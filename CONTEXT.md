# Boss Pool domain language

Boss Pool is a sponsor-funded boss fight. Players spend ammunition to earn a share of the prize through effective damage.

## Language

**Round**:
One funded boss encounter with a deadline, three stages, and a fixed prize.
_Avoid_: Treating a stage as a separate round.

**Stage**:
One form of the boss with its own HP budget. Clearing it starts the next stage at full HP.
_Avoid_: Percentage band, level with a separate prize.

**Ammunition**:
The physical ROY or magic MROY token consumed by an attack. The two kinds have different damage weights.
_Avoid_: Using ROY as the name for both tokens.

**Attack**:
The player's authorized purchase and burn of one selected ammunition kind, with damage applied to the current stage.
_Avoid_: Ordinary swap, standalone token transfer.

**Effective damage**:
The HP actually removed by an attack, capped at the current stage's remaining HP.
_Avoid_: Raw burn amount, trading volume, money spent.

**Contribution**:
A player's accumulated effective damage in the round, which determines their share of the prize.
_Avoid_: Volume score, wallet token balance.

**Prize escrow**:
The maker's funded reward balance reserved for contributors after defeat, or for refund if the boss survives the deadline.
_Avoid_: LP capital, entry proceeds, treasury.

**Entry proceeds**:
Payments collected for enrollment. They are separate from the funded prize and trading liquidity.
_Avoid_: Automatic prize top-up.

**Seed LP**:
The initial trading liquidity supplied to the two ammunition pools.
_Avoid_: Total token supply, prize backing.

**Starter reserve**:
Physical ammunition reserved for the promised allocations to enrolled players.
_Avoid_: Unrestricted treasury inventory.

**Locked treasury**:
The unallocated ammunition held outside trading pools and the starter reserve, unavailable until its release time.
_Avoid_: Available attack liquidity, price support.

**Round timelock**:
A restriction on access to an allocation until a fixed time at or after the round deadline.
_Avoid_: A gradual vesting schedule, a price guarantee.

**Vesting**:
Scheduled release of an allocation over time. It controls availability, not the token's market price.
_Avoid_: Price stabilization.
