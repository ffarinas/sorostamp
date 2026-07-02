// Regenerate the Soroban verifier's VK byte constants from a snarkjs
// verification_key.json. Ports the serializer used by soroban-verifier-gen,
// matching the contract (test.rs g1/g2_from_coords + build-invoke-args.cjs):
//   G1 = x ‖ y                       (32+32 BE = 64 bytes)
//   G2 = x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0   (4×32 BE = 128 bytes)
// snarkjs vk_*_2 = [[x.c0,x.c1],[y.c0,y.c1],...], so c1 = p[0][1], c0 = p[0][0].
//
// Usage: node gen-vk.cjs <verification_key.json> > vk_generated.rs
const fs = require("fs");
const vkPath = process.argv[2] || "./verification_key_s.json";
const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));

const be32 = (d) => BigInt(d).toString(16).padStart(64, "0"); // 32-byte big-endian hex
const g1 = (p) => be32(p[0]) + be32(p[1]);
const g2 = (p) => be32(p[0][1]) + be32(p[0][0]) + be32(p[1][1]) + be32(p[1][0]);

function rustBytes(hex, indent) {
  const bytes = hex.match(/.{2}/g).map((b) => "0x" + b);
  let out = "";
  for (let i = 0; i < bytes.length; i += 16) out += indent + bytes.slice(i, i + 16).join(", ") + ",\n";
  return out;
}

const blocks = [];
blocks.push(`const VK_ALPHA: [u8; BN254_G1_SERIALIZED_SIZE] = [\n${rustBytes(g1(vk.vk_alpha_1), "    ")}];`);
blocks.push(`const VK_BETA: [u8; BN254_G2_SERIALIZED_SIZE] = [\n${rustBytes(g2(vk.vk_beta_2), "    ")}];`);
blocks.push(`const VK_GAMMA: [u8; BN254_G2_SERIALIZED_SIZE] = [\n${rustBytes(g2(vk.vk_gamma_2), "    ")}];`);
blocks.push(`const VK_DELTA: [u8; BN254_G2_SERIALIZED_SIZE] = [\n${rustBytes(g2(vk.vk_delta_2), "    ")}];`);
let ic = `const VK_IC: [[u8; BN254_G1_SERIALIZED_SIZE]; ${vk.IC.length}] = [\n`;
for (const p of vk.IC) ic += `    [\n${rustBytes(g1(p), "        ")}    ],\n`;
ic += "];";
blocks.push(ic);

fs.writeFileSync("vk_generated.rs", blocks.join("\n\n") + "\n");
console.error(`wrote vk_generated.rs | IC points: ${vk.IC.length} | nPublic: ${vk.nPublic}`);
