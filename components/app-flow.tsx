"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — App flow (4-step stepper) + the Proof Card

   This is the REAL pipeline (no longer a mock):
     Step 2  the user drops a .eml; we keep the File (bytes stay local).
     Step 3  proveEmail() runs zk-email + snarkjs IN THE BROWSER → proof.
     Step 4  POST the proof to /api/seal → the sponsor seals it on Stellar.
     Result  a real proof card + a link to the on-chain public page /p/[id].
   ═══════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, Fragment } from "react";
import { Seal, SealingSeal } from "@/components/seal";
import { Ic, Btn, CopyValue, Spinner } from "@/components/primitives";
import { CoachMark } from "@/components/onboarding";
import { trunc, NET, BLUEPRINTS, blueprintField, blueprintKind, HEADER_ONLY_NOTE, BODY_PROOF_NOTE } from "@/lib/data";
import {
  proveEmail,
  extractEmailBody,
  proveEmailBodySpans,
  userIdentifiers,
  isLowPowerDevice,
  isBodyCapableDevice,
  type ProveResult,
  type ProveProgress,
  type BodyProveResult,
} from "@/lib/prove";
import {
  buildSelectable,
  suggestSpans,
  textRangeToSpan,
  checkSelection,
  auditSuffix,
  parseFactSpan,
  toLatin1,
  type Selectable,
  type SelSpan,
  type SuffixAudit,
} from "@/lib/prove-body";

/* The outcome of sealing on-chain. `alreadySealed` means this exact fact was
   proven before — still a success: the attestation is live on-chain. */
type SealResult = { id: string; hash?: string; alreadySealed: boolean };

/* One result type across both circuits. */
type AnyResult =
  | ({ kind: "header" } & ProveResult)
  | ({ kind: "body" } & BodyProveResult);

/* Build the public proof URL, carrying the full packed reveal (?s=) so /p/[id]
   can decode + verify it for ANY proof, the revealed field/blueprint (?f=), and
   the circuit kind (?c=) so the page reads the right verifier contract. */
function proofUrl(r: AnyResult, id: string): string {
  const s = encodeURIComponent(r.publicSignals.slice(1).join(","));
  const f = r.kind === "body" ? "purchase" : (r as ProveResult).field || "subject";
  const c = r.kind === "body" ? "&c=body" : "";
  return `/p/${id}?s=${s}&f=${encodeURIComponent(f)}${c}`;
}

/* base64 for the suffix (goes in the seal POST). */
function b64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192)
    s += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
  return btoa(s);
}

/* ════════ The real Proof Card — built from in-memory proof + seal ════════ */
function RealProofCard({
  result,
  seal,
  onShare,
}: {
  result: AnyResult;
  seal: SealResult;
  onShare: () => void;
}) {
  const N = NET;
  const isBody = result.kind === "body";
  const verifier = isBody ? N.verifierBody : N.verifier;
  const link = N.explorer + "/contract/" + verifier;
  return (
    <div className="proofcard-wrap">
      <div className="pc-seal"><Seal size={104} variant="verified" /></div>
      <div className="proofcard">
      <div className="pc-perf" aria-hidden="true" />
      <div className="pc-body">
        <span className="eyebrow pc-eyebrow">
          {isBody ? "On-chain attestation · purchase facts from the body" : `On-chain attestation · revealed ${(result as ProveResult).field}`}
        </span>
        {isBody ? (
          <div className="pc-fact">
            <span className="pc-fact-k">The proven facts</span>
            <span className="pc-fact-v serif">
              {result.facts.map((f) => `${f.label} ${f.value}`.trim()).join(" · ")}
            </span>
            <span className="pc-fact-k" style={{ marginTop: 8 }}>Signed by</span>
            <span className="pc-fact-v mono" style={{ fontSize: 14 }}>{result.from}</span>
          </div>
        ) : (
          <div className="pc-fact">
            <span className="pc-fact-k">The proven fact</span>
            <span className="pc-fact-v serif">{(result as ProveResult & { kind: "header" }).subject || "Sealed on Stellar"}</span>
          </div>
        )}
        <div className="pc-honesty mono">{isBody ? BODY_PROOF_NOTE : HEADER_ONLY_NOTE}</div>
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
            <span className="pc-mk">Nullifier</span>
            <CopyValue value={seal.id} display={trunc(seal.id, 10, 8)} />
          </div>
          {seal.hash && (
            <div className="pc-mrow">
              <span className="pc-mk">Transaction</span>
              <CopyValue
                value={seal.hash}
                display={trunc(seal.hash, 10, 8)}
                link={N.explorer + "/tx/" + seal.hash}
              />
            </div>
          )}
          <div className="pc-mrow">
            <span className="pc-mk">Verifier</span>
            <CopyValue value={verifier} display={trunc(verifier, 6, 5)} link={link} />
          </div>
          <div className="pc-mrow">
            <span className="pc-mk">Curve</span>
            <span className="mono pc-mv">{N.curve}</span>
          </div>
        </div>
        <div className="pc-actions">
          <button className="btn-plain" onClick={onShare}>
            <Ic.link style={{ width: 15, height: 15 }} /> Copy proof link
          </button>
          <a className="btn-plain" href={proofUrl(result, seal.id)} target="_blank" rel="noopener">
            <Ic.eye style={{ width: 15, height: 15 }} /> Public page
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ════════ Stepper rail ════════ */
const STEPS = [
  { n: 1, t: "Choose a proof" },
  { n: 2, t: "Provide the email" },
  { n: 3, t: "Generate proof" },
  { n: 4, t: "Seal on Stellar" },
];
function Stepper({ step, maxReached, onJump }: any) {
  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        const state = s.n < step ? "done" : s.n === step ? "active" : "todo";
        const reachable = s.n <= maxReached;
        return (
          <Fragment key={s.n}>
            <button className={"st-node st-" + state} disabled={!reachable}
                    onClick={() => reachable && onJump(s.n)}>
              <span className="st-dot">{s.n < step ? <Ic.check style={{ width: 13, height: 13 }} /> : s.n}</span>
              <span className="st-label">{s.t}</span>
            </button>
            {i < STEPS.length - 1 && <span className={"st-bar" + (s.n < step ? " filled" : "")} />}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ════════ Step 1 — choose blueprint ════════ */
function Step1({ bp, setBp, customField, setCustomField }: any) {
  const BP = BLUEPRINTS;
  const active: any = BP.find((b) => b.id === bp);
  return (
    <div className="step-pane fade-up">
      <div className="pane-head">
        <h2 className="display">What do you want to prove?</h2>
        <p>Pick a blueprint. Each one reveals exactly the stated facts from a DKIM-signed email — nothing else.</p>
        <p className="honesty-note mono">
          {active && active.kind === "body" ? BODY_PROOF_NOTE : HEADER_ONLY_NOTE}
        </p>
      </div>
      <div className="bp-grid">
        {BP.map((b: any) => {
          const I = Ic[b.icon];
          const on = b.id === bp;
          return (
            <button key={b.id} className={"bp-card" + (on ? " on" : "")}
                    onClick={() => setBp(b.id)}>
              <span className="bp-ic"><I style={{ width: 20, height: 20 }} /></span>
              <div className="bp-txt">
                <span className="bp-t">{b.title}</span>
                <span className="bp-d">{b.blurb}</span>
              </div>
              <span className="bp-check">{on && <Ic.check style={{ width: 14, height: 14 }} />}</span>
            </button>
          );
        })}
      </div>
      {active && active.fields && (
        <div className="provider-row">
          <span className="field-lbl">Field to reveal</span>
          <div className="seg-prov">
            {active.fields.map((f: string) => (
              <button key={f} className={"segp" + (customField === f ? " on" : "")} onClick={() => setCustomField(f)}>
                {f}
              </button>
            ))}
          </div>
          <span className="prov-domain mono">reveals the <b>{customField}</b> header — everything else stays hidden</span>
        </div>
      )}
    </div>
  );
}

/* ════════ Step 2 — provide email ════════ */
function Step2({ file, setFile, showCoach, onCoachDismiss }: any) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate a dropped/picked file: it must be a RAW email (.eml) carrying a DKIM
  // signature. A .rtf (Apple Mail "Save As"), a screenshot, a PDF, or a forwarded
  // body has no original signature and can't be proven.
  const validate = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (/\.rtf$/i.test(f.name || "")) {
      setError("That's a .rtf — it only has the rendered body, no DKIM signature. Use the raw .eml (see below).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("That file is over 5 MB. The original .eml of a single email is much smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      if (text.trimStart().startsWith("{\\rtf")) {
        setError("That looks like rich text, not a raw email. Sorostamp needs the .eml with its DKIM signature.");
        return;
      }
      if (!/^dkim-signature:/im.test(text)) {
        setError("No DKIM signature found in this file. Make sure it's the original .eml — not a forward, a screenshot, or a saved body.");
        return;
      }
      setFile(f); // keep the real File — its bytes are proven locally in Step 3
    };
    reader.onerror = () => setError("Couldn't read that file. Try again.");
    reader.readAsText(f.slice(0, 200000)); // first ~200 KB holds the headers + DKIM
  };

  return (
    <div className="step-pane fade-up">
      <div className="pane-head">
        <h2 className="display">Provide the email</h2>
        <p>Drop the original <span className="mono">.eml</span> file — the raw message, with its DKIM signature intact.</p>
      </div>
      <div className="privacy-bar">
        <Ic.lock style={{ width: 18, height: 18 }} />
        <span>Your email is processed <b>entirely in your browser</b>. It never touches our servers.</span>
      </div>
      {!file ? (
        <>
          <input ref={inputRef} type="file" accept=".eml,message/rfc822,text/plain"
                 style={{ display: "none" }}
                 onChange={(e) => validate(e.target.files && e.target.files[0])} />
          <div className="dz-wrap">
            <CoachMark show={showCoach && !file} onDismiss={onCoachDismiss} />
            <div className={"dropzone" + (drag ? " drag" : "")}
                 onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                 onDragLeave={() => setDrag(false)}
                 onDrop={(e) => { e.preventDefault(); setDrag(false); onCoachDismiss && onCoachDismiss(); validate(e.dataTransfer.files && e.dataTransfer.files[0]); }}
                 onClick={() => { onCoachDismiss && onCoachDismiss(); inputRef.current && inputRef.current.click(); }}>
              <span className="dz-ic"><Ic.upload style={{ width: 26, height: 26 }} /></span>
              <div className="dz-t">Drop your <span className="mono">.eml</span> here</div>
              <div className="dz-d">or click to browse · max 5&nbsp;MB · stays on this device</div>
            </div>
          </div>
          {error && (
            <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, padding: "11px 14px", borderRadius: 11, background: "var(--burned-bg)", color: "var(--burned)", fontSize: 13.5, lineHeight: 1.45 }}>
              <Ic.alert style={{ width: 17, height: 17, flex: "none", marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
          <details className="eml-help" style={{ marginTop: 16, fontSize: 13, color: "var(--ink-2)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--ink)" }}>
              How do I get my <span className="mono">.eml</span>?
            </summary>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><b>Gmail (web):</b> open the email → <b>⋮</b> menu → <b>Show original</b> → <b>Download Original</b>.</li>
              <li><b>Apple Mail:</b> <b>drag the message</b> from the list onto Finder — a <span className="mono">.eml</span> appears. <i>Save As</i> gives a <span className="mono">.rtf</span>, which won't work — it has no DKIM signature.</li>
              <li><b>Don&apos;t forward it.</b> Forwarding re-signs the message and breaks the original signature. Sorostamp needs the raw email exactly as it arrived.</li>
            </ul>
          </details>
        </>
      ) : (
        <div className="eml-preview">
          <div className="emlp-head">
            <span className="emlp-file mono"><Ic.file style={{ width: 14, height: 14 }} /> {file.name || "email.eml"}</span>
            <button className="emlp-clear" onClick={() => setFile(null)}><Ic.x style={{ width: 14, height: 14 }} /> Remove</button>
          </div>
          <div className="emlp-body">
            <div className="emlp-line"><span className="mk mono">File</span><span className="mv mono">{file.name} · {(file.size / 1024).toFixed(0)} KB</span></div>
            <div className="emlp-line"><span className="mk mono">DKIM</span><span className="mv mono ok">✓ signature detected</span></div>
            <div className="emlp-div" />
            <div className="emlp-fields">
              <span className="ef-lbl">What happens next</span>
              <p className="ef-note">
                When you continue, Sorostamp resolves the sender&apos;s DKIM key, then builds a
                zero-knowledge proof <b>in this browser</b>. The email bytes never leave your
                device — only the finished proof is sent on-chain.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════ Step 3 — generate proof (REAL) ════════ */

/* What the consent panel needs (built on the main thread after selection). */
type ConsentData = {
  facts: { key: string; value: string }[];
  from: string;
  suffix: Uint8Array;
  audit: SuffixAudit;
  bodyLen: number;
};

/* Consent panel (body proofs): the suffix after the reveal window is published
   in the sealing transaction — show EXACTLY what that is, plus the PII scan,
   before any heavy download/proving starts. */
function ConsentPanel({ data, onDecide }: {
  data: ConsentData;
  onDecide: (go: boolean) => void;
}) {
  const kb = (data.suffix.length / 1024).toFixed(1);
  return (
    <div className="step-pane fade-up">
      <div className="pane-head">
        <h2 className="display">Your reveals. One thing to approve.</h2>
        <p>These selections will be the proven statement — nothing else from the email is shown:</p>
      </div>
      <div className="eml-preview" style={{ marginBottom: 14 }}>
        <div className="emlp-body">
          {data.facts.map((f) => (
            <div key={f.key} className="emlp-line">
              <span className="mk mono">Reveal</span>
              <span className="mv mono ok">{f.value}</span>
            </div>
          ))}
          <div className="emlp-line"><span className="mk mono">Signed by</span><span className="mv mono">{data.from}</span></div>
        </div>
      </div>
      <div className="privacy-bar" style={{ alignItems: "flex-start" }}>
        <Ic.eye style={{ width: 18, height: 18, flex: "none", marginTop: 2 }} />
        <span>
          To prove body facts, the <b>tail of the email</b> after your selection
          ({kb}&nbsp;KB) is <b>published on-chain</b> — the contract needs it to finish
          the body hash. Everything before and around your selections stays private.
          {data.audit.ok ? (
            <> We scanned it: <b>no personal data found</b>.</>
          ) : (
            <> ⚠ Our scan flagged {data.audit.hits.length} possible personal item(s) — review below before continuing.</>
          )}
        </span>
      </div>
      {!data.audit.ok && (
        <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, padding: "11px 14px", borderRadius: 11, background: "var(--burned-bg)", color: "var(--burned)", fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>
            Review before approving — publishing is permanent and this tail contains:
          </span>
          {data.audit.hits.slice(0, 5).map((h, i) => (
            <span key={i} className="mono">{h.kind}: …{h.excerpt}…</span>
          ))}
          <span>
            It&apos;s your call: approve to publish it anyway, or cancel and select facts
            that appear later in the email (a later selection = a smaller public tail).
          </span>
        </div>
      )}
      <details style={{ marginTop: 12, fontSize: 13, color: "var(--ink-2)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--ink)" }}>
          Review the exact {kb} KB that will be published
        </summary>
        <pre className="mono" style={{ marginTop: 10, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, lineHeight: 1.5, background: "var(--paper-2, #f4f0e6)", padding: 12, borderRadius: 10 }}>
          {data.audit.preview}
        </pre>
      </details>
      <div className="flow-nav" style={{ marginTop: 16 }}>
        <button className="btn-plain" onClick={() => onDecide(false)}>Cancel</button>
        <Btn variant="primary" onClick={() => onDecide(true)} icon={<Ic.lock style={{ width: 15, height: 15 }} />}>
          Approve &amp; generate proof
        </Btn>
      </div>
    </div>
  );
}

/* Selection stage (body proofs): the user reads the decoded body and selects
   up to 3 spans to reveal — generic across providers/languages. Selections map
   char-exact back to the SIGNED raw bytes via the Selectable offset maps. */
function SelectStage({ selectable, body, spans, setSpans, onContinue, hint }: {
  selectable: Selectable;
  body: Uint8Array;
  spans: SelSpan[];
  setSpans: (s: SelSpan[]) => void;
  onContinue: () => void;
  hint?: string | null;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [selErr, setSelErr] = useState<string | null>(null);

  const spanPreview = (s: SelSpan) => {
    const { label, value } = parseFactSpan(toLatin1(body, s.start, s.end));
    return `${label} ${value}`.trim() || "(empty)";
  };

  const addSelection = () => {
    setSelErr(null);
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !preRef.current) {
      setSelErr("Highlight some text in the email below first, then click Add.");
      return;
    }
    if (!preRef.current.contains(sel.anchorNode) || !preRef.current.contains(sel.focusNode)) {
      setSelErr("Select text inside the email body below.");
      return;
    }
    const a = sel.anchorOffset;
    const b = sel.focusOffset;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const span = textRangeToSpan(selectable, from, to);
    if (!span) {
      setSelErr("Couldn't map that selection — try again.");
      return;
    }
    if (spans.length >= 3) {
      setSelErr("Up to 3 reveals per proof — remove one first.");
      return;
    }
    const next = [...spans, span];
    const chk = checkSelection(body.length, next);
    if (!chk.ok) {
      setSelErr(chk.error);
      return;
    }
    setSpans(next);
    sel.removeAllRanges();
  };

  const chk = spans.length ? checkSelection(body.length, spans) : null;

  return (
    <div className="step-pane fade-up">
      <div className="pane-head">
        <h2 className="display">Select what to reveal.</h2>
        <p>
          Highlight up to 3 facts in the signed body below (an amount, a merchant, a
          reference…) and add them. Include the label next to each value so verifiers
          see its context. Everything you don&apos;t select stays hidden.
        </p>
      </div>

      {spans.length > 0 && (
        <div className="eml-preview" style={{ marginBottom: 10 }}>
          <div className="emlp-body">
            {spans.map((s, i) => (
              <div key={i} className="emlp-line">
                <span className="mk mono">Reveal {i + 1}</span>
                <span className="mv mono ok" style={{ flex: 1 }}>{spanPreview(s)}</span>
                <button className="emlp-clear" onClick={() => { setSelErr(null); setSpans(spans.filter((_, j) => j !== i)); }}>
                  <Ic.x style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
            {chk?.ok && (
              <div className="emlp-line">
                <span className="mk mono">Tail to publish</span>
                <span className="mv mono">{Math.round(chk.suffixLen / 1024)} KB (you review it next)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hint && spans.length === 0 && !selErr && (
        <div style={{ display: "flex", gap: 9, marginBottom: 10, padding: "10px 14px", borderRadius: 11, background: "var(--burned-bg)", color: "var(--burned)", fontSize: 13, lineHeight: 1.5 }}>
          <Ic.alert style={{ width: 16, height: 16, flex: "none", marginTop: 1 }} />
          <span>{hint}</span>
        </div>
      )}
      {selErr && (
        <div role="alert" style={{ display: "flex", gap: 9, marginBottom: 10, padding: "10px 14px", borderRadius: 11, background: "var(--burned-bg)", color: "var(--burned)", fontSize: 13 }}>
          <Ic.alert style={{ width: 16, height: 16, flex: "none", marginTop: 1 }} />
          <span>{selErr}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <button className="btn-plain" onClick={addSelection}>
          <Ic.plus style={{ width: 14, height: 14 }} /> Add highlighted text
        </button>
      </div>

      <pre
        ref={preRef}
        className="mono"
        style={{ maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, lineHeight: 1.6, background: "var(--paper-2, #f4f0e6)", padding: 14, borderRadius: 12, userSelect: "text", cursor: "text" }}
      >{selectable.text}</pre>

      <div className="flow-nav" style={{ marginTop: 14 }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", alignSelf: "center" }}>
          {spans.length}/3 reveals selected
        </span>
        <Btn variant="primary" disabled={!chk?.ok} onClick={onContinue}>
          Continue
        </Btn>
      </div>
    </div>
  );
}

function Step3({ file, field, kind, onProved, onError }: {
  file: File;
  field: string;
  kind: "header" | "body";
  onProved: (r: AnyResult) => void;
  onError: (msg: string) => void;
}) {
  const [progress, setProgress] = useState<ProveProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // body-proof staging: extract → select → consent → prove
  const [stage, setStage] = useState<"extract" | "select" | "consent" | "prove">("extract");
  const [body, setBody] = useState<Uint8Array | null>(null);
  const [fromLine, setFromLine] = useState("");
  const [selectable, setSelectable] = useState<Selectable | null>(null);
  const [spans, setSpans] = useState<SelSpan[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const bufRef = useRef<ArrayBuffer | null>(null);
  // Proving downloads a huge key and runs a heavy witness; on mobile/low-RAM
  // devices that OOM-crashes the tab. Gate honestly instead of crashing.
  // Body proofs use a bigger key (~1 GB) → the bar is higher.
  const [blocked] = useState(() => (kind === "body" ? !isBodyCapableDevice() : isLowPowerDevice()));
  const startedRef = useRef(false);

  useEffect(() => {
    if (blocked || startedRef.current) return; // gated, or already running
    startedRef.current = true;
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        bufRef.current = buf;
        if (kind === "body") {
          // phase 1: fast — DKIM verify + canonical body for the selection UI
          const ex = await extractEmailBody(buf.slice(0), (p) => setProgress(p));
          const sel = buildSelectable(ex.body);
          setBody(ex.body);
          setFromLine(ex.from);
          setSelectable(sel);
          // pre-suggest amounts/references — the user can remove or add
          const suggested = suggestSpans(sel);
          if (suggested.length) {
            const chk = checkSelection(ex.body.length, suggested);
            if (chk.ok) setSpans(suggested);
            else {
              // facts exist but the scheme's physics reject them — say so, and
              // point at the choices that remain (later facts = smaller tail)
              setHint(
                `We found facts in this email, but that selection can't be body-proven: ${chk.error} ` +
                  `Tip: the same fact often appears more than once — selecting a LATER occurrence shrinks the published tail. ` +
                  `Or "Proof of Receipt" can prove this email's subject line instead.`
              );
            }
          }
          setStage("select");
        } else {
          const result = await proveEmail(buf, field, (p) => setProgress(p));
          onProved({ kind: "header", ...result });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
        onError(msg);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selection approved → build the consent data (suffix + PII audit) locally
  const toConsent = () => {
    if (!body) return;
    const chk = checkSelection(body.length, spans);
    if (!chk.ok) return;
    const suffix = body.slice(chk.windowEnd);
    const emlText = bufRef.current ? new TextDecoder().decode(bufRef.current) : "";
    setConsent({
      facts: spans.map((s, i) => {
        const { label, value } = parseFactSpan(toLatin1(body, s.start, s.end));
        return { key: `sel${i}`, value: `${label} ${value}`.trim() };
      }),
      from: fromLine,
      suffix,
      audit: auditSuffix(suffix, userIdentifiers(emlText)),
      bodyLen: body.length,
    });
    setStage("consent");
  };

  // consent approved → phase 2: the heavy proving run
  const startProving = async () => {
    if (!consent || !bufRef.current) return;
    setStage("prove");
    try {
      const result = await proveEmailBodySpans(
        bufRef.current.slice(0),
        spans,
        consent.suffix,
        (p) => setProgress(p)
      );
      onProved({ kind: "body", ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      onError(msg);
    }
  };

  // The substeps shown, keyed to the worker's progress emits.
  const dlPct = progress?.step === "download" && typeof progress.pct === "number" ? progress.pct : null;
  const keySize = kind === "body" ? "~1 GB" : "~400 MB";
  const STEPS = [
    { k: "dkim", label: "Resolving the DKIM key", d: "published RSA key, via DNS" },
    {
      k: "inputs",
      label: kind === "body" ? "Building circuit inputs" : "Building circuit inputs",
      d: kind === "body" ? "body + masks, locally" : "headers parsed locally",
    },
    {
      k: "download",
      label: dlPct !== null ? `Downloading the proving key · ${dlPct}%` : "Downloading the proving key",
      d: `${keySize} · one time, then cached`,
    },
    { k: "prove", label: "Building the Groth16 proof", d: "runs off the main thread" },
  ];
  const order = ["parse", "dkim", "inputs", "download", "witness", "prove", "done"];
  const curIdx = progress ? order.indexOf(progress.step) : 0;
  const done = progress?.step === "done";
  // Use real download % within the download phase; otherwise the step index.
  const base = (curIdx / (order.length - 1)) * 100;
  const pct =
    dlPct !== null
      ? Math.min(100, ((order.indexOf("download") + dlPct / 100) / (order.length - 1)) * 100)
      : Math.min(100, base);

  if (blocked) {
    return (
      <div className="step-pane fade-up">
        <div className="gen-wrap">
          <h2 className="display gen-title">
            {kind === "body" ? "Purchase proofs need a roomy desktop" : "Proving needs a desktop browser"}
          </h2>
          <p className="gen-sub" style={{ maxWidth: 470 }}>
            {kind === "body"
              ? `Proving body facts downloads a ${keySize} key and peaks at a few GB of memory — it needs a desktop or laptop with 8 GB of RAM or more.`
              : "Generating the proof downloads a ~400 MB key and runs a heavy computation in your browser — that crashes most phones. Open this page on a desktop or laptop to create your proof."}
          </p>
          <button className="btn-plain" style={{ marginTop: 6 }}
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard)
                navigator.clipboard.writeText(window.location.href).catch(() => {});
            }}>
            <Ic.link style={{ width: 15, height: 15 }} /> Copy this link to open on desktop
          </button>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="step-pane fade-up">
        <div className="gen-wrap">
          <h2 className="display gen-title">Couldn&apos;t generate the proof.</h2>
          <p className="gen-sub" style={{ color: "var(--burned)", maxWidth: 460 }}>{err}</p>
        </div>
      </div>
    );
  }

  if (kind === "body" && stage === "select" && selectable && body) {
    return (
      <SelectStage
        selectable={selectable}
        body={body}
        spans={spans}
        setSpans={setSpans}
        onContinue={toConsent}
        hint={hint}
      />
    );
  }

  if (kind === "body" && stage === "consent" && consent) {
    return (
      <ConsentPanel
        data={consent}
        onDecide={(go) => {
          if (go) startProving();
          else {
            setConsent(null);
            setStage("select");
          }
        }}
      />
    );
  }

  return (
    <div className="step-pane fade-up">
      <div className="gen-wrap">
        <div className="gen-seal"><SealingSeal size={132} sealed={done} /></div>
        <h2 className="display gen-title">{done ? "Proof generated." : "Generating zero-knowledge proof…"}</h2>
        <p className="gen-sub">{done ? "Built locally. Nothing was uploaded." : "Running in your browser. The email never leaves this device."}</p>
        {!done && (
          <p className="honesty-note">The first proof downloads a {keySize} proving key — this can take a minute or two. It&apos;s cached after that.</p>
        )}
        <div className="gen-bar"><span className="gen-fill" style={{ width: pct + "%" }} /></div>
        <div className="gen-steps">
          {STEPS.map((s) => {
            const sIdx = order.indexOf(s.k);
            const st = curIdx > sIdx ? "done" : curIdx === sIdx ? "run" : "wait";
            return (
              <div key={s.k} className={"gen-step gs-" + st}>
                <span className="gs-ic">
                  {st === "done" ? <Ic.check style={{ width: 13, height: 13 }} />
                    : st === "run" ? <Spinner size={13} />
                    : <span className="gs-dot" />}
                </span>
                <span className="gs-k mono">{s.label}</span>
                <span className="gs-d mono">{s.d}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════ Step 4 — seal on Stellar (REAL) ════════ */
function Step4({ result, onSealed }: {
  result: AnyResult;
  onSealed: (s: SealResult) => void;
}) {
  const N = NET;
  const isBody = result.kind === "body";
  const verifier = isBody ? N.verifierBody : N.verifier;
  const [state, setState] = useState<"ready" | "sending" | "sealed" | "error">("ready");
  const [err, setErr] = useState<string | null>(null);
  const [sealed, setSealed] = useState<SealResult | null>(null);

  const seal = async () => {
    setState("sending");
    setErr(null);
    try {
      const res = await fetch("/api/seal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isBody
            ? {
                kind: "body",
                proof: result.proof,
                publicSignals: result.publicSignals,
                suffix: b64((result as BodyProveResult).suffix),
              }
            : { proof: result.proof, publicSignals: result.publicSignals }
        ),
      });
      const data = await res.json();
      if (data.ok) {
        const s: SealResult = { id: data.id, hash: data.hash, alreadySealed: false };
        setSealed(s);
        setState("sealed");
        setTimeout(() => onSealed(s), 700);
      } else if (data.reason === "already_sealed") {
        // The exact fact was proven before — still live on-chain. Treat as success.
        const s: SealResult = { id: data.id, alreadySealed: true };
        setSealed(s);
        setState("sealed");
        setTimeout(() => onSealed(s), 700);
      } else {
        setErr(data.error || "The contract rejected the proof.");
        setState("error");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  return (
    <div className="step-pane fade-up">
      <div className="pane-head">
        <h2 className="display">Seal it on-chain</h2>
        <p>Submit the proof to the Sorostamp verifier contract on {N.name}. Verification happens inside Soroban.</p>
      </div>
      <div className="seal-stage">
        <SealingSeal size={150} sealed={state === "sealed"} />
        <div className="seal-side">
          <div className="ss-row"><span className="ss-k">Contract</span><CopyValue value={verifier} display={trunc(verifier, 6, 5)} link={N.explorer + "/contract/" + verifier} /></div>
          <div className="ss-row"><span className="ss-k">Function</span><span className="mono ss-v">{isBody ? "seal_body(proof, public_signals, suffix)" : "submit_proof(proof, public_signals)"}</span></div>
          <div className="ss-row"><span className="ss-k">Cost to you</span><span className="mono ss-v">Free · gas sponsored by Sorostamp</span></div>
          {state === "ready" && (
            <Btn variant="primary" onClick={seal} icon={<Ic.lock style={{ width: 15, height: 15 }} />}>Verify on-chain</Btn>
          )}
          {state === "sending" && (
            <div className="seal-status"><Spinner size={16} /> <span>Submitting to Soroban… <span className="mono faint">awaiting confirmation</span></span></div>
          )}
          {state === "sealed" && sealed && (
            <div className="seal-status ok">
              <span className="vchk"><Ic.check style={{ width: 12, height: 12 }} /></span>
              {sealed.alreadySealed ? "Already sealed on-chain — verified" : "Sealed on-chain — verified"}
            </div>
          )}
          {state === "error" && (
            <>
              <div className="seal-status" style={{ color: "var(--burned)" }}>
                <Ic.alert style={{ width: 16, height: 16 }} /> <span>{err}</span>
              </div>
              <Btn variant="primary" onClick={seal} icon={<Ic.lock style={{ width: 15, height: 15 }} />}>Try again</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════ App shell ════════ */
export function AppFlow({ go, initialBlueprint, pushToast, showCoach, onCoachDismiss }: any) {
  const [step, setStep] = useState(1);
  const [maxReached, setMax] = useState(1);
  const [bp, setBp] = useState(initialBlueprint || "purchase");
  const [customField, setCustomField] = useState("subject");
  const [file, setFile] = useState<File | null>(null);
  // The header field the proof will reveal: the blueprint's preset, or the
  // user's pick for the Custom blueprint. Body blueprints ignore `field`.
  const field = bp === "custom" ? customField : blueprintField(bp);
  const kind = blueprintKind(bp);
  const [proveResult, setProveResult] = useState<AnyResult | null>(null);
  const [sealResult, setSealResult] = useState<SealResult | null>(null);

  const goStep = (n: number) => { setStep(n); setMax((m) => Math.max(m, n)); };
  const next = () => goStep(Math.min(4, step + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const reset = () => {
    setStep(1); setMax(1); setFile(null); setProveResult(null); setSealResult(null);
  };

  const canNext = step === 1 ? !!bp : step === 2 ? !!file : true;

  if (step === 5 && proveResult && sealResult) {
    const shareUrl =
      (typeof window !== "undefined" ? window.location.origin : "https://sorostamp.com") +
      proofUrl(proveResult, sealResult.id);
    return (
      <div className="app-result fade-up">
        <div className="wrap-narrow">
          <div className="result-banner">
            <span className="vchk lg"><Ic.check style={{ width: 16, height: 16 }} /></span>
            <div>
              <div className="rb-t">Your proof is sealed on {NET.name}.</div>
              <div className="rb-d">Anyone with the link can verify the fact — and only the fact.</div>
            </div>
          </div>
          <RealProofCard
            result={proveResult}
            seal={sealResult}
            onShare={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard)
                navigator.clipboard.writeText(shareUrl).catch(() => {});
              pushToast("Proof link copied", "Share it — the email stays private.", "success");
            }}
          />
          <div className="result-foot">
            <button className="btn-plain" onClick={reset}>
              <Ic.plus style={{ width: 15, height: 15 }} /> Create another proof
            </button>
            <a className="btn-plain" href={proofUrl(proveResult, sealResult.id)} target="_blank" rel="noopener">
              <Ic.eye style={{ width: 15, height: 15 }} /> View public page
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-flow">
      <div className="wrap-narrow">
        <Stepper step={step} maxReached={maxReached} onJump={goStep} />
        <div className="flow-card card">
          {step === 1 && <Step1 bp={bp} setBp={setBp} customField={customField} setCustomField={setCustomField} />}
          {step === 2 && <Step2 file={file} setFile={setFile} showCoach={showCoach && step === 2} onCoachDismiss={onCoachDismiss} />}
          {step === 3 && file && (
            <Step3
              file={file}
              field={field}
              kind={kind}
              onProved={(r) => { setProveResult(r); goStep(4); }}
              onError={() => {}}
            />
          )}
          {step === 4 && proveResult && (
            <Step4 result={proveResult} onSealed={(s) => { setSealResult(s); setStep(5); }} />
          )}

          {step !== 3 && step !== 4 && (
            <div className="flow-nav">
              {step > 1 ? <button className="btn-plain" onClick={back}>Back</button> : <span />}
              <Btn variant="primary" disabled={!canNext} onClick={next}>
                {step === 2 ? "Generate proof" : "Continue"}
              </Btn>
            </div>
          )}
          {step === 3 && (
            <div className="flow-nav single"><button className="btn-plain" onClick={back}>Cancel</button></div>
          )}
        </div>
      </div>
    </div>
  );
}
