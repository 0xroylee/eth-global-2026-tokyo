import type { PlayerSnapshot, RoundSnapshot } from "@boss-pool/chain";
import { displayAmount } from "@/lib/format";

export function VictoryCard({ round, player, onClaim, onClose }: {
  round: RoundSnapshot;
  player?: PlayerSnapshot;
  onClaim: () => void;
  onClose: () => void;
}) {
  const reward = player && round.finalEligibleHP > 0n ? round.originalPrize * player.bossHPBalance / round.finalEligibleHP : null;
  return (
    <div className="panel-enter window-chrome w-full font-mono text-[#2b4a8b]">
      <div role="status" className="window-title px-4 py-2.5"><h2 className="text-xl text-white">BOSS DEFEATED</h2></div>
      <div className="space-y-3 p-4 text-[11px] leading-relaxed">
        <p>YOUR REWARD RIGHTS</p>
        <p>{player ? `${displayAmount(player.bossHPBalance, 18)} BossHP held` : "Connect a wallet to see your reward rights."}</p>
        {reward !== null && <p>{displayAmount(reward, 6)} MockUSD for your current holdings</p>}
        <p>BossHP bought or received elsewhere carries the same reward rights. Redeemed tokens are permanently locked.</p>
        <button type="button" onClick={onClaim} className="min-h-[44px] w-full border-2 border-[#2b4a8b] px-4 py-2 focus-visible:outline-2">VIEW REWARDS</button>
        <button type="button" onClick={onClose} className="min-h-[44px] w-full border-2 border-[#2b4a8b]/40 px-4 py-2 focus-visible:outline-2">EXIT BATTLE</button>
      </div>
    </div>
  );
}
