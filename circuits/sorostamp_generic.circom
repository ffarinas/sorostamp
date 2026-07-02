pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/email-nullifier.circom";
include "@zk-email/circuits/utils/regex.circom";

// ── Sorostamp — generic header-field reveal circuit ────────────────────────
// Headers-only DKIM verify + nullifier + REVEAL a CHOSEN header span.
//
// Instead of a fixed subject regex, the caller passes a `headerMask` (1 = keep,
// 0 = hide) over the signed header bytes and a `revealStartIndex`. The circuit
// reveals exactly the masked span and packs it into the SAME compact shape the
// contract already expects (nullifier + 4 packed chunks → 5 public signals), so
// ONE circuit/ceremony/VK/verifier powers every blueprint:
//   - Proof of Payment  → mask the Subject line
//   - Email at a domain → mask the From/domain
//   - Custom            → mask any header field the user picks
//
// The mask + start index are computed off-circuit (lib/prove.ts). The contract
// stays field-agnostic: it commits to pub_signals[1..] via statement_hash and
// does not care WHICH header was revealed.
//
// Public output order matches the contract: pub_signals[0] = nullifier,
// pub_signals[1..] = the packed revealed field (the committed statement).
template SorostampGeneric(maxHeadersLength, n, k, maxRevealLength) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    signal input headerMask[maxHeadersLength]; // 1 = reveal byte, 0 = hide
    signal input revealStartIndex;             // where the revealed span begins

    // Headers-only DKIM verification with HEADER MASKING enabled (arg 6 = 1).
    // maxBodyLength=64 is required-but-unused when ignoreBodyHashCheck=1.
    component ev = EmailVerifier(maxHeadersLength, 64, n, k, 1, 1, 0, 0);
    ev.emailHeader <== emailHeader;
    ev.emailHeaderLength <== emailHeaderLength;
    ev.pubkey <== pubkey;
    ev.signature <== signature;
    ev.headerMask <== headerMask;

    // Anti-replay nullifier = poseidon(poseidon(signature)).
    component nul = EmailNullifier(n, k);
    nul.signature <== signature;

    // Pack the revealed span (non-masked bytes are 0 in maskedHeader) into the
    // same chunk layout as the pilot circuit — keeps the 5-signal public shape.
    var CHUNKS = computeIntChunkLength(maxRevealLength);
    signal packed[CHUNKS] <== PackRegexReveal(maxHeadersLength, maxRevealLength)(ev.maskedHeader, revealStartIndex);

    // Public outputs — nullifier FIRST, then the packed revealed field.
    signal output nullifier <== nul.out;
    signal output revealed[CHUNKS] <== packed;
}

// 1088-byte headers, RSA n=121/k=17, reveal up to 124 bytes (→ 4 packed chunks,
// identical public-signal count to the pilot so the contract VK shape matches).
component main = SorostampGeneric(1088, 121, 17, 124);
