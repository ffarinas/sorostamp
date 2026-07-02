// Turn snarkjs proof_s.json + public_s.json into the Stellar CLI argument files for
// submit_proof. Serialization must match the contract (test.rs): G1 = x‖y (32+32 BE);
// G2 = x.c1‖x.c0‖y.c1‖y.c0, where snarkjs pi_b = [[x.c0,x.c1],[y.c0,y.c1],...].
const fs = require("fs");
const proof = require("./proof_s.json");
const pub = require("./public_s.json");

const h = (d) => BigInt(d).toString(16).padStart(64, "0"); // 32-byte big-endian hex

const a = h(proof.pi_a[0]) + h(proof.pi_a[1]);
const b =
  h(proof.pi_b[0][1]) + h(proof.pi_b[0][0]) + // x.c1, x.c0
  h(proof.pi_b[1][1]) + h(proof.pi_b[1][0]);  // y.c1, y.c0
const c = h(proof.pi_c[0]) + h(proof.pi_c[1]);

fs.writeFileSync("proof_arg.json", JSON.stringify({ a, b, c }));
fs.writeFileSync("pubsignals_arg.json", JSON.stringify(pub.map(h)));
console.log("a:", a.length / 2, "b:", b.length / 2, "c:", c.length / 2, "bytes | pub_signals:", pub.length);
