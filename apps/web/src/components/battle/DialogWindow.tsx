import { displayAmount, displayEstimate } from "@/lib/format";
import type { ReactNode } from "react";
import type { AttackQuotePreview } from "../BossActions";

export function DialogWindow({
  title,
  detail,
  preview,
  showAttackQuote,
  walletConnected,
  networkMismatch,
  writeBusy,
  children,
  showMessage = true,
}: {
  title: string;
  detail: string;
  preview: AttackQuotePreview;
  showAttackQuote: boolean;
  walletConnected: boolean;
  networkMismatch: boolean;
  writeBusy: boolean;
  children?: ReactNode;
  showMessage?: boolean;
}) {
  const quote = preview.quote;
  const outputUnit = preview.outputSymbol;
  const status = !walletConnected
    ? "Connect a wallet to attack. The public quote works without one."
    : networkMismatch
      ? "Switch the wallet to the selected network."
      : writeBusy
        ? "Waiting for the wallet action or confirmed receipt."
        : !quote
          ? preview.loading ? "Calculating the public attack quote…" : "Quote unavailable · retrying automatically."
          : !preview.fresh
            ? "Quote expired or changed · refreshing bounds."
            : !preview.playerReady || !preview.allowanceReady
              ? preview.allowanceLoading ? "Checking wallet balance and allowance…" : "Allowance read unavailable · retrying."
              : !preview.hasInputBalance
                ? "At least 1 MockUSD is needed for the maximum input cap."
                : preview.allowanceMissing
                  ? "Approval needed · choose SWAP ATTACK to continue."
                  : "Ready · choose SWAP ATTACK to submit.";

  return (
    <div className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full min-h-[150px] flex-col border-2 border-white bg-[#FFF9E9] px-3 py-2 text-[#092B61] sm:px-4">
        {showMessage && <div aria-live="polite" className="min-w-0 shrink-0">
          <div className="window-title mb-1 inline-block px-2 py-1 text-[9px]">BATTLE MESSAGE</div>
          <p className="break-words text-xs leading-snug sm:text-sm">{title}</p>
          <p className="mt-0.5 break-words font-mono text-[10px] leading-snug sm:text-xs">{detail}</p>
        </div>}

        {showAttackQuote && <section aria-label="Attack quote preview" className="mt-2 min-w-0 shrink-0 border-t border-[#2b4a8b]/30 pt-1.5 font-mono">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-pixel text-[9px]">AUTO QUOTE · 1 MockUSD MAX</h2>
            <span className={`shrink-0 text-[9px] ${quote && preview.fresh ? "text-[#286f43]" : "text-[#8c443e]"}`}>
              {quote && preview.fresh ? "FRESH" : preview.loading ? "REFRESHING" : "WAITING"}
            </span>
          </div>
          {quote ? (
            <>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <Metric label="EXPECTED DAMAGE" value={`≈ ${displayEstimate(quote.bossHPOut, preview.outputDecimals)} ${outputUnit}`} title={`${displayAmount(quote.bossHPOut, preview.outputDecimals)} ${outputUnit}`} />
                <Metric label="MAX SPEND" value={`${displayAmount(quote.maxMockUSD, 6)} MockUSD`} title={`${displayAmount(quote.maxMockUSD, 6)} MockUSD`} />
                <Metric label={`MIN. ${outputUnit.toUpperCase()} OUTPUT`} value={`≥ ${displayFloor(quote.minBossHPOut, preview.outputDecimals)} ${outputUnit}`} title={`${displayAmount(quote.minBossHPOut, preview.outputDecimals)} ${outputUnit}`} />
              </div>
              <p className="mt-1 break-words text-[9px] leading-snug sm:text-[10px]">
                Est. spend {displayEstimate(quote.mockUSDSpent, 6)} · refund {displayEstimate(quote.mockUSDRefunded, 6)} MockUSD · fees {formatFee(quote.supplyPoolFee)} / {formatFee(quote.bossPoolFee)}
              </p>
            </>
          ) : (
            <p className="mt-1 font-mono text-[10px] leading-snug">Expected damage and spend appear here as soon as the public read is available.</p>
          )}
          {!quote && preview.error && <p className="mt-1 truncate font-mono text-[9px] leading-snug text-[#8c443e]" role="status" title={preview.error}>Quote error: {preview.error.length > 100 ? `${preview.error.slice(0, 97)}…` : preview.error}</p>}
          <p className="mt-1 break-words font-mono text-[9px] leading-snug" role="status">{status}</p>
        </section>}
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate text-[8px] tracking-[0.04em] text-[#526c9a]">{label}</p>
      <p className="break-words text-[10px] leading-snug sm:text-xs">{value}</p>
    </div>
  );
}

function displayFloor(value: bigint, decimals: number): string {
  const places = Math.min(decimals, 4);
  const factor = 10n ** BigInt(decimals - places);
  return displayAmount(value / factor, places);
}

function formatFee(fee: number): string {
  return `${(fee / 10_000).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
