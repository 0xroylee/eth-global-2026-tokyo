const CMD_CLASS =
  "min-h-[44px] border-2 border-[#2b4a8b] bg-[#f7f3e3] px-2 py-2 font-mono text-[10px] tracking-[0.14em] text-[#2b4a8b] transition-transform duration-150 ease-[var(--ease-out-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] hover:bg-[#2b4a8b]/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:border-[#8a93a6]/60 disabled:text-[#8a93a6] disabled:opacity-60";

/**
 * COMMAND window: 2×2 battle commands. ATTACK is the only functional one
 * and takes focus on open; RUN closes (equivalent to ESC); MAGIC/ITEM are
 * always disabled with explanatory titles.
 */
export function CommandWindow({
  canAttack,
  onAttack,
  onClose,
}: {
  canAttack: boolean;
  onAttack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="window-chrome w-[min(26vw,260px)] max-md:w-[48vw] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" autoFocus disabled={!canAttack} onClick={onAttack} className={CMD_CLASS}>
          ATTACK
        </button>
        <button type="button" disabled title="Not in the mock build" className={CMD_CLASS}>
          MAGIC
        </button>
        <button type="button" disabled title="Inventory is a later milestone" className={CMD_CLASS}>
          ITEM
        </button>
        <button type="button" onClick={onClose} className={CMD_CLASS}>
          RUN
        </button>
      </div>
    </div>
  );
}
