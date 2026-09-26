import type { AttackQuote, RoundSnapshot } from "@boss-pool/chain";
import { battleProgress } from "../../lib/battleDetails";
import { displayAmount, displayEstimate, roundStatusLabel } from "../../lib/format";
import { PoolFlow } from "./PoolFlow";

export function BattleDetails({ round, quote, priceStatus, cooldownSeconds = 0 }: {
  round: RoundSnapshot;
  quote: AttackQuote | null;
  priceStatus: string;
  cooldownSeconds?: number;
}) {
  const { stages, percent } = battleProgress(round);
  const current = stages[round.currentStage];
  const factory = round.encounterMode === "factory";
  const continuous = round.continuousLiquidity;
  const { symbol, decimals } = round.hpToken;
  const progressDecimals = factory ? 6 : decimals;
  const progressUnit = factory ? "MockUSD" : symbol;
  // Scale before dividing so low-decimal tokens retain a fractional exchange rate.
  const rate = quote && quote.mockUSDSpent > 0n ? quote.bossHPOut * 1_000_000n * 10_000n / quote.mockUSDSpent : null;
  const maxCapacity = round.stageCapacity.reduce((max, amount) => amount > max ? amount : max, 0n);
  const y = (amount: bigint) => 164 - (maxCapacity > 0n ? Number(amount * 120n / maxCapacity) : 0);
  const markerX = 60 + round.currentStage * 190 + current.percent / 100 * 190;

  return (
    <section aria-label={continuous ? "Battle volume progress and cooldowns" : "Battle progress and token release"} className="font-system antialiased">
      <div className="grid gap-5 border-b border-[#2b4a8b]/25 pb-4 sm:grid-cols-[1.6fr_1fr]">
        <div>
          <h3 className="font-pixel text-[11px]">CURRENT EXCHANGE RATE</h3>
          {rate !== null ? <>
            <p className="mt-3 text-sm">1 MockUSD ≈</p>
            <p className="mt-1 break-words text-2xl font-semibold tabular-nums" title={`${displayAmount(rate, decimals + 4)} ${symbol} per MockUSD`}>
              {quote!.bossHPOut > 0n && rate < 10n ** BigInt(decimals) ? "< 0.0001" : displayEstimate(rate, decimals + 4)} <span className="text-base font-normal">{symbol}</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed">Effective rate for the {displayAmount(quote!.maxMockUSD, 6)} MockUSD attack cap, including both pool fees. Actual output varies with pool prices.</p>
          </> : <p role="status" className="mt-3 text-sm leading-relaxed">{priceStatus}</p>}
        </div>
        <div className="sm:border-l sm:border-[#2b4a8b]/25 sm:pl-5">
          <h3 className="font-pixel text-[11px]">CURRENT STAGE</h3>
          <p className="mt-3 text-2xl font-semibold">{round.currentStage + 1} <span className="text-base font-normal">/ 3</span></p>
          <p className="mt-1 text-sm">{roundStatusLabel(round.status)}</p>
          <p className="mt-2 text-xs">{factory ? "Advances with eligible MockUSD volume." : "Advances as sellable HP is purchased."}</p>
          {cooldownSeconds > 0 && <p role="status" className="mt-2 text-sm font-semibold tabular-nums">Next attack in {cooldownSeconds}s</p>}
        </div>
      </div>

      <PoolFlow round={round} quote={quote} />

      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <ProgressBar label={`Stage ${round.currentStage + 1} progress`} percent={current.percent} color="bg-[#57c858]" detail={`${displayEstimate(current.amount, progressDecimals)} / ${displayEstimate(current.target, progressDecimals)} ${progressUnit}${factory ? " eligible volume" : " purchased"}`} />
        <ProgressBar label="Battle progress" percent={percent} color="bg-[#a9d6ff]" detail={`${stages.filter((stage) => stage.cleared).length} of 3 stages cleared`} />
      </div>

      {continuous ? <section className="border-y border-[#2b4a8b]/25 py-3" aria-label="Continuous pool liquidity">
        <h3 className="font-pixel text-[11px]">CONTINUOUS POOL LIQUIDITY</h3>
        <p className="mt-2 text-xs leading-relaxed">The entire sale allocation is active at launch. Each attack counts toward its current stage. Stage changes preserve the AMM price and liquidity.</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums"><dt>Initial sale inventory</dt><dd className="text-right">{displayEstimate(continuous.initialSaleBudget, decimals)} {symbol}</dd><dt>Remaining pool inventory</dt><dd className="text-right">{displayEstimate(round.remainingSellableHP, decimals)} {symbol}</dd></dl>
        <p className="mt-3 text-xs leading-relaxed">Clearing stage one starts a 60-second cooldown; clearing stage two starts a 120-second cooldown. Each attack is bounded to its stage's volume goal, allowing one MockUSD base unit of fee rounding or one indivisible token unit. All actual volume stays in that stage. Liquidity depth and token value change with swaps.</p>
      </section> : <figure className="border-y border-[#2b4a8b]/25 py-3">
        <figcaption>
          <h3 className="font-pixel text-[11px]">TOKEN RELEASE CURVE</h3>
          <p className="mt-2 text-xs leading-relaxed">Each step shows the sale capacity for that stage. Clearing a stage unlocks the next allocation. Tokens reach players through attacks.</p>
        </figcaption>
        <svg viewBox="0 0 660 205" role="img" aria-label="Token sale capacity rises across three stages. Solid steps are unlocked; dashed steps are locked. Exact amounts and release conditions follow below." className="mt-3 block w-full text-[#2b4a8b]">
          <text x="60" y="16" fill="currentColor" fontSize="11">Sale capacity · % of largest stage</text>
          {[0, 50, 100].map((value) => <g key={value}>
            <line x1="60" x2="630" y1={164 - value * 1.2} y2={164 - value * 1.2} stroke="currentColor" strokeOpacity="0.18" />
            <text x="48" y={168 - value * 1.2} textAnchor="end" fill="currentColor" fontSize="11">{value}%</text>
          </g>)}
          {stages.map((stage, index) => {
            const x = 60 + index * 190;
            const top = y(round.stageCapacity[index]);
            return <g key={index}>
              {stage.unlocked && <rect x={x} y={top} width="190" height={164 - top} fill="#a9d6ff" fillOpacity={index === round.currentStage ? "0.5" : "0.22"} />}
              <path d={`M ${x} ${index === 0 ? 164 : y(round.stageCapacity[index - 1])} V ${top} H ${x + 190}`} stroke="currentColor" strokeWidth="3" strokeDasharray={stage.unlocked ? undefined : "6 5"} fill="none" />
              <text x={x + 95} y={top - 10} textAnchor="middle" fill="currentColor" fontSize="11">{new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(displayAmount(round.stageCapacity[index], decimals)))} {symbol}</text>
              <text x={x + 95} y="192" textAnchor="middle" fill="currentColor" fontSize="12">Stage {index + 1}</text>
            </g>;
          })}
          {current.unlocked && <g>
            <line x1={markerX} x2={markerX} y1={y(round.stageCapacity[round.currentStage])} y2="164" stroke="currentColor" strokeDasharray="3 4" />
            <rect x={markerX - 5} y={y(round.stageCapacity[round.currentStage]) - 5} width="10" height="10" fill="#57c858" stroke="currentColor" strokeWidth="2" />
          </g>}
        </svg>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
          <span>━━ Unlocked</span><span>┄┄ Locked</span><span className="flex items-center gap-2"><span aria-hidden className="size-2.5 border border-[#2b4a8b] bg-[#57c858]" />Current progress</span>
        </div>
      </figure>}

      <table className="mt-3 w-full table-fixed text-left text-xs leading-relaxed">
        <caption className="sr-only">{continuous ? "Stage volume goals, cooldowns, and confirmed token purchases" : "Stage sale budgets, release conditions, and confirmed token purchases"}</caption>
        <thead><tr className="border-b border-[#2b4a8b]/25"><th className="w-[24%] py-2 font-normal">Stage</th><th className="w-[43%] px-3 py-2 font-normal">{continuous ? "Volume goal / cooldown" : "Sale capacity / unlock"}</th><th className="py-2 text-right font-normal">Sold to players</th></tr></thead>
        <tbody>{stages.map((stage, index) => <tr key={index} className={`border-b border-[#2b4a8b]/15 ${index === round.currentStage ? "bg-[#a9d6ff]/25" : ""}`}>
          <th scope="row" className="py-3 pl-2 align-top font-normal"><span className="text-xs font-semibold">STAGE {index + 1}</span><span className="mt-1 block">{stage.cleared ? "Cleared" : !stage.unlocked ? continuous ? "Upcoming" : "Locked" : round.status === 4 ? "Expired" : "Current"}</span>{factory && <span className="mt-1 block text-[11px]">{displayEstimate(stage.target, 6)} MockUSD to clear</span>}</th>
          <td className="break-words px-3 py-3 align-top" title={continuous ? `${displayAmount(stage.target, 6)} MockUSD` : `${displayAmount(round.stageCapacity[index], decimals)} ${symbol}`}>{continuous ? <><span className="font-semibold">{displayEstimate(stage.target, 6)} MockUSD</span><span className="mt-1 block">{index === 2 ? "Victory" : `${index === 0 ? 60 : 120}s pause after clearing`}</span></> : <><span className="font-semibold">{displayEstimate(round.stageCapacity[index], decimals)} {symbol}</span><span className="mt-1 block">{index === 0 ? "On battle activation" : `After Stage ${index} clears`}</span></>}</td>
          <td className="break-words py-3 pr-2 text-right align-top" title={`${displayAmount(round.stageSold[index], decimals)} ${symbol}`}>{displayEstimate(round.stageSold[index], decimals)} {symbol}</td>
        </tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed">{factory ? "Stage progress counts eligible MockUSD spent. Unsold tokens can remain when a volume target is reached." : "Stage progress counts authorized HP purchases. A cleared stage may leave a tiny unsellable rounding residue."} {continuous ? "The prize is separate from pool liquidity." : "The prize is separate from these sale budgets."}</p>
    </section>
  );
}

function ProgressBar({ label, percent, color, detail }: { label: string; percent: number; color: string; detail: string }) {
  return <div>
    <div className="flex justify-between gap-3 text-xs"><span>{label}</span><span className="tabular-nums">{percent.toFixed(1)}%</span></div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent.toFixed(1)}%. ${detail}`} className="mt-2 h-3 bg-[#092b61] p-0.5"><div className={`h-full origin-left ${color}`} style={{ transform: `scaleX(${percent / 100})` }} /></div>
    <p className="mt-2 break-words text-[11px] leading-relaxed">{detail}</p>
  </div>;
}
