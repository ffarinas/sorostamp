pragma circom 2.1.6;

// ── Measurement-only circuit ───────────────────────────────────────────────
// Goal: read the REAL constraint count of zk-email's EmailVerifier at a given
// body size, so we can decide in-browser vs server-side proving for Lacre.
// Not the final circuit (no nullifier, no packed reveal yet) — just the cost.
//
// EmailVerifier(maxHeadersLength, maxBodyLength, n, k,
//               ignoreBodyHashCheck, enableHeaderMasking, enableBodyMasking,
//               removeSoftLineBreaks)
// n=121,k=17 → supports up to 2048-bit RSA (Zinli's 1024-bit key fits, zero-padded).
// enableBodyMasking=1 + removeSoftLineBreaks=1 = our user-redaction model on a
// quoted-printable body.

include "@zk-email/circuits/email-verifier.circom";

// ignoreBodyHashCheck=1 → prove from HEADERS only (subject etc.), skip the body entirely.
component main = EmailVerifier(1088, 64, 121, 17, 1, 0, 0, 0);
