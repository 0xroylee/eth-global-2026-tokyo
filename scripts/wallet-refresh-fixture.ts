import { resolve } from "node:path";

// Run from the repo root: bun scripts/wallet-refresh-fixture.ts
// This page mounts the real provider with simulated wallets; it never signs or broadcasts.
// Select Beta, reload, and expect Beta with zero prompts despite new provider UUIDs.
// The links exercise late discovery, a sole wallet after Disconnect, pending reads,
// and blocked storage. During a pending read, open the chooser or Disconnect,
// then release the read and check that the user's action still controls the state.
const root = process.cwd();
Bun.serve({
  hostname: "127.0.0.1",
  port: 3039,
  async fetch(request) {
    if (new URL(request.url).pathname === "/bundle.js") {
      const built = await Bun.build({
        entrypoints: [resolve(root, "apps/web/scripts/fixtures/wallet-refresh.tsx")],
        target: "browser",
        define: { "process.env.NODE_ENV": JSON.stringify("development") },
      });
      if (!built.success) return new Response(built.logs.map(String).join("\n"), { status: 500 });
      return new Response(built.outputs[0], { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
    }
    return new Response('<!doctype html><html><head><title>Wallet refresh verification</title><style>body{font:16px system-ui;padding:32px}button{margin:8px;padding:10px}main{max-width:900px}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>', {
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
    });
  },
});
console.log("Wallet refresh fixture: http://127.0.0.1:3039");
