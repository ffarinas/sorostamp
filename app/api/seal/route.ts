/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — sponsored-submit "relayer"  (POST /api/seal)

   Takes a snarkjs Groth16 proof + public signals, serializes them into the
   contract's expected wire format, and seals the attestation on-chain via
   `submit_proof` on the LIVE testnet verifier — paying the fee with a funded
   sponsor account so the prover never needs gas or a wallet.

   SERVER-ONLY: reads SOROSTAMP_SPONSOR_SECRET and does network I/O. Must run on
   the Node runtime (the @stellar/stellar-sdk + the sponsor key need Node).
   ═══════════════════════════════════════════════════════════════════ */
// Source Client + signer + Keypair all from the bindings package so they share
// ONE @stellar/stellar-sdk version (the bindings bundle their own). The bindings
// re-export the SDK top-level + its `contract` namespace (basicNodeSigner lives
// there), so the signer we pass matches the Client's SDK exactly.
import { Client, Keypair, contract, type Proof } from "sorostamp-contract";
import { Client as BodyClient } from "sorostamp-body-contract";
import { NET } from "@/lib/data";

const { basicNodeSigner } = contract;

// The sponsor secret + SDK need Node APIs (not the edge runtime).
export const runtime = "nodejs";
// Never cache: each POST is a distinct on-chain side effect.
export const dynamic = "force-dynamic";

/* ── proof → contract-arg serialization (MUST match the contract / test.rs) ──
   The verifier reads G1 points as x‖y and G2 points as x.c1‖x.c0‖y.c1‖y.c0,
   each field element a 32-byte big-endian buffer. snarkjs gives these as
   decimal strings. This mirrors lacre/circuits/build-invoke-args.cjs exactly. */

/** A field element (decimal or "0x…" string) as a 32-byte big-endian Buffer. */
function be32(dec: string): Buffer {
  let v = BigInt(dec);
  if (v < 0n) throw new Error(`field element is negative: ${dec}`);
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`field element exceeds 32 bytes: ${dec}`);
  return buf;
}

type ProofInput = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
};

/** Build the on-chain `Proof` struct from a snarkjs proof.json shape. */
function buildProof(p: ProofInput): Proof {
  // a = x‖y  (64 bytes)
  const a = Buffer.concat([be32(p.pi_a[0]), be32(p.pi_a[1])]);
  // b = x.c1‖x.c0‖y.c1‖y.c0  (128 bytes) — snarkjs pi_b = [[x.c0,x.c1],[y.c0,y.c1],…]
  const b = Buffer.concat([
    be32(p.pi_b[0][1]),
    be32(p.pi_b[0][0]),
    be32(p.pi_b[1][1]),
    be32(p.pi_b[1][0]),
  ]);
  // c = x‖y  (64 bytes)
  const c = Buffer.concat([be32(p.pi_c[0]), be32(p.pi_c[1])]);
  return { a, b, c };
}

/* The contract rejects a replayed nullifier with error #4 (AlreadySealed). The
   SDK surfaces this in more than one shape:
     - a parsed contract `Err` from `tx.result`, whose `.error.message` is the
       error's on-chain DOC string ("…already sealed…anti-replay"), NOT the
       "AlreadySealed" identifier;
     - a thrown SimulationFailedError carrying "Error(Contract, #4)".
   Match any of these so detection is resilient to the SDK's decoding choice. */
const ALREADY_SEALED_RE = /Error\(Contract, #4\)|AlreadySealed|already sealed|anti-replay/i;
function isAlreadySealed(x: unknown): boolean {
  if (!x) return false;
  // Pull the message out of a parsed contract Err ({ error: { message } }).
  const errMsg = (x as { error?: { message?: string } })?.error?.message;
  const s = `${errMsg ?? ""} ${(x as Error)?.message ?? ""} ${typeof x === "string" ? x : ""}`;
  return ALREADY_SEALED_RE.test(s);
}

export async function POST(req: Request): Promise<Response> {
  // Hex of the nullifier (public signal 0), captured once parsed so error
  // branches can echo the attestation `id` even when they only have an error.
  let idHex: string | undefined;
  try {
    const secret = process.env.SOROSTAMP_SPONSOR_SECRET;
    if (!secret) {
      return Response.json(
        { ok: false, error: "SOROSTAMP_SPONSOR_SECRET is not set" },
        { status: 500 }
      );
    }

    // ── parse + validate the request body ──
    const body = (await req.json()) as {
      proof?: ProofInput;
      publicSignals?: string[];
      /** "body" → seal on the BODY verifier via seal_body (needs `suffix`) */
      kind?: "header" | "body";
      /** base64 of the public suffix bytes (body proofs only) */
      suffix?: string;
    };
    const { proof, publicSignals, kind, suffix } = body;
    if (
      !proof?.pi_a ||
      !proof?.pi_b ||
      !proof?.pi_c ||
      !Array.isArray(publicSignals) ||
      publicSignals.length === 0
    ) {
      return Response.json(
        { ok: false, error: "body must be { proof: {pi_a,pi_b,pi_c}, publicSignals: string[] }" },
        { status: 400 }
      );
    }
    if (kind === "body" && typeof suffix !== "string") {
      return Response.json(
        { ok: false, error: "body proofs must include `suffix` (base64)" },
        { status: 400 }
      );
    }

    // ── serialize to the contract wire format ──
    const proofArg = buildProof(proof);
    const pubSignals = publicSignals.map((s) => be32(s));
    idHex = pubSignals[0].toString("hex");

    // ── build a Client that signs/pays with the sponsor account ──
    const sponsor = Keypair.fromSecret(secret);
    const { signTransaction } = basicNodeSigner(sponsor, NET.networkPassphrase);

    // Seal step: submit_proof (header verifier) or seal_body (body verifier,
    // which also carries the public suffix for the on-chain SHA completion).
    // Both simulate on construction; a replayed nullifier traps here (#4).
    let tx: { result: unknown; signAndSend: () => Promise<{ result: unknown; sendTransactionResponse?: { hash?: string } }> };
    if (kind === "body") {
      if (!NET.verifierBody) {
        return Response.json(
          { ok: false, error: "The purchase verifier is not deployed on this network yet." },
          { status: 503 }
        );
      }
      const bodyClient = new BodyClient({
        networkPassphrase: NET.networkPassphrase,
        contractId: NET.verifierBody,
        rpcUrl: NET.rpcUrl,
        publicKey: sponsor.publicKey(),
        signTransaction,
      });
      tx = await bodyClient.seal_body({
        proof: proofArg,
        pub_signals: pubSignals,
        suffix: Buffer.from(suffix!, "base64"),
      });
    } else {
      const client = new Client({
        networkPassphrase: NET.networkPassphrase, // from NET — works on any network
        contractId: NET.verifier, // single source of truth (the deployed verifier)
        rpcUrl: NET.rpcUrl,
        publicKey: sponsor.publicKey(), // sponsor is the source account → pays the fee
        signTransaction,
      });
      tx = await client.submit_proof({
        proof: proofArg,
        pub_signals: pubSignals,
      });
    }

    // Defensive: if the sim returned a Result::Err rather than trapping.
    let simResult: unknown;
    try {
      simResult = tx.result;
    } catch (e) {
      if (isAlreadySealed(e)) {
        return Response.json({ ok: false, reason: "already_sealed", id: idHex });
      }
      throw e;
    }
    if (simResult && typeof (simResult as { isErr?: () => boolean }).isErr === "function") {
      const r = simResult as { isErr: () => boolean; unwrapErr: () => unknown };
      if (r.isErr()) {
        if (isAlreadySealed(r.unwrapErr())) {
          return Response.json({ ok: false, reason: "already_sealed", id: idHex });
        }
        return Response.json(
          { ok: false, error: String((r.unwrapErr() as { message?: string })?.message ?? "contract error") },
          { status: 500 }
        );
      }
    }

    // ── sign with the sponsor and submit to the network ──
    const sent = await tx.signAndSend();

    // The returned nullifier (== attestation id) is an Ok(Buffer).
    const ok = sent.result as unknown as {
      isErr?: () => boolean;
      unwrap?: () => Buffer;
    };
    const nullifier: Buffer =
      typeof ok?.unwrap === "function" ? ok.unwrap() : (sent.result as unknown as Buffer);

    return Response.json({
      ok: true,
      id: Buffer.from(nullifier).toString("hex"),
      hash: sent.sendTransactionResponse?.hash,
    });
  } catch (err) {
    // AlreadySealed most commonly surfaces here, as a thrown simulation error.
    if (isAlreadySealed(err)) {
      return Response.json({ ok: false, reason: "already_sealed", id: idHex });
    }
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
