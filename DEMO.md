# Sorostamp — Demo video script (2–3 min)

> Goal of the video: show a **live product** running the **full loop** end-to-end,
> lead with the **headline** in the first 10 seconds, and land a **quantified hook**.
> Shoot it as one continuous screen-capture with voiceover; no slides until the end.

---

## 0:00–0:12 — The hook (headline first)

**On screen:** the landing page hero.

**Voiceover:**
> "This is a real bank email. Sorostamp turns it into a zero-knowledge proof on
> Stellar that says *‘I received a payment’* — provable by anyone, on-chain —
> **without ever revealing the email.** The email never even leaves my browser."

**Why:** states the headline fact + the privacy guarantee + the chain, immediately.

---

## 0:12–0:30 — Pick the proof

**On screen:** click **Create a proof → Proof of Payment**. Show the blueprint cards.

**Voiceover:**
> "I pick a blueprint — Proof of Payment. Each blueprint reveals exactly one fact
> from a DKIM-signed email and hides everything else."

---

## 0:30–1:00 — Drop the email (privacy beat)

**On screen:** drag the real `.eml` onto the dropzone. Point at the privacy bar
("processed entirely in your browser"). The file preview appears.

**Voiceover:**
> "I drop the original email — the raw message my bank actually signed with DKIM.
> Watch the network tab: the email bytes never get uploaded. The only thing that
> leaves my machine is a DNS lookup for the bank's *public* DKIM key."

**Shot tip:** have the browser devtools **Network tab** open and visible — show
that there is **no upload** of the email, only the `/api/dkim` domain lookup.

---

## 1:00–1:50 — Prove in the browser (the headline feature)

**On screen:** click **Generate proof**. The step list runs: resolving DKIM key →
building circuit inputs → computing the witness → building the Groth16 proof.

**Voiceover:**
> "Now it proves — right here in the browser. It's verifying the bank's RSA
> signature and running a **1.17-million-constraint** zk-email circuit to a
> **Groth16 proof on BN254**. No server sees the email. This is the hard part,
> and it's happening on my laptop."

**Quantified hook to say out loud:** *1.17M constraints · Groth16 · BN254 ·
~2 minutes in-browser · email never uploaded.*

**Shot tip:** this is the slow step — either let it run with the progress
animation, or cut with a "still proving…" caption and rejoin at completion.

---

## 1:50–2:20 — Seal on Stellar (the on-chain beat)

**On screen:** Step 4. Click **Verify on-chain**. Show "Submitting to Soroban…"
then the **Sealed / Verified** state.

**Voiceover:**
> "I submit the proof to our Soroban verifier contract. The contract runs the
> **BN254 pairing check natively on Stellar**, confirms it's never been sealed
> before, and writes the attestation on-chain. Gas is sponsored — I never needed
> a wallet."

---

## 2:20–2:50 — The public, verifiable artifact (live product)

**On screen:** open the **public proof page** `/p/<id>`. Show: the readable
proven fact, "Verified on Stellar testnet", "Email never revealed", the ledger
number, and click through to **stellar.expert** to show the live contract.

**Voiceover:**
> "And here's the shareable result. Anyone can open this link and verify the fact
> on-chain — the proof matches the statement hash sealed in the contract. They see
> *that* a payment was received. They never see the email, the account, or
> anything else."

**Shot tip:** open the stellar.expert contract link in a second tab to prove it's
real, live, on-chain — not a mockup.

---

## 2:50–3:00 — Close

**On screen:** back to the proof card / logo.

**Voiceover:**
> "Sorostamp. Any DKIM-signed email becomes a real-world fact you can prove on
> Stellar — and nothing else. Real-world ZK, live today."

---

## Pre-flight checklist (before recording)

- [ ] Dev server running locally (`npm run dev`) **or** the deployed site, with
      the sample email available (`public/sample-email.eml` present locally).
- [ ] The email you demo is one you're comfortable showing the **subject** of —
      the subject is the field that gets revealed.
- [ ] Browser **devtools → Network** open during Step 2 to prove "no upload".
- [ ] A second tab with `stellar.expert/explorer/testnet/contract/<verifier>`.
- [ ] If proving feels long on camera, pre-warm by loading the zkey once so it's
      cached, then record.
- [ ] Optional: a fresh email (never sealed) so the seal shows a **new** tx,
      not `already_sealed`. (The sample is already on-chain → shows "already
      sealed — verified", which is still a valid, honest outcome to narrate.)
