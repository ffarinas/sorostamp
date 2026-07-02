/* Temporary 1920×1080 slide for the demo video: the hash-completion scheme,
   rendered with the app's own visual language (exact text, no AI-image mangling). */
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const box = (bg: string, border: string) => ({
  display: "flex" as const,
  flexDirection: "column" as const,
  gap: 14,
  background: bg,
  border: `3px solid ${border}`,
  borderRadius: 22,
  padding: "30px 34px",
});

export async function GET(): Promise<Response> {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f7f3ea",
          padding: "70px 90px",
          fontFamily: "sans-serif",
          justifyContent: "space-between",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: "#caa53d", display: "flex", alignItems: "center", justifyContent: "center", color: "#3a2f0e", fontSize: 32, fontWeight: 800 }}>S</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: "#2a2620" }}>The &quot;hash completion&quot; scheme</div>
          </div>
          <div style={{ fontSize: 26, color: "#8a806f", display: "flex" }}>breaking zk-email&apos;s body-size wall</div>
        </div>

        {/* the three-way body split */}
        <div style={{ display: "flex", gap: 26, alignItems: "stretch" }}>
          <div style={{ ...box("#eceae2", "#d8d2c2"), width: 430 }}>
            <div style={{ fontSize: 24, letterSpacing: 4, color: "#8a806f", display: "flex" }}>PREFIX</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#221f1a", display: "flex" }}>100% private</div>
            <div style={{ fontSize: 24, color: "#6b6357", lineHeight: 1.45, display: "flex" }}>collapsed to a SHA-256 midstate (M1), computed in your browser</div>
          </div>
          <div style={{ ...box("#fdf4d7", "#caa53d"), width: 500 }}>
            <div style={{ fontSize: 24, letterSpacing: 4, color: "#95762a", display: "flex" }}>WINDOW · 1536 B</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#221f1a", display: "flex" }}>proven in-circuit</div>
            <div style={{ fontSize: 24, color: "#6b6357", lineHeight: 1.45, display: "flex" }}>M1 → M2 through the facts; masks reveal only what you selected</div>
          </div>
          <div style={{ ...box("#e7f2e9", "#8fc49c"), width: 560 }}>
            <div style={{ fontSize: 24, letterSpacing: 4, color: "#1f7a3d", display: "flex" }}>SUFFIX</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#221f1a", display: "flex" }}>verified on-chain</div>
            <div style={{ fontSize: 24, color: "#6b6357", lineHeight: 1.45, display: "flex" }}>the Soroban contract resumes SHA-256 from M2 and must reach the DKIM-signed bh=</div>
          </div>
        </div>

        {/* soundness line */}
        <div style={{ display: "flex", justifyContent: "center", fontSize: 30, color: "#2a2620", fontWeight: 600 }}>
          Forging any piece = finding a second preimage of SHA-256
        </div>

        {/* numbers */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#221f1a", borderRadius: 22, padding: "34px 44px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#f3ce62", display: "flex" }}>1.77M constraints</div>
            <div style={{ fontSize: 23, color: "#b9b2a4", display: "flex" }}>vs ~40M the naive way — proven in-browser</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#f3ce62", display: "flex" }}>58M / 100M</div>
            <div style={{ fontSize: 23, color: "#b9b2a4", display: "flex" }}>on-chain instruction budget per seal</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#f3ce62", display: "flex" }}>Stellar mainnet</div>
            <div style={{ fontSize: 23, color: "#b9b2a4", display: "flex" }}>2 verifier contracts · fully open source</div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "center", gap: 40, fontSize: 28, color: "#6b6357" }}>
          <span>sorostamp.com</span>
          <span>·</span>
          <span>github.com/ffarinas/sorostamp</span>
        </div>
      </div>
    ),
    { width: 1920, height: 1080 }
  );
}
