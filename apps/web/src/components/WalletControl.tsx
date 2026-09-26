"use client";

/* eslint-disable @next/next/no-img-element -- wallet icons are validated data URIs supplied by the wallet */

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_SEPOLIA_CHAIN, type Address } from "@boss-pool/chain";
import { useWallet } from "@/wallet/WalletProvider";
import type { DiscoveredWallet, SwitchableWalletChain } from "@/wallet/types";

type Dialog = "error" | "menu" | null;

const PILL =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-[0.12em] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] disabled:active:scale-100";
const NEUTRAL = "border-white/12 text-[#9da8c3] hover:bg-white/5";
const ACCENT = "border-accent-soft/40 text-accent-soft hover:bg-accent/10";
const LIVE = "border-live/25 text-live-soft hover:bg-live/5";
const WARN = "border-[#f5b04a]/40 text-[#f5b04a] hover:bg-[#f5b04a]/10";

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletControl() {
  const { state, requestConnect, connect, switchToChain, disconnect, clearError } = useWallet();
  const [dialog, setDialog] = useState<Dialog>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // A wallet error is the direct result of the user's last action, so surface it without another click.
  useEffect(() => {
    if (state.status === "error") setDialog("error");
  }, [state.status]);

  const openConnect = useCallback(() => {
    if (state.status === "connecting" || state.status === "discovering" || state.status === "choosing") return;
    void requestConnect();
  }, [requestConnect, state.status]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (dialog === null) return;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, closeDialog]);

  const dismissError = () => {
    clearError();
    closeDialog();
  };

  const retry = () => {
    if (state.status !== "error") return;
    const { selected, account } = state;
    clearError();
    setDialog(null);
    if (selected && account) void switchToChain(baseSepoliaSwitchConfig()).catch(() => undefined);
    else if (selected) void connect(selected.info.uuid);
    else openConnect();
  };

  const onDisconnect = () => {
    disconnect();
    closeDialog();
  };

  return (
    <>
      {state.status === "discovering" && <Pill className={NEUTRAL} disabled dot>WALLET · CHECKING</Pill>}
      {state.status === "unavailable" && (
        <Pill className={NEUTRAL} disabled title="No browser wallet detected on this page">
          WALLET · UNAVAILABLE
        </Pill>
      )}
      {state.status === "disconnected" && (
        <Pill ref={triggerRef} className={ACCENT} onClick={openConnect} aria-haspopup={state.providers.length > 1 ? "dialog" : undefined}>
          CONNECT WALLET
        </Pill>
      )}
      {state.status === "choosing" && <Pill className={NEUTRAL} disabled dot>WALLET · CHOOSE</Pill>}
      {state.status === "connecting" && <Pill className={NEUTRAL} disabled dot>WALLET · WAITING</Pill>}
      {state.status === "connected" && (
        <>
          <Pill ref={triggerRef} className={LIVE} onClick={() => setDialog("menu")} aria-haspopup="dialog" dot live>
            {shortAddress(state.account)}
            <span className="hidden text-live-soft/70 sm:inline">· CHAIN {state.chainId ?? "UNKNOWN"}</span>
          </Pill>
          {state.chainId !== BASE_SEPOLIA_CHAIN.id && (
            <Pill className={WARN} onClick={() => void switchToChain(baseSepoliaSwitchConfig()).catch(() => undefined)}>
              SWITCH TO BASE SEPOLIA
            </Pill>
          )}
        </>
      )}
      {state.status === "error" && (
        <Pill ref={triggerRef} className={WARN} onClick={() => setDialog("error")} aria-haspopup="dialog">
          WALLET · RETRY
        </Pill>
      )}

      {dialog === "error" && state.status === "error" && (
        <Overlay ref={dialogRef} title="Wallet request did not complete" titleId="wallet-error-title" eyebrow="WALLET">
          <p className="mt-2 text-sm leading-relaxed text-muted" role="alert">
            {state.message}
          </p>
          <DialogActions>
            <PrimaryButton onClick={retry}>TRY AGAIN</PrimaryButton>
            <SecondaryButton onClick={dismissError}>CLOSE · ESC</SecondaryButton>
          </DialogActions>
        </Overlay>
      )}

      {dialog === "menu" && state.status === "connected" && (
        <Overlay ref={dialogRef} title={state.selected.info.name} titleId="wallet-menu-title" eyebrow="CONNECTED WALLET">
          <p className="mt-2 break-all font-mono text-[11px] tracking-[0.06em] text-fog">{state.account}</p>
          <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-dim">
            CHAIN · {state.chainId ?? "UNKNOWN"}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            This clears Boss Pool&apos;s local session. It does not revoke wallet permissions.
          </p>
          <DialogActions>
            <PrimaryButton onClick={onDisconnect}>DISCONNECT APP</PrimaryButton>
            <SecondaryButton onClick={closeDialog}>CLOSE · ESC</SecondaryButton>
          </DialogActions>
        </Overlay>
      )}
    </>
  );
}

export function WalletChooserHost() {
  const { state, connect, cancelConnect } = useWallet();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state.status !== "choosing") return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelConnect();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [cancelConnect, state.status]);

  if (state.status !== "choosing") return null;

  return (
    <Overlay ref={dialogRef} title="Choose a wallet" titleId="wallet-chooser-title">
      <ul className="mt-4 flex flex-col gap-2">
        {state.providers.map((wallet) => (
          <li key={wallet.info.uuid}>
            <button
              type="button"
              onClick={() => void connect(wallet.info.uuid)}
              className="flex w-full items-center gap-3 rounded-lg border border-white/12 px-4 py-3 text-left transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.98]"
            >
              <WalletIcon wallet={wallet} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-fog">{wallet.info.name}</span>
                <span className="block truncate font-mono text-[9px] tracking-[0.1em] text-dim">{wallet.info.rdns}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <DialogActions>
        <SecondaryButton onClick={cancelConnect}>CANCEL · ESC</SecondaryButton>
      </DialogActions>
    </Overlay>
  );
}

function baseSepoliaSwitchConfig(): SwitchableWalletChain {
  const chain = BASE_SEPOLIA_CHAIN;
  return {
    id: chain.id,
    name: chain.name,
    rpcUrls: [...chain.rpcUrls.default.http],
    nativeCurrency: chain.nativeCurrency,
    blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
  };
}

function Pill({
  ref,
  className,
  dot,
  live,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>;
  dot?: boolean;
  live?: boolean;
}) {
  return (
    <button ref={ref} type="button" className={`${PILL} ${className ?? ""}`} {...rest}>
      {dot && (
        <span
          aria-hidden="true"
          className={`size-[7px] rounded-full ${live ? "bg-live shadow-[0_0_12px_rgba(79,218,165,0.55)]" : "bg-[#8e9bb9]"}`}
        />
      )}
      {children}
    </button>
  );
}

function WalletIcon({ wallet }: { wallet: DiscoveredWallet }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink">
      {wallet.safeIcon ? (
        <img src={wallet.safeIcon} alt="" className="size-6" style={{ imageRendering: "auto" }} />
      ) : (
        <span aria-hidden="true" className="text-base text-dim">
          ◈
        </span>
      )}
    </span>
  );
}

function Overlay({
  ref,
  title,
  titleId,
  eyebrow,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  title: string;
  titleId: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel-enter max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[380px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
      >
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 id={titleId} className="text-xl font-semibold tracking-[-0.03em]">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2">{children}</div>;
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg bg-accent/20 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-accent-soft transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-accent/30 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
