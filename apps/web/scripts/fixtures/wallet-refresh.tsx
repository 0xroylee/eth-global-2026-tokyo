import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WalletProvider, useWallet } from "../../src/wallet/WalletProvider";

const stats = { prompts: 0, reads: 0 };
const accountA = "0x0000000000000000000000000000000000000001";
const accountB = "0x0000000000000000000000000000000000000002";
const delayed = location.pathname === "/late";
const single = location.pathname === "/single";
let betaAnnounced = !delayed;
const pendingReads: Array<() => void> = [];
if (location.pathname === "/storage-blocked") {
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Fixture storage unavailable"); } });
}
function fixture(name: string, rdns: string, account: string) {
  const handlers = new Map<string, Set<(value: unknown) => void>>();
  const provider = {
    async request({ method }: { method: string }) {
      if (method === "eth_requestAccounts") {
        stats.prompts++;
        sessionStorage.removeItem("fixture-locked");
        window.dispatchEvent(new Event("fixture:stats"));
        return [account];
      }
      if (method === "eth_accounts") {
        stats.reads++;
        window.dispatchEvent(new Event("fixture:stats"));
        if (location.pathname === "/pending" && name === "Beta Wallet") await new Promise<void>(resolve => pendingReads.push(resolve));
        return sessionStorage.getItem("fixture-locked") === name ? [] : [account];
      }
      if (method === "eth_chainId") return "0x14a34";
      throw new Error(`Unexpected request: ${method}`);
    },
    on(event: string, callback: (value: unknown) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(callback);
    },
    removeListener(event: string, callback: (value: unknown) => void) { handlers.get(event)?.delete(callback); },
  };
  return { info: { name, rdns, uuid: crypto.randomUUID(), icon: "" }, provider };
}
const alpha = fixture("Alpha Wallet", "test.alpha", accountA);
const beta = fixture("Beta Wallet", "test.beta", accountB);
const announce = (wallet: typeof alpha) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: wallet }));
window.addEventListener("eip6963:requestProvider", () => {
  if (!single) announce(alpha);
  if (betaAnnounced) announce(beta);
});

function App() {
  const wallet = useWallet();
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw(n => n + 1);
    window.addEventListener("fixture:stats", update);
    return () => window.removeEventListener("fixture:stats", update);
  }, []);
  const state = wallet.state;
  return <main>
    <h1>Wallet refresh verification</h1>
    <p>Fixture wallets only. No real wallet, RPC, or transaction calls.</p>
    <p><a href="/">Two wallets</a> · <a href="/late">Delayed Beta announcement</a> · <a href="/single">Only Beta</a> · <a href="/pending">Pending Beta read</a> · <a href="/storage-blocked">Storage unavailable</a></p>
    <p data-testid="status">Status: {state.status}</p>
    <p data-testid="wallet">Wallet: {"selected" in state ? state.selected?.info.name : "none"}</p>
    <p data-testid="account">Account: {"account" in state ? state.account : "none"}</p>
    <p>Wallet IDs change on every page load.</p>
    <p data-testid="prompts">Authorization prompts this load: {stats.prompts}</p>
    <p>Silent account reads this load: {stats.reads}</p>
    <button onClick={() => void wallet.requestConnect()}>Request connection</button>
    <button onClick={wallet.cancelConnect}>Cancel wallet chooser</button>
    {state.providers.map(detail => <button key={detail.info.uuid} onClick={() => void wallet.connect(detail.info.uuid)}>Connect {detail.info.name}</button>)}
    <button onClick={wallet.disconnect}>Disconnect</button>
    <button onClick={() => pendingReads.splice(0).forEach(resolve => resolve())}>Release pending reads</button>
    <button onClick={() => { betaAnnounced = true; announce(beta); }}>Announce Beta</button>
    <button onClick={() => { sessionStorage.setItem("fixture-locked", "Beta Wallet"); location.reload(); }}>Lock Beta and reload</button>
    <button onClick={() => { sessionStorage.removeItem("fixture-locked"); location.reload(); }}>Unlock fixture and reload</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><WalletProvider><App /></WalletProvider></StrictMode>);
