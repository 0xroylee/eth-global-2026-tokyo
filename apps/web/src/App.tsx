import { useEffect, useState } from "react";
import {
  createLocalPublicClient,
  fetchLocalDeployment,
  formatUnits,
  readLocalRound,
  verifyLocalDeployment,
  type LocalDeploymentManifest,
  type LocalRoundSnapshot,
} from "@boss-pool/chain";

type DeploymentState =
  | { kind: "loading" }
  | { kind: "live"; manifest: LocalDeploymentManifest; round: LocalRoundSnapshot }
  | { kind: "not-deployed" }
  | { kind: "error"; message: string };

const roundStatuses = ["Setup", "Active", "Stage cleared", "Defeated", "Expired"];

export function App() {
  const [deployment, setDeployment] = useState<DeploymentState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const manifest = await fetchLocalDeployment();
        const client = createLocalPublicClient(manifest);
        await verifyLocalDeployment(manifest, client);
        const round = await readLocalRound(manifest);
        if (active) setDeployment({ kind: "live", manifest, round });
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "LOCAL_DEPLOYMENT_MISSING") {
          setDeployment({ kind: "not-deployed" });
        } else {
          setDeployment({ kind: "error", message: error instanceof Error ? error.message : "Could not read local contract state." });
        }
      }
    };
    void load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const live = deployment.kind === "live";
  const statusText = live ? roundStatuses[deployment.round.status] ?? `Status ${deployment.round.status}` : "";

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Boss Pool local arena home">
          <span className="brand-mark">BP</span>
          <span>BOSS POOL</span>
        </a>
        <span className="network-pill"><span className="pulse" /> LOCAL ARENA</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">UNISWAP V4 · LOCAL PROTOTYPE</p>
          <h1>One pool.<br /><span>Three stages.</span></h1>
          <p className="intro">Every hit buys real BossHP. The hook counts purchased HP as damage; tokens stay in player wallets.</p>
        </div>
        <div className="boss-preview" aria-hidden="true">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />
          <div className="boss-core"><span>?</span></div>
          <div className="boss-caption">ARENA // 001</div>
        </div>
      </section>

      <section className="state-panel" aria-live="polite">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ON-CHAIN ROUND STATE</p>
            <h2>{live ? "Connected to local contracts" : "Waiting for local deployment"}</h2>
          </div>
          <span className={`status-badge ${live ? "is-live" : "is-idle"}`}>
            <span className="status-dot" />
            {deployment.kind === "loading" ? "CHECKING" : live ? "LIVE" : deployment.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED"}
          </span>
        </div>

        {live ? (
          <>
            <p className="deployment-note">RPC verified on chain {deployment.manifest.chainId} · deployment block {deployment.manifest.deployedAtBlock} · state read at block {deployment.round.blockNumber.toString()}</p>
            <div className="round-metrics">
              <Metric label="ROUND STATUS" value={statusText} />
              <Metric label="CURRENT STAGE" value={`${deployment.round.currentStage + 1} / 3`} />
              <Metric
                label="ORIGINAL PRIZE"
                value={`${displayAmount(deployment.round.originalPrize, 6)} mUSD`}
                detail={`Hook MockUSD balance: ${displayAmount(deployment.round.mockUSDInHook, 6)} mUSD, including entry proceeds`}
              />
            </div>

            <div className="data-section">
              <p className="eyebrow">STAGE HP SOLD</p>
              <div className="stage-grid">
                {deployment.round.stageSold.map((sold, index) => (
                  <div className="stage-cell" key={index}>
                    <span className="stage-index">STAGE 0{index + 1}</span>
                    <strong>{displayAmount(sold, 18)} <small>/ {displayAmount(deployment.round.stageCapacity[index], 18)} HP</small></strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="data-section">
              <p className="eyebrow">BOSSHP BALANCES · READ FROM ERC-20</p>
              <div className="balance-grid">
                <Metric label="TOTAL SUPPLY" value={`${displayAmount(deployment.round.bossHPTotalSupply, 18)} HP`} />
                <Metric label="POOL MANAGER" value={`${displayAmount(deployment.round.bossHPInPoolManager, 18)} HP`} detail="LP inventory and fees" />
                <Metric label="ROUTER RESERVE" value={`${displayAmount(deployment.round.bossHPInRouter, 18)} HP`} />
                <Metric label="HOOK CUSTODY" value={`${displayAmount(deployment.round.bossHPInHook, 18)} HP`} detail={`${displayAmount(deployment.round.redeemedHP, 18)} redeemed`} />
              </div>
            </div>
            <p className="address-line">BossHook <code>{deployment.manifest.addresses.hook}</code></p>
          </>
        ) : deployment.kind === "error" ? (
          <p className="state-message error-message">{deployment.message}</p>
        ) : (
          <p className="state-message">No deployment manifest is available. Run the local seed command after starting Anvil; arena values will appear only after it reads real contract state.</p>
        )}
      </section>

      <footer className="footer"><span>NO MOCK DAMAGE · NO BURN · LOCAL CHAIN ONLY</span><span>ROUND STATE REFRESHES EVERY 5 SECONDS</span></footer>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {detail && <span className="metric-detail">{detail}</span>}
    </div>
  );
}

function displayAmount(value: bigint, decimals: number) {
  return formatUnits(value, decimals).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
