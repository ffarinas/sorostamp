# Sorostamp — Demo video script (2–3 min, English narration)

> Lead with the headline in the first 10 seconds, show the FULL loop live on
> mainnet, explain what ZK is doing (a submission requirement), end on the
> links. One continuous screen capture + voiceover; cut/speed-up only the
> proving wait.

---

## ✅ Pre-flight (do ALL of this BEFORE recording)

1. **Dry-run on sorostamp.com with the Zinli QuickNode email**
   (`🛍️ ¡Nueva compra con Zinli! - Ref. 711066405671.eml`), start to finish,
   including Seal. This (a) validates the whole mainnet flow in the browser,
   (b) **warms the zkey cache** so the recorded take says "Loading the proving
   key (cached)" instead of a 1 GB download, and (c) leaves a SECOND sealed
   mainnet proof as a bonus.
2. **Record with the Anthropic receipt** (`Your receipt from Anthropic…eml`) —
   it's fresh on mainnet (no replay collision) and it's YOUR story.
   ⚠️ Reminder: approving its consent panel publishes the attached PDF
   invoices in the mainnet transaction — same trade you already accepted on
   testnet. If you'd rather not, swap roles: dry-run with Anthropic, record
   with the Zinli one (clean consent, 3 facts, no warnings).
3. **Same browser profile for warm-up and take** (incognito has a separate,
   cold cache). Close extra tabs, hide the bookmarks bar, 1080p+ display.
4. Have the public-proof link of the dry-run seal handy (second "verifier"
   moment), plus a phone or second browser window.

---

## 0:00–0:15 — The hook

**On screen:** the Anthropic receipt open (or its screenshot), then dev-tools
inspector editing the amount from $100.00 to $999.00 in two clicks.

> "How do you prove you paid for something — without handing over your inbox?
> A screenshot can be forged in ten seconds. I just did."

## 0:15–0:35 — What Sorostamp is

**On screen:** sorostamp.com landing; hover the live proof card.

> "Sorostamp turns any DKIM-signed email into a zero-knowledge proof, verified
> by a smart contract on Stellar mainnet. You reveal exactly the facts you
> choose — the email itself never leaves your browser. This proof card is
> live, on-chain, right now."

## 0:35–1:45 — The demo (the core)

**On screen:** Create proof — the four blueprint cards are visible. Sweep the
cursor across them while naming each, then select Proof of Purchase.

> "Four proof blueprints. *Proof of Sender* — prove an email genuinely came
> from a domain: instant anti-phishing. *Proof of Receipt* — prove you received
> an email, revealing only its subject line. *Custom field* — any signed
> header, for builders. And the headline, *Proof of Purchase*: facts from the
> body of the email itself — something zk-email tooling couldn't reach until
> now. Let's run that one."

**Drop the Anthropic .eml:**

> "My company reimburses my Anthropic subscription. Here's the real receipt —
> processed entirely in my browser."

**Selection stage appears (the signed body, readable):**

> "This is the signed body. I highlight exactly what I want to reveal —
> the $100.00 — and nothing else."

**Consent panel:**

> "Before proving, Sorostamp shows me precisely what gets published to
> complete the verification, scans it for personal data, and asks for my
> consent. No silent trade-offs."

**Proving (SPEED UP this section in edit; keep the progress bar visible):**

> "A Groth16 proof — 1.8 million constraints — generated right here in the
> browser, in a web worker."

**Seal on Stellar → sealed card:**

> "One click, and a Soroban contract on Stellar mainnet verifies the proof and
> seals the attestation. Gas is sponsored — the user needs no wallet."

## 1:45–2:15 — The verifier's view

**On screen:** Copy proof link → open it in a second window/phone.

> "Anyone with the link can verify it: the amount, cryptographically signed by
> Anthropic's own mail server, sealed in a mainnet ledger — and nothing else
> about the email. My employer sees proof, not my inbox."

## 2:15–2:50 — What ZK is doing (requirement) + close

**On screen:** README architecture diagram, then the repo + sorostamp.com.

> "The zero-knowledge part is load-bearing: the circuit verifies the sender's
> RSA DKIM signature and the email's hashes privately, in-browser. The
> contract checks the BN254 pairing on-chain and finishes the body hash
> itself — our 'hash completion' technique, which breaks zk-email's body-size
> wall: facts buried mid-email that would normally need forty million
> constraints, proven with under two million. Two verifier contracts live on
> mainnet, fully open source. Sorostamp — prove the fact, keep the email."

**End card:** `sorostamp.com · github.com/ffarinas/sorostamp`

---

## If something goes sideways mid-take

- "Already sealed" at step 4 → it's the anti-replay working; the flow still
  ends green ("Already sealed on-chain — verified"). Usable take, or switch
  to the other email.
- RPC hiccup on the public page → it shows "Reading the proof on-chain…" and
  the browser fallback fills it in seconds. Keep rolling.
