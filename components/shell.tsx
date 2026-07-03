"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — app shell: topbar, navigation, theme, toasts, onboarding
   Ported from the Vite app's main.jsx. The old in-memory `view` router
   becomes real Next.js routes; `go(view, opts)` maps to useRouter pushes:
     go("landing") → "/"
     go("app")     → "/app"
     go("verify")  → the live demo proof page (demoProofPath)
   `go` and `pushToast` are exposed to pages via the ShellContext + useShell().
   ═══════════════════════════════════════════════════════════════════ */
import {
  useState, useEffect, useCallback, useContext, createContext, Fragment,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { Ic } from "@/components/primitives";
import { Seal } from "@/components/seal";
import { Onboarding } from "@/components/onboarding";
import { NET, demoProofPath } from "@/lib/data";

/* ── Shell context: what pages/components consume ───────────── */
type ShellCtx = {
  go: (view: string, opts?: any) => void;
  pushToast: (title: string, msg?: string, kind?: string) => void;
  blueprint: string | null;
  showCoach: boolean;
  dismissCoach: () => void;
};
const ShellContext = createContext<ShellCtx | null>(null);
export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <Shell>");
  return ctx;
}

/* ── Toasts ─────────────────────────────────────────────────── */
function useToasts(): [(title: string, msg?: string, kind?: string) => void, any] {
  const [toasts, setToasts] = useState<any[]>([]);
  const push = useCallback((title: string, msg = "", kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, title, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const node = (
    <div className="toast-wrap">
      {toasts.map((t) => {
        const I = t.kind === "success" ? Ic.ok : t.kind === "error" ? Ic.alert : Ic.info;
        return (
          <div key={t.id} className={"toast toast-" + t.kind}>
            <I className="ic" />
            <div><div className="t-title">{t.title}</div>{t.msg && <div className="t-msg">{t.msg}</div>}</div>
          </div>
        );
      })}
    </div>
  );
  return [push, node];
}

/* ── Topbar ─────────────────────────────────────────────────── */
function Topbar({ activeView, go, theme, setTheme, onHelp }: any) {
  const tabs = [
    { id: "landing", label: "Overview" },
    { id: "app", label: "Create proof" },
    { id: "verify", label: "Public proof" },
  ];
  return (
    <header className="topbar">
      <div className="topbar-in">
        <button className="brand" onClick={() => go("landing")}>
          <span className="brand-mark">
            <Seal size={28} variant="gold" glyph="S" />
            <span className="word serif">Sorostamp</span>
          </span>
          <span className="sub">on-chain email proofs</span>
        </button>
        <nav className="tb-nav">
          {tabs.map((t) => (
            <button key={t.id} className={"tb-tab" + (activeView === t.id ? " on" : "")} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </nav>
        <span className="tb-spacer" />
        <div className="tb-right">
          <button className="theme-btn" onClick={onHelp} title="How Sorostamp works" aria-label="How Sorostamp works">
            <Ic.info style={{ width: 17, height: 17 }} />
          </button>
          <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title="Toggle theme" aria-label="Toggle theme">
            {theme === "dark"
              ? <Ic.spark style={{ width: 16, height: 16 }} />
              : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"/></svg>}
          </button>
          <span className="net-pill tb-net"><span className="dot" /><span className="lbl">{NET.name}</span></span>
        </div>
      </div>
    </header>
  );
}

/* ── Shell ──────────────────────────────────────────────────── */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState("light");
  const [push, toastNode] = useToasts();
  const [blueprint, setBlueprint] = useState<string | null>(null);
  const ONBOARD_KEY = "sorostamp_onboarded";
  const [obOpen, setObOpen] = useState(false);
  const [coachDone, setCoachDone] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // first-run onboarding — but NOT on the public proof page (/p/[id]): that
  // visitor is a verifier following a shared link, not someone creating a
  // proof, so the "how to create" tutorial just gets in the way of the proof
  // they came to check.
  useEffect(() => {
    if (pathname.startsWith("/p/")) return;
    let seen = null;
    try { seen = localStorage.getItem(ONBOARD_KEY); } catch (e) {}
    if (!seen) { setObOpen(true); setCoachDone(false); }
  }, [pathname]);

  const markOnboarded = (dontShow: boolean) => {
    if (dontShow) { try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) {} }
  };

  const go = useCallback((v: string, opts: any = {}) => {
    if (opts.blueprint) setBlueprint(opts.blueprint);
    if (v === "landing") router.push("/");
    else if (v === "app") router.push("/app");
    else if (v === "verify") router.push(demoProofPath());
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [router]);

  const closeOnboarding = (dontShow: boolean) => { markOnboarded(dontShow); setObOpen(false); };
  const finishOnboarding = (dontShow: boolean) => { markOnboarded(dontShow); setObOpen(false); go("app"); };

  // Which top-nav tab is highlighted, derived from the current path.
  const activeView =
    pathname === "/" ? "landing"
      : pathname.startsWith("/app") ? "app"
      : pathname.startsWith("/p/") ? "verify"
      : "";

  const ctx: ShellCtx = {
    go,
    pushToast: push,
    blueprint,
    showCoach: !coachDone,
    dismissCoach: () => setCoachDone(true),
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className="lacre-root">
        <Topbar activeView={activeView} go={go} theme={theme} setTheme={setTheme} onHelp={() => setObOpen(true)} />
        <main>{children}</main>
        {toastNode}
        <Onboarding open={obOpen} onClose={closeOnboarding} onFinish={finishOnboarding} />
      </div>
    </ShellContext.Provider>
  );
}
