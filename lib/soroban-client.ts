/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — Soroban reader (CLIENT-side fallback)

   The public page (/p/[id]) reads the attestation on the SERVER (lib/soroban).
   That works in Node and on Cloudflare's edge, but `wrangler dev` local mode
   (workerd) can't reach soroban-testnet.stellar.org (TLS/connection quirk),
   and a deployed Worker may occasionally fail too. The BROWSER can always reach
   the RPC (it's CORS-enabled for dApps), so when the server read comes back
   empty we re-read here, in the browser.

   No "server-only" — this runs in the client bundle. Uses native fetch + the
   browser's SubtleCrypto, plus stellar-sdk for pure XDR build/parse.
   ═══════════════════════════════════════════════════════════════════ */
import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Account,
  xdr,
} from "@stellar/stellar-sdk";
import { NET } from "@/lib/data";

export type Attestation = {
  nullifier: string;
  statementHash: string;
  ledger: number;
  timestamp: number;
} | null;

export type SubjectInfo = { subject: string; statementVerified: boolean } | null;

const SIM_SOURCE = "GBJFYONXMVCOMOSHKMWM3AOPBASDUJYLVGSHRQ6UXAKYLU5Q64P2VQ7S";

/** Read get_attestation(idHex) from the verifier contract, in the browser. */
export async function readAttestationClient(
  idHex: string,
  contractId: string = NET.verifier
): Promise<Attestation> {
  try {
    if (!contractId) return null;
    const contract = new Contract(contractId);
    const idScVal = nativeToScVal(Buffer.from(idHex, "hex"), { type: "bytes" });
    const source = new Account(SIM_SOURCE, "0");
    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: NET.networkPassphrase,
    })
      .addOperation(contract.call("get_attestation", idScVal))
      .setTimeout(30)
      .build();

    const resp = await fetch(NET.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: { transaction: tx.toXDR() },
      }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      result?: { error?: string; results?: Array<{ xdr?: string }> };
    };
    const retXdr = json.result?.results?.[0]?.xdr;
    if (!retXdr || json.result?.error) return null;

    const native = scValToNative(xdr.ScVal.fromXDR(retXdr, "base64"));
    if (!native) return null;
    return {
      nullifier: bytesToHex(native.nullifier),
      statementHash: bytesToHex(native.statement_hash),
      ledger: Number(native.ledger),
      timestamp: Number(native.timestamp),
    };
  } catch {
    return null;
  }
}

/** Decode the packed-subject chunks and verify them against the on-chain
    statement_hash — entirely in the browser (SubtleCrypto for sha256). */
export async function verifySubjectClient(
  chunks: string[],
  statementHashHex: string
): Promise<SubjectInfo> {
  if (!chunks.length) return null;
  try {
    const subject = decodeSubject(chunks);
    const recomputed = await statementHashFromChunks(chunks);
    return { subject, statementVerified: recomputed === statementHashHex };
  } catch {
    return null;
  }
}

export type BodyInfo = {
  from: string;
  facts: { key: string; label: string; value: string; raw: string }[];
  statementVerified: boolean;
} | null;

/** Decode + verify a BODY proof's 27 statement chunks against the on-chain
    statement_hash (body domain tag) — browser mirror of resolveBodyFromQuery. */
export async function verifyBodyClient(
  chunks: string[],
  statementHashHex: string
): Promise<BodyInfo> {
  if (chunks.length !== 27) return null;
  try {
    const { decodeFactChunks, parseFactSpan } = await import("./prove-body");
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
    const recomputed = await statementHashFromChunks(chunks, "LACRE_ATTESTATION_BODY_V1");
    return { from, facts, statementVerified: recomputed === statementHashHex };
  } catch {
    return null;
  }
}

/* ── helpers (browser-safe mirrors of lib/soroban.ts) ── */

function bytesToHex(b: Uint8Array | number[]): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function decodeSubject(chunks: string[]): string {
  const bytes: number[] = [];
  for (const s of chunks) {
    let v = BigInt(s);
    for (let i = 0; i < 31; i++) {
      bytes.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  const raw = new TextDecoder().decode(new Uint8Array(bytes)).replace(/[\s\0]+$/, "");
  const folded = raw.replace(/\?=\s+=\?/g, "?==?");
  return folded
    .replace(/=\?utf-8\?B\?([^?]+)\?=/gi, (_m, b) => {
      const bin = atob(b);
      const u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(u8);
    })
    .trim();
}

/* sha256( domainTag ‖ chunk[i] as 32-byte big-endian … ), hex. */
async function statementHashFromChunks(
  chunks: string[],
  domainTag = "LACRE_ATTESTATION_V1"
): Promise<string> {
  const tag = new TextEncoder().encode(domainTag);
  const parts: Uint8Array[] = [tag];
  for (const c of chunks) {
    let v = BigInt(c);
    const be = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) {
      be[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    parts.push(be);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}
