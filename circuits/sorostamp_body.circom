pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/email-nullifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/utils/array.circom";
include "@zk-email/circuits/lib/base64.circom";

// ── Sorostamp — body-fact reveal circuit ("hash completion" scheme) ─────────
//
// Proves facts that live in the email BODY (amount / merchant / reference in a
// payment receipt) without hashing the whole body in-circuit. DKIM's bh= commits
// to SHA-256 of the full canonicalized body; SHA is sequential, so a fact in the
// middle of a 50 KB HTML email would normally force ~12M constraints of hashing
// (everything from the fact to the end). Instead we split the body three ways:
//
//   [ prefix ..................][ window (facts) ][ suffix .................. ]
//     private — collapsed to      hashed + masked    published verbatim; the
//     midstate M1 off-circuit     IN-CIRCUIT          CONTRACT finishes the SHA
//
// In-circuit: chain M1 through the window blocks → M2, and reveal up to
// `numFacts` masked spans of the window. On-chain: the Soroban contract resumes
// SHA-256 from M2 over the public suffix (+ standard padding for
// consumedBytes + |suffix| total) and requires digest == bh, where bh is
// decoded HERE from the DKIM-signed header. Faking any piece needs a free-start
// second preimage of SHA-256.
//
// bh= is located WITHOUT the 617K-constraint BodyHashRegex: under relaxed
// canonicalization the dkim-signature header (b= emptied) is always the LAST
// line of the signed blob, so we assert (a) the literal ";bh=" / " bh=" prefix
// at bhIndex and (b) no LF between the 44 base64 chars and the end of the real
// message. The scan stops at emailHeaderLength-8 because the final 8 SHA-padding
// bytes encode the bit-length and may legitimately contain 0x0A; everything
// between the message end and there is 0x80/zeros, never LF.
//
// Public signals (29 incl. the leading nullifier — order is contract ABI):
//   [0]      nullifier            poseidon(poseidon(signature)) — anti-replay
//   [1..4]   fromChunks[4]        revealed From header span (packed 31 B/field)
//   [5..6]   bhHi, bhLo           bh= from the header, 2×128-bit BE halves
//   [7..8]   m2Hi, m2Lo           SHA midstate after the window, same packing
//   [9]      consumedBytes        bytes hashed so far (prefix + window)
//   [10..27] factChunks[3][6]     revealed window spans, label+value together
//                                 (packed 31 B/field, ≤186 B per fact)
template SorostampBody(maxHeadersLength, n, k, maxWindowLength, maxFromLength, maxFactLength, numFacts) {
    assert(maxWindowLength % 64 == 0);

    // header + DKIM
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    // From reveal (same mask scheme as the generic header circuit)
    signal input headerMask[maxHeadersLength];
    signal input fromStartIndex;
    // bh= location inside the signed header (start of the 44 base64 chars)
    signal input bhIndex;
    // body window
    signal input m1Bytes[32];                  // SHA midstate before the window (8 BE u32 words as bytes)
    signal input windowBytes[maxWindowLength]; // raw canonicalized body bytes, block-aligned
    signal input windowBlocks;                 // 64-byte blocks actually used (≤ maxWindowLength/64)
    signal input consumedBytes;                // prefix + window bytes — anchors the contract's padding
    // fact reveals — masks are 1 exactly over each label+value span
    signal input factMask[numFacts][maxWindowLength];
    signal input factStart[numFacts];

    // ── 1. DKIM verify over the header (body ignored — we anchor it via bh) ──
    component ev = EmailVerifier(maxHeadersLength, 64, n, k, 1, 1, 0, 0);
    ev.emailHeader <== emailHeader;
    ev.emailHeaderLength <== emailHeaderLength;
    ev.pubkey <== pubkey;
    ev.signature <== signature;
    ev.headerMask <== headerMask;

    component nul = EmailNullifier(n, k);
    nul.signature <== signature;

    // ── 2. Extract bh= from the signed header ────────────────────────────────
    // range-pin bhIndex; the ItemAtIndex lookups below additionally force it
    // inside the header (their index-match sum === 1 is unsatisfiable otherwise)
    component bhIndexBits = Num2Bits(11);
    bhIndexBits.in <== bhIndex;

    // 2a. literal prefix: emailHeader[bhIndex-4..bhIndex-1] == (';'|' ') 'b' 'h' '='
    signal sepByte <== ItemAtIndex(maxHeadersLength)(emailHeader, bhIndex - 4);
    (sepByte - 59) * (sepByte - 32) === 0; // ';' or ' '
    signal bByte <== ItemAtIndex(maxHeadersLength)(emailHeader, bhIndex - 3);
    bByte === 98;
    signal hByte <== ItemAtIndex(maxHeadersLength)(emailHeader, bhIndex - 2);
    hByte === 104;
    signal eqByte <== ItemAtIndex(maxHeadersLength)(emailHeader, bhIndex - 1);
    eqByte === 61;

    // 2b. bh= sits on the LAST line (the dkim-signature header itself): no LF
    // from the end of the base64 run to the end of the real message.
    var hdrBits = log2Ceil(maxHeadersLength);
    signal isAfterBh[maxHeadersLength];
    signal isBeforeLen[maxHeadersLength];
    signal inScan[maxHeadersLength];
    signal isLF[maxHeadersLength];
    for (var i = 0; i < maxHeadersLength; i++) {
        isAfterBh[i] <== GreaterEqThan(hdrBits)([i, bhIndex + 44]);
        isBeforeLen[i] <== LessThan(hdrBits + 1)([i, emailHeaderLength - 8]);
        inScan[i] <== isAfterBh[i] * isBeforeLen[i];
        isLF[i] <== IsEqual()([emailHeader[i], 10]);
        inScan[i] * isLF[i] === 0;
    }

    // 2c. read the 44 base64 chars and decode to the 32-byte body hash
    signal bhBase64[44] <== SelectSubArray(maxHeadersLength, 44)(emailHeader, bhIndex, 44);
    signal bhBytes[32] <== Base64Decode(32)(bhBase64);

    // ── 3. Chain the SHA midstate through the window: M1 → M2 ────────────────
    // Sha256BytesPartial does pure block compression + selects the state after
    // `windowBlocks` blocks; padding is deliberately absent — the message
    // continues into the public suffix, which the CONTRACT absorbs and pads.
    signal windowLen <== windowBlocks * 64;
    AssertZeroPadding(maxWindowLength)(windowBytes, windowLen);
    signal m2Bits[256] <== Sha256BytesPartial(maxWindowLength)(windowBytes, windowLen, m1Bytes);

    // ── 4. Reveal the fact spans (label + value together, anti-mislabeling) ──
    var FACT_CHUNKS = computeIntChunkLength(maxFactLength);
    component factByteMask[numFacts];
    component factPack[numFacts];
    for (var f = 0; f < numFacts; f++) {
        factByteMask[f] = ByteMask(maxWindowLength);
        factByteMask[f].in <== windowBytes;
        factByteMask[f].mask <== factMask[f];
        factPack[f] = PackRegexReveal(maxWindowLength, maxFactLength);
        factPack[f].in <== factByteMask[f].out;
        factPack[f].startIndex <== factStart[f];
    }

    // consumedBytes must be sane for the contract's u64 padding math
    component consumedBits = Num2Bits(32);
    consumedBits.in <== consumedBytes;

    // ── 5. Public outputs (declaration order = public-signal order) ──────────
    signal output nullifier <== nul.out;

    var FROM_CHUNKS = computeIntChunkLength(maxFromLength);
    signal output fromChunks[FROM_CHUNKS] <== PackRegexReveal(maxHeadersLength, maxFromLength)(ev.maskedHeader, fromStartIndex);

    component bhByteBits[32];
    signal bhBits[256];
    for (var i = 0; i < 32; i++) {
        bhByteBits[i] = Num2Bits(8);
        bhByteBits[i].in <== bhBytes[i];
        for (var j = 0; j < 8; j++) {
            bhBits[i * 8 + j] <== bhByteBits[i].out[7 - j];
        }
    }
    component bhPack = PackBits(256, 128);
    bhPack.in <== bhBits;
    signal output bhHi <== bhPack.out[0];
    signal output bhLo <== bhPack.out[1];

    component m2Pack = PackBits(256, 128);
    m2Pack.in <== m2Bits;
    signal output m2Hi <== m2Pack.out[0];
    signal output m2Lo <== m2Pack.out[1];

    signal output consumedOut <== consumedBytes;

    signal output factChunks[numFacts][FACT_CHUNKS];
    for (var f = 0; f < numFacts; f++) {
        factChunks[f] <== factPack[f].out;
    }
}

// 1088-byte headers, RSA n=121/k=17, 1536-byte window (24 blocks — the Zinli
// fact region is ~1.2 KB incl. alignment slack), From ≤124 B (4 chunks, same as
// the generic circuit), each fact span ≤186 B (6 chunks), 3 facts.
component main = SorostampBody(1088, 121, 17, 1536, 124, 186, 3);
