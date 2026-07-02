// Generate fresh contract test fixtures (proof.json + public.json) from the
// GENERIC circuit + new zkey, so `cargo test -p verifier` verifies against the
// regenerated VK. Proves the Zinli .eml revealing the Subject (same as the pilot).
import fs from "fs";
import * as snarkjs from "snarkjs";
import { generateEmailVerifierInputs } from "@zk-email/helpers/dist/input-generators.js";

const EML = "../../example-emails/_💰¡Recibiste un Zinli! - Ref. 042091652259.eml";
const WASM = "./build_generic/sorostamp_generic_js/sorostamp_generic.wasm";
const ZKEY = "./build_generic/sorostamp_gen_final.zkey";
const OUT = "../contracts/verifier/fixtures/bn254";

const base = await generateEmailVerifierInputs(fs.readFileSync(EML), { maxHeadersLength: 1088, ignoreBodyHashCheck: true });
const hdr = base.emailHeader.map((x) => String.fromCharCode(Number(x))).join("");
const at = hdr.toLowerCase().indexOf("subject:") + "subject:".length;
let end = hdr.indexOf("\r\n", at); if (end < 0) end = hdr.length;
const inputs = { ...base, headerMask: base.emailHeader.map((_, i) => (i >= at && i < end ? "1" : "0")), revealStartIndex: String(at) };

const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);
fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify(proof, null, 1));
fs.writeFileSync(`${OUT}/public.json`, JSON.stringify(publicSignals, null, 1));
fs.copyFileSync("./build_generic/verification_key_generic.json", `${OUT}/verification_key.json`);

const nul = BigInt(publicSignals[0]).toString(16).padStart(64, "0");
console.log("wrote proof.json + public.json + verification_key.json to", OUT);
console.log("nullifier:", nul, "| signals:", publicSignals.length);
process.exit(0);
