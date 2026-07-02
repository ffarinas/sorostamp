import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — OpenNext (Cloudflare) config

   Defaults are right for this app:
     - SSR for /p/[id] + the /api routes run on the Worker (nodejs_compat).
     - The heavy proving (snarkjs + 750 MB zkey) runs in the BROWSER, not the
       Worker, so we don't need any special Worker memory/cache wiring for it.
     - The zkey is too big for Worker static assets (25 MiB/file limit) — it's
       served from R2 via NEXT_PUBLIC_ZKEY_URL (see wrangler.jsonc + README).

   No incremental-cache override: the only dynamic route reads live on-chain
   state every request (force-dynamic), so there's nothing to cache.
   ═══════════════════════════════════════════════════════════════════ */
export default defineCloudflareConfig();
