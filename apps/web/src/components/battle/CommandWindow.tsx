const CMD_CLASS = "min-h-[44px] border-2 border-[#2b4a8b] bg-[#f7f3e3] px-2 py-2 font-mono text-[10px] tracking-[0.14em] text-[#2b4a8b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] hover:bg-[#2b4a8b]/10 disabled:cursor-not-allowed disabled:opacity-60";

export function CommandWindow({ label, disabled, onAction, onClose }: {
  label: string;
  disabled: boolean;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <div className="window-chrome w-[min(26vw,260px)] max-md:w-[48vw] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={onAction} className={CMD_CLASS}>{label}</button>
        <button type="button" onClick={onClose} className={CMD_CLASS}>RUN</button>
      </div>
    </div>
  );
}
