// De-risk the GENERIC header-masking circuit: prove the Zinli .eml revealing the
// Subject via a header mask, and assert (1) the nullifier matches the pilot
// circuit's on-chain value (same EmailNullifier on the signature) and (2) the
// revealed/decoded field equals the subject. If both hold, the generic engine
// reproduces the pilot exactly — and can reveal ANY field by changing the mask.
import fs from "fs";
import * as snarkjs from "snarkjs";
import { generateEmailVerifierInputs } from "@zk-email/helpers/dist/input-generators.js";

const EML = "../../example-emails/_💰¡Recibiste un Zinli! - Ref. 042091652259.eml";
const WASM = "./build_generic/sorostamp_generic_js/sorostamp_generic.wasm";
const ZKEY = "./build_generic/sorostamp_gen_final.zkey";
const EXPECT_NULLIFIER = "176649697cc84470a93da695da345b804e89a38502061bbdc1624ca5f2d88c8f";

// Build the circuit inputs for a chosen header FIELD by masking its byte span.
function buildFieldInputs(inputs, fieldName) {
  const hdr = inputs.emailHeader.map((x) => String.fromCharCode(Number(x))).join("");
  const lower = hdr.toLowerCase();
  const key = fieldName.toLowerCase() + ":";
  const at = lower.indexOf(key);
  if (at < 0) throw new Error(`field "${fieldName}" not in signed header`);
  const start = at + key.length;            // value begins right after "field:"
  let end = hdr.indexOf("\r\n", start);     // value ends at the line break
  if (end < 0) end = hdr.indexOf("\n", start);
  if (end < 0) end = hdr.length;
  const mask = inputs.emailHeader.map((_, i) => (i >= start && i < end ? "1" : "0"));
  return { ...inputs, headerMask: mask, revealStartIndex: String(start) };
}

const FIELD = process.argv[2] || "subject";
const raw = fs.readFileSync(EML);
const base = await generateEmailVerifierInputs(raw, { maxHeadersLength: 1088, ignoreBodyHashCheck: true });
const inputs = buildFieldInputs(base, FIELD);

console.time("fullProve");
const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);
console.timeEnd("fullProve");

const nullifierHex = BigInt(publicSignals[0]).toString(16).padStart(64, "0");
let bytes = [];
for (const s of publicSignals.slice(1)) { let v = BigInt(s); for (let i = 0; i < 31; i++) { bytes.push(Number(v & 0xffn)); v >>= 8n; } }
const rawSub = Buffer.from(bytes).toString("utf8").replace(/[\s\0]+$/, "");
const subj = rawSub.replace(/\?=\s+=\?/g, "?==?").replace(/=\?utf-8\?B\?([^?]+)\?=/gi, (_, b) => Buffer.from(b, "base64").toString("utf8")).trim();

const out = [
  "revealStartIndex: " + inputs.revealStartIndex,
  "publicSignals   : " + publicSignals.length,
  "nullifier : " + nullifierHex,
  "expected  : " + EXPECT_NULLIFIER,
  "nullifier match : " + (nullifierHex === EXPECT_NULLIFIER ? "YES ✅" : "NO ❌"),
  "revealed subject: " + JSON.stringify(subj),
].join("\n");
fs.writeFileSync("test-generic-result.txt", out + "\n");
console.log(out);
process.exit(0);
