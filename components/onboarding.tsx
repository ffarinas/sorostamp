"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — first-run onboarding modal (4-step carousel) + dropzone coach-mark
   ═══════════════════════════════════════════════════════════════════ */
import { useState, useEffect, Fragment } from "react";
import { Seal } from "@/components/seal";
import { Ic, Btn } from "@/components/primitives";

/* ── Per-step illustrations ─────────────────────────────────── */

/* 1 · sealed email — almost everything masked, one line kept */
function ArtSealed() {
  return (
    <div className="ob-art ob-art-sealed">
      <div className="obm-email">
        <div className="obm-row"><span className="obm-k mono">From</span><span className="obm-bar w70" /></div>
        <div className="obm-row"><span className="obm-k mono">Subj</span><span className="obm-bar w90" /></div>
        <div className="obm-div" />
        <div className="obm-bar w80" />
        <div className="obm-bar w60" />
        <div className="obm-kept mono"><span className="vchk sm"><Ic.check style={{ width: 10, height: 10 }} /></span> Received $250.00</div>
        <div className="obm-bar w75" />
        <div className="obm-bar w50" />
      </div>
      <div className="obm-seal"><Seal size={66} variant="verified" /></div>
    </div>
  );
}

/* 2 · three steps */
const OB_HOW = [
  { ic: "upload", t: "Drop your .eml file", d: "the original signed message" },
  { ic: "shield", t: "Your browser builds a ZK proof", d: "the email never leaves your device", hi: true },
  { ic: "lock",   t: "A Stellar contract verifies it", d: "on Stellar, trustlessly" },
];
function ArtHow() {
  return (
    <div className="ob-art ob-how">
      {OB_HOW.map((s, i) => {
        const I = Ic[s.ic];
        return (
          <Fragment key={i}>
            <div className={"obh-card" + (s.hi ? " hi" : "")}>
              <span className="obh-n mono">{i + 1}</span>
              <span className="obh-ic"><I style={{ width: 19, height: 19 }} /></span>
              <span className="obh-t">{s.t}</span>
              <span className="obh-d">{s.d}</span>
              {s.hi && <span className="obh-flag">stays on your device</span>}
            </div>
            {i < OB_HOW.length - 1 && <span className="obh-arrow"><Ic.chevron style={{ width: 16, height: 16, transform: "rotate(-90deg)" }} /></span>}
          </Fragment>
        );
      })}
    </div>
  );
}

/* 3 · getting your .eml */
const OB_EML = [
  { ic: "mail", c: "Gmail (web)", d: <>open email → <b>⋮</b> → <b>Show original</b> → <b>Download Original</b></> },
  { ic: "file", c: "Apple Mail", d: <>drag the message onto Finder — a <span className="mono">.eml</span> appears. <span className="warnote">“Save As” gives a .rtf — that won’t work.</span></> },
];
function ArtEml() {
  return (
    <div className="ob-art ob-eml">
      {OB_EML.map((r, i) => {
        const I = Ic[r.ic];
        return (
          <div key={i} className="obe-row">
            <span className="obe-ic"><I style={{ width: 18, height: 18 }} /></span>
            <div className="obe-txt"><span className="obe-c">{r.c}</span><span className="obe-d">{r.d}</span></div>
          </div>
        );
      })}
      <div className="obe-row warn">
        <span className="obe-ic warn"><Ic.alert style={{ width: 18, height: 18 }} /></span>
        <div className="obe-txt"><span className="obe-c">Don’t forward it</span><span className="obe-d">forwarding breaks the original signature.</span></div>
      </div>
      <div className="obe-format mono"><Ic.info style={{ width: 13, height: 13 }} /> We need the raw <b>.eml</b> — not a .rtf, screenshot, or PDF.</div>
    </div>
  );
}

/* 4 · private by design */
const OB_PRIV = [
  "Your email is processed only in your browser.",
  "No crypto wallet, no XLM, no gas to pay — verification is on us.",
  "The proof is verified on Stellar by an open smart contract.",
];
function ArtPrivate() {
  return (
    <div className="ob-art ob-priv">
      {OB_PRIV.map((t, i) => (
        <div key={i} className="obp-row">
          <span className="vchk"><Ic.check style={{ width: 12, height: 12 }} /></span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

const OB_STEPS = [
  { eyebrow: "Welcome to Sorostamp",  title: "Prove a fact from an email — reveal nothing.",
    body: "Every email is signed by whoever sent it — your bank, a payment app, Google. Sorostamp uses that signature to prove one fact (“you received $250”) without ever showing the email itself.",
    art: ArtSealed },
  { eyebrow: "How it works",      title: "Three steps. Zero leakage.",
    body: "Proving happens locally. Only the single fact you choose is ever made public — checked on-chain.",
    art: ArtHow },
  { eyebrow: "Before you start",  title: "Getting your .eml file.",
    body: "Sorostamp needs the original, signed message. Here’s how to grab it:",
    art: ArtEml },
  { eyebrow: "Private by design", title: "No wallet needed. Nothing leaked.",
    body: "You don’t need crypto to use Sorostamp — just the email.",
    art: ArtPrivate, cta: "Seal your first proof" },
];

/* ── The modal ──────────────────────────────────────────────── */
export function Onboarding({ open, onClose, onFinish }: any) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [dontShow, setDontShow] = useState(true);
  const last = OB_STEPS.length - 1;

  const go = (d: number) => { setDir(d); setStep((s) => Math.min(last, Math.max(0, s + d))); };
  const close = () => onClose(dontShow);
  const finish = () => onFinish(dontShow);

  useEffect(() => { if (open) setStep(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" && step < last) go(1);
      else if (e.key === "ArrowLeft" && step > 0) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  if (!open) return null;
  const S = OB_STEPS[step];
  const Art = S.art;

  return (
    <div className="ob-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="ob-modal" role="dialog" aria-modal="true" aria-label="Welcome to Sorostamp">
        <button className="ob-x" onClick={close} aria-label="Close"><Ic.x style={{ width: 18, height: 18 }} /></button>

        <div className="ob-head">
          <Seal size={48} variant="gold" glyph="S" />
          <span className="eyebrow">{S.eyebrow}</span>
        </div>

        <div className="ob-stage">
          <div key={step} className={"ob-panel " + (dir >= 0 ? "from-right" : "from-left")}>
            <h2 className="display ob-title">{S.title}</h2>
            <p className="ob-body">{S.body}</p>
            <Art />
          </div>
        </div>

        <div className="ob-dots">
          {OB_STEPS.map((_, i) => (
            <button key={i} className={"ob-dot" + (i === step ? " on" : "")}
                    onClick={() => { setDir(i > step ? 1 : -1); setStep(i); }} aria-label={"Step " + (i + 1)} />
          ))}
        </div>

        <div className="ob-foot">
          <label className="ob-check">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            <span className="ob-box">{dontShow && <Ic.check style={{ width: 12, height: 12 }} />}</span>
            Don’t show this again
          </label>
          <div className="ob-nav">
            {step > 0 && <button className="btn-plain" onClick={() => go(-1)}>Back</button>}
            {step < last
              ? <Btn variant="primary" onClick={() => go(1)}>Next</Btn>
              : <Btn variant="primary" onClick={finish} icon={<Ic.zap style={{ width: 15, height: 15 }} />}>{S.cta}</Btn>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Coach-mark pointing at the dropzone (first time on step 2) ── */
export function CoachMark({ show, onDismiss }: any) {
  if (!show) return null;
  return (
    <div className="coach" role="note">
      <span className="coach-arrow" aria-hidden="true" />
      <Ic.upload style={{ width: 16, height: 16 }} />
      <span>Drop your <span className="mono">.eml</span> here — it never leaves your browser.</span>
      <button className="coach-x" onClick={onDismiss} aria-label="Dismiss"><Ic.x style={{ width: 13, height: 13 }} /></button>
    </div>
  );
}
