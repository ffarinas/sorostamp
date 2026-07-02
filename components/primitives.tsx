"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — shared primitives + icons
   ═══════════════════════════════════════════════════════════════════ */
import { useState, useRef, useCallback } from "react";

/* ── Icons (simple geometric strokes) ───────────────────────── */
export const Ic: any = {
  copy: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15"/></svg>),
  check: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="4 12.5 9.5 18 20 6"/></svg>),
  arrow: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>),
  ext: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V9a1.5 1.5 0 0 1 1.5-1.5H12"/></svg>),
  wallet: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 9h18"/><circle cx="17" cy="13.5" r="1.3" fill="currentColor" stroke="none"/></svg>),
  lock: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>),
  globe: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>),
  shield: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>),
  users: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9"/></svg>),
  spark: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>),
  chevron: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>),
  x: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>),
  plus: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  alert: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="currentColor"/></svg>),
  ok: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/></svg>),
  info: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="currentColor"/></svg>),
  spinner: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M12 3a9 9 0 1 0 9 9" opacity="1"/><path d="M12 3a9 9 0 0 1 9 9" opacity="0.25"/></svg>),
  mail: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7.5l7.3 5.2a1.2 1.2 0 0 0 1.4 0L20 7.5"/></svg>),
  eye: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>),
  eyeOff: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 4l16 16"/><path d="M9.5 5.9A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.3M6.2 7.7A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>),
  share: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 11l7.8-3.8M8.1 13l7.8 3.8"/></svg>),
  link: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.3 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7L12.7 17"/></svg>),
  download: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v12M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>),
  upload: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 16V4M7 8l5-5 5 5"/><path d="M5 20h14"/></svg>),
  zap: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 2L4 13.5h6L11 22l9-11.5h-6z"/></svg>),
  server: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><line x1="7" y1="7.5" x2="7.02" y2="7.5"/><line x1="7" y1="16.5" x2="7.02" y2="16.5"/></svg>),
  code: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="8 7 3 12 8 17"/><polyline points="16 7 21 12 16 17"/></svg>),
  bank: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 10l8-5 8 5"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 21h18"/></svg>),
  file: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>),
  coins: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/></svg>),
};

/* ── clipboard ──────────────────────────────────────────────── */
export function useCopy(): [boolean, (text: any) => void] {
  const [copied, setCopied] = useState(false);
  const tRef = useRef<any>(null);
  const copy = useCallback((text: any) => {
    const t = String(text);
    const done = () => { setCopied(true); clearTimeout(tRef.current); tRef.current = setTimeout(() => setCopied(false), 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done).catch(() => fallback(t, done));
    } else fallback(t, done);
  }, []);
  return [copied, copy];
}
function fallback(text: string, done: () => void) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch (e) {}
  document.body.removeChild(ta);
}

/* CopyValue — boxed mono value w/ copy + optional truncation + explorer link */
export function CopyValue({ value, display, label, link, mono = true, className = "" }: any) {
  const [copied, copy] = useCopy();
  return (
    <span className={"copy " + (copied ? "copied " : "") + className} onClick={(e) => { e.stopPropagation(); copy(value); }}
          title={label ? label + ": " + value : value} role="button">
      <span className={"val" + (mono ? " mono" : "")}>{display || value}</span>
      {link && (
        <a href={link} target="_blank" rel="noopener" className="ci" onClick={(e) => e.stopPropagation()} title="Open in stellar.expert">
          <Ic.ext />
        </a>
      )}
      <span className="ci">{copied ? <Ic.check /> : <Ic.copy />}</span>
    </span>
  );
}

/* ── Spinner ────────────────────────────────────────────────── */
export function Spinner({ size = 16 }: any) {
  return <Ic.spinner className="spin" style={{ width: size, height: size }} />;
}

/* ── Button with chip arrow ─────────────────────────────────── */
export function Btn({ variant = "primary", loading, disabled, children, icon, small, ...rest }: any) {
  const cls = `btn btn-${variant}` + (small ? " btn-sm" : "");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      <span>{children}</span>
      <span className="chip">{loading ? <Spinner size={small ? 13 : 15} /> : (icon || <Ic.arrow style={{ width: small ? 13 : 15, height: small ? 13 : 15 }} />)}</span>
    </button>
  );
}
