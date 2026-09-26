const ROW =
  "flex w-full flex-1 items-center gap-4 border-0 bg-[#FFF9E9] px-4 text-left text-[#092B61] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8ab4ff] disabled:text-[#6d7c9c]";

/**
 * Vertical command menu. SWAP ATTACK is the only live command.
 * MAGIC and ITEM stay unavailable. RUN leaves the battle.
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
    <div className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full flex-col border-2 border-white bg-[#FFF9E9]">
        <div className="bg-[#092B61] px-4 py-3 text-[22px] leading-none text-white">コマンド？</div>
        <div className="flex flex-1 flex-col divide-y-4 divide-[#092B61]">
          <Command
            kana="やく"
            label="SWAP ATTACK"
            icon="⚔"
            selected={canAttack}
            disabled={!canAttack}
            autoFocus
            onClick={onAttack}
          />
          <Command kana="まほう" label="MAGIC" icon="✦" disabled title="Not in the mock build" />
          <Command kana="アイテム" label="ITEM" icon="▣" disabled title="Inventory is a later milestone" />
          <Command kana="にげる" label="RUN" icon="➜" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

function Command({
  kana,
  label,
  icon,
  selected = false,
  disabled = false,
  autoFocus = false,
  title,
  onClick,
}: {
  kana: string;
  label: string;
  icon: string;
  selected?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`${ROW} ${selected ? "bg-[#DCEEFF]" : ""}`}
    >
      <span aria-hidden className="grid size-14 shrink-0 place-items-center bg-[#092B61] text-[26px] leading-none text-white">
        {icon}
      </span>
      <span className="flex flex-col items-start gap-1">
        <span className="text-[16px] leading-none">{kana}</span>
        <span className="text-[26px] leading-none">{label}</span>
      </span>
    </button>
  );
}
