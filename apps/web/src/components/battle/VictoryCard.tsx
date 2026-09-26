import { displayAmount } from "@/lib/format";
import { mockRewardShare } from "@/lib/mockBattle";

/**
 * Victory card: reward rights (transferable) and historical contribution
 * (permanent) are shown separately, per the receipt-driven accounting rule.
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
    <div className="panel-enter rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
      <div role="status">
        <p className="eyebrow mb-1">REWARD PREVIEW · MOCK</p>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-fog">BOSS DEFEATED</h2>
      </div>

      <div className="mt-4 space-y-3">
        <section className="rounded-xl border border-white/10 bg-ink/60 p-3.5">
          <p className="eyebrow mb-2">YOUR REWARD RIGHTS</p>
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            {displayAmount(eligibleHP, 18)} HP · {sharePercent}% share
          </p>
          <p className="mt-1 font-mono text-[11px] text-accent-soft">
            ≈ {displayAmount(shareAmount, 6)} MockUSD expected
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-ink/60 p-3.5">
          <p className="eyebrow mb-2">YOUR CONTRIBUTION</p>
          <p className="font-mono text-[11px] text-muted">{displayAmount(historicalDamage, 18)} HP</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-dim">
            Reward rights can transfer; contribution history does not.
          </p>
        </section>
      </div>

      <button
        type="button"
        disabled
        title="Mock build — claiming is the next step"
        className="mt-4 min-h-[44px] w-full rounded-xl border border-white/12 px-4 py-3 font-mono text-[11px] tracking-[0.18em] text-dim opacity-60"
      >
        CLAIM REWARD
      </button>
    </div>
  );
}
