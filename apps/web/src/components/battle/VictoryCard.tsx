import { displayAmount } from "@/lib/format";
import { mockRewardShare } from "@/lib/mockBattle";

/**
 * Victory pixel window: reward rights (transferable) and historical
 * contribution (permanent) are shown separately, per the receipt-driven
 * accounting rule. Cream/navy JRPG chrome (uiux-battle v2 §5.1).
 */
export function VictoryCard({
  eligibleHP,
  finalEligibleHP,
  prize,
  historicalDamage,
}: {
  eligibleHP: bigint;
  finalEligibleHP: bigint;
  prize: bigint;
  historicalDamage: bigint;
}) {
  const shareAmount = mockRewardShare(eligibleHP, finalEligibleHP, prize);
  const sharePercent = finalEligibleHP > 0n ? Number((eligibleHP * 10000n) / finalEligibleHP) / 100 : 0;

  return (
    <div className="panel-enter window-chrome w-full font-mono">
      <div role="status" className="window-title px-4 py-2.5">
        <p className="text-[10px] tracking-[0.15em] text-white/80">REWARD PREVIEW · MOCK</p>
        <h2 className="mt-0.5 text-xl text-white">BOSS DEFEATED</h2>
      </div>

      <div className="space-y-3 p-4">
        <section className="border border-[#2b4a8b]/40 p-3">
          <p className="mb-2 text-[10px] tracking-[0.14em] text-[#2b4a8b]/80">YOUR REWARD RIGHTS</p>
          <p className="text-[11px] leading-relaxed text-[#2b4a8b]">
            {displayAmount(eligibleHP, 18)} HP · {sharePercent}% share
          </p>
          <p className="mt-1 text-[11px] text-[#2b4a8b]">
            ≈ {displayAmount(shareAmount, 6)} MockUSD expected
          </p>
        </section>

        <section className="border border-[#2b4a8b]/40 p-3">
          <p className="mb-2 text-[10px] tracking-[0.14em] text-[#2b4a8b]/80">YOUR CONTRIBUTION</p>
          <p className="text-[11px] text-[#2b4a8b]">{displayAmount(historicalDamage, 18)} HP</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#2b4a8b]/80">
            Reward rights can transfer; contribution history does not.
          </p>
        </section>

        <button
          type="button"
          disabled
          title="Mock build — claiming is the next step"
          className="min-h-[44px] w-full cursor-not-allowed border-2 border-[#8a93a6]/60 px-4 py-3 font-mono text-[11px] tracking-[0.18em] text-[#8a93a6] opacity-60"
        >
          CLAIM REWARD
        </button>
      </div>
    </div>
  );
}
