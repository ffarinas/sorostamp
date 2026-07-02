#!/bin/bash
# Sorostamp — full Cloudflare deploy: build with the R2 zkey URLs baked in,
# strip the 1.4 GB zkeys OpenNext copies from the public/zk symlinks (assets
# have a 25 MiB/file cap — R2 serves the keys in prod), then deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_ZKEY_URL="https://pub-b1a2060c7eb64827bdd878e8930cc82c.r2.dev/sorostamp_final.zkey"
export NEXT_PUBLIC_BODY_ZKEY_URL="https://pub-b1a2060c7eb64827bdd878e8930cc82c.r2.dev/sorostamp_body_final.zkey"
npm run cf:build
rm -f .open-next/assets/zk/*.zkey
npx wrangler deploy
