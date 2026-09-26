import type { ReactNode } from "react";
import { displayAmount, displayEstimate, roundStatusLabel } from "@/lib/format";
import { roundSecondsLeft } from "@/lib/battle";
import type { DeploymentState } from "@/lib/useBossPool";
import { BattleFrame } from "./BattleFrame";

function Label({ icon, children }: { icon: string; children: ReactNode }) {
  return <span className="flex shrink-0 items-center gap-2 bg-[#092B61] px-2 py-2 text-xs leading-none text-white sm:text-sm lg:px-3 lg:text-[clamp(16px,2.2vh,20px)]"><span aria-hidden>{icon}</span>{children}</span>;
}

export function StatusPanel({ deployment }: { deployment: DeploymentState }) {
  const live = deployment.kind === "live" ? deployment : null;
  const round = live?.round;
  const player = live?.player;
  const factory = round?.encounterMode === "factory";
  const cap = round ? factory ? round.stageVolumeTarget[round.currentStage] : round.stageCapacity[round.currentStage] : 0n;
  const progress = round ? factory ? round.stageVolume[round.currentStage] : cap - round.remainingSellableHP : 0n;
  const remaining = round?.remainingSellableHP ?? 0n;
  const hpFraction = cap > 0n
    ? Math.min(1, Number((factory ? progress : remaining) * 10_000n / cap) / 10_000)
    : 0;
  const defeated = round?.status === 3;
  const eligibleBalance = factory ? player?.rewardCredit ?? 0n : player?.bossHPBalance ?? 0n;
  const share = defeated && player && round.finalEligibleHP > 0n ? Number(eligibleBalance * 10_000n / round.finalEligibleHP) / 100 : null;
  const shownPlayerBalance = defeated && factory ? player?.rewardCredit : player?.bossHPBalance;
  const shownPlayerDecimals = defeated && factory ? round?.rewardToken.decimals ?? 18 : round?.hpToken.decimals ?? 18;
  const shownPlayerSymbol = defeated && factory ? round?.rewardToken.symbol ?? "MEME" : round?.hpToken.symbol ?? "HP";

  return (
    <div className="space-y-2 font-pixel">
      <BattleFrame><div className="flex flex-wrap items-center gap-2 p-2 lg:flex-nowrap lg:gap-3"><Label icon="◆">BOSS POOL</Label><span className="min-w-0 flex-1 text-[10px] leading-relaxed sm:text-xs lg:text-[clamp(16px,2.45vh,22px)] lg:leading-none">UNISWAP V4 HACKATHON DEMO</span></div></BattleFrame>
      <BattleFrame>
        <div className="flex flex-wrap items-center gap-2 p-2 lg:flex-nowrap lg:gap-3">
          <Label icon="⚔">{factory ? "STAGE VOLUME" : "BOSS HP"}</Label>
          <div className="min-w-[120px] flex-1 lg:contents">
            {round && <div className="h-4 overflow-hidden bg-[#092B61] lg:h-8 lg:min-w-0 lg:flex-1" role="progressbar" aria-label={factory ? "Stage volume" : "Boss HP"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpFraction * 100} aria-valuetext={factory ? `${displayAmount(progress, 6)} of ${displayAmount(cap, 6)} MockUSD volume` : `${displayAmount(remaining, round.hpToken.decimals)} of ${displayAmount(cap, round.hpToken.decimals)} ${round.hpToken.symbol} remaining`}>
              <div className="h-full w-full origin-left bg-[#59C84A] transition-transform duration-300" style={{ transform: `scaleX(${hpFraction})` }} />
            </div>}
            <p className="mt-1 break-words text-xs tabular-nums sm:text-sm lg:m-0 lg:shrink-0 lg:text-[clamp(16px,2.65vh,24px)] lg:leading-none" title={round ? factory ? `${displayAmount(progress, 6)} of ${displayAmount(cap, 6)} MockUSD volume` : `${displayAmount(remaining, round.hpToken.decimals)} ${round.hpToken.symbol} remaining` : undefined}>{round ? factory ? `≈ ${displayEstimate(progress, 6)} / ${displayEstimate(cap, 6)} mUSD` : `≈ ${displayEstimate(remaining, round.hpToken.decimals)} / ${displayEstimate(cap, round.hpToken.decimals)} ${round.hpToken.symbol} (${Math.round(hpFraction * 100)}%)` : "—"}</p>
          </div>
        </div>
      </BattleFrame>
      <BattleFrame>
        <div className="flex flex-wrap items-center gap-2 p-2 lg:flex-nowrap lg:gap-3">
          <Label icon="💧">{defeated ? "YOUR SHARE" : factory ? "MEME BOUGHT" : "YOUR HP"}</Label>
          <div className="min-w-[120px] flex-1 lg:contents">
            {share !== null && <div className="h-4 overflow-hidden bg-[#092B61] lg:h-8 lg:min-w-0 lg:flex-1" role="progressbar" aria-label="Your prize share" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, share)}>
              <div className="h-full w-full origin-left bg-[#55B8F2] transition-transform duration-300" style={{ transform: `scaleX(${Math.min(1, share / 100)})` }} />
            </div>}
            <p className="mt-1 break-words text-xs tabular-nums sm:text-sm lg:m-0 lg:shrink-0 lg:text-[clamp(16px,2.65vh,24px)] lg:leading-none" title={player && shownPlayerBalance !== undefined ? `${displayAmount(shownPlayerBalance, shownPlayerDecimals)} ${shownPlayerSymbol}` : undefined}>{player ? share !== null ? `${share}%` : `≈ ${displayEstimate(shownPlayerBalance ?? 0n, shownPlayerDecimals)} ${shownPlayerSymbol}` : "CONNECT WALLET"}</p>
          </div>
        </div>
      </BattleFrame>
    </div>
  );
}

export function BattleMeta({ deployment, now }: { deployment: DeploymentState; now: number }) {
  const live = deployment.kind === "live" ? deployment : null;
  const round = live?.round;
  const seconds = live ? roundSecondsLeft(live.round, live.readAt, now) : null;
  const time = round?.deadline === 0n ? "NO LIMIT" : seconds === null ? "—" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const network = deployment.network === "local" ? "LOCAL CHAIN" : deployment.network === "base-sepolia" ? "BASE SEPOLIA" : "HISTORICAL · READ ONLY";
  const status = round ? roundStatusLabel(round.status) : deployment.kind === "loading" ? "CHECKING" : deployment.kind === "not-deployed" ? "NOT DEPLOYED" : "DATA UNAVAILABLE";
  const hookAddress = deployment.hookAddress;
  return (
    <div className="bg-[#092B61] px-3 py-2 font-pixel text-[10px] leading-relaxed text-white shadow-[3px_3px_0_#041833] sm:text-xs lg:flex lg:gap-2 lg:py-1 lg:text-[16px] lg:leading-none">
      <p>STAGE {round ? round.currentStage + 1 : "—"}/3 · ROUND <span className={seconds !== null && seconds < 600 && round?.status !== 3 ? "text-[#ffb4a8]" : ""}>{round?.status === 3 ? "VICTORY" : time}</span></p>
      <p title={`${status}${round ? ` · BLOCK ${round.blockNumber}` : ""}`}>{network}</p>
      {hookAddress && <p title={hookAddress}>HOOK {hookAddress.slice(0, 6)}…{hookAddress.slice(-4)}</p>}
    </div>
  );
}
