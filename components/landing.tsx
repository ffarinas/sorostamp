"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — Landing page
   ═══════════════════════════════════════════════════════════════════ */
import { Seal } from "@/components/seal";
import { Ic, Btn, CopyValue } from "@/components/primitives";
import { trunc, NET, BLUEPRINTS, EMAIL, demoProofPath } from "@/lib/data";

/* ── Hero proof-card preview (compact) ───────────────────────────
   An illustration of the proof card whose network + verifier contract are
   REAL (from NET), with a link to a live, on-chain proof. No invented
   proof/tx hashes are shown as if real. */
function HeroProof() {
  const N = NET;
  return (
    <div className="hero-proof">
      <div className="seal-perch"><Seal size={92} variant="verified" /></div>
      <div className="hp-badge"><Ic.eyeOff style={{ width: 13, height: 13 }} /> Email never revealed</div>
      <span className="eyebrow" style={{ fontSize: 11 }}>Example proof · Proof of Purchase</span>
      <div className="hp-fact serif">Paid <b>$3.57</b> to<br /><b>Amazon Web Services</b></div>
      <div className="hp-verline">
        <span className="vchk"><Ic.check style={{ width: 12, height: 12 }} /></span>
        Verified on {N.name}
      </div>
      <div className="hp-hashes">
        <div className="hp-hrow"><span className="hk">contract</span><span className="hv mono">{trunc(N.verifier, 6, 4)}</span></div>
        <div className="hp-hrow"><span className="hk">curve</span><span className="hv mono">{N.curve}</span></div>
      </div>
      <a className="btn-plain" href={demoProofPath()} style={{ marginTop: 10, fontSize: 12.5 }}>
        <Ic.eye style={{ width: 13, height: 13 }} /> See a live proof
      </a>
    </div>
  );
}

function Hero({ go }: any) {
  const N = NET;
  return (
    <section className="l-hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">On-chain email proofs · Stellar Soroban</span>
          <h1 className="display">Turn any email into an on-chain proof.</h1>
          <p className="lede">
            Prove what you paid, who really emailed you, or any signed fact — with zero-knowledge
            cryptography, sealed on Stellar, without ever revealing the email.
          </p>
          <div className="cta-row">
            <Btn variant="primary" onClick={() => go("app")} icon={<Ic.zap style={{ width: 15, height: 15 }} />}>
              Launch app
            </Btn>
            <a className="btn btn-ghost" href="#how"
               onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <span>How it works</span>
              <span className="chip"><Ic.chevron style={{ width: 15, height: 15 }} /></span>
            </a>
          </div>
          <div className="hero-meta">
            <div className="hm-item">
              <span className="k">Network</span>
              <span className="net-pill" style={{ alignSelf: "flex-start" }}><span className="dot" />{N.name}</span>
            </div>
            <div className="hm-item">
              <span className="k">Verifier contract</span>
              <CopyValue value={N.verifier} display={trunc(N.verifier, 6, 4)}
                         link={N.explorer + "/contract/" + N.verifier} />
            </div>
            <div className="hm-item">
              <span className="k">Proof system</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{N.curve}</span>
            </div>
          </div>
        </div>
        <div className="hero-art-col"><HeroProof /></div>
      </div>
    </section>
  );
}

/* ── How it works ───────────────────────────────────────────── */
const HOW = [
  { ic: "mail", n: "01", t: "Add your .eml file",
    d: "A payment receipt, a corporate notice — anything signed by DKIM. It stays on your device." },
  { ic: "shield", n: "02", t: "Prove it privately",
    d: "Your browser builds a zero-knowledge proof of one fact. The email never leaves your machine." },
  { ic: "lock", n: "03", t: "Seal it on Stellar",
    d: "A Soroban contract verifies the proof on Stellar. Reveal nothing, prove everything." },
];
function HowItWorks() {
  return (
    <section id="how" className="l-section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 className="display">Three steps. Zero leakage.</h2>
        </div>
        <div className="how-grid">
          {HOW.map((s) => {
            const I = Ic[s.ic];
            return (
              <div key={s.n} className="how-card card">
                <div className="how-top">
                  <span className="how-ic"><I style={{ width: 20, height: 20 }} /></span>
                  <span className="how-n mono">{s.n}</span>
                </div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── The contrast — without / with Sorostamp (the "wow") ────────── */
function EmailHeaderLine({ k, v, danger }: any) {
  return (
    <div className={"eh-line" + (danger ? " danger" : "")}>
      <span className="eh-k mono">{k}</span>
      <span className="eh-v mono">{v}</span>
    </div>
  );
}
function Contrast() {
  const E = EMAIL;
  const N = NET;
  return (
    <section className="l-section">
      <div className="wrap">
        <div className="section-head" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 38px" }}>
          <span className="eyebrow">The difference · illustrative example</span>
          <h2 className="display">Same email. One reveals everything.</h2>
          <p className="sec-lede">A screenshot exposes the whole email. A Sorostamp proof reveals only the one signed field you choose — and hides the rest.</p>
        </div>
        <div className="contrast-grid">
          {/* WITHOUT */}
          <div className="ct-panel ct-without">
            <div className="ct-head">
              <span className="ct-tag ct-tag-bad"><Ic.eye style={{ width: 13, height: 13 }} /> Everyone sees everything</span>
              <span className="ct-title">Without Sorostamp</span>
            </div>
            <div className="email-raw">
              <EmailHeaderLine k="From" v={E.from} danger />
              <EmailHeaderLine k="To" v={E.to} danger />
              <EmailHeaderLine k="Subject" v={E.subject} danger />
              <EmailHeaderLine k="DKIM" v={E.dkim} />
              <div className="eh-div" />
              <div className="email-body">
                {E.body.map((b, i) => (
                  <p key={i} className={b.reveal ? "danger" : ""}>{b.t}</p>
                ))}
              </div>
            </div>
          </div>
          {/* WITH */}
          <div className="ct-panel ct-with">
            <div className="ct-head">
              <span className="ct-tag ct-tag-good"><Ic.lock style={{ width: 13, height: 13 }} /> Prove the fact, hide the email</span>
              <span className="ct-title">With Sorostamp</span>
            </div>
            <div className="email-raw redacted">
              {/* Proof of Sender reveals the signed From — shown in clear; the
                  rest of the email stays hidden. */}
              <EmailHeaderLine k="From" v={E.from} />
              <EmailHeaderLine k="To" v="███████████████" />
              <EmailHeaderLine k="Subject" v="████████████████████" />
              <EmailHeaderLine k="DKIM" v="✓ signature verified" />
              <div className="eh-div" />
              <div className="email-body">
                {E.body.map((b, i) => (
                  <p key={i} className="masked">{"█".repeat(Math.min(34, Math.max(14, b.t.length)))}</p>
                ))}
              </div>
              <div className="with-seal">
                <Seal size={56} variant="verified" />
                <div>
                  <div className="ws-fact">{E.illustrativeFact}</div>
                  <div className="ws-sub"><span className="vchk sm"><Ic.check style={{ width: 10, height: 10 }} /></span> Verified on {N.name}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Use cases ──────────────────────────────────────────────── */
function UseCases({ go }: any) {
  const BP = BLUEPRINTS;
  return (
    <section className="l-section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Use cases</span>
          <h2 className="display">One engine, many proofs.</h2>
        </div>
        <div className="uc-grid">
          {BP.map((b: any) => {
            const I = Ic[b.icon];
            return (
              <button key={b.id} className={"uc-card card" + (b.featured ? " featured" : "") + (b.comingSoon ? " coming" : "")}
                      disabled={b.comingSoon}
                      onClick={() => !b.comingSoon && go("app", { blueprint: b.id })}>
                <span className="uc-ic"><I style={{ width: 22, height: 22 }} /></span>
                {b.featured && <span className="uc-flag">Most popular</span>}
                {b.comingSoon && <span className="uc-flag uc-soon">Coming soon</span>}
                <h3>{b.title}</h3>
                <p>{b.blurb}</p>
                <div className="uc-ex mono">{b.example}</div>
                {!b.comingSoon && <span className="uc-go"><Ic.arrow style={{ width: 16, height: 16 }} /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Trustless by design (dark band) ────────────────────────── */
const TRUST = [
  { ic: "server", t: "No server reads your email", d: "Proving runs entirely client-side. Your inbox never touches our infrastructure." },
  { ic: "shield", t: "Built on audited zk-email circuits", d: "DKIM + RSA-2048 verification on battle-tested, open-source circuits." },
  { ic: "globe", t: "Verified on-chain by Soroban", d: "A single smart contract on Stellar checks every proof. No trusted party." },
];
function Trustless() {
  return (
    <section className="l-section band-dark trust-band">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Trustless by design</span>
          <h2 className="display">Nobody has to take your word for it.</h2>
        </div>
        <div className="ben-grid">
          {TRUST.map((b, i) => {
            const I = Ic[b.ic];
            return (
              <div key={i} className="ben">
                <I className="ben-ic" />
                <h4>{b.t}</h4>
                <p>{b.d}</p>
              </div>
            );
          })}
        </div>
        <div className="trust-logos">
          {["Stellar", "Soroban", "Groth16 · BN254", "DKIM", "zk-email"].map((l) => (
            <span key={l} className="tlogo mono">{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA + footer ─────────────────────────────────────── */
function FinalCTA({ go }: any) {
  return (
    <section className="l-section">
      <div className="wrap">
        <div className="finalcta card">
          <Seal size={72} variant="gold" className="fc-seal" />
          <h2 className="display">Seal your first proof.</h2>
          <p>Bring a DKIM-signed email. Walk away with a shareable, on-chain certificate — and nothing leaked.</p>
          <div className="cta-row" style={{ justifyContent: "center" }}>
            <Btn variant="primary" onClick={() => go("app")} icon={<Ic.zap style={{ width: 15, height: 15 }} />}>Launch app</Btn>
            <button className="btn btn-ghost" onClick={() => go("verify")}>
              <span>See a public proof</span>
              <span className="chip"><Ic.arrow style={{ width: 15, height: 15 }} /></span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ go }: any) {
  const N = NET;
  return (
    <footer className="l-footer">
      <div className="wrap foot-grid">
        <div className="foot-brand">
          <div className="brand-mark">
            <Seal size={30} variant="gold" glyph="S" />
            <span className="word serif">Sorostamp</span>
          </div>
          <p className="foot-tag">Turn any email into an on-chain proof. Reveal nothing.</p>
        </div>
        <div className="foot-cols">
          <div className="foot-col">
            <span className="fc-h">Product</span>
            <a onClick={() => go("app")}>App</a>
            <a onClick={() => go("verify")}>Public proof</a>
            <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }}>How it works</a>
          </div>
          <div className="foot-col">
            <span className="fc-h">On-chain</span>
            <a href={N.explorer + "/contract/" + N.verifier} target="_blank" rel="noopener">Verifier contract ↗</a>
            <a href={N.explorer} target="_blank" rel="noopener">Explorer ↗</a>
          </div>
        </div>
      </div>
      <div className="wrap foot-base">
        <span className="mono">© 2026 Sorostamp · {N.curve}</span>
        <span className="mono faint">Verifier {trunc(N.verifier, 5, 4)}</span>
      </div>
    </footer>
  );
}

export function Landing({ go }: any) {
  return (
    <div className="landing fade-up">
      <Hero go={go} />
      <HowItWorks />
      <Contrast />
      <UseCases go={go} />
      <Trustless />
      <FinalCTA go={go} />
      <Footer go={go} />
    </div>
  );
}
