/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — proving Web Worker

   Runs the heavy work OFF the main thread so the UI never freezes and mobile
   Safari doesn't OOM-crash the tab. Two modes:

   header       — reveal one DKIM-signed header field (subject / from / …).
   body-extract — verify DKIM and return the CANONICAL body: the main thread
                  renders it and the user selects what to reveal (generic —
                  any provider, any language; no per-provider templates).
   body         — prove the user-selected raw-byte spans via the hash-completion
                  scheme. Consent already happened on the main thread.

   Proving keys are cached with the Cache API (sorostamp-zk-v1): the 400 MB–1 GB
   downloads happen once per browser, with real byte progress on first fetch.

   Messages IN:  { eml, mode: "header"|"body"|"body-extract", field?, spans?, wasmUrl, zkeyUrl }
   Messages OUT: { type: "progress", step, label, pct? }
                 { type: "extracted", body, from }              (body-extract)
                 { type: "result", proof, publicSignals }
                 { type: "error", message }
   ═══════════════════════════════════════════════════════════════════ */
/// <reference lib="webworker" />
import { Buffer } from "buffer";
import { BODY_MAX_FROM, BODY_MAX_HEADERS, BODY_MAX_WINDOW, shaMidstate, toLatin1 } from "./prove-body";

// @zk-email/helpers picks its crypto path via `typeof window !== 'undefined'`.
// A Web Worker has no `window`, so the library would take the NODE path and call
// `crypto.createPublicKey` — absent in the browser crypto polyfill (that's the
// "createPublicKey is not a function" failure). Alias `window` to the worker
// global so it uses its browser path (WebCrypto + node-forge + createVerify, all
// available in a worker). Runs at module load, before the dynamic @zk-email
// import inside onmessage is evaluated.
(globalThis as unknown as { window: unknown }).window = globalThis;

const MAX_HEADERS_LENGTH = 1088;

/* Translate the library's technical failures into honest, human messages.
   The most common one: an email that signs an unusually large set of headers
   overflows the circuit's 1088-byte header budget — @zk-email throws
   "Padding to max length did not complete properly! …1408 long but max is 1088". */
function humanizeInputError(e: unknown): Error {
  const m = e instanceof Error ? e.message : String(e);
  if (/Padding to max length|padded message is \d+ long|max is \d+/i.test(m)) {
    return new Error(
      "Sorostamp can't prove this particular email yet — its provider signs an unusually " +
        "large set of headers, more than we can process today. This is a limit on our side, " +
        "not a problem with your email. Everyday receipts and payment notifications work " +
        "great — try one of those."
    );
  }
  return e instanceof Error ? e : new Error(m);
}

type Step = "inputs" | "download" | "witness" | "prove" | "done";
function post(step: Step, label: string, pct?: number) {
  (self as unknown as Worker).postMessage({ type: "progress", step, label, pct });
}

/* ── proving-key fetch: Cache API first, network + real progress after ──
   cache.put consumes a clone of the SAME network stream while we read it, so
   the key is never duplicated in memory. Quota errors (Safari, incognito) just
   skip caching — proving still works, it downloads again next time. */
const ZK_CACHE = "sorostamp-zk-v1";

async function fetchZkeyWithProgress(url: string): Promise<Uint8Array> {
  let res: Response | null = null;
  let fromCache = false;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(ZK_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      res = hit;
      fromCache = true;
    }
  } catch {
    cache = null; // Cache API unavailable — plain fetch below
  }
  if (!res) {
    res = await fetch(url);
    if (!res.ok || !res.body) throw new Error("Couldn't load the proving key.");
    if (cache) {
      // write-through while we read; ignore quota/eviction failures
      cache.put(url, res.clone()).catch(() => {});
    }
  }
  if (!res.body) throw new Error("Couldn't load the proving key.");

  const total = Number(res.headers.get("content-length")) || 0;
  const label = fromCache
    ? "Loading the proving key (cached)"
    : "Downloading the proving key (one time)";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    post("download", label, total ? Math.round((received / total) * 100) : undefined);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/* ── header mode (unchanged flow) ─────────────────────────────────────── */
async function proveHeader(eml: ArrayBuffer, field: string, wasmUrl: string, zkeyUrl: string) {
  post("inputs", "Building circuit inputs");
  const { generateEmailVerifierInputs } = await import(
    "@zk-email/helpers/dist/input-generators"
  );
  const rawBuf = Buffer.from(new Uint8Array(eml));
  let inputs: Record<string, unknown> & { emailHeader: string[] };
  try {
    inputs = (await generateEmailVerifierInputs(rawBuf, {
      maxHeadersLength: MAX_HEADERS_LENGTH,
      ignoreBodyHashCheck: true,
    })) as Record<string, unknown> & { emailHeader: string[] };
  } catch (e) {
    throw humanizeInputError(e);
  }

  const hdr = inputs.emailHeader.map((x) => String.fromCharCode(Number(x))).join("");
  const keyName = field.toLowerCase() + ":";
  const at = hdr.toLowerCase().indexOf(keyName);
  if (at < 0) {
    throw new Error(`This email's DKIM-signed header has no "${field}" field to reveal.`);
  }
  const start = at + keyName.length;
  let end = hdr.indexOf("\r\n", start);
  if (end < 0) end = hdr.indexOf("\n", start);
  if (end < 0) end = hdr.length;
  // The circuit packs at most 124 revealed bytes (SorostampGeneric maxRevealLength).
  // A longer field (marketing subjects, fat From lines) must be truncated here —
  // an unclamped mask makes the reveal constraints unsatisfiable and the proof
  // dies with a cryptic snarkjs error instead of a truncated-but-valid reveal.
  const MAX_HEADER_REVEAL = 124;
  if (end - start > MAX_HEADER_REVEAL) end = start + MAX_HEADER_REVEAL;
  inputs.headerMask = inputs.emailHeader.map((_, i) => (i >= start && i < end ? "1" : "0"));
  inputs.revealStartIndex = String(start);

  const zkey = await fetchZkeyWithProgress(zkeyUrl);
  post("witness", "Computing the witness");
  const snarkjs = await import("snarkjs");
  post("prove", "Building the Groth16 proof");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);

  post("done", "Proof generated");
  (self as unknown as Worker).postMessage({ type: "result", proof, publicSignals });
}

/* ── body mode ─────────────────────────────────────────────────────────
   Two phases, both provider-agnostic:
   body-extract — verify DKIM, hand the CANONICAL body back to the main thread
                  (the user reads it and selects what to reveal there).
   body         — given the user's raw-byte spans, build the window/masks and
                  prove. No pausing: consent already happened on the main thread. */

async function extractBody(eml: ArrayBuffer) {
  post("inputs", "Verifying DKIM & decoding the body");
  const { verifyDKIMSignature } = await import("@zk-email/helpers/dist/dkim");
  const { generateEmailVerifierInputsFromDKIMResult } = await import(
    "@zk-email/helpers/dist/input-generators"
  );
  const rawBuf = Buffer.from(new Uint8Array(eml));
  const dkim = await verifyDKIMSignature(rawBuf);
  // Validate the header budget UP FRONT (before the user spends time selecting)
  // so a too-long-header email fails here with an honest message, not after
  // selection + consent.
  try {
    generateEmailVerifierInputsFromDKIMResult(dkim, {
      maxHeadersLength: BODY_MAX_HEADERS,
      ignoreBodyHashCheck: true,
    });
  } catch (e) {
    throw humanizeInputError(e);
  }
  const body = new Uint8Array(dkim.body).slice();
  // the From line straight from the raw email (display only — the PROVEN From
  // comes out of the circuit's public signals later)
  const fromLine = /^from:(.*)$/im.exec(rawBuf.toString("utf8"))?.[1]?.trim() ?? "";
  const buf = body.buffer as ArrayBuffer;
  (self as unknown as Worker).postMessage({ type: "extracted", body: buf, from: fromLine }, [buf]);
}

async function proveBody(
  eml: ArrayBuffer,
  spans: { start: number; end: number }[],
  wasmUrl: string,
  zkeyUrl: string
) {
  post("inputs", "Building circuit inputs");
  const { verifyDKIMSignature } = await import("@zk-email/helpers/dist/dkim");
  const { generateEmailVerifierInputsFromDKIMResult } = await import(
    "@zk-email/helpers/dist/input-generators"
  );

  const rawBuf = Buffer.from(new Uint8Array(eml));
  const dkim = await verifyDKIMSignature(rawBuf);
  const body = new Uint8Array(dkim.body);

  // window from the user's spans — same math as checkSelection on main thread
  if (!spans.length) throw new Error("Nothing selected to reveal.");
  const first = Math.min(...spans.map((s) => s.start));
  const windowStart = Math.floor(first / 64) * 64;
  const windowEnd = windowStart + BODY_MAX_WINDOW;
  if (windowEnd > body.length || Math.max(...spans.map((s) => s.end)) > windowEnd) {
    throw new Error("The selection doesn't fit the proving window.");
  }
  // the circuit has exactly 3 reveal units — pad by repeating the first span
  // (duplicates are collapsed when displaying)
  const facts = [...spans];
  while (facts.length < 3) facts.push(facts[0]);

  // header-side inputs (same path as the generic circuit; header-budget errors
  // were already surfaced in extractBody, but stay defensive here too)
  let base: { emailHeader: string[]; emailHeaderLength: string; pubkey: string[]; signature: string[] };
  try {
    base = generateEmailVerifierInputsFromDKIMResult(dkim, {
      maxHeadersLength: BODY_MAX_HEADERS,
      ignoreBodyHashCheck: true,
    }) as { emailHeader: string[]; emailHeaderLength: string; pubkey: string[]; signature: string[] };
  } catch (e) {
    throw humanizeInputError(e);
  }
  const hdrU8 = new Uint8Array(base.emailHeader.map(Number));
  const hdrStr = toLatin1(hdrU8);

  // bh= location + integrity of the byte just before it
  const bhIndex = hdrStr.indexOf(dkim.bodyHash);
  if (bhIndex < 0) throw new Error("Couldn't locate bh= in the signed header.");
  if (!/^[; ]bh=$/.test(hdrStr.slice(bhIndex - 4, bhIndex))) {
    throw new Error("Unexpected bytes before bh= in the signed header.");
  }

  // From reveal — clamped to the circuit's packed capacity (see proveHeader)
  const fromKey = "from:";
  const fromAt = hdrStr.toLowerCase().indexOf(fromKey);
  if (fromAt < 0) throw new Error("No From header in the signed header.");
  const fromStart = fromAt + fromKey.length;
  let fromEnd = hdrStr.indexOf("\r\n", fromStart);
  if (fromEnd < 0) fromEnd = hdrStr.length;
  if (fromEnd - fromStart > BODY_MAX_FROM) fromEnd = fromStart + BODY_MAX_FROM;

  const windowBytes = body.slice(windowStart, windowEnd);
  const m1 = shaMidstate(body, windowStart);
  const inputs = {
    emailHeader: base.emailHeader,
    emailHeaderLength: base.emailHeaderLength,
    pubkey: base.pubkey,
    signature: base.signature,
    headerMask: base.emailHeader.map((_, i) => (i >= fromStart && i < fromEnd ? "1" : "0")),
    fromStartIndex: String(fromStart),
    bhIndex: String(bhIndex),
    m1Bytes: Array.from(m1, String),
    windowBytes: Array.from(windowBytes, String),
    windowBlocks: String(BODY_MAX_WINDOW / 64),
    consumedBytes: String(windowEnd),
    factMask: facts.map((f) =>
      Array.from({ length: BODY_MAX_WINDOW }, (_, i) =>
        i >= f.start - windowStart && i < f.end - windowStart ? "1" : "0"
      )
    ),
    factStart: facts.map((f) => String(f.start - windowStart)),
  };

  const zkey = await fetchZkeyWithProgress(zkeyUrl);
  post("witness", "Computing the witness");
  const snarkjs = await import("snarkjs");
  post("prove", "Building the Groth16 proof");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);

  post("done", "Proof generated");
  (self as unknown as Worker).postMessage({ type: "result", proof, publicSignals });
}

/* ── entry ────────────────────────────────────────────────────────────── */
self.onmessage = async (e: MessageEvent) => {
  try {
    const { eml, mode, field, spans, wasmUrl, zkeyUrl } = e.data as {
      eml: ArrayBuffer;
      mode?: "header" | "body" | "body-extract";
      field?: string;
      spans?: { start: number; end: number }[];
      wasmUrl: string;
      zkeyUrl: string;
    };
    if (mode === "body-extract") {
      await extractBody(eml);
    } else if (mode === "body") {
      await proveBody(eml, spans || [], wasmUrl, zkeyUrl);
    } else {
      await proveHeader(eml, field || "subject", wasmUrl, zkeyUrl);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
