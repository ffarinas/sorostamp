pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/email-nullifier.circom";

// ── Lacre — pilot circuit (validation cut) ─────────────────────────────────
// Prove a real email's DKIM signature over its HEADERS (subject, from, date…) and
// emit a nullifier. The BODY is skipped (ignoreBodyHashCheck=1): zk-email's in-circuit
// body hashing is ~1,500 constraints/byte, so Zinli's 54KB HTML body (~20M constraints)
// is infeasible. The signed headers are small (~1KB) → ~778K constraints, provable.
//
// This cut validates the FULL pipeline (real .eml → Groth16/BN254 → our Soroban verifier).
// Subject selective-reveal via header masking is the next iteration.
//
// Public output order is the contract's convention: pub_signals[0] = nullifier.
template Lacre(maxHeadersLength, n, k) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];

    // Headers-only DKIM verification (maxBodyLength is a required-but-unused 64).
    component ev = EmailVerifier(maxHeadersLength, 64, n, k, 1, 0, 0, 0);
    ev.emailHeader <== emailHeader;
    ev.emailHeaderLength <== emailHeaderLength;
    ev.pubkey <== pubkey;
    ev.signature <== signature;

    // Anti-replay nullifier = poseidon(poseidon(signature)) — unique per email.
    component nul = EmailNullifier(n, k);
    nul.signature <== signature;

    signal output nullifier  <== nul.out;       // pub_signals[0]
    signal output pubkeyHash <== ev.pubkeyHash;  // which DKIM key signed (domain commitment)
    signal output shaHi      <== ev.shaHi;       // upper 128 bits of the signed-header SHA-256
    signal output shaLo      <== ev.shaLo;       // lower 128 bits
}

component main = Lacre(1088, 121, 17);
