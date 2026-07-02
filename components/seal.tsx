"use client";
/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — the wax-seal brand motif
   A pressed wax seal: wavy blobby rim, embossed inner ring, "S" monogram.
   States: idle gold seal · "sealed" green verified ring + spark.
   Built from circles + one blobby path (kept geometric).
   ═══════════════════════════════════════════════════════════════════ */

/* wavy wax-blob rim path around a center, r radius, n lobes, amp wobble */
function blobPath(r: number, n = 14, amp = 0.06) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (i % 2 ? amp : -amp));
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    d += ` Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`;
  }
  return d + "Z";
}

/* Seal — size in px. variant: "gold" (default) | "verified".
   stamp: animate a pressing motion. mono: monogram glyph (default S). */
export function Seal({ size = 96, variant = "gold", stamp = false, glyph = "S", className = "" }: any) {
  const verified = variant === "verified";
  const wax = verified ? "var(--valid)" : "var(--accent)";
  const waxDeep = verified
    ? "color-mix(in oklch, var(--valid) 78%, #000 22%)"
    : "var(--accent-2)";
  const emboss = verified
    ? "color-mix(in oklch, var(--valid) 60%, #000 40%)"
    : "color-mix(in oklch, var(--accent-2) 55%, #000 45%)";
  const ink = verified ? "#0b1f16" : "var(--on-accent)";

  return (
    <span className={"seal " + (stamp ? "seal-stamp " : "") + className}
          style={{ width: size, height: size, display: "inline-block" }}>
      <svg viewBox="-60 -60 120 120" width={size} height={size} fill="none">
        <defs>
          <radialGradient id={"sealg-" + variant} cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="color-mix(in oklch, white 30%, transparent)" />
            <stop offset="46%" stopColor="transparent" />
            <stop offset="100%" stopColor="color-mix(in oklch, #000 26%, transparent)" />
          </radialGradient>
        </defs>
        {/* drop / press shadow */}
        <ellipse cx="0" cy="6" rx="50" ry="48" fill="rgba(0,0,0,.16)" className="seal-shadow" />
        {/* wax blob rim */}
        <path d={blobPath(50, 16, 0.05)} fill={waxDeep} />
        <path d={blobPath(47, 16, 0.055)} fill={wax} />
        {/* sheen */}
        <path d={blobPath(47, 16, 0.055)} fill={`url(#sealg-${variant})`} />
        {/* embossed dashed inner ring */}
        <circle cx="0" cy="0" r="38" fill="none" stroke={emboss} strokeWidth="1.4"
                strokeDasharray="2 3.4" opacity=".7" />
        <circle cx="0" cy="0" r="33" fill="none" stroke={emboss} strokeWidth="2" opacity=".5" />
        {/* monogram or check */}
        {verified ? (
          <path d="M-15 1 L-4 12 L17 -12" stroke={ink} strokeWidth="6"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : (
          <text x="0" y="1" textAnchor="middle" dominantBaseline="central"
                fontFamily="var(--serif)" fontSize="46" fontWeight="600" fill={ink}
                style={{ letterSpacing: "-.02em" }}>{glyph}</text>
        )}
      </svg>
      {stamp && (
        <span className="seal-spark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width={size * 0.34} height={size * 0.34}>
            <g stroke={verified ? "var(--valid)" : "var(--accent-2)"} strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="1" x2="12" y2="6" />
              <line x1="21" y1="6" x2="17" y2="9" />
              <line x1="3" y1="6" x2="7" y2="9" />
            </g>
          </svg>
        </span>
      )}
    </span>
  );
}

/* Sealing animation: wax presses, then snaps to verified with a check. */
export function SealingSeal({ size = 120, sealed = false }: any) {
  return (
    <div className={"sealing " + (sealed ? "is-sealed" : "")} style={{ width: size, height: size }}>
      <div className="sealing-layer base"><Seal size={size} variant="gold" /></div>
      <div className="sealing-layer done"><Seal size={size} variant="verified" stamp /></div>
    </div>
  );
}
