import type { NextConfig } from "next";

/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — Next config

   The proving client (lib/prove.ts) runs @zk-email/helpers + snarkjs in
   the BROWSER so the email never leaves the device. Those libs `require()`
   Node builtins (crypto, stream, timers, …). Turbopack can't polyfill Node
   builtins for the browser (experimental.fallbackNodePolyfills is
   unsupported there), so we build with webpack (`next … --webpack`) and
   wire the browser shims via resolve.fallback + ProvidePlugin below.
   ═══════════════════════════════════════════════════════════════════ */
const nextConfig: NextConfig = {
  // OpenNext (Cloudflare) consumes the standalone server output. Required so
  // `next build --webpack` emits .next/standalone for `opennextjs-cloudflare
  // build --skipNextBuild` to bundle into the Worker.
  output: "standalone",
  webpack(config, { isServer, webpack }) {
    // Polyfills are only needed for the browser bundle — the server has real
    // Node. (Touching the server config would shadow Node's own builtins.)
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        // @zk-email/helpers + mailauth + libmime/libbase64 (browser path) use:
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        timers: require.resolve("timers-browserify"),
        path: require.resolve("path-browserify"),
        url: require.resolve("url"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser"),
        assert: require.resolve("assert"),
        util: require.resolve("util"),
        punycode: require.resolve("punycode"),
        os: require.resolve("os-browserify/browser"),
        // Node-only paths the browser never reaches (DoH replaces dns, no
        // filesystem/process spawning client-side, no test runner in prod):
        fs: false,
        dns: false,
        net: false,
        tls: false,
        child_process: false,
        test: false,
      };
      config.plugins = config.plugins || [];
      // libmime/libbase64 import with the `node:` scheme (e.g. `node:buffer`),
      // which resolve.fallback keys don't match. Strip the prefix so they fall
      // through to the browser shims above.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      // Make Buffer + process available as globals to the polyfilled modules.
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        })
      );
    }
    return config;
  },
};

export default nextConfig;
