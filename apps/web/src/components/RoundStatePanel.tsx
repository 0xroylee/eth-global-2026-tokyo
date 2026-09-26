"use client";

import { displayAmount, roundStatusLabel } from "@/lib/format";
import type { DeploymentState } from "@/lib/useBossPool";
import { Metric } from "./Metric";

export function RoundStatePanel({ deployment }: { deployment: DeploymentState }) {
  const live = deployment.kind === "live";

  return (
    <section
      className="rounded-[13px] border border-[#adbce8]/15 bg-panel/80 px-[27px] pb-[23px] pt-[25px] shadow-[0_14px_55px_rgba(0,0,0,0.18)]"
      aria-live="polite"
    >
      <div className="flex flex-col items-start justify-between gap-5 md:flex-row">
        <div>
          <p className="eyebrow mb-2">ON-CHAIN ROUND STATE</p>
          <h2 className="text-[19px] font-medium tracking-[-0.025em]">
            {live
              ? `Connected to ${deployment.network === "local" ? "local contracts" : deployment.network === "base-sepolia" ? "Base Sepolia" : "historical Robinhood testnet"}`
              : deployment.kind === "loading"
                ? "Checking the selected deployment"
                : deployment.kind === "not-deployed"
                  ? `No ${deployment.network === "local" ? "local" : deployment.network === "base-sepolia" ? "Base Sepolia" : "historical Robinhood"} manifest found`
                  : "Deployment unavailable"}
          </h2>
        </div>
        <StatusBadge state={deployment} />
      </div>

      {deployment.kind === "live" ? (
        <LiveRound deployment={deployment} />
      ) : deployment.kind === "error" ? (
        <p className="hairline mt-5 border-t pt-[17px] text-[13px] leading-[1.6] text-danger">{deployment.message}</p>
      ) : (
        <p className="hairline mt-5 border-t pt-[17px] text-[13px] leading-[1.6] text-[#a2abc1]">
          {deployment.kind === "loading"
            ? "Verifying the manifest, recorded deployment transaction, contract code, and immutable wiring."
            : "No deployment manifest is available for this network. Arena values appear only after the configured RPC reads verified contract state."}
        </p>
      )}
    </section>
  );
}

function StatusBadge({ state }: { state: DeploymentState }) {
  const live = state.kind === "live";
  const label =
    state.kind === "loading" ? "CHECKING" : live ? "LIVE" : state.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED";
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-2 font-mono text-[9px] tracking-[0.12em] ${
        live ? "border-live/25 text-live-soft" : "border-[#bec5dc]/15 text-[#9da8c3]"
      }`}
    >
      <span
        className={`size-[7px] rounded-full ${live ? "bg-live shadow-[0_0_12px_rgba(79,218,165,0.55)]" : "bg-[#8e9bb9]"}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function LiveRound({ deployment }: { deployment: Extract<DeploymentState, { kind: "live" }> }) {
  const { manifest, round } = deployment;
  return (
    <>
      <p className="mt-4 font-mono text-[9px] leading-[1.6] tracking-[0.02em] text-[#828da8]">
        RPC verified on chain {manifest.chainId} · deployment block {manifest.deployedAtBlock} · state read at block{" "}
        {round.blockNumber.toString()}
      </p>

      <div className="hairline mt-4 grid grid-cols-1 gap-4 border-y py-[17px] md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/8 md:[&>*]:px-[15px] md:[&>*:first-child]:pl-0">
        <Metric label="ROUND STATUS" value={roundStatusLabel(round.status)} />
        <Metric label="CURRENT STAGE" value={`${round.currentStage + 1} / 3`} />
        <Metric
          label="ORIGINAL PRIZE"
          value={`${displayAmount(round.originalPrize, 6)} mUSD`}
          detail={`Hook MockUSD balance: ${displayAmount(round.mockUSDInHook, 6)} mUSD`}
        />
      </div>

      <div className="mt-5">
        <p className="eyebrow mb-2.5">STAGE HP SOLD</p>
        <div className="hairline grid grid-cols-1 overflow-hidden rounded-[9px] border divide-y divide-white/8 md:grid-cols-3 md:divide-x md:divide-y-0">
          {round.stageSold.map((sold, index) => (
            <div className="flex min-w-0 flex-col gap-[11px] p-3.5" key={index}>
              <span className="font-mono text-[9px] tracking-[0.1em] text-dim">STAGE 0{index + 1}</span>
              <strong className="text-sm font-medium text-[#e7ebf8] [overflow-wrap:anywhere]">
                {displayAmount(sold, 18)}{" "}
                <small className="text-[10px] font-normal text-[#828da8]">
                  / {displayAmount(round.stageCapacity[index], 18)} HP
                </small>
              </strong>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-5 group">
        <summary className="eyebrow cursor-pointer list-none select-none marker:content-none">
          <span className="group-open:hidden">▸ </span>
          <span className="hidden group-open:inline">▾ </span>
          BOSSHP CUSTODY · DEV VIEW
        </summary>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-[18px] md:grid-cols-4 md:gap-y-3">
          <Metric label="TOTAL SUPPLY" value={`${displayAmount(round.bossHPTotalSupply, 18)} HP`} />
          <Metric
            label="POOL MANAGER"
            value={`${displayAmount(round.bossHPInPoolManager, 18)} HP`}
            detail="LP inventory and fees"
          />
          <Metric label="ROUTER RESERVE" value={`${displayAmount(round.bossHPInRouter, 18)} HP`} />
          <Metric
            label="HOOK CUSTODY"
            value={`${displayAmount(round.bossHPInHook, 18)} HP`}
            detail={`${displayAmount(round.redeemedHP, 18)} redeemed`}
          />
        </div>
        <p className="hairline mt-[18px] border-t pt-3 text-xs text-[#a2abc1]">
          BossHook <code className="font-mono text-[11px] text-[#bbc7ff]">{manifest.addresses.hook}</code>
        </p>
      </details>
    </>
  );
}
