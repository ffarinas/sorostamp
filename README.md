# Sorostamp — turn any email into an on-chain proof. Reveal nothing.

**Live app:** https://sorostamp.fabianfarinas.workers.dev
**Live proof (mainnet):** open the app → "See a live proof"

Sorostamp turns a DKIM-signed email into a Groth16 zero-knowledge proof,
verified by a Soroban smart contract on **Stellar mainnet**. You reveal exactly
the facts you choose — an amount, a merchant, a reference, a subject line, a
sender — and nothing else. The email itself **never leaves your browser**.

The flagship use case: *"my company reimburses my Anthropic subscription — I
prove I paid $100.00, cryptographically signed by Anthropic itself, without
giving anyone access to my inbox."* A screenshot can be faked in the browser
inspector in two minutes. This can't: faking it requires breaking SHA-256 or
stealing the sender's DKIM private key.

| | Stellar mainnet |
|---|---|
| Header verifier (`submit_proof`) | `CCZQCQISEKU6KHXAIGO336MS6ROMMKZE6ONEHBLT33EADLWZUPSCPG27` |
| Body verifier (`seal_body`) | `CDGRALTQPLSRM656AUG7Y6YSR3BVVKY5BUWL4VXE5NMRMP4VJ56PEJM7` |

---

## What ZK does here (load-bearing, not decorative)

DKIM means every real email arrives with an RSA signature from the sender's
domain over its headers **and** a hash of its body. Verifying that signature
publicly would require publishing the email. The ZK circuit verifies it
**privately** — DNS-published RSA key, 2048-bit signature check, SHA-256 of the
header, all inside a Groth16 circuit — and reveals only the masked spans the
user selected, plus an anti-replay nullifier. The Soroban contract verifies the
proof with the protocol's native BN254 pairing and seals an attestation anyone
can check from a link.

Three proof blueprints, two circuits:

- **Proof of Purchase** *(body circuit — the headline)*: select up to 3 facts
  from the **body** of any payment email ("Monto $49.0", "Comercio QUICKNODE",
  "Referencia 711066405671") — provider-agnostic, any language, no templates.
- **Proof of Sender / Proof of Receipt / Custom** *(header circuit)*: reveal one
  DKIM-signed header field (From, Subject, …).

## The technical contribution: breaking zk-email's body-size wall

zk-email's known limitation: hashing the body in-circuit costs ~1,500
constraints/byte, so a fact sitting 25 KB before the end of a 50 KB HTML email
needs tens of millions of constraints — impossible in a browser. The standard
`shaPrecompute` trick only helps when facts sit near the END of the body; real
receipts don't cooperate.

Sorostamp splits the body three ways ("**hash completion**" scheme):

```
[ prefix ················ ][ window (1536 B) ][ suffix ······················ ]
  private — collapsed to     hashed IN-CIRCUIT   published in the sealing tx —
  SHA midstate M1, computed  from M1 → M2, with  the CONTRACT resumes SHA-256
  client-side                masked fact reveals from M2 and must hit bh=
```

- The circuit chains M1 through the window and reveals the selected spans
  (label+value together, so a span can't be re-labeled out of context).
- It also extracts `bh=` (the DKIM body-hash commitment) from the signed header
  **without** the 617K-constraint BodyHashRegex: under relaxed canonicalization
  the dkim-signature header is always the last signed line, so a ~30K-constraint
  literal+position check suffices.
- The contract resumes SHA-256 from M2 over the public suffix (a hand-rolled
  compression function — Soroban's sha256 host fn can't resume from a midstate),
  applies the padding for the full body length, and requires `digest == bh`.

Soundness: forging any piece requires a free-start second preimage of SHA-256.
Cost on-chain: **~58M instructions** of the 100M budget (28-point MSM ≈ 32M +
pairing ≈ 17.5M; the 24 KB suffix SHA is noise).

**The honest trade-off:** everything *after* your selection is published inside
the sealing transaction (it is the verification fuel; it is **not** stored —
only a 32-byte attestation persists). The app shows you those exact bytes, runs
a PII scan over them (your address, your name, attached files), and asks for
explicit consent before proving. Bank/fintech notification emails have clean
template tails; receipts with PDF attachments get loud red warnings and the
choice stays yours.

Numbers: body circuit = **1,771,176 constraints** (ptau-21), zkey ~976 MB,
proved in-browser in a Web Worker (the Cache API keeps the key after the first
download). Header circuit = 822K constraints, zkey ~414 MB.

## Privacy model

| Data | Fate |
|---|---|
| The email file | Never leaves the browser (proving runs in a Web Worker) |
| Everything before/around your selected facts | Private (midstate + in-circuit masks) |
| The facts you select + the From line | Revealed — that's the point |
| The template tail after your facts (body proofs) | Published in the tx, with preview + PII scan + explicit consent |
| On-chain storage | 32-byte nullifier + 32-byte statement hash + timestamps |

Anti-replay: nullifier = poseidon(poseidon(DKIM signature)) — each email seals
once. The public page recomputes the statement hash from the link's packed
signals and checks it against the chain, so the displayed facts are exactly the
committed ones.

## Repository map

```
app/, components/, lib/     Next.js 16 app — landing, 4-step flow, public /p/[id]
lib/prove.worker.ts         Web Worker: input-gen + snarkjs proving (both circuits)
lib/prove-body.ts           Body scheme: MIME/QP/UTF-8 decoding with byte-exact
                            selection maps, window/suffix math, PII audit
app/api/seal/route.ts       Sponsored relayer — users need no wallet, no XLM
circuits/                   Circom sources + input-gen/VK/fixture scripts
contracts/verifier/         Header verifier (Groth16 BN254 + attestations), 10 tests
contracts/verifier-body/    Body verifier (+ SHA-256 resume + suffix check), 14 tests
packages/                   Generated TS bindings for both contracts
```

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Proving needs the proving keys, which are far too large for git (414 MB +
976 MB). Either point the app at the hosted ones:

```bash
NEXT_PUBLIC_ZKEY_URL=https://pub-b1a2060c7eb64827bdd878e8930cc82c.r2.dev/sorostamp_final.zkey \
NEXT_PUBLIC_BODY_ZKEY_URL=https://pub-b1a2060c7eb64827bdd878e8930cc82c.r2.dev/sorostamp_body_final.zkey \
npm run dev
```

or regenerate them from source (`circuits/`): compile with circom 2.1.6+, run
`snarkjs groth16 setup` against `powersOfTau28_hez_final_21.ptau`, and place
them at `public/zk/`. Contract tests run with `cargo test` in each contract dir
(fixtures included — a real proof from a real receipt, already public on-chain).

Sealing on-chain needs `SOROSTAMP_SPONSOR_SECRET` in `.env.local` (any funded
account; it pays the fees so users don't need wallets).

Deployment (Cloudflare Workers via OpenNext + R2 for the keys): see
[DEPLOY.md](DEPLOY.md). Mainnet notes and addresses: see [MAINNET.md](MAINNET.md).

## Honest limitations (read this)

- **Single-contributor trusted setup.** Both zkeys had one Phase-2 contributor
  (the author). For the hackathon this ships with disclosure; before real-value
  use a multi-party ceremony is mandatory — outline in [MAINNET.md](MAINNET.md).
- **Header proofs prove headers.** Proof of Sender/Receipt/Custom prove the
  DKIM-signed *header* only; the body proof is what cryptographically binds
  body facts. The UI labels this everywhere.
- **Body-proof physics.** Selected facts must sit within one 1536-byte window
  (≤186 bytes per fact), and everything after them must fit one transaction
  (≤110 KB) and be publishable — the app checks all three and explains failures
  honestly (e.g. an email whose facts are followed by PDF attachments will warn
  you the PDFs would be published; that choice is yours).
- **DKIM is the trust root.** The proof shows what a domain's mail server
  signed. If a sender rotates keys, old emails need the archived DNS key.

## Stack

Next.js 16 (webpack + Node polyfills for in-browser zk-email), snarkjs,
@zk-email/circuits + helpers, circom 2 / Groth16 / BN254, Soroban (native BN254
host functions, soroban-sdk 26), OpenNext on Cloudflare Workers, R2.

Built solo for **Stellar Hacks: Real-World ZK** by [@ffarinas](https://github.com/ffarinas).
