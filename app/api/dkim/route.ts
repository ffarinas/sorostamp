/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — DKIM public-key resolver  (GET /api/dkim)

   Resolves a DKIM TXT record server-side via DNS-over-HTTPS. The browser
   proving client (lib/prove.ts) calls this so DKIM resolution goes through
   our own origin — reliable, no client-side CORS to dns.google, and not
   blocked by ad-blockers or corporate networks the way browser DoH can be.

   PRIVACY: only the DKIM record NAME (e.g. "scph1120._domainkey.acme.com")
   ever reaches this route. The email itself is parsed entirely in the
   browser and never leaves the user's device.

   Wire format mirrors what @zk-email/helpers' resolver expects: an array of
   raw TXT strings, each carrying `…; p=<base64 key>; …`.
   ═══════════════════════════════════════════════════════════════════ */

// DoH + the JSON shape need no Node APIs, but keep this off the edge cache:
// DKIM keys rotate, and a stale record would break proving.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public DoH endpoints (both CORS-enabled, but here we call them server→server).
const GOOGLE = "https://dns.google/resolve";
const CLOUDFLARE = "https://cloudflare-dns.com/dns-query";
const TXT = 16; // DNS RR type for TXT

type DohAnswer = { type: number; data: string };
type DohResponse = { Status: number; Answer?: DohAnswer[] };

/** Query one DoH endpoint for the TXT records at `name`. Returns raw TXT
    strings (double-quotes stripped — some providers wrap the record). */
async function resolveTXT(name: string, endpoint: string): Promise<string[]> {
  const url = new URL(endpoint);
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");
  const resp = await fetch(url, {
    headers: { accept: "application/dns-json" },
    // Never let a hung DoH call wedge the request.
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];
  const out = (await resp.json()) as DohResponse;
  if (out.Status !== 0 || !out.Answer) return [];
  return out.Answer.filter((a) => a.type === TXT).map((a) =>
    a.data.replace(/"/g, "")
  );
}

/** Pull the base64 public key out of a DKIM TXT record (`p=<key>`). */
function extractKey(records: string[]): string | null {
  for (const r of records) {
    const m = /p=([A-Za-z0-9+/=]*)/.exec(r);
    if (m && m[1]) return m[1];
  }
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  // Accept either the full record name or domain+selector.
  let name = searchParams.get("name") ?? "";
  if (!name) {
    const domain = searchParams.get("domain");
    const selector = searchParams.get("selector");
    if (domain && selector) name = `${selector}._domainkey.${domain}`;
  }
  name = name.trim();

  // Validate: a DKIM record name is dot-separated DNS labels — never an email
  // address or anything with an "@". Reject early so the email can't leak here.
  if (!name || name.includes("@") || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return Response.json(
      { ok: false, error: "pass ?name=<selector>._domainkey.<domain> (or ?domain=&selector=)" },
      { status: 400 }
    );
  }

  try {
    // Google first; fall back to Cloudflare if it returns nothing.
    let records = await resolveTXT(name, GOOGLE);
    if (records.length === 0) records = await resolveTXT(name, CLOUDFLARE);

    if (records.length === 0) {
      return Response.json(
        { ok: false, error: `no DKIM TXT record found at ${name}` },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      name,
      records, // raw TXT strings — what the prover's resolver consumes
      publicKey: extractKey(records), // convenience (base64), may be null
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
