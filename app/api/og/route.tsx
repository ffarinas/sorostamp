/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — dynamic Open Graph image for a public proof (/p/[id]).

   Social platforms fetch this to render the link card. It renders the proof
   card itself — the revealed fact + "Verified on Stellar" — so a shared proof
   link looks like a proof, not a broken favicon. Params (?id=&s=&f=) mirror the
   /p/[id] link; the decoded value is a PREVIEW (the /p page does the real
   on-chain verification when opened).
   ═══════════════════════════════════════════════════════════════════ */
import { ImageResponse } from "next/og";
import { NET } from "@/lib/data";

export const runtime = "nodejs";

const W = 1200;
const H = 630;

/* Decode the packed-subject chunks (?s=) into the readable revealed value —
   same scheme as lib/soroban decodeSubject (31 bytes/field, LSB-first). */
function decodeChunks(sParam: string): string {
  const chunks = sParam.split(",").map((x) => x.trim()).filter(Boolean);
  const bytes: number[] = [];
  for (const s of chunks) {
    let v: bigint;
    try {
      v = BigInt(s);
    } catch {
      continue;
    }
    for (let i = 0; i < 31; i++) {
      bytes.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  const raw = Buffer.from(bytes).toString("utf8").replace(/[\s\0]+$/, "");
  const folded = raw.replace(/\?=\s+=\?/g, "?==?");
  return folded
    .replace(/=\?utf-8\?B\?([^?]+)\?=/gi, (_m, b) =>
      Buffer.from(b, "base64").toString("utf8")
    )
    .trim();
}

/* Body proofs (?c=body): ?s= carries 27 signals; decode the three fact spans
   (indices 9.. as 3×6 chunks) into "Amount $3.57 · Merchant … · Ref …". */
function decodeBodyFacts(sParam: string): string {
  const chunks = sParam.split(",").map((x) => x.trim()).filter(Boolean);
  if (chunks.length !== 27) return "";
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const raw = decodeChunks(chunks.slice(9 + i * 6, 9 + (i + 1) * 6).join(","));
    if (!raw || seen.has(raw)) continue; // unused slots repeat span #1
    seen.add(raw);
    // raw span is QP/HTML ("Monto</strong>…$3.57") — strip to readable text
    const text = raw
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/<[^>]*>/g, " ")
      .replace(/<[^>]*$/, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join(" · ");
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("s") || "";
  const field = searchParams.get("f") || "subject";
  const isBody = searchParams.get("c") === "body";
  let fact = "";
  try {
    fact = s ? (isBody ? decodeBodyFacts(s) : decodeChunks(s)) : "";
  } catch {
    fact = "";
  }
  if (fact.length > 90) fact = fact.slice(0, 88) + "…";
  if (!fact) fact = "A fact proven & sealed on Stellar";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f7f3ea",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          justifyContent: "space-between",
        }}
      >
        {/* header: wordmark + privacy */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                background: "#caa53d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#3a2f0e",
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, color: "#2a2620" }}>Sorostamp</div>
          </div>
          <div style={{ fontSize: 22, color: "#6b6357", display: "flex" }}>Email never revealed</div>
        </div>

        {/* the fact */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#8a806f",
              display: "flex",
            }}
          >
            On-chain attestation · {isBody ? "purchase facts from the body" : `revealed ${field}`}
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#221f1a", lineHeight: 1.1, display: "flex" }}>
            {fact}
          </div>
        </div>

        {/* footer: verified badge + network */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "#e7f2e9",
              color: "#1f7a3d",
              borderRadius: 999,
              padding: "14px 28px",
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 999, background: "#1f7a3d", display: "flex" }} />
            Verified on {NET.name}
          </div>
          <div style={{ fontSize: 24, color: "#6b6357", display: "flex" }}>{NET.curve}</div>
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}
