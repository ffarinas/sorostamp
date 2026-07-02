# Sorostamp — mainnet deployment & trusted-setup disclosure

**Sorostamp is LIVE on Stellar mainnet:**

| Contract | Address |
|---|---|
| Header verifier (`submit_proof`) | `CCZQCQISEKU6KHXAIGO336MS6ROMMKZE6ONEHBLT33EADLWZUPSCPG27` |
| Body verifier (`seal_body`, hash-completion) | `CDGRALTQPLSRM656AUG7Y6YSR3BVVKY5BUWL4VXE5NMRMP4VJ56PEJM7` |

RPC: `https://soroban-rpc.creit.tech` (note: `mainnet.sorobanrpc.com` accepted
reads but timed out on submission during deploy — creit worked with a 0.1 XLM
fee cap). The testnet contracts remain live for development
(`CDAFTUPV…T3Y5` header, `CAEL5NZI…QFU7` body).

## ⚠️ DISCLOSURE: single-contributor trusted setup

Both proving keys (`sorostamp_final.zkey`, `sorostamp_body_final.zkey`) were
produced with a **single Phase-2 contribution** on the builder's machine —
meaning the party who ran the setup could, in principle, forge proofs the
contracts would accept. We ship the hackathon deployment with this honest
disclosure; **before real-value use, the ceremony below is mandatory**: a
multi-party Phase-2 setup is sound as long as *at least one* contributor was
honest. This is a multi-person event — it can't be done by one machine.

### Ceremony outline (snarkjs Groth16 Phase 2)

```bash
# starting from the Phase-1 powers-of-tau (pot21) + the compiled r1cs
snarkjs groth16 setup sorostamp.r1cs pot21_final.ptau sorostamp_0000.zkey

# each independent contributor, in turn (different people / machines):
snarkjs zkey contribute sorostamp_0000.zkey sorostamp_0001.zkey \
  --name="Contributor 1" -e="<random entropy 1>"
snarkjs zkey contribute sorostamp_0001.zkey sorostamp_0002.zkey \
  --name="Contributor 2" -e="<random entropy 2>"
# … as many as you can get; more honest parties = stronger security …

# finalize with a public, unpredictable beacon (e.g. a future Bitcoin block hash)
snarkjs zkey beacon sorostamp_000N.zkey sorostamp_final_mainnet.zkey \
  <beaconHash> 10 -n="Final Beacon"

# verify the full chain, then export the verification key
snarkjs zkey verify sorostamp.r1cs pot21_final.ptau sorostamp_final_mainnet.zkey
snarkjs zkey export verificationkey sorostamp_final_mainnet.zkey \
  verification_key_mainnet.json
```

Publish each contributor's attestation/transcript so anyone can audit the
ceremony.

## Then: regenerate the verifier and deploy

The contract's hard-coded verification key (`VK_*` constants in
`lacre/contracts/verifier/src/lib.rs`) is derived from `verification_key.json`.
After the ceremony you must regenerate those constants from the **new**
`verification_key_mainnet.json` (the `soroban-verifier-gen` tool used originally),
rebuild, and re-run the contract's test suite.

```bash
# 1. regenerate VK constants from the mainnet verification key, rebuild + test
#    (see /tmp/lacre-ref/soroban-verifier-gen — the generator used for testnet)
cargo test -p verifier   # all 10 tests must stay green

# 2. deploy to mainnet (funded mainnet account required)
stellar contract deploy --wasm target/.../verifier.wasm \
  --network mainnet --source <funded-mainnet-account>

# 3. point the frontend at mainnet
#    - lib/data.ts → NET: rpcUrl=https://mainnet.sorobanrpc.com (or your provider),
#      networkPassphrase="Public Global Stellar Network ; September 2015",
#      explorer=https://stellar.expert/explorer/public, verifier=<new id>, name="Stellar mainnet"
#    - regenerate the TS bindings:
#      stellar contract bindings typescript --network mainnet \
#        --contract-id <new id> --output-dir packages/sorostamp-contract
#    - fund the sponsor account with real XLM and set SOROSTAMP_SPONSOR_SECRET

# 4. the new mainnet zkey (sorostamp_final_mainnet.zkey) goes to R2;
#    set NEXT_PUBLIC_ZKEY_URL to its public URL (see DEPLOY.md)
```

## Recommendation

For the hackathon submission, **keep testnet**: it's live, verified end-to-end
(`is_sealed → true`, real BN254 pairing checked on-chain), and the UI labels it
honestly as testnet. Promote to mainnet only after a real ceremony — shipping a
single-contributor zkey to mainnet would be worse than not shipping at all.
