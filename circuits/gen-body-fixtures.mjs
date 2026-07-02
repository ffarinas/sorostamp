// Generate contract test fixtures for verifier-body from the REAL Zinli
// purchase proof: proof.json + public.json + suffix.bin + verification key.
// Uses the witness already computed by gen-body-input.mjs + generate_witness.
import fs from "fs";
import * as snarkjs from "snarkjs";

const ZKEY = "./build_body/sorostamp_body_final.zkey";
const WTNS = "./build_body/witness_body.wtns";
const VKEY = "./build_body/verification_key_body.json";
const OUT = "../contracts/verifier-body/fixtures/bn254";

const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, WTNS);

// paranoia: verify locally before blessing as a fixture
const vkey = JSON.parse(fs.readFileSync(VKEY, "utf8"));
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
if (!ok) throw new Error("local verification failed — refusing to write fixtures");

// cross-check bh in the signals against the expected value from input-gen
const exp = JSON.parse(fs.readFileSync("build_body/expected_body.json", "utf8"));
const hex32 = (hi, lo) =>
  BigInt(hi).toString(16).padStart(32, "0") + BigInt(lo).toString(16).padStart(32, "0");
if (hex32(publicSignals[5], publicSignals[6]) !== exp.bh) throw new Error("bh mismatch in proof publics");
if (Number(publicSignals[9]) !== exp.consumed) throw new Error("consumed mismatch in proof publics");

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify(proof, null, 1));
fs.writeFileSync(`${OUT}/public.json`, JSON.stringify(publicSignals, null, 1));
fs.copyFileSync("build_body/suffix.bin", `${OUT}/suffix.bin`);
fs.copyFileSync(VKEY, `${OUT}/verification_key.json`);

const nul = BigInt(publicSignals[0]).toString(16).padStart(64, "0");
console.log("fixtures OK →", OUT);
console.log("nullifier:", nul, "| signals:", publicSignals.length, "| local verify: PASS");
process.exit(0);
