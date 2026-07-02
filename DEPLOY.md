# Sorostamp — Cloudflare deployment

The frontend deploys to **Cloudflare Workers** via the **OpenNext** adapter.
The config is in the repo (`open-next.config.ts`, `wrangler.jsonc`, and the
`cf:build` / `preview` / `deploy` scripts). The browser does the heavy proving,
so the Worker only runs SSR + the `/api/*` routes.

## What's automated vs. what needs your Cloudflare account

| Step | Status |
| --- | --- |
| Webpack browser bundle (zk-email + snarkjs) | ✅ builds (`npm run build`) |
| OpenNext Worker bundle | ✅ builds (`npm run cf:build`) |
| Local Worker run | ✅ `npm run preview` (wrangler dev, no login needed) |
| R2 bucket + upload the 750 MB zkey | ⛔ needs your CF account |
| Sponsor secret as a Worker secret | ⛔ needs your CF account |
| `wrangler deploy` + `sorostamp.com` DNS | ⛔ needs your CF account |

## One-time setup (your account)

```bash
# 0. Authenticate wrangler against your Cloudflare account
npx wrangler login

# 1. R2 for the proving key (too big for Worker static assets, 25 MiB/file limit)
npx wrangler r2 bucket create sorostamp-zk
npx wrangler r2 object put sorostamp-zk/sorostamp_final.zkey \
  --file ../lacre/circuits/sorostamp_final.zkey
# Enable public access for the bucket (dashboard → R2 → Settings → Public r2.dev,
# or attach a custom domain like zk.sorostamp.com). You'll get a public host.

# 2. The sponsor secret (the fee-paying account; NEVER commit it)
npx wrangler secret put SOROSTAMP_SPONSOR_SECRET
# paste the S... secret when prompted (same value as .env.local)
```

## Deploy

The browser fetches the zkey from R2, so set its public URL at **build time**:

```bash
NEXT_PUBLIC_ZKEY_URL="https://<your-r2-public-host>/sorostamp_final.zkey" \
  npm run deploy
```

`NEXT_PUBLIC_ZKEY_URL` is baked into the client bundle (it's a `NEXT_PUBLIC_`
var). If you omit it the client falls back to `/zk/sorostamp_final.zkey`, which
won't exist on the deploy → proving fails. So it's required for prod.

## Custom domain

Add `sorostamp.com` as a **Custom Domain** on the Worker (Cloudflare dashboard →
Workers → sorostamp → Settings → Domains & Routes). Cloudflare manages the DNS
record + TLS automatically. (The namecheap default records you removed earlier
are no longer relevant once the domain's nameservers point at Cloudflare.)

## Local preview (no login)

```bash
npm run preview      # builds + runs the Worker locally via wrangler dev
```

For local preview the zkey/sample aren't in R2 — drop your own `.eml`, and if you
want the in-browser proof to run locally, set `NEXT_PUBLIC_ZKEY_URL` to a reachable
URL or restore the dev symlink under `public/zk/` (see below).

## Notes

- **Dev symlink:** `public/zk/sorostamp_final.zkey` is a git-ignored symlink to
  `../lacre/circuits/sorostamp_final.zkey` for `npm run dev`. It's intentionally
  excluded from the Cloudflare build (R2 serves it in prod).
- **Sample email:** `public/sample-email.eml` is git-ignored (it's a personal
  receipt) and excluded from the deploy. The deployed "Use sample" button will
  fail gracefully; drop your own `.eml` instead.
- **Worker runtime:** `nodejs_compat` is on (the Worker bundles
  `@stellar/stellar-sdk` for `/api/seal` + the on-chain read in `/p/[id]`).
- **`/p/[id]` on-chain read:** the page reads the attestation on the server, but
  also has a **client-side fallback** (`lib/soroban-client.ts`): if the server
  read returns empty, the browser reads on-chain itself (the Soroban RPC is
  CORS-enabled). This matters because **local `wrangler dev` (workerd) can't
  reach `soroban-testnet.stellar.org`** ("internal error" — a local-proxy TLS
  quirk; `dns.google` works fine, so general fetch is OK). The SSR HTML shows
  "Reading the proof on-chain…" and the browser fills in the verified card.
  The deployed Cloudflare edge usually does reach the RPC server-side — verify
  `/p/<a real sealed id>` on the live deploy; either way the page resolves.

## Verified locally (what's known-good)

- `npm run build` (webpack browser bundle) — passes.
- `npm run cf:build` (OpenNext Worker) — passes; `worker.js` emitted.
- `npm run preview` (workerd): `/`, `/app`, `/api/dkim` (resolves real key),
  `/api/seal` (→ already_sealed for the demo proof), `/zk/*.wasm` asset — all OK.
  `/p/[id]` shows the reading state (client fallback handles the read).
- `npm run dev` (node): full flow incl. `/p/[id]` rendering the verified card
  with the clean decoded subject + on-chain statement-hash match.
- The proving pipeline (`lib/prove.ts`) reproduces the exact on-chain nullifier
  in a Node harness (`176649697cc8…`).
