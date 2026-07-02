pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/helpers/email-nullifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/subject_all_regex.circom";

// ── Sorostamp — pilot circuit (subject selective-reveal) ───────────────────
// Headers-only DKIM verify + nullifier + REVEAL the email SUBJECT.
// The subject regex is GENERIC (RFC822 "subject:" — not per-provider), so it
// scales across senders/languages. The body is skipped (infeasible to hash).
//
// Public output order matches the contract: pub_signals[0] = nullifier,
// pub_signals[1..] = the packed subject (the revealed statement, committed via
// the contract's statement_hash; the frontend recomputes it from the link).
template Sorostamp(maxHeadersLength, n, k, maxSubjectLength) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    signal input subjectStartIndex; // index where the subject reveal begins (computed off-circuit)

    // Headers-only DKIM verification (maxBodyLength=64 is required-but-unused).
    component ev = EmailVerifier(maxHeadersLength, 64, n, k, 1, 0, 0, 0);
    ev.emailHeader <== emailHeader;
    ev.emailHeaderLength <== emailHeaderLength;
    ev.pubkey <== pubkey;
    ev.signature <== signature;

    // Anti-replay nullifier = poseidon(poseidon(signature)).
    component nul = EmailNullifier(n, k);
    nul.signature <== signature;

    // Reveal the subject with the GENERIC subject regex, then pack it compactly.
    signal subjectFound;
    signal subjectReveal[maxHeadersLength];
    (subjectFound, subjectReveal) <== SubjectAllRegex(maxHeadersLength)(emailHeader);
    subjectFound === 1; // the email MUST contain a subject

    var SUBJ_CHUNKS = computeIntChunkLength(maxSubjectLength);
    signal packedSubject[SUBJ_CHUNKS] <== PackRegexReveal(maxHeadersLength, maxSubjectLength)(subjectReveal, subjectStartIndex);

    // Public outputs — nullifier FIRST, then the packed subject statement.
    signal output nullifier <== nul.out;
    signal output subject[SUBJ_CHUNKS] <== packedSubject;
}

component main = Sorostamp(1088, 121, 17, 124);
