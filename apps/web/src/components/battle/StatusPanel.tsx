import { displayAmount, displayEstimate, roundStatusLabel } from "@/lib/format";
import { STAGE_HUES, roundSecondsLeft } from "@/lib/battle";
import type { DeploymentState } from "@/lib/useBossPool";

export function StatusPanel({ deployment, now }: { deployment: DeploymentState; now: number }) {
  const live = deployment.kind === "live" ? deployment : null;
  const round = live?.round;
  const player = live?.player;
  const cap = round?.stageCapacity[round.currentStage] ?? 0n;
  const remaining = round?.remainingSellableHP ?? 0n;
  const hpFraction = cap > 0n ? Math.min(1, Number(remaining * 10_000n / cap) / 10_000) : 0;
  const defeated = round?.status === 3;
  const share = defeated && player && round.finalEligibleHP > 0n
    ? Number(player.bossHPBalance * 10_000n / round.finalEligibleHP) / 100
    : null;
  const seconds = live ? roundSecondsLeft(live.round, live.readAt, now) : null;
  const time = seconds === null ? "—" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const network = deployment.network === "local" ? "LOCAL CHAIN" : deployment.network === "base-sepolia" ? "BASE SEPOLIA" : "HISTORICAL · READ ONLY";

  return (
    <div className="window-chrome flex flex-col gap-2 px-3 py-2.5 font-mono text-[#2b4a8b]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] tracking-[0.08em]">
        <span>BOSS HP</span>
        <span className="break-all tabular-nums" title={round ? `${displayAmount(remaining, 18)} HP remaining` : undefined}>{round ? `≈ ${displayEstimate(remaining, 18)}/${displayEstimate(cap, 18)} (${Math.round(hpFraction * 100)}%)` : "—"}</span>
      </div>
      {round && <div className="bar-track h-3 overflow-hidden" role="progressbar" aria-label="Boss HP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpFraction * 100} aria-valuetext={`${displayAmount(remaining, 18)} of ${displayAmount(cap, 18)} HP remaining`}>
        <div className="h-full w-full origin-left bg-[#57c858] transition-transform duration-300" style={{ transform: `scaleX(${hpFraction})` }} />
      </div>}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 pt-1 text-[10px] tracking-[0.08em]">
        <span>{defeated ? "YOUR SHARE" : "YOUR HP"}</span>
        <span className="break-all tabular-nums" title={player ? `${displayAmount(player.bossHPBalance, 18)} BossHP` : undefined}>{player ? share !== null ? `${share}%` : `≈ ${displayEstimate(player.bossHPBalance, 18)} HP` : "CONNECT WALLET"}</span>
      </div>
      {share !== null && <div className="bar-track h-2.5 overflow-hidden" role="progressbar" aria-label="Your prize share" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, share)}>
        <div className="h-full w-full origin-left bg-[#a9d6ff] transition-transform duration-300" style={{ transform: `scaleX(${Math.min(1, share / 100)})` }} />
      </div>}
      <div className="mt-1 flex flex-col gap-1.5 border-t-2 border-[#2b4a8b]/20 pt-1.5 text-[10px] tracking-[0.1em]">
        <span className="flex flex-wrap items-center justify-between gap-x-2">
          <span>STAGE {round ? round.currentStage + 1 : "—"} / 3</span>
          <span className="flex gap-1" aria-hidden>{STAGE_HUES.map((color, index) => <span key={color} className="size-1.5" style={{ background: round?.currentStage === index ? color : "#2b4a8b33" }} />)}</span>
        </span>
        <span className="flex flex-wrap justify-between gap-x-2"><span>ROUND DEADLINE</span><span className={seconds !== null && seconds < 600 && !defeated ? "text-[#a52a2a]" : ""}>{defeated ? "VICTORY" : time}</span></span>
        <span>{network}</span>
        <span>{round ? roundStatusLabel(round.status) : deployment.kind === "loading" ? "CHECKING DEPLOYMENT" : deployment.kind === "not-deployed" ? "NOT DEPLOYED" : "DATA UNAVAILABLE"}</span>
        {round && <span className="text-[9px]">BLOCK {round.blockNumber.toString()}</span>}
      </div>
    </div>
  );
}
