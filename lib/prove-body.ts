/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — body-fact proving: pure helpers (no DOM, no Node APIs)

   The body circuit ("hash completion" scheme) splits the canonicalized body:

     [ prefix ............ ][ window (facts) ][ suffix .................. ]
       private, collapsed     hashed + masked   published verbatim — the
       to SHA midstate M1     IN-CIRCUIT         contract resumes SHA-256
                                                 from M2 and must hit bh=

   Everything here is deliberately runtime-agnostic (worker, browser page,
   server route all import it): SHA-256 midstate math, quoted-printable
   decoding with a raw-offset map, the Zinli purchase template, the
   window/suffix split, the suffix PII audit, and fact-chunk decoding for
   displaying/verifying revealed spans.

   Validated against the real pipeline in lacre/circuits/gen-body-input.mjs
   (same functions, Node run: witness OK + bh match on a real Zinli receipt).
   ═══════════════════════════════════════════════════════════════════ */

/* Circuit parameters — MUST match circuits/sorostamp_body.circom:
   component main = SorostampBody(1088, 121, 17, 1536, 124, 186, 3); */
export const BODY_MAX_HEADERS = 1088;
export const BODY_MAX_WINDOW = 1536; // 24 SHA blocks
export const BODY_MAX_FACT = 186;
export const BODY_MAX_FROM = 124;
export const BODY_NUM_SIGNALS = 28;

/* Public-signal indices (contract ABI) */
export const SIG = {
  nullifier: 0,
  from: 1, // ..4 (4 chunks)
  bhHi: 5,
  bhLo: 6,
  m2Hi: 7,
  m2Lo: 8,
  consumed: 9,
  facts: 10, // 3 × 6 chunks
  factChunks: 6,
} as const;

/* ── SHA-256 midstate (compression only — no padding) ────────────────── */
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
const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

function shaCompress(state: number[], block: Uint8Array, off: number): void {
  const w = new Array<number>(64);
  for (let i = 0; i < 16; i++) {
    w[i] =
      ((block[off + 4 * i] << 24) |
        (block[off + 4 * i + 1] << 16) |
        (block[off + 4 * i + 2] << 8) |
        block[off + 4 * i + 3]) >>>
      0;
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

/** SHA-256 midstate (32 bytes, BE words) after `nBytes` (multiple of 64) of `data`. */
export function shaMidstate(data: Uint8Array, nBytes: number): Uint8Array {
  if (nBytes % 64 !== 0) throw new Error("midstate cut must be block-aligned");
  const state = [...SHA_IV];
  for (let off = 0; off < nBytes; off += 64) shaCompress(state, data, off);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[4 * i] = state[i] >>> 24;
    out[4 * i + 1] = (state[i] >>> 16) & 0xff;
    out[4 * i + 2] = (state[i] >>> 8) & 0xff;
    out[4 * i + 3] = state[i] & 0xff;
  }
  return out;
}

/* ── byte/string utilities ───────────────────────────────────────────── */
/** Uint8Array → latin1 string (chunked to stay off the arg-spread limit). */
export function toLatin1(u8: Uint8Array, from = 0, to = u8.length): string {
  let s = "";
  for (let i = from; i < to; i += 8192) {
    s += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, to)));
  }
  return s;
}

/** Decode quoted-printable `raw[from..to)` with a decoded→raw offset map, so
    regexes run on readable text but masks address RAW bytes. */
export function qpDecodeWithMap(
  raw: Uint8Array,
  from: number,
  to: number
): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let i = from;
  while (i < to) {
    const b = raw[i];
    if (b === 0x3d /* '=' */ && i + 2 < to) {
      const a = raw[i + 1];
      const c = raw[i + 2];
      if (a === 0x0d && c === 0x0a) {
        i += 3; // soft line break — vanishes
        continue;
      }
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

/* ── generic selection: readable text ⇄ raw byte offsets ─────────────── */
/** A selected byte range in the CANONICAL body (what the mask will reveal). */
export type SelSpan = { start: number; end: number };

/** The suffix rides inside the sealing transaction. Soroban's tx cap is
    129,536 bytes and a measured seal_body envelope adds ~1.7 KB of proof +
    signals + op overhead, so ~110 KB of suffix fits with real margin — the
    error stays ours (honest) instead of the network's. */
export const SUFFIX_MAX_BYTES = 110_000;

export type Selectable = {
  /** human-readable body text (QP decoded, tags/style/script stripped,
      whitespace collapsed) — what the user reads and selects from */
  text: string;
  /** starts[i]/ends[i] = raw byte range of visible char i in the canonical body */
  starts: number[];
  ends: number[];
};

/** The canonical body is raw MIME: part headers, boundaries and base64
    attachment payloads are noise (and traps) for a human picking facts. Find
    the byte ranges of the TEXT parts (text/* not base64) — only those are
    rendered and suggested over. Single-part bodies pass through whole. */
export function textPartRanges(raw: Uint8Array): { start: number; end: number }[] {
  const s = toLatin1(raw);
  // boundary tokens: declared inline by nested multiparts, or implied by the
  // first line (the top-level boundary lives in the message headers, not here)
  const bset = new Set<string>();
  const bre = /boundary="?([^";\r\n]+)"?/gi;
  let bm: RegExpExecArray | null;
  while ((bm = bre.exec(s))) bset.add(bm[1].trim());
  const firstNl = s.indexOf("\r\n");
  const firstLine = s.slice(0, firstNl < 0 ? s.length : firstNl).trim();
  if (firstLine.startsWith("--")) bset.add(firstLine.slice(2).replace(/--$/, "").trim());
  if (!bset.size) return [{ start: 0, end: raw.length }];

  const isBoundary = (line: string) => {
    if (!line.startsWith("--")) return false;
    return bset.has(line.slice(2).replace(/--\s*$/, "").trim());
  };

  const ranges: { start: number; end: number }[] = [];
  let state: "search" | "headers" | "content" = "search";
  let ctype = "";
  let cte = "";
  let contentStart = -1;
  const closePart = (end: number) => {
    if (contentStart >= 0 && contentStart < end && /^text\//i.test(ctype) && !/base64/i.test(cte)) {
      ranges.push({ start: contentStart, end });
    }
    contentStart = -1;
  };

  let pos = 0;
  while (pos <= s.length) {
    const nl = s.indexOf("\r\n", pos);
    const lineEnd = nl < 0 ? s.length : nl;
    const line = s.slice(pos, lineEnd);
    if (isBoundary(line.trim())) {
      closePart(pos);
      state = "headers";
      ctype = "";
      cte = "";
    } else if (state === "headers") {
      if (line.trim() === "") {
        state = "content";
        contentStart = nl < 0 ? s.length : nl + 2;
      } else {
        const cm = /^content-type:\s*([^;\s]+)/i.exec(line);
        if (cm) ctype = cm[1];
        const em = /^content-transfer-encoding:\s*(\S+)/i.exec(line);
        if (em) cte = em[1];
      }
    }
    if (nl < 0) break;
    pos = nl + 2;
  }
  closePart(raw.length);
  return ranges.length ? ranges : [{ start: 0, end: raw.length }];
}

/** Build the readable view of the canonical body with a per-character map back
    to raw byte offsets, so a mouse selection over TEXT becomes a byte-exact
    reveal mask over the SIGNED bytes. Works for any provider/language.

    Only TEXT MIME parts are rendered (attachments/base64/part headers are
    skipped). The stream is decoded in layers -- QP soft-breaks/=XX first, then
    UTF-8 assembly (so accents render instead of mojibake), invisible layout
    characters are dropped, and a few common HTML entities are resolved -- while
    every visible char keeps its exact raw byte range for the mask. */
export function buildSelectable(raw: Uint8Array): Selectable {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (const range of textPartRanges(raw)) {
    const N = range.end;
    let i = range.start;
    let inTag = false;
    let tagName = "";
    let tagDone = false;
    let skipUntil: string | null = null; // "</style" | "</script" | "-->"
    let skipTail = "";
    let lastWasSpace = true;

    // one decoded byte, skipping QP soft breaks and resolving =XX escapes
    const readByte = (at: number): { b: number; next: number } | null => {
      while (at + 2 < N && raw[at] === 0x3d && raw[at + 1] === 0x0d && raw[at + 2] === 0x0a) at += 3;
      if (at >= N) return null;
      if (raw[at] === 0x3d && at + 2 < N) {
        const hex = String.fromCharCode(raw[at + 1], raw[at + 2]);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) return { b: parseInt(hex, 16), next: at + 3 };
      }
      return { b: raw[at], next: at + 1 };
    };

    while (i < N) {
      const r0 = readByte(i);
      if (!r0) break;
      let ch: string;
      let next = r0.next;
      let literal = false; // entity-decoded chars must not re-enter markup parsing

      // UTF-8 assembly: lead byte + continuations become ONE visible char
      if (r0.b >= 0xc2 && r0.b <= 0xf4) {
        const need = r0.b >= 0xf0 ? 3 : r0.b >= 0xe0 ? 2 : 1;
        const bytes = [r0.b];
        let p = next;
        let ok = true;
        for (let k = 0; k < need; k++) {
          const rn = readByte(p);
          if (!rn || (rn.b & 0xc0) !== 0x80) { ok = false; break; }
          bytes.push(rn.b);
          p = rn.next;
        }
        if (ok) {
          let cp = 0;
          if (need === 1) cp = ((bytes[0] & 0x1f) << 6) | (bytes[1] & 0x3f);
          else if (need === 2) cp = ((bytes[0] & 0x0f) << 12) | ((bytes[1] & 0x3f) << 6) | (bytes[2] & 0x3f);
          else cp = ((bytes[0] & 0x07) << 18) | ((bytes[1] & 0x3f) << 12) | ((bytes[2] & 0x3f) << 6) | (bytes[3] & 0x3f);
          // invisible layout chars (zero-width, soft hyphen, BOM, line seps): drop
          if ((cp >= 0x200b && cp <= 0x200f) || cp === 0x00ad || cp === 0xfeff || cp === 0x2028 || cp === 0x2029 || (cp >= 0x202a && cp <= 0x202e)) {
            i = p;
            continue;
          }
          ch = cp === 0xa0 ? " " : String.fromCodePoint(cp);
          next = p;
        } else {
          ch = String.fromCharCode(r0.b);
        }
      } else if (r0.b === 0xa0) {
        ch = " "; // stray nbsp byte
      } else {
        ch = String.fromCharCode(r0.b);
      }

      if (skipUntil) {
        skipTail = (skipTail + ch.toLowerCase()).slice(-10);
        if (skipTail.endsWith(skipUntil)) {
          if (skipUntil === "-->") {
            skipUntil = null;
          } else {
            skipUntil = null; // consumed "</style" -- swallow the rest of the tag
            inTag = true;
            tagDone = true;
            tagName = "";
          }
          skipTail = "";
        }
        i = next;
        continue;
      }

      if (inTag) {
        if (ch === ">") {
          inTag = false;
          if (tagName === "style") { skipUntil = "</style"; skipTail = ""; }
          else if (tagName === "script") { skipUntil = "</script"; skipTail = ""; }
        } else if (!tagDone && /[a-zA-Z]/.test(ch)) {
          tagName += ch.toLowerCase();
          if (tagName.length > 8) tagDone = true;
        } else if (!tagDone && ch === "!" && tagName === "") {
          tagName = "!";
        } else if (tagName === "!" && ch === "-") {
          tagName = "!-";
        } else if (tagName === "!-" && ch === "-") {
          inTag = false;
          skipUntil = "-->"; // "<!--" -- comments may contain ">"
          skipTail = "";
        } else {
          tagDone = true;
        }
        i = next;
        continue;
      }
      if (ch === "<") {
        inTag = true;
        tagName = "";
        tagDone = false;
        i = next;
        continue;
      }

      // common HTML entities (text emails abuse &nbsp; as spacing)
      if (ch === "&") {
        let ent = "";
        let p = next;
        for (let k = 0; k < 7 && p < N; k++) {
          const rn = readByte(p);
          if (!rn) break;
          const ec = String.fromCharCode(rn.b);
          p = rn.next;
          if (ec === ";") { ent += ec; break; }
          ent += ec;
        }
        const map: Record<string, string> = { "nbsp;": " ", "amp;": "&", "quot;": '"', "#39;": "'" };
        if (map[ent] !== undefined) {
          ch = map[ent];
          next = p;
          literal = true;
        }
      }
      void literal;

      // collapse whitespace runs
      if (/[\s ]/.test(ch)) {
        if (lastWasSpace) {
          i = next;
          continue;
        }
        ch = " ";
        lastWasSpace = true;
      } else {
        lastWasSpace = false;
      }
      text += ch;
      // astral chars (emoji) are TWO UTF-16 units — map each unit to the same
      // raw range so text indices and the offset arrays never drift
      for (let u = 0; u < ch.length; u++) {
        starts.push(i);
        ends.push(next);
      }
      i = next;
    }
    // separation between MIME parts so selections can't bridge them invisibly
    if (text && !text.endsWith(" ")) {
      text += " ";
      starts.push(ends[ends.length - 1] - 1);
      ends.push(ends[ends.length - 1]);
    }
  }
  return { text, starts, ends };
}

/** Map a selection over the readable text [from, to) to the raw byte span it
    covers (including any hidden formatting between the visible characters). */
export function textRangeToSpan(sel: Selectable, from: number, to: number): SelSpan | null {
  if (from >= to || from < 0 || to > sel.text.length) return null;
  return { start: sel.starts[from], end: sel.ends[to - 1] };
}

/** Suggest up to `max` reveal-worthy spans: currency amounts and long
    reference-like numbers, each extended left to carry a little context (the
    surrounding label), so verifiers see "Amount paid $100.00", not a bare
    number. Pure heuristics over the readable text — provider-agnostic.

    Facts usually appear more than once (text/plain part first, HTML part
    later). We anchor on the LAST occurrence and keep earlier matches that
    share its proving window: the later the window, the smaller the public
    suffix — which is both cheaper and more private. */
export function suggestSpans(sel: Selectable, max = 3): SelSpan[] {
  type M = { from: number; to: number };
  const found: M[] = [];
  const amount = /(?:[$€£]|USD|EUR|Bs\.?)\s?\d[\d.,]*/g;
  let m: RegExpExecArray | null;
  while ((m = amount.exec(sel.text))) found.push({ from: m.index, to: m.index + m[0].length });
  const ref = /\b\d[\d-]{7,19}\b/g;
  while ((m = ref.exec(sel.text))) {
    if (/\d{8,}/.test(m[0].replace(/-/g, ""))) found.push({ from: m.index, to: m.index + m[0].length });
  }
  if (!found.length) return [];
  found.sort((a, b) => a.from - b.from);

  // extend left for label context ("Monto $49.0", not a bare "$49.0"). Visible
  // chars ≠ raw bytes (HTML tags hide between them), so try word starts from
  // the farthest and shrink until the RAW span fits the circuit's fact limit.
  const withContext = (r: M): SelSpan | null => {
    let f = Math.max(0, r.from - 24);
    while (f > 0 && !/\s/.test(sel.text[f - 1])) f--;
    while (f < r.from) {
      while (f < r.from && !/[A-Za-z0-9$€£]/.test(sel.text[f])) f++;
      const span = textRangeToSpan(sel, f, r.to);
      if (span && span.end - span.start <= BODY_MAX_FACT) return span;
      // too many hidden bytes — drop the leftmost word and retry
      while (f < r.from && !/\s/.test(sel.text[f])) f++;
      while (f < r.from && /\s/.test(sel.text[f])) f++;
    }
    return textRangeToSpan(sel, r.from, r.to);
  };

  const dedupe = new Set<string>();
  const chosen: SelSpan[] = [];
  const fits = (cand: SelSpan) => {
    const all = [...chosen, cand];
    const first = Math.min(...all.map((s) => s.start));
    const last = Math.max(...all.map((s) => s.end));
    return last - Math.floor(first / 64) * 64 <= BODY_MAX_WINDOW;
  };
  // walk from the LAST match backwards
  for (let i = found.length - 1; i >= 0 && chosen.length < max; i--) {
    const key = sel.text.slice(found[i].from, found[i].to);
    if (dedupe.has(key)) continue;
    const span = withContext(found[i]);
    if (!span || span.end - span.start > BODY_MAX_FACT) continue;
    if (!fits(span)) continue;
    dedupe.add(key);
    chosen.push(span);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/* ── selection validation + window / suffix split ────────────────────── */
export type SelectionCheck =
  | { ok: true; windowStart: number; windowEnd: number; suffixLen: number }
  | { ok: false; error: string };

/** Validate 1–3 selected spans against the scheme's physics: each span ≤186
    bytes, all spans inside one 1536-byte window, window inside the body, and
    the public tail after the window small enough for the sealing transaction. */
export function checkSelection(bodyLen: number, spans: SelSpan[]): SelectionCheck {
  if (spans.length < 1) return { ok: false, error: "Select at least one thing to reveal." };
  if (spans.length > 3) return { ok: false, error: "Up to 3 reveals per proof." };
  for (const s of spans) {
    if (s.end - s.start > BODY_MAX_FACT) {
      return {
        ok: false,
        error: `One selection is ${s.end - s.start} bytes with its hidden formatting — the limit is ${BODY_MAX_FACT}. Select a shorter span.`,
      };
    }
  }
  const first = Math.min(...spans.map((s) => s.start));
  const last = Math.max(...spans.map((s) => s.end));
  const windowStart = Math.floor(first / 64) * 64;
  const windowEnd = windowStart + BODY_MAX_WINDOW;
  if (last > windowEnd) {
    return {
      ok: false,
      error: `Your selections span ${last - windowStart} bytes of the email — they must sit within ${BODY_MAX_WINDOW} bytes of each other (one proving window). Select facts that appear close together.`,
    };
  }
  if (windowEnd > bodyLen) {
    return { ok: false, error: "The selection sits too close to the end of the email for the proving window." };
  }
  const suffixLen = bodyLen - windowEnd;
  if (suffixLen > SUFFIX_MAX_BYTES) {
    return {
      ok: false,
      error: `Everything after your selection (${Math.round(suffixLen / 1024)} KB) must be published on-chain to complete the body hash — too large for one transaction (limit ~${Math.round(SUFFIX_MAX_BYTES / 1024)} KB). Emails with attachments after the facts can't be body-proven.`,
    };
  }
  return { ok: true, windowStart, windowEnd, suffixLen };
}

/* ── suffix PII audit ────────────────────────────────────────────────── */
export type SuffixAuditHit = { kind: string; excerpt: string };
export type SuffixAudit = {
  ok: boolean;
  hits: SuffixAuditHit[];
  /** human-readable preview of what will be published (QP-decoded, tags kept) */
  preview: string;
  bytes: number;
};

/** The suffix is published in the sealing transaction (public forever in the
    ledger). Scan its DECODED text for the user's identifiers and for anything
    email-shaped, and hand the UI an honest preview. `identifiers` come from the
    user's own email (To address, display name). */
export function auditSuffix(suffix: Uint8Array, identifiers: string[]): SuffixAudit {
  const { text } = qpDecodeWithMap(suffix, 0, suffix.length);
  const hits: SuffixAuditHit[] = [];
  const englobe = (at: number) =>
    text.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, " ").trim();

  for (const raw of identifiers) {
    const id = raw.trim();
    if (id.length < 4) continue; // too short to be meaningful
    let at = text.toLowerCase().indexOf(id.toLowerCase());
    while (at >= 0) {
      hits.push({ kind: `your "${id}"`, excerpt: englobe(at) });
      at = text.toLowerCase().indexOf(id.toLowerCase(), at + 1);
      if (hits.length > 8) break;
    }
  }
  // anything email-shaped that ISN'T the sender's own domain infrastructure
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = emailRe.exec(text)) && hits.length <= 8) {
    hits.push({ kind: `email address ${m[0]}`, excerpt: englobe(m.index) });
  }
  // attached files: their MIME headers sit in the suffix as plaintext even when
  // the payload is base64 — an attachment (PDF invoice…) would be published raw
  const attRe = /content-disposition:\s*attachment|content-type:\s*application\/[a-z]/gi;
  while ((m = attRe.exec(text)) && hits.length <= 10) {
    hits.push({ kind: "an ATTACHED FILE (would be published in full)", excerpt: englobe(m.index) });
  }

  return { ok: hits.length === 0, hits, preview: text, bytes: suffix.length };
}

/* ── revealed-fact decoding (proof card + /p page) ───────────────────── */
/** Unpack 31-bytes-per-field chunks (LSB-first) back into the raw span text. */
export function decodeFactChunks(chunks: string[]): string {
  const bytes: number[] = [];
  for (const s of chunks) {
    let v = BigInt(s);
    for (let i = 0; i < 31; i++) {
      bytes.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  let out = "";
  for (const b of bytes) if (b !== 0) out += String.fromCharCode(b);
  return out;
}

/** A revealed span is raw signed bytes: QP-encoded HTML like
    "Monto</strong></p>=0A<p style=3D…>$3.57". Derive the display pair
    { label, value } while keeping the raw span available for inspection. */
export function parseFactSpan(rawSpan: string): { label: string; value: string } {
  // QP-decode: drop soft breaks, decode =XX
  const unfolded = rawSpan.replace(/=\r?\n/g, "");
  const decoded = unfolded.replace(/=([0-9A-Fa-f]{2})/g, (_m, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  // strip tags → "Monto $3.57" (a span may end mid-tag: drop the dangling "<…" too)
  const text = decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sp = text.indexOf(" ");
  if (sp < 0) return { label: text, value: "" };
  return { label: text.slice(0, sp), value: text.slice(sp + 1).trim() };
}
