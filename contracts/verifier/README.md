# lacre-verifier — Groth16 / BN254 email-proof verifier for Soroban

Verifies a Groth16 zero-knowledge proof over **BN254** inside a Stellar **Soroban**
contract (native `crypto::bn254` host functions, Protocol 25 "X-Ray") **and seals the
result as a public, replay-protected attestation**. This is the on-chain half of Lacre:
it turns a **zk-email (DKIM)** proof into a public fact anyone can verify, while the
email itself never touches the chain.

## Status — verify + attest, NOT deployed (kept for security review)

The contract is intentionally **undeployed**: it is being audited for logic/security
flaws across several independent reviewers before it touches any network.

### API

| fn | effect |
|---|---|
| `verify_proof(proof, pub_signals) -> bool` | pure Groth16 check, no state change |
| `submit_proof(proof, pub_signals) -> id` | **verify → anti-replay → persist Attestation → emit `Sealed`**; returns the id (== nullifier) |
| `get_attestation(id) -> Option<Attestation>` | reads real on-chain state for the public `/p/:id` page |
| `is_sealed(nullifier) -> bool` | has this email/proof been sealed already? |

`pub_signals: Vec<BytesN<32>>` — public signals as 32-byte big-endian field elements
(exactly how snarkjs / zk-email emit them).

### Public-signal layout (contract ↔ circuit convention)

```
pub_signals[0]  = nullifier   — unique per email; the circuit must bind it to the
                                DKIM signature so the SAME email can't be sealed twice
pub_signals[1..] = the proven public statement (signing-domain commitment, amount,
                                reference, …) — the circuit decides what to expose
```

### Attestation (what `/p/:id` reads — holds NO email contents)

```rust
Attestation { nullifier: BytesN<32>, statement_hash: BytesN<32>, ledger: u32, timestamp: u64 }
//            └ anti-replay key      └ domain-separated sha256 of the STATEMENT (excl. nullifier)
```

### Central security property

The contract **trusts `pub_signals` only after the pairing passes AND only as canonical
field elements**. A valid Groth16 proof binds them mathematically, but a non-canonical
encoding (≥ r) reduces to the same scalar while differing as bytes — so those are rejected
up front (`ensure_canonical`). With that, taking the nullifier from `pub_signals[0]` is safe.

### Measured cost (toy fixture, 1 public input)

| tx | CPU instr | Memory | % of tx CPU limit |
|---|---|---|---|
| `verify_proof` (pure) | 25,595,385 | 207,399 B | ~25.6% |
| `submit_proof` (verify + seal) | **25,652,812** | 227,826 B | **~25.6%** |
| `submit_proof` replay (rejected pre-pairing) | **49,876** | — | **~0.05%** |

→ Sealing adds **~53k instructions** over verification — negligible. The whole sponsored
tx fits in **one transaction** with huge headroom; the dominant cost is the BN254 pairing
(~17.5M). The **sponsored gas model** (Lacre pays; user needs no wallet/XLM) stays at
cents per seal. WASM artifact: **25 KB**.

## Audit surface

A first external audit (run blind, without these notes) found — and we FIXED:

- **[HIGH] Non-canonical field elements → malleable anti-replay.** `x` and `x+r` reduce to
  the same scalar (the proof verifies for both) but differ as bytes, so `nullifier+r` slipped
  past the replay check ⇒ the same email sealable ~4–5×. **Fixed:** `ensure_canonical` rejects
  any signal ≥ r (`FieldElementNotCanonical`) before verify/seal. Test: `35 + r` is refused
  even though it is the same field element as `35`.
- **[MED] Replay charged after the pairing → sponsor griefing.** **Fixed:** the nullifier
  check now runs BEFORE the pairing — a known-sealed replay costs **~50k CPU, not ~25.6M**
  (~500× cut). Test asserts the cost.
- **[MED/LOW] No domain separation in the commitment.** **Fixed:** preimage is now
  `"LACRE_ATTESTATION_V1" || statement_signals`, and the hash EXCLUDES the nullifier, so
  `statement_hash` commits to *the fact*, not *this email*.

Open for the integration phase — confirmed across **three** audit rounds; none block the
contract logic (the risk has moved to the zk-email wiring):

1. **Nullifier soundness is the CIRCUIT's job.** The contract only guarantees "haven't seen
   these 32 bytes." The real zk-email circuit must derive the nullifier from a stable
   email/DKIM property (e.g. `b=`) that the prover cannot freely choose.
2. **Statement-signal invariant.** `hash_statement` skips `pub_signals[0]`, so a
   nullifier-only VK (the toy) hashes just `DOMAIN_TAG` → a constant. The real VK MUST expose
   ≥1 statement signal after the nullifier; add a `pub_signals.len() >= 2` guard at the swap.
3. **No recipient/address binding.** `submit_proof` is permissionless: a third party can
   publish your attestation first (steals nothing; the nullifier blocks double-seal).
   "Ownership" requires the circuit to bind an address / recipient hash / challenge.
4. **Opaque attestation (product).** The chain stores only commitments — `/p/:id` cannot
   render "Received $250" from chain alone. The proof link carries the public statement; the
   frontend recomputes `statement_hash` and checks it against the stored one.
5. **Relayer abuse is off-chain.** The contract can't tell a legit user from someone holding
   many valid emails. The sponsored submit service needs rate limiting before it pays fees.
6. **TTL / rent.** `persistent`, ~90-day TTL bumped on write; a lapsed one can be evicted.
   The UI must say "renewable on-chain storage", not "forever".
7. **Implicit versioning / immutable.** `DOMAIN_TAG` carries `V1` but the Attestation stores
   no schema; contract-address = version. No admin/pause: a bug ⇒ redeploy to a new address,
   and the app must pin contract address + circuit layout for old proof links.
8. **Malformed-point handling.** The typed `Bn254*Affine` ABI means the host decodes points,
   but test invalid point encodings through the real frontend/relayer/CLI path before mainnet.
9. **Toy VK still embedded.** Biggest integration risk: the real zk-email VK + exact layout
   (nullifier at index 0, ≥1 statement signal, decimal-string→32-byte-BE encoding, N inputs).

## Run

```bash
cd contracts/verifier
cargo test                                       # 10 tests: verify + seal + replay + canonicity + budgets
cargo test budget -- --nocapture                 # prints verify & submit budget breakdowns
cargo build --target wasm32v1-none --release     # deploy artifact (lacre_verifier.wasm, 25 KB)
```

## Next (after the audit)
1. Get a real **zk-email** Groth16 VK + proof (Circom/snarkjs Groth16 over BN254 → compatible).
2. Regenerate the verifier from that VK:
   `soroban-verifier-gen --vk verification_key.json --out verifier --curve bn254`,
   and lay out the circuit's public signals as above (nullifier at index 0).
3. Deploy to testnet → mainnet; wire the frontend "Seal on Stellar" step to a **sponsored
   submit** (service-account fee-bump), reading `get_attestation` for `/p/:id`.

*Groth16/BN254 core ported from [mysteryon88/soroban-verifier-gen](https://github.com/mysteryon88/soroban-verifier-gen); attestation + nullifier layer is Lacre's.*
