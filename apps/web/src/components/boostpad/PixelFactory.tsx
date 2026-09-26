"use client";

/* eslint-disable @next/next/no-img-element -- reuse the existing boss art */

import { formatUnits } from "@boss-pool/chain";
import type { ReactNode } from "react";
import { WalletControl } from "../WalletControl";
import { BattleFrame } from "../battle/BattleFrame";
import type { BoostPadForm } from "./useBoostPadForm";

const INPUT = "mt-2 w-full border-2 border-[#092B61] bg-white px-3 py-2 font-pixel text-[16px] leading-normal text-[#092B61] placeholder:text-[#6d7c9c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#092B61] disabled:opacity-50";
const BUTTON = "bg-[#092B61] px-3 py-2 text-[16px] leading-snug text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#092B61] disabled:cursor-not-allowed disabled:opacity-40";
const PORTRAITS = ["/images/boss-cat-form-a.png?v=6", "/images/boss-cat-form-b.png?v=6", "/images/boss-cat-form-c.png?v=8"];

export function PixelFactory({ pad }: { pad: BoostPadForm }) {
  const locked = Boolean(pad.busy || pad.factoryLocked);
  const token = pad.matchingTokenInfo;
  const amount = (value: bigint) => `${formatUnits(value, token?.decimals ?? 18)} ${token?.symbol ?? "tokens"}`;
  const pending = pad.factoryOperation.active;

  return (
    <section className="space-y-4 py-5 font-pixel text-[16px] leading-snug text-[#092B61] [-webkit-font-smoothing:none]">
      <header className="flex items-start justify-between gap-3">
        <BattleFrame tone="navy"><h1 className="px-4 py-3 text-[18px]">BLACKSMITH</h1></BattleFrame>
        <button type="button" onClick={pad.closeForm} className={`${BUTTON} shadow-[3px_3px_0_#041833]`}>ESC · WALK</button>
      </header>
      <BattleFrame><p className="px-4 py-3 text-[18px]">Bring me a token, and I&apos;ll forge the boss.</p></BattleFrame>

      {pad.result ? (
        <BattleFrame>
          <div role="status" className="space-y-3 break-words px-4 py-4">
            <h2>BOSS LAUNCHED</h2>
            <p>Your boss was created successfully.</p>
            <dl className="space-y-3 text-[14px]">
              <Detail label="Boss ID" value={pad.result.bossId} />
              <Detail label="Token" value={pad.result.token} />
              <Detail label="Hook" value={pad.result.hook} />
              <Detail label="Router" value={pad.result.router} />
            </dl>
            <TransactionLink hash={pad.result.hash} />
            <button type="button" onClick={pad.startAnother} disabled={pad.factoryLocked} className={`${BUTTON} block`}>CREATE ANOTHER BOSS</button>
          </div>
        </BattleFrame>
      ) : null}

      {pad.error || pad.factoryOperation.storageError || pending ? (
        <BattleFrame><div className="space-y-3 px-4 py-4">
            {pad.error ? <Notice error>{pad.error}</Notice> : null}
            {pad.factoryOperation.storageError ? <Notice error>{pad.factoryOperation.storageError}</Notice> : null}
            {pending?.status === "preparing" ? <Notice>Finish the wallet request before starting another operation.</Notice> : null}
            {pending?.status === "submitted" ? (
              <div role="status" className="space-y-2 border-t-2 border-[#092B61]/20 pt-3 text-[14px]">
                <p>{pending.operation.kind === "launch" ? "LAUNCH PENDING" : "TOKEN APPROVAL PENDING"}</p>
                <TransactionLink hash={pending.operation.hash} />
                <p>Closing this form does not cancel the transaction.</p>
                <button type="button" onClick={() => void pad.resumeFactoryOperation()} disabled={!pad.canResume} className={`${BUTTON} block`}>{pad.busy === "resume" ? "CHECKING…" : "CHECK TRANSACTION"}</button>
              </div>
            ) : null}
            {pending?.status === "unreadable" ? <Notice error>A saved transaction could not be read. Creation is locked to prevent duplicates. Keep this browser&apos;s stored data and check the transaction before trying again.</Notice> : null}
        </div></BattleFrame>
      ) : null}

      <form onSubmit={(event) => { event.preventDefault(); void pad.requestQuote(); }} noValidate hidden={Boolean(pad.result)}>
        <BattleFrame>
          <fieldset className="space-y-5 px-4 py-4">
            <legend>CREATE A BOSS</legend>
            <div>
              <p>1 · CONNECT WALLET</p>
              <p className="mt-1 text-[12px] text-[#536b99]">BASE SEPOLIA · TESTNET</p>
              <div className="mt-2 flex flex-wrap gap-2 [&>button]:rounded-none [&>button]:border-0 [&>button]:bg-[#092B61] [&>button]:font-pixel [&>button]:text-[16px] [&>button]:tracking-normal [&>button]:text-white">
                <WalletControl />
              </div>
            </div>
            <label className="block">
              <span>2 · TOKEN ADDRESS</span>
              <input aria-label="Token address" value={pad.tokenAddress} onChange={(event) => pad.editToken(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={locked} className={INPUT} />
              <button type="button" onClick={() => void pad.loadToken()} disabled={locked || !pad.tokenAddress} className={`${BUTTON} mt-2`}>{pad.busy === "token" ? "READING TOKEN…" : "READ TOKEN"}</button>
            </label>
            {token ? <p className="text-[14px] text-[#536b99]">{token.symbol} · Wallet balance: {token.balance === undefined ? pad.account ? "checking…" : "connect wallet" : formatUnits(token.balance, token.decimals)}</p> : null}
            <label className="block">
              <span>3 · POOL AMOUNT</span>
              <input aria-label="Total token allocation" inputMode="decimal" value={pad.allocation} onChange={(event) => pad.editAllocation(event.target.value)} placeholder="Tokens to deposit" disabled={locked || !token} className={INPUT} />
              <Hint>The total deposit includes the final prize.</Hint>
            </label>
            <label className="block">
              <span>4 · TARGET VOLUME</span>
              <input aria-label="Target MockUSD volume" inputMode="decimal" value={pad.volumeTarget} onChange={(event) => pad.editVolumeTarget(event.target.value)} placeholder="MockUSD trading volume" disabled={locked} className={INPUT} />
              <Hint>In MockUSD. Only attacks against this boss count.</Hint>
            </label>
            <label className="block">
              <span>5 · FINAL PRIZE %</span>
              <input aria-label="Prize percentage" inputMode="decimal" value={pad.prizePercent} onChange={(event) => pad.editPrizePercent(event.target.value)} placeholder="Share of the deposit" disabled={locked} className={INPUT} />
              <Hint>Released to eligible fighters after the final stage. Greater than 0%, below 100%.</Hint>
            </label>
            <div>
              <p>6 · THREE STAGES</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PORTRAITS.map((src, index) => (
                  <div key={src} className="border-2 border-[#092B61] bg-white p-2 text-center">
                    <img src={src} alt={`Stage ${index + 1} boss`} className="h-16 w-full object-contain [image-rendering:pixelated]" />
                    <p className="mt-1 text-[12px]">STAGE {index + 1}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="border-t-2 border-[#092B61]/20 pt-3 text-[14px]">This boss stays open until defeated. You cannot cancel it or withdraw deposited funds, even after victory. Players can claim earned prizes without a time limit.</p>

            {pad.factoryBuild.status === "checking" ? <Notice>Checking the Factory…</Notice> : null}
            {pad.factoryBuild.status === "unconfigured" ? <Notice>Boss creation is unavailable on Base Sepolia. You can still read token details.</Notice> : null}
            {pad.factoryBuild.status === "not-deployed" || pad.factoryBuild.status === "incompatible" ? <Notice error>Boss creation is temporarily unavailable. No funds have been requested.</Notice> : null}
            {pad.factoryBuild.status === "error" ? <Notice error>Could not reach the Factory. Check your connection and reload.</Notice> : null}
            {token && pad.allocationAmount !== undefined && token.balance !== undefined && !pad.hasEnoughBalance ? <Notice error>Your token balance is below the pool amount.</Notice> : null}

            {pad.quoteState ? (
              <div className="space-y-3 border-t-2 border-[#092B61]/20 pt-3">
                <h2>FUNDING PREVIEW</h2>
                <dl className="space-y-2 text-[14px]">
                  <Detail label="Total deposit" value={amount(pad.quoteState.config.tokenAllocation)} />
                  <Detail label="Final prize" value={amount(pad.quoteState.quote.prizeAmount)} />
                  <Detail label="Battle allocation" value={amount(pad.quoteState.quote.battleTokenBudget)} />
                  <Detail label="Target volume" value={`${formatUnits(pad.quoteState.config.volumeTargetMockUSD, 6)} MockUSD`} />
                </dl>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button type="submit" disabled={!pad.factoryBuildReady || !token || locked} className={BUTTON}>{pad.busy === "quote" ? "CALCULATING FUNDING…" : "GET FUNDING QUOTE"}</button>
              <button type="button" onClick={() => void pad.continueLaunch()} disabled={!pad.canContinue || locked} className={BUTTON}>{pad.busyLabel ?? pad.actionLabel}</button>
            </div>
          </fieldset>
        </BattleFrame>
      </form>
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="mt-2 block text-[14px] text-[#536b99]">{children}</span>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={`text-[14px] ${error ? "text-[#a52b2b]" : "text-[#536b99]"}`}>{children}</p>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[#536b99]">{label}</dt><dd className="break-all">{value}</dd></div>;
}

function TransactionLink({ hash }: { hash: string }) {
  return <a className="inline-block break-all underline underline-offset-4" href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a>;
}
