# Boss Pool domain language

Boss Pool is a sponsor-funded fight where players spend ROY to buy BossHP. Damage counts cumulative authorized purchases, while eligible BossHP represents a share of the prize. Attacks do not burn tokens.

## Language

**Round**:
One funded encounter with a deadline, three stages, and a fixed prize.
_Avoid_: Treating a stage as another round.

**Stage**:
One boss form with an HP budget and a corresponding gated liquidity allocation.
_Avoid_: A purely visual form change with all future liquidity already released.

**ROY**:
The attack currency paid into the Boss pool to acquire BossHP.
_Avoid_: A token burned by the primary attack, physical ammunition.

**BossHP**:
The ERC-20 token received when an authorized purchase deals damage. Eligible player-held BossHP represents reward rights rather than proof of its current holder's historical attacks.
_Avoid_: A plain HP variable, the raw PoolManager token balance.

**Supply pool**:
The MockUSD / ROY market used to acquire the attack currency.
_Avoid_: Prize pool.

**Boss pool**:
The ROY / BossHP market whose stage liquidity is released by the game rules.
_Avoid_: Magic pool, prize escrow.

**Attack**:
An authorized purchase of BossHP that advances stage damage and delivers reward-bearing tokens to the player. The primary entry path first buys ROY with MockUSD.
_Avoid_: Any ordinary swap, standalone ERC-20 burn.

**Effective damage**:
The actual BossHP output of an authorized attack against the current stage.
_Avoid_: ROY spent, trading volume, token balances, burned tokens.

**Stage sold**:
The cumulative BossHP output credited to authorized player attacks within one stage. It excludes transfers, liquidity changes, and controller refills.
_Avoid_: Total token supply, wallet holdings, total swap volume.

**Contribution**:
Historical effective damage recorded by authorized attacks. Reward rights can change holders independently of that history.
_Avoid_: Current token holdings, trading volume, the reward payout denominator.

**Eligible HP**:
BossHP released through authorized player attacks, representing a share of the winning-round prize. Unsold protocol reserve, HP fees, and rounding residue are excluded.
_Avoid_: All minted BossHP, totalSupply, controller refill input.

**Reward share**:
The share of the original prize represented by eligible BossHP, measured against the eligible supply fixed at defeat. In the transferable model, its holder may change without creating more damage.
_Avoid_: Historical attack count, personal ROY spend.

**Stage reserve**:
Prefunded BossHP and any required paired ROY reserved for future stage liquidity, released only when the stage condition is met.
_Avoid_: Freely spendable treasury, assets time-locked until after the fight.

**Locked treasury**:
Unallocated tokens unavailable until at least the round deadline. They are separate from the stage reserve needed during play.
_Avoid_: Stage reserve, active liquidity, price support.

**Prize escrow**:
The maker's funded MockUSD reward reserved for victory claims or the defined expiry refund.
_Avoid_: LP capital, entry proceeds, stage reserve.

**Entry proceeds**:
Payments collected for enrollment, accounted separately from prizes and liquidity.
_Avoid_: Automatic prize top-up.

**HP budget**:
A stage's nominal BossHP sale allocation. Unsellable rounding residue does not earn contribution.
_Avoid_: The singleton's token balance, total BossHP supply.

**Stage release**:
Activation of the next prefunded LP allocation after the previous stage is cleared.
_Avoid_: Merely transferring tokens to PoolManager, unrestricted token minting.

**Refill**:
A game-controlled BossHP-to-ROY exchange funded by stage reserve to restore the lower battle-pool price between stages. It earns no damage or contribution.
_Avoid_: A player sell-back, free HP, a new attack.
