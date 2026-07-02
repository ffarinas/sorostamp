"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — Public verification page (what a third party sees)

   Renders a REAL attestation read from the live Soroban testnet contract.
   The server route (/p/[id]) reads get_attestation on-chain and passes the
   parsed `attestation` (+ decoded `subject`) down as serializable props.
   ═══════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { Seal } from "@/components/seal";
import { Ic, CopyValue } from "@/components/primitives";
import { trunc, NET, HEADER_ONLY_NOTE, BODY_PROOF_NOTE } from "@/lib/data";
import { useShell } from "@/components/shell";
import { readAttestationClient, verifySubjectClient, verifyBodyClient } from "@/lib/soroban-client";

/* These mirror the serializable shapes produced by lib/soroban.ts. We redefine
   them here because that module is server-only and can't be imported into a
   "use client" file. */
export type Attestation = {
  nullifier: string; // hex
  statementHash: string; // hex
  ledger: number;
  timestamp: number; // unix seconds
} | null;
export type SubjectInfo = { subject: string; statementVerified: boolean } | null;
export type BodyInfo = {
  from: string;
  facts: { key: string; label: string; value: string; raw: string }[];
  statementVerified: boolean;
} | null;

/* Format a unix-seconds timestamp as a readable UTC string. */
function fmtTs(unix: number): string {
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/* Context bridge: the server route (/p/[id]) renders this with real on-chain
   data; it pulls go/pushToast from the Shell and feeds VerifyPage. */
export function PublicProof({
  id,
  attestation,
  subject,
  body,
  sParam,
  field,
}: {
  id?: string;
  attestation?: Attestation;
  subject?: SubjectInfo;
  body?: BodyInfo;
  sParam?: string | null;
  field?: string | null;
}) {
  const { go, pushToast } = useShell();
  return (
    <VerifyPage
      go={go}
      pushToast={pushToast}
      id={id}
      attestation={attestation ?? null}
      subject={subject ?? null}
      body={body ?? null}
      sParam={sParam ?? null}
      field={field ?? null}
    />
  );
}

export function VerifyPage({
  go,
  pushToast,
  id,
  attestation,
  subject,
  body,
  sParam,
  field,
}: {
  go: (v: string) => void;
  pushToast: (t: string, m?: string, k?: string) => void;
  id?: string;
  attestation?: Attestation;
  subject?: SubjectInfo;
  body?: BodyInfo;
  sParam?: string | null;
  field?: string | null;
}) {
  const N = NET;
  // The revealed header field (subject/from/…), for honest labeling.
  const revealedField = field || "subject";
  // Purchase (body-circuit) proofs are labeled by blueprint in ?f= — the client
  // fallback needs this to read the right contract and decode the right layout.
  const isBody = !!body || field === "purchase" || field === "zinli-purchase";
  const verifierContract = isBody ? N.verifierBody : N.verifier;

  // The server read works in Node + on Cloudflare's edge, but can come back
  // empty when the Worker can't reach the RPC (e.g. local `wrangler dev`). In
  // that case fall back to reading on-chain from the browser, where the RPC is
  // always reachable. `att`/`subjectInfo` below are the effective values.
  const [clientAtt, setClientAtt] = useState<Attestation>(null);
  const [clientSubject, setClientSubject] = useState<SubjectInfo>(null);
  const [clientBody, setClientBody] = useState<BodyInfo>(null);
  // Start in the reading state when the server didn't supply an attestation but
  // we have an id — so the SSR HTML shows "reading…" (not a "not found" flash)
  // and the browser then confirms by reading on-chain.
  const [reading, setReading] = useState(!attestation && !!id);

  useEffect(() => {
    if (attestation || !id) return; // server already had it — nothing to do
    let alive = true;
    setReading(true);
    (async () => {
      const a = await readAttestationClient(id, verifierContract);
      if (!alive) return;
      setClientAtt(a);
      if (a && sParam) {
        const chunks = sParam.split(",").map((x) => x.trim()).filter(Boolean);
        if (isBody) setClientBody(await verifyBodyClient(chunks, a.statementHash));
        else setClientSubject(await verifySubjectClient(chunks, a.statementHash));
      }
      if (alive) setReading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attestation, id, sParam, isBody]);

  const att = attestation ?? clientAtt;
  const subjectInfo = subject ?? clientSubject;
  const bodyInfo = body ?? clientBody;

  // ── While the client fallback is reading on-chain ────────────────
  if (!att && reading) {
    return (
      <div className="verify-page fade-up">
        <div className="vp-bg" aria-hidden="true" />
        <div className="vp-inner">
          <div className="vp-top">
            <span className="vp-kicker mono">sorostamp.com/p/{trunc(id || "", 8, 6)}</span>
            <h1 className="display vp-h">Reading the proof on-chain…</h1>
            <p className="vp-lede">Fetching the attestation from {N.name}.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Graceful "not found / not yet sealed" state ──────────────────
  if (!att) {
    return (
      <div className="verify-page fade-up">
        <div className="vp-bg" aria-hidden="true" />
        <div className="vp-inner">
          <div className="vp-top">
            <span className="vp-kicker mono">sorostamp.com/p/{trunc(id || "", 8, 6)}</span>
            <h1 className="display vp-h">Proof not found.</h1>
            <p className="vp-lede">
              We couldn&apos;t find an attestation for this id on {N.name}. It may not have
              been sealed yet, or the link is incorrect.
            </p>
          </div>

          <div className="vp-explain">
            <Ic.alert style={{ width: 18, height: 18 }} />
            <p>
              Sorostamp read the verifier contract on-chain and got no attestation back
              for <span className="mono">{trunc(id || "", 8, 6)}</span>. Nothing to verify.
            </p>
          </div>

          <div className="vp-cta">
            <span className="vp-cta-txt">Want a proof like this?</span>
            <button className="btn btn-ghost" onClick={() => go("app")}>
              <span>Create your own with Sorostamp</span>
              <span className="chip"><Ic.arrow style={{ width: 15, height: 15 }} /></span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Real attestation present ─────────────────────────────────────
  const explorerContract = `${N.explorer}/contract/${verifierContract}`;
  const subjectText = subjectInfo?.subject;
  const verified = isBody ? !!bodyInfo?.statementVerified : !!subjectInfo?.statementVerified;
  const factsLine = bodyInfo
    ? bodyInfo.facts.map((f) => `${f.label} ${f.value}`.trim()).join(" · ")
    : "";

  return (
    <div className="verify-page fade-up">
      <div className="vp-bg" aria-hidden="true" />
      <div className="vp-inner">
        <div className="vp-top">
          <span className="vp-kicker mono">sorostamp.com/p/{trunc(att.nullifier, 8, 6)}</span>
          <h1 className="display vp-h">A verified proof.</h1>
          <p className="vp-lede">
            Someone sealed this fact on Stellar with Sorostamp. You can check it yourself —
            the email behind it was never revealed.
          </p>
        </div>

        {/* ── The Proof Card — real on-chain data ── */}
        <div className="proofcard-wrap">
          <div className="pc-seal"><Seal size={104} variant="verified" /></div>
          <div className="proofcard">
            <div className="pc-perf" aria-hidden="true" />
            <div className="pc-body">
            <span className="eyebrow pc-eyebrow">
              {isBody
                ? "On-chain attestation · purchase facts from the body"
                : `On-chain attestation${subjectText ? ` · revealed ${revealedField}` : ""}`}
            </span>
            {isBody && bodyInfo ? (
              <div className="pc-fact">
                <span className="pc-fact-k">The proven purchase</span>
                <span className="pc-fact-v serif">{factsLine}</span>
                <span className="pc-fact-k" style={{ marginTop: 8 }}>Signed by</span>
                <span className="pc-fact-v mono" style={{ fontSize: 14 }}>{bodyInfo.from}</span>
              </div>
            ) : (
              <div className="pc-fact">
                <span className="pc-fact-k">{subjectText ? "The proven fact" : "Attestation"}</span>
                <span className="pc-fact-v serif">
                  {subjectText || "A fact was proven & sealed on Stellar"}
                </span>
              </div>
            )}
            <div className="pc-date">Sealed {fmtTs(att.timestamp)}</div>
            <div className="pc-badges">
              <span className="pc-badge pc-badge-ok">
                <span className="vchk"><Ic.check style={{ width: 12, height: 12 }} /></span>
                Verified on {N.name}
              </span>
              <span className="pc-badge pc-badge-priv">
                <Ic.eyeOff style={{ width: 13, height: 13 }} /> Email never revealed
              </span>
            </div>
            <div className="pc-meta">
              <div className="pc-mrow">
                <span className="pc-mk">Ledger</span>
                <span className="mono pc-mv">#{att.ledger.toLocaleString()}</span>
              </div>
              <div className="pc-mrow">
                <span className="pc-mk">Nullifier</span>
                <CopyValue value={att.nullifier} display={trunc(att.nullifier, 10, 8)} />
              </div>
              <div className="pc-mrow">
                <span className="pc-mk">Statement hash</span>
                <CopyValue value={att.statementHash} display={trunc(att.statementHash, 10, 8)} />
              </div>
              <div className="pc-mrow">
                <span className="pc-mk">Verifier</span>
                <CopyValue
                  value={verifierContract}
                  display={trunc(verifierContract, 6, 5)}
                  link={explorerContract}
                />
              </div>
            </div>
            <div className="pc-actions">
              <button
                className="btn-plain"
                onClick={() => {
                  const url =
                    typeof window !== "undefined"
                      ? window.location.href
                      : `https://sorostamp.com/p/${att.nullifier}`;
                  if (typeof navigator !== "undefined" && navigator.clipboard)
                    navigator.clipboard.writeText(url).catch(() => {});
                  pushToast("Proof link copied", "", "success");
                }}
              >
                <Ic.link style={{ width: 15, height: 15 }} /> Copy proof link
              </button>
              <a className="btn-plain" href={explorerContract} target="_blank" rel="noopener">
                <Ic.ext style={{ width: 15, height: 15 }} /> View contract
              </a>
            </div>
          </div>
          </div>
        </div>

        <div className="vp-explain">
          <Ic.shield style={{ width: 18, height: 18 }} />
          <p>
            {isBody ? (
              <>
                These purchase facts were cryptographically proven from the <b>body of a
                DKIM-signed email</b>: the circuit chains the body-hash commitment (bh=)
                through the fact window, and the Soroban contract finishes the SHA-256 over
                the public template tail. <b>{BODY_PROOF_NOTE}</b>
              </>
            ) : (
              <>
                This fact was cryptographically proven from a <b>DKIM-signed email</b>. The email
                itself was never revealed — only the statement above, checked on-chain by a Soroban
                smart contract on {N.name}. <b>{HEADER_ONLY_NOTE}</b>
              </>
            )}
          </p>
        </div>

        <div className="vp-checks">
          {isBody && bodyInfo && (
            <div className="vp-check vp-check-wide">
              <span className="vc-ic"><Ic.check style={{ width: 14, height: 14 }} /></span>
              <div style={{ minWidth: 0 }}>
                <span className="vc-t">Revealed from the signed body</span>
                {bodyInfo.facts.map((f) => (
                  <span key={f.key} className="vc-d mono wrap" style={{ display: "block" }}>
                    {`${f.label} ${f.value}`.trim()}
                  </span>
                ))}
                <details style={{ marginTop: 6 }}>
                  <summary className="mono" style={{ cursor: "pointer", fontSize: 11.5, color: "var(--ink-2)" }}>
                    show the raw signed spans (QP/HTML as committed on-chain)
                  </summary>
                  {bodyInfo.facts.map((f) => (
                    <span key={f.key} className="vc-d mono wrap" style={{ display: "block", fontSize: 10.5, marginTop: 4 }}>
                      {f.raw}
                    </span>
                  ))}
                </details>
              </div>
            </div>
          )}
          {!isBody && subjectText && (
            <div className="vp-check vp-check-wide">
              <span className="vc-ic"><Ic.check style={{ width: 14, height: 14 }} /></span>
              <div>
                <span className="vc-t">Revealed {revealedField}</span>
                <span className="vc-d mono wrap">{subjectText}</span>
              </div>
            </div>
          )}
          <div className="vp-check">
            <span className="vc-ic">
              {verified ? (
                <Ic.check style={{ width: 14, height: 14 }} />
              ) : (
                <Ic.info style={{ width: 14, height: 14 }} />
              )}
            </span>
            <div>
              <span className="vc-t">
                {verified ? "Matches the on-chain statement_hash" : "Statement hash"}
              </span>
              <span className="vc-d mono">{trunc(att.statementHash, 8, 6)}</span>
              {/* TODO: generic case — carry the subject in the proof link and
                  verify it against statement_hash for every proof, not just demos. */}
            </div>
          </div>
          <div className="vp-check">
            <span className="vc-ic"><Ic.check style={{ width: 14, height: 14 }} /></span>
            <div>
              <span className="vc-t">Sealed on-chain</span>
              <a
                className="vc-d mono link"
                href={explorerContract}
                target="_blank"
                rel="noopener"
              >
                ledger #{att.ledger.toLocaleString()} · {trunc(verifierContract, 5, 4)} ↗
              </a>
            </div>
          </div>
        </div>

        <div className="vp-cta">
          <span className="vp-cta-txt">Want a proof like this?</span>
          <button className="btn btn-ghost" onClick={() => go("app")}>
            <span>Create your own with Sorostamp</span>
            <span className="chip"><Ic.arrow style={{ width: 15, height: 15 }} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
