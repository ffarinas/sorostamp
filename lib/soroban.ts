/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — Soroban reader (SERVER-ONLY: does network I/O)

   Reads a REAL attestation from the live Lacre verifier contract on the
   Stellar testnet via get_attestation(nullifier) and parses it.

   The RPC logic here is a direct port of the validated standalone script
   `test-getattestation.mjs` (which confirmed it reads the live contract).
   Connection details come from `NET` in `@/lib/data`.

   This module must only ever be imported by Server Components / server code
   — never from a "use client" file — so the @stellar/stellar-sdk and this
   network I/O stay on the server.
   ═══════════════════════════════════════════════════════════════════ */
import "server-only";
import { cache } from "react";
import { createHash } from "crypto";
import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Account,
  xdr,
} from "@stellar/stellar-sdk";
import { NET } from "@/lib/data";
import { decodeFactChunks, parseFactSpan } from "@/lib/prove-body";

/* A parsed on-chain attestation. The two byte fields are hex strings so the
   object is serializable across the Server → Client boundary. `null` means
   the proof was not found on-chain (or the read failed). */
export type Attestation = {
  nullifier: string; // hex
  statementHash: string; // hex
  ledger: number;
  timestamp: number; // unix seconds
} | null;

// Any valid account works as the source for a read-only simulation —
// nothing is signed or submitted to the network.
const SIM_SOURCE = "GBJFYONXMVCOMOSHKMWM3AOPBASDUJYLVGSHRQ6UXAKYLU5Q64P2VQ7S";

/**
 * Read get_attestation(nullifier) from the live verifier contract.
 * Returns the parsed Attestation, or `null` on simulation error / missing
 * attestation / any thrown error.
 *
 * Transport is a plain `fetch` to the Soroban JSON-RPC `simulateTransaction`
 * method — NOT stellar-sdk's `rpc.Server`, which uses axios and fails on
 * Cloudflare Workers (workerd). stellar-sdk is still used for the pure XDR
 * build (TransactionBuilder) and parse (xdr.ScVal.fromXDR + scValToNative),
 * which work everywhere. Wrapped in React.cache so the page and
 * generateMetadata share one round-trip per request.
 */
export const getAttestation = cache(async function getAttestation(
  idHex: string,
  contractId: string = NET.verifier
): Promise<Attestation> {
  try {
    if (!contractId) return null; // (body verifier not deployed on this NET)
    const contract = new Contract(contractId);
    const idScVal = nativeToScVal(Buffer.from(idHex, "hex"), { type: "bytes" });

    // Build the read-only invocation. Any valid source works — nothing is
    // signed or submitted; we only simulate to read the return value.
    const source = new Account(SIM_SOURCE, "0");
    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: NET.networkPassphrase,
    })
      .addOperation(contract.call("get_attestation", idScVal))
      .setTimeout(30)
      .build();

    // Soroban RPC: POST { method: "simulateTransaction", params: { transaction } }.
    const resp = await fetch(NET.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: { transaction: tx.toXDR() },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error("[getAttestation] RPC HTTP", resp.status);
      return null;
    }
    const json = (await resp.json()) as {
      result?: { error?: string; results?: Array<{ xdr?: string }> };
      error?: { message?: string };
    };
    if (json.error) {
      console.error("[getAttestation] RPC error:", json.error.message);
      return null;
    }
    const r = json.result;
    if (!r || r.error) {
      console.error("[getAttestation] simulation error:", r?.error);
      return null;
    }
    const retXdr = r.results?.[0]?.xdr;
    if (!retXdr) return null; // contract returned None / empty → not sealed

    const native = scValToNative(xdr.ScVal.fromXDR(retXdr, "base64"));
    if (!native) return null;

    return {
      nullifier: Buffer.from(native.nullifier).toString("hex"),
      statementHash: Buffer.from(native.statement_hash).toString("hex"),
      ledger: Number(native.ledger),
      timestamp: Number(native.timestamp),
    };
  } catch (e) {
    console.error("[getAttestation] failed:", e instanceof Error ? e.stack || e.message : String(e));
    return null;
  }
});

/**
 * Unpack the packed-subject field elements into the readable subject.
 *
 * Ported from `lacre/circuits/decode-subject.cjs`:
 *   - each chunk (decimal or hex string) → BigInt
 *   - 31 bytes little-endian (PackBytes packs 31 bytes/field, LSB first)
 *   - concat all chunks → utf-8 → strip trailing NUL/space padding
 *   - MIME-decode any `=?utf-8?B?…?=` words via base64.
 *
 * Improvements over the reference: also strips the trailing NUL padding the
 * packing leaves, and folds the linear whitespace between two adjacent RFC 2047
 * encoded-words (which must be ignored) so e.g. "04209" + "1652259" rejoin into
 * "042091652259" instead of showing a stray space.
 */
export function decodeSubject(chunks: string[]): string {
  const bytes: number[] = [];
  for (const s of chunks) {
    let v = BigInt(s); // accepts "0x…" or decimal
    for (let i = 0; i < 31; i++) {
      bytes.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  const raw = Buffer.from(bytes)
    .toString("utf8")
    .replace(/[\s\0]+$/, ""); // drop trailing spaces + NUL padding
  // RFC 2047: whitespace separating two adjacent encoded-words is not part of
  // the text and is dropped when both are decoded.
  const folded = raw.replace(/\?=\s+=\?/g, "?==?");
  const decoded = folded.replace(/=\?utf-8\?B\?([^?]+)\?=/gi, (_m, b) =>
    Buffer.from(b, "base64").toString("utf8")
  );
  return decoded.trim();
}

/**
 * Recompute the statement_hash from the packed-subject chunks and compare it
 * to the on-chain value, proving the readable subject matches what was sealed.
 *
 * Scheme (verified against the live demo attestation): the statement_hash is
 *   sha256( "LACRE_ATTESTATION_V1"  ‖  chunk[i] as 32-byte big-endian … ).
 *
 * Returns the recomputed hex; callers compare it to `att.statementHash`.
 */
export function statementHashFromChunks(
  chunks: string[],
  domainTag = "LACRE_ATTESTATION_V1"
): string {
  const h = createHash("sha256");
  h.update(Buffer.from(domainTag, "utf8"));
  for (const c of chunks) {
    let v = BigInt(c);
    const be = Buffer.alloc(32);
    for (let i = 31; i >= 0; i--) {
      be[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    h.update(be);
  }
  return h.digest("hex");
}

/* The human-readable subject for a proof, plus whether it provably matches the
   on-chain statement_hash. Serializable — safe to pass to Client Components. */
export type SubjectInfo = {
  subject: string;
  statementVerified: boolean;
};

/**
 * Resolve the readable subject for a proof from the packed chunks carried in
 * the proof link `?s=` (comma-separated public signals 1..). We decode them AND
 * recompute the statement_hash to confirm they match what was sealed on-chain —
 * so the subject shown is the one the prover actually committed to, not
 * arbitrary text appended to the URL. Works for ANY proof (no hardcoded map).
 *
 * `statementVerified` is the trust signal: only true when the chunks hash to
 * the on-chain statement_hash. Returns null when no `?s=` is present (the public
 * page then shows the attestation without a decoded subject).
 */
export function resolveSubjectFromQuery(
  att: Attestation,
  sParam?: string | null
): SubjectInfo | null {
  if (!att || !sParam) return null;

  // Parse "c1,c2,c3,…" → decimal/hex chunk strings. Reject anything that isn't
  // a clean list of integers so a malformed query can't throw downstream.
  const chunks = sParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (chunks.length === 0 || !chunks.every((c) => /^(0x)?[0-9a-fA-F]+$/.test(c))) {
    return null;
  }
  try {
    return {
      subject: decodeSubject(chunks),
      statementVerified: statementHashFromChunks(chunks) === att.statementHash,
    };
  } catch {
    return null;
  }
}

/* ── body proofs (purchase facts) ─────────────────────────────────────────
   The body circuit's ?s= carries public signals 1..27:
     [0..3]  from chunks   [4],[5] bh hi/lo   [6],[7] m2 hi/lo
     [8]     consumedBytes [9..26] fact chunks (3 × 6)
   All 27 hash into the statement under the body verifier's domain tag. */

export type BodyInfo = {
  from: string;
  facts: { key: string; label: string; value: string; raw: string }[];
  statementVerified: boolean;
};

export function resolveBodyFromQuery(
  att: Attestation,
  sParam?: string | null
): BodyInfo | null {
  if (!att || !sParam) return null;
  const chunks = sParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (chunks.length !== 27 || !chunks.every((c) => /^(0x)?[0-9a-fA-F]+$/.test(c))) {
    return null;
  }
  try {
    const from = decodeFactChunks(chunks.slice(0, 4));
    // 3 reveal slots; unused ones repeat the first span — collapse duplicates
    const seen = new Set<string>();
    const facts: NonNullable<BodyInfo>["facts"] = [];
    for (let i = 0; i < 3; i++) {
      const raw = decodeFactChunks(chunks.slice(9 + i * 6, 9 + (i + 1) * 6));
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      const { label, value } = parseFactSpan(raw);
      facts.push({ key: `fact${i + 1}`, label, value, raw });
    }
    return {
      from,
      facts,
      statementVerified:
        statementHashFromChunks(chunks, "LACRE_ATTESTATION_BODY_V1") === att.statementHash,
    };
  } catch {
    return null;
  }
}
