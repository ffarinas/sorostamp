/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — app constants (ESM exports)
   Turn any email into an on-chain proof. Reveal nothing.

   Single source of truth for the network (NET). Every UI label derives from
   NET.name so it is always truthful — it auto-corrects the instant NET flips
   from testnet to mainnet. NO fake proof data lives here: real proofs come
   from the prover + the on-chain contract. DEMO_PROOF below is a REAL sealed
   attestation (used for the "see a public proof" link), not a mock.
   ═══════════════════════════════════════════════════════════════════ */

export const trunc = (s: string, a = 5, b = 4): string =>
  !s ? "" : s.length <= a + b + 1 ? s : s.slice(0, a) + "…" + s.slice(-b);

export const NET = {
  name: "Stellar mainnet",
  explorer: "https://stellar.expert/explorer/public",
  rpcUrl: "https://soroban-rpc.creit.tech",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
  verifier: "CCZQCQISEKU6KHXAIGO336MS6ROMMKZE6ONEHBLT33EADLWZUPSCPG27",
  /* the BODY-fact verifier (hash-completion scheme). */
  verifierBody: "CDGRALTQPLSRM656AUG7Y6YSR3BVVKY5BUWL4VXE5NMRMP4VJ56PEJM7",
  curve: "BN254 · Groth16",
};

/* A REAL proof sealed on-chain on the current NET — used by the "see a public
   proof" link so it points at a live, verifiable attestation (never a fake id).
   This one is a PURCHASE proof (body circuit): amount + merchant + reference
   proven from a real Zinli receipt, SHA-completed on-chain. `s` carries public
   signals 1..27 so /p/[id] decodes + verifies them against statement_hash.
   Re-seal + update this when NET moves to mainnet. */
export const DEMO_PROOF = {
  id: "0c8a8c8bb5d9686a4abb0d33423dc4ca45f240303c55fb59df41c66bced2e928",
  s: "194666597924776273747617569695496934414441374877850647301490417508293368354,191581518755820840972191367976279910911858616013036010069204200939425246575,68639741128297,0,224408548876787808704745321371898735214,215678128706197145462604938007513426974,4732770446763984286634177417214912758,78882523946232650106818027045571871106,25280,90532941209156347952764942152146536428050468401731209448336026819340693325,186265199388283581969422035200634946441851074830131201593591146241151083076,85030812463930343383952636288395444409045733802168419245421296361923241326,17085966780867276361729848864,0,0,191657733782098488915614928809092783542994174380346628040845026339962318659,186265199388446415873509388354644745663423356313567302437652759208436907365,56942384055501707857913124510531543930674664281486674386723628230093137262,171608132237904468649970650685805755707588427582801702513290102012388581424,80186366960943592928185344358167245687,0,198302733512704122474400686267699020698445542763929225912197055243492943186,196797620577297810026719531653493902384078772271562688961295303142588838688,195080649412222096270206353151357613048808150232346571484974804718476868472,22529374248952584947215355623121750534382765814189373,0,0",
};

/** Path to the live public proof page for the demo attestation (purchase proof). */
export const demoProofPath = (): string =>
  `/p/${DEMO_PROOF.id}?s=${encodeURIComponent(DEMO_PROOF.s)}&f=purchase&c=body`;

/* Honesty lines, everywhere a proof is presented. Header blueprints verify the
   DKIM signature over the HEADERS only. The purchase blueprint ALSO proves body
   facts via DKIM's bh= commitment (hash-completion scheme) — its trade-off is
   that the template tail after the facts becomes public on-chain. */
export const HEADER_ONLY_NOTE =
  "Proves the DKIM-signed header — the email body is not cryptographically proven.";
export const BODY_PROOF_NOTE =
  "Proves facts inside the email body via DKIM's body-hash commitment. The template tail after the facts is published on-chain (you review it first).";

/* Blueprints. Two circuits power all of them:
   - kind "header": ONE generic circuit reveals a chosen signed header field.
   - kind "body":   the hash-completion circuit reveals purchase facts (amount /
     merchant / reference) from the body itself — the headline capability. */
export const BLUEPRINTS = [
  {
    id: "purchase",
    title: "Proof of Purchase",
    icon: "coins",
    featured: true,
    kind: "body" as const,
    field: "",
    blurb:
      "Prove what you paid and to whom — select the exact facts to reveal from any payment email. Nothing else is shown.",
    example: "Reveals up to 3 facts you select",
  },
  {
    id: "sender",
    title: "Proof of Sender",
    icon: "mail",
    kind: "header" as const,
    field: "from",
    blurb: "Prove an email genuinely came from a domain — without revealing the message.",
    example: "Reveals the signed From line",
  },
  {
    id: "receipt",
    title: "Proof of Receipt",
    icon: "mail",
    kind: "header" as const,
    field: "subject",
    blurb: "Prove you received an email (a receipt, a notice) — revealing only its subject line.",
    example: "Reveals the subject line only",
  },
  {
    id: "custom",
    title: "Custom field",
    icon: "code",
    kind: "header" as const,
    field: "subject",
    // Any signed header the user picks — the builder/power-user escape hatch.
    fields: ["subject", "from", "to"],
    blurb: "Prove any single signed header from a DKIM email — for builders.",
    example: "Reveals one header you choose",
  },
];

/* The header field a blueprint reveals (default "subject"). */
export function blueprintField(id: string): string {
  return BLUEPRINTS.find((b) => b.id === id)?.field || "subject";
}

/* Whether a blueprint proves BODY facts (purchase) vs a single header field. */
export function blueprintKind(id: string): "header" | "body" {
  return BLUEPRINTS.find((b) => b.id === id)?.kind === "body" ? "body" : "header";
}

/* Illustrative email for the landing-page contrast view ONLY. This is NOT a
   real user proof — the landing labels it "Illustrative example". Real emails
   are uploaded by the user and parsed in the browser. */
export const EMAIL = {
  from: "Payment Receipts <no-reply@payments.example>",
  to: "you@example.com",
  subject: "You received a payment of $250.00",
  date: "Sat, 13 Jun 2026 20:40:42 +0000",
  dkim: "v=1; a=rsa-sha256; d=payments.example; s=2026; bh=Hh9k…; b=Qm4Z…",
  illustrativeFact: "Genuinely from payments.example",
  body: [
    { t: "You've received a payment.", reveal: false },
    { t: "Amount: $250.00", reveal: true },
    { t: "Reference: 081734590012", reveal: false },
    { t: "Date: Jun 13, 2026, 4:40 PM", reveal: false },
    { t: "Status: Completed", reveal: false },
    { t: "Thank you for using our service.", reveal: false },
  ],
};
