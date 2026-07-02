// Build circuit inputs for sorostamp_body.circom from a real Zinli purchase
// .eml, and self-check every cryptographic claim BEFORE proving:
//   sha256(canonicalBody) == bh=, JS midstate resume reproduces bh=, the fact
//   spans decode to the expected values, and all spans fit the 1536-byte window.
//
// The pure functions here (sha256 midstate, QP index-map decode, Zinli template
// extraction, window/suffix split) port 1:1 into the browser worker.
//
// Usage: node gen-body-input.mjs ["path/to/email.eml"]
// Writes: build_body/input_body.json, build_body/suffix.bin, build_body/expected_body.json

import fs from "fs";
import crypto from "crypto";
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim/index.js";
import { generateEmailVerifierInputsFromDKIMResult } from "@zk-email/helpers/dist/input-generators.js";

const EML = process.argv[2];
if (!EML) throw new Error("usage: node gen-body-input.mjs <path/to/email.eml>");

const MAX_HEADERS = 1088;
const MAX_WINDOW = 1536; // 24 SHA blocks
const MAX_FACT = 186;
const MAX_FROM = 124;

/* ── SHA-256 midstate (compression only, no padding) ─────────────────────── */
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function shaCompress(state, block, off) {
  const w = new Array(64);
  for (let i = 0; i < 16; i++) {
    w[i] =
      ((block[off + 4 * i] << 24) | (block[off + 4 * i + 1] << 16) | (block[off + 4 * i + 2] << 8) | block[off + 4 * i + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
    const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = state;
  for (let i = 0; i < 64; i++) {
    const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
    const ch = ((e & f) ^ (~e & g)) >>> 0;
    const t1 = (h + s1 + ch + SHA_K[i] + w[i]) >>> 0;
    const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
    const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
    const t2 = (s0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
}

/** Midstate (32 bytes, BE words) after hashing `nBytes` (multiple of 64) of `data`. */
export function shaMidstate(data, nBytes) {
  if (nBytes % 64 !== 0) throw new Error("midstate cut must be block-aligned");
  const state = [...SHA_IV];
  for (let off = 0; off < nBytes; off += 64) shaCompress(state, data, off);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[4 * i] = state[i] >>> 24; out[4 * i + 1] = (state[i] >>> 16) & 0xff;
    out[4 * i + 2] = (state[i] >>> 8) & 0xff; out[4 * i + 3] = state[i] & 0xff;
  }
  return out;
}

/* ── quoted-printable decode with a decoded→raw index map ────────────────── */
/** Decode `raw[from..to)` as QP, returning { text, map } where map[i] is the
 *  raw offset of decoded char i. Soft line breaks (=\r\n) vanish; =XX becomes
 *  one char. Lets us regex on readable text but mask RAW bytes. */
export function qpDecodeWithMap(raw, from, to) {
  let text = "";
  const map = [];
  let i = from;
  while (i < to) {
    const b = raw[i];
    if (b === 0x3d /* '=' */ && i + 2 < to) {
      const a = raw[i + 1], c = raw[i + 2];
      if (a === 0x0d && c === 0x0a) { i += 3; continue; } // soft break
      const hex = String.fromCharCode(a, c);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        text += String.fromCharCode(parseInt(hex, 16));
        map.push(i);
        i += 3;
        continue;
      }
    }
    text += String.fromCharCode(b);
    map.push(i);
    i++;
  }
  return { text, map };
}

/* ── Zinli purchase template: locate the three fact spans ────────────────── */
/** Each fact is revealed as label+value TOGETHER (anti-mislabeling): the mask
 *  runs from the label's first raw byte to the value's last raw byte. */
export const ZINLI_FACTS = [
  { key: "monto", label: "Monto", value: /Monto[\s\S]{0,300}?(\$[\d][\d.,]*)/ },
  { key: "comercio", label: "Comercio", value: /Comercio[\s\S]{0,300}?>\s*([^<]{2,100}?)\s*</ },
  { key: "referencia", label: "Referencia", value: /Referencia[\s\S]{0,300}?>\s*(\d{6,18})\s*</ },
];

export function locateZinliFacts(body) {
  const facts = [];
  for (const f of ZINLI_FACTS) {
    // LAST occurrence of the label = the HTML part (facts appear in both MIME parts)
    const labelBytes = Buffer.from(f.label);
    const labelAt = body.lastIndexOf(labelBytes);
    if (labelAt < 0) throw new Error(`Zinli template: label "${f.label}" not found in body`);
    const { text, map } = qpDecodeWithMap(body, labelAt, Math.min(labelAt + 500, body.length));
    const m = f.value.exec(text);
    if (!m) throw new Error(`Zinli template: value for "${f.label}" not found`);
    const valueEndDecoded = m.index + m[0].length; // end of the full match = end of value
    const rawEnd = map[valueEndDecoded - 1] + 1;
    facts.push({ key: f.key, start: labelAt, end: rawEnd, value: m[1].trim() });
  }
  return facts;
}

/* ── window / suffix split ───────────────────────────────────────────────── */
export function splitBody(body, facts) {
  const firstStart = Math.min(...facts.map((f) => f.start));
  const lastEnd = Math.max(...facts.map((f) => f.end));
  const windowStart = Math.floor(firstStart / 64) * 64;
  const windowEnd = windowStart + MAX_WINDOW;
  if (lastEnd > windowEnd)
    throw new Error(`fact region ${lastEnd - windowStart} B exceeds the ${MAX_WINDOW} B window`);
  if (windowEnd > body.length)
    throw new Error("window would run past the end of the body — facts too close to the end");
  return { windowStart, windowEnd };
}

/* ── main ────────────────────────────────────────────────────────────────── */
const raw = fs.readFileSync(EML);
const dkim = await verifyDKIMSignature(raw);
const body = dkim.body; // canonicalized exactly as bh= commits to it

// self-check 0: our ground truth
const bhBytes = Buffer.from(dkim.bodyHash, "base64");
const bodySha = crypto.createHash("sha256").update(body).digest();
if (!bodySha.equals(bhBytes)) throw new Error("sha256(canonical body) != bh — canonicalization broken");

// header-side inputs (same path the generic circuit uses)
const base = generateEmailVerifierInputsFromDKIMResult(dkim, {
  maxHeadersLength: MAX_HEADERS,
  ignoreBodyHashCheck: true,
});
const hdrBuf = Buffer.from(base.emailHeader.map(Number));

// bh= location in the signed header
const bhIndex = hdrBuf.indexOf(Buffer.from(dkim.bodyHash));
if (bhIndex < 0) throw new Error("bh= base64 not found in canonical header");
const pre = hdrBuf.subarray(bhIndex - 4, bhIndex).toString();
if (!/^[; ]bh=$/.test(pre)) throw new Error(`unexpected bytes before bh=: ${JSON.stringify(pre)}`);

// From reveal (value only, like the generic circuit's field reveal)
const hdrStr = hdrBuf.toString("latin1");
const fromKey = "from:";
const fromAt = hdrStr.toLowerCase().indexOf(fromKey);
if (fromAt < 0) throw new Error("no from: in canonical header");
const fromStart = fromAt + fromKey.length;
let fromEnd = hdrStr.indexOf("\r\n", fromStart);
if (fromEnd < 0) fromEnd = hdrStr.length;
if (fromEnd - fromStart > MAX_FROM) fromEnd = fromStart + MAX_FROM;
const headerMask = base.emailHeader.map((_, i) => (i >= fromStart && i < fromEnd ? "1" : "0"));

// facts, window, midstate, suffix
const facts = locateZinliFacts(body);
for (const f of facts) {
  if (f.end - f.start > MAX_FACT)
    throw new Error(`fact "${f.key}" span ${f.end - f.start} B exceeds ${MAX_FACT} B`);
}
const { windowStart, windowEnd } = splitBody(body, facts);
const windowBytes = body.subarray(windowStart, windowEnd);
const m1 = shaMidstate(body, windowStart);
const consumed = windowEnd; // prefix + window
const suffix = body.subarray(windowEnd);

// self-check 1: JS resume over window+suffix from M1 must reproduce bh
{
  const rest = body.subarray(windowStart);
  const state = [];
  for (let i = 0; i < 8; i++)
    state.push(((m1[4 * i] << 24) | (m1[4 * i + 1] << 16) | (m1[4 * i + 2] << 8) | m1[4 * i + 3]) >>> 0);
  // full-message hash by continuing from m1: easiest cross-check via node crypto on the whole body already done (self-check 0); here we check block math:
  const state2 = [...state];
  const full = Math.floor(rest.length / 64) * 64;
  for (let off = 0; off < full; off += 64) shaCompress(state2, rest, off);
  // final partial block + padding
  const remLen = rest.length - full;
  const totalBits = BigInt(body.length) * 8n;
  const tail = Buffer.alloc(remLen < 56 ? 64 : 128);
  rest.copy(tail, 0, full);
  tail[remLen] = 0x80;
  tail.writeBigUInt64BE(totalBits, tail.length - 8);
  for (let off = 0; off < tail.length; off += 64) shaCompress(state2, tail, off);
  const digest = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) digest.writeUInt32BE(state2[i], 4 * i);
  if (!digest.equals(bhBytes)) throw new Error("JS midstate resume != bh — midstate math broken");
}

// assemble circuit input
const factMask = facts.map((f) =>
  Array.from({ length: MAX_WINDOW }, (_, i) =>
    i >= f.start - windowStart && i < f.end - windowStart ? "1" : "0"
  )
);
const input = {
  emailHeader: base.emailHeader,
  emailHeaderLength: base.emailHeaderLength,
  pubkey: base.pubkey,
  signature: base.signature,
  headerMask,
  fromStartIndex: String(fromStart),
  bhIndex: String(bhIndex),
  m1Bytes: Array.from(m1, String),
  windowBytes: Array.from(windowBytes, String),
  windowBlocks: String(MAX_WINDOW / 64),
  consumedBytes: String(consumed),
  factMask,
  factStart: facts.map((f) => String(f.start - windowStart)),
};

fs.mkdirSync("build_body", { recursive: true });
fs.writeFileSync("build_body/input_body.json", JSON.stringify(input));
fs.writeFileSync("build_body/suffix.bin", suffix);
fs.writeFileSync(
  "build_body/expected_body.json",
  JSON.stringify(
    {
      eml: EML,
      from: hdrStr.slice(fromStart, fromEnd),
      bh: bhBytes.toString("hex"),
      m1: Buffer.from(m1).toString("hex"),
      consumed,
      suffixLen: suffix.length,
      bodyLen: body.length,
      windowStart,
      facts: facts.map((f) => ({ key: f.key, value: f.value, span: f.end - f.start, raw: body.subarray(f.start, f.end).toString("latin1") })),
    },
    null,
    2
  )
);

console.log("bh:", bhBytes.toString("hex"));
console.log("window:", windowStart, "→", windowEnd, "| consumed:", consumed, "| suffix:", suffix.length, "B");
for (const f of facts) console.log(`fact ${f.key}: "${f.value}" (span ${f.end - f.start} B @ window+${f.start - windowStart})`);
console.log("from:", JSON.stringify(hdrStr.slice(fromStart, fromEnd)));
console.log("wrote build_body/input_body.json + suffix.bin + expected_body.json");
