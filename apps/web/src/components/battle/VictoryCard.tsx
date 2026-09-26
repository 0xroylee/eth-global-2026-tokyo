import type { PlayerSnapshot, RoundSnapshot } from "@boss-pool/chain";
import { displayAmount } from "@/lib/format";
import { BattleFrame } from "./BattleFrame";

export function VictoryCard({ round, player, onClaim, onClose }: {
  round: RoundSnapshot;
  player?: PlayerSnapshot;
  onClaim: () => void;
  onClose: () => void;
}) {
  const reward = player && round.finalEligibleHP > 0n ? round.originalPrize * player.bossHPBalance / round.finalEligibleHP : null;
  return (
    <BattleFrame className="panel-enter w-full font-pixel">
      <div role="status" className="bg-[#092B61] px-4 py-3 text-white"><h2 className="text-lg sm:text-xl">BOSS DEFEATED</h2></div>
      <div className="space-y-3 p-4 text-xs leading-relaxed sm:text-sm">
        <p>YOUR REWARD RIGHTS</p>
        <p className="break-words">{player ? `${displayAmount(player.bossHPBalance, 18)} BossHP held` : "Connect a wallet to see your reward rights."}</p>
        {reward !== null && <p className="break-words">{displayAmount(reward, 6)} MockUSD for your current holdings</p>}
        <p>BossHP bought or received elsewhere carries the same reward rights. Redeemed tokens are permanently locked.</p>
        <button type="button" onClick={onClaim} className="min-h-11 w-full border-2 border-[#092B61] px-4 py-2 focus-visible:outline-2">VIEW REWARDS</button>
        <button type="button" onClick={onClose} className="min-h-11 w-full border-2 border-[#092B61]/40 px-4 py-2 focus-visible:outline-2">ESC · EXIT</button>
      </div>
    </BattleFrame>
  );
}
