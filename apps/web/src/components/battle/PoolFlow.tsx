import type { AttackQuote, RoundSnapshot } from "@boss-pool/chain";
import { displayEstimate } from "../../lib/format";

export function PoolFlow({ round, quote }: { round: RoundSnapshot; quote: AttackQuote | null }) {
  const { symbol, decimals } = round.hpToken;
  const factory = round.encounterMode === "factory";

  return (
    <figure className="border-b border-[#2b4a8b]/25 py-4">
      <figcaption>
        <h3 className="font-pixel text-[11px]">HOW THE TWO POOLS CONNECT</h3>
        <p className="mt-2 text-xs leading-relaxed">One attack, two swaps. Attack Token connects the shared supply market to this boss.</p>
      </figcaption>

      <div role="group" aria-label={`Attack route: your MockUSD enters the supply pool, which buys Attack Token. The boss pool takes that Attack Token and sends ${symbol} to your wallet.`} className="mt-5 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] sm:gap-0">
        <div className="flex min-w-0 flex-col items-center gap-2">
          <div className="w-full text-center">
            <p className="text-[10px] font-semibold tracking-wider">FROM YOUR WALLET</p>
            <p className="mt-1 break-words text-sm font-semibold tabular-nums">{quote ? `≈ ${displayEstimate(quote.mockUSDSpent, 6)} MockUSD` : "MockUSD"}</p>
          </div>
          <FlowArrow />
          <PoolBasin name="1 · SUPPLY POOL" tokenIn="MockUSD" tokenOut="Attack Token" fee={round.supplyPoolFee} />
        </div>

        <div aria-hidden="true" className="flex flex-col items-center justify-center gap-2 py-2 text-center sm:h-[196px] sm:py-0">
          <p className="text-[11px] font-semibold leading-tight">Attack<br />Token</p>
          <FlowArrow className="sm:-rotate-90" />
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-col-reverse">
          <PoolBasin name="2 · BOSS POOL" tokenIn="Attack Token" tokenOut={symbol} fee={round.bossPoolFee} />
          <FlowArrow className="sm:rotate-180" />
          <div className="w-full text-center">
            <p className="text-[10px] font-semibold tracking-wider">TO YOUR WALLET</p>
            <p className="mt-1 break-words text-sm font-semibold tabular-nums">{quote ? `≈ ${displayEstimate(quote.bossHPOut, decimals)} ${symbol}` : symbol}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 border-b border-dashed border-[#2b4a8b]/35 pb-3 text-[11px] leading-relaxed">
        <span aria-hidden="true" className="text-lg leading-none">↩</span>
        <p>{quote
          ? `Estimated return to your wallet: ${displayEstimate(quote.mockUSDRefunded, 6)} MockUSD + ${displayEstimate(quote.royRefunded, 18)} unused Attack Token.`
          : "Unused MockUSD and Attack Token return to your wallet."}</p>
      </div>

      {quote && <div className="mt-3 grid gap-4 text-[11px] sm:grid-cols-2">
        <div>
          <p className="font-semibold">Supply pool estimate</p>
          <p className="mt-1 break-words tabular-nums">{displayEstimate(quote.mockUSDSpent, 6)} MockUSD → {displayEstimate(quote.royBought, 18)} Attack Token bought</p>
        </div>
        <div>
          <p className="font-semibold">Boss pool estimate</p>
          <p className="mt-1 break-words tabular-nums">{displayEstimate(quote.roySpent, 18)} Attack Token spent → {displayEstimate(quote.bossHPOut, decimals)} {symbol} received</p>
        </div>
      </div>}
      <p className="mt-3 text-[11px] leading-relaxed">{factory ? "Confirmed attacks advance raid progress with eligible MockUSD volume." : `Confirmed ${symbol} purchases deal damage.`} Both pool prices and fees determine your output. Purchased tokens stay in your wallet.</p>
    </figure>
  );
}

function PoolBasin({ name, tokenIn, tokenOut, fee }: { name: string; tokenIn: string; tokenOut: string; fee: number }) {
  return (
    <div className="relative flex h-[196px] w-full min-w-0 flex-col items-center px-4 pb-5 pt-[62px]">
      <svg aria-hidden="true" viewBox="0 0 300 196" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full fill-none stroke-[#2b4a8b] stroke-2">
        <path d="M2 28V163C2 203 298 203 298 163V28" fill="#DCEEFF" vectorEffect="non-scaling-stroke" />
        <path d="M3 141C72 165 228 165 297 141M3 154C72 178 228 178 297 154" strokeOpacity="0.15" vectorEffect="non-scaling-stroke" />
        <ellipse cx="150" cy="28" rx="148" ry="26" fill="#A9D6FF" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="absolute inset-x-3 top-[19px] text-center font-pixel text-[10px] leading-tight">{name}</p>
      <div className="relative grid w-full grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-start gap-1 text-center">
        <div className="min-w-0">
          <span aria-hidden="true" className="mx-auto grid size-8 place-items-center rounded-full border-2 border-[#2b4a8b] bg-[#fff9e9] text-sm font-semibold">{tokenIn === "MockUSD" ? "$" : "A"}</span>
          <p className="mt-2 truncate text-xs font-semibold">{tokenIn}</p>
        </div>
        <span aria-hidden="true" className="pt-1 text-xl">→</span>
        <div className="min-w-0">
          <span aria-hidden="true" className="mx-auto grid size-8 place-items-center rounded-full border-2 border-[#2b4a8b] bg-[#f6ca67] text-sm font-semibold">{tokenOut === "Attack Token" ? "A" : "◆"}</span>
          <p className="mt-2 truncate text-xs font-semibold">{tokenOut}</p>
        </div>
      </div>
      <p className="relative mt-auto text-[11px]">{fee / 10_000}% pool fee</p>
    </div>
  );
}

function FlowArrow({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 32" className={`h-8 w-6 shrink-0 fill-none stroke-current stroke-[2.5] ${className}`}><path d="M12 1V28M4 20L12 28L20 20" /></svg>;
}
