"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { STAGE_IMAGE_IDS, STAGE_IMAGES } from "@/lib/boostPad";
import { FactoryWalk } from "./FactoryWalk";
import { useBoostPadForm } from "./useBoostPadForm";

const FIELD =
  "mt-1 w-full border border-white/15 bg-[#14110e] px-3 py-2 text-sm text-[#f3e6d0] outline-none transition-transform duration-150 ease-[var(--ease-out-strong)] placeholder:text-[#8a7b68] focus-visible:border-[#e7b56a]";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Direct visits are web form mode. The hub opens the walkable factory.
 * Submit checks the description and does not deploy or save it.
 */
export function BoostPadView() {
  const fromGame = useSearchParams().get("from") === "game";
  if (fromGame) return <FactoryWalk />;
  return <WebFormMode />;
}

function WebFormMode() {
  const { arena, account, connected, formOpen, openForm, closeForm, form, errors, handoff, edit, setStageCount, chooseImage, submit } = useBoostPadForm();

  return (
    <main className="h-dvh overflow-y-auto bg-[#100e0c] text-[#f3e6d0]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-[#e7b56a]">WEB FORM MODE</p>
            <h1 className="mt-1 text-lg font-semibold tracking-[0.12em]">BOOSTPAD</h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-[#f3e6d0] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
          >
            BACK TO HUB
          </Link>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <button
            type="button"
            onClick={openForm}
            className="border border-[#e7b56a]/40 bg-[#1a1612] p-4 text-left transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
          >
            <SmithPortrait />
            <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-[#e7b56a]">BLACKSMITH</p>
            <p className="mt-2 text-sm leading-relaxed text-[#d9cbb8]">Bring me a token, and I&apos;ll forge the boss.</p>
          </button>

          {formOpen ? (
            <form onSubmit={submit} className="border border-white/10 bg-[#1a1612] p-4 sm:p-5" noValidate>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed text-[#d9cbb8]">Bring me a token, and I&apos;ll forge the boss.</p>
                <button
                  type="button"
                  onClick={closeForm}
                  className="shrink-0 border border-white/15 px-3 py-2 font-mono text-[10px] tracking-[0.14em] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
                >
                  CLOSE
                </button>
              </div>

              <fieldset className="mt-5 space-y-4">
                <legend className="font-mono text-[10px] tracking-[0.16em] text-[#e7b56a]">CREATE A BOSS</legend>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">1 · CONNECT WALLET</p>
                  {connected && account ? (
                    <p className="mt-2 font-mono text-sm text-[#f3e6d0]">{shortAddress(account)}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void arena.connect().catch(() => undefined)}
                      className="mt-2 border border-[#e7b56a]/50 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-[#e7b56a] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] disabled:opacity-40"
                    >
                      {arena.wallet.status === "missing" ? "NO WALLET" : "CONNECT WALLET"}
                    </button>
                  )}
                  {arena.wallet.error ? (
                    <p role="alert" className="mt-2 text-sm text-[#ffaaa4]">
                      {arena.wallet.error}
                    </p>
                  ) : null}
                </div>

                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">2 · TOKEN</span>
                  <input
                    value={form.token}
                    onChange={(event) => edit({ ...form, token: event.target.value })}
                    placeholder="MockUSD"
                    className={FIELD}
                    aria-invalid={Boolean(errors.token)}
                  />
                  {errors.token ? <FieldError>{errors.token}</FieldError> : null}
                </label>

                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">3 · POOL AMOUNT</span>
                  <input
                    inputMode="decimal"
                    value={form.poolAmount}
                    onChange={(event) => edit({ ...form, poolAmount: event.target.value })}
                    placeholder="How much of that token goes into the pool"
                    className={FIELD}
                    aria-invalid={Boolean(errors.poolAmount)}
                  />
                  {errors.poolAmount ? <FieldError>{errors.poolAmount}</FieldError> : null}
                </label>

                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">4 · TARGET VOLUME</span>
                  <input
                    inputMode="decimal"
                    value={form.targetVolume}
                    onChange={(event) => edit({ ...form, targetVolume: event.target.value })}
                    placeholder="Trading volume to aim for"
                    className={FIELD}
                    aria-invalid={Boolean(errors.targetVolume)}
                  />
                  {errors.targetVolume ? <FieldError>{errors.targetVolume}</FieldError> : null}
                </label>

                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">5 · FINAL PRIZE %</span>
                  <input
                    inputMode="decimal"
                    value={form.prizePercent}
                    onChange={(event) => edit({ ...form, prizePercent: event.target.value })}
                    placeholder="Percentage of the pool amount"
                    className={FIELD}
                    aria-invalid={Boolean(errors.prizePercent)}
                  />
                  <p className="mt-1 text-xs text-[#8a7b68]">Released when the final stage is cleared.</p>
                  {errors.prizePercent ? <FieldError>{errors.prizePercent}</FieldError> : null}
                </label>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">6 · STAGES</p>
                  <div className="mt-2 flex gap-2">
                    {([1, 2, 3] as const).map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={form.stageCount === count}
                        onClick={() => setStageCount(count)}
                        className={`border px-3 py-2 font-mono text-[10px] tracking-[0.14em] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] ${
                          form.stageCount === count
                            ? "border-[#e7b56a] bg-[#e7b56a] text-[#1a1612]"
                            : "border-white/15 text-[#f3e6d0]"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  {errors.stageCount ? <FieldError>{errors.stageCount}</FieldError> : null}
                </div>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.12em] text-[#b7a898]">7 · STAGE IMAGES</p>
                  <div className="mt-2 space-y-3">
                    {Array.from({ length: form.stageCount }, (_, index) => (
                      <div key={index}>
                        <p className="text-xs text-[#b7a898]">Stage {index + 1}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {STAGE_IMAGE_IDS.map((id) => {
                            const selected = form.stageImages[index] === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => chooseImage(index, id)}
                                className={`w-20 border p-1 transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] ${
                                  selected ? "border-[#e7b56a]" : "border-white/15"
                                }`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- existing boss art, no optimisation pass */}
                                <img
                                  src={STAGE_IMAGES[id].src}
                                  alt=""
                                  className="h-16 w-full object-contain [image-rendering:pixelated]"
                                />
                                <span className="mt-1 block text-center font-mono text-[9px] tracking-[0.08em]">
                                  {STAGE_IMAGES[id].label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {errors.stageImages ? <FieldError>{errors.stageImages}</FieldError> : null}
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={!connected}
                className="mt-5 border border-[#e7b56a] bg-[#e7b56a] px-4 py-2 font-mono text-[10px] tracking-[0.14em] text-[#1a1612] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] disabled:opacity-40"
              >
                FORGE DESCRIPTION
              </button>
              {!connected ? <p className="mt-2 text-xs text-[#8a7b68]">Connect a wallet before forging.</p> : null}

              {handoff && account ? (
                <div role="status" className="mt-5 border border-[#e7b56a]/40 bg-[#100e0c] p-4">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-[#e7b56a]">READY FOR THE CONTRACT HANDOFF</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <Row label="Account" value={account} />
                    <Row label="Token" value={handoff.token} />
                    <Row label="Pool amount" value={handoff.poolAmount} />
                    <Row label="Target volume" value={handoff.targetVolume} />
                    <Row label="Final prize" value={`${handoff.prizePercent}% of the pool amount`} />
                    <Row label="Stages" value={String(handoff.stageCount)} />
                    <Row
                      label="Images"
                      value={handoff.stageImages.map((id, index) => `Stage ${index + 1}: ${STAGE_IMAGES[id].label}`).join(" · ")}
                    />
                  </dl>
                </div>
              ) : null}
            </form>
          ) : (
            <p className="border border-dashed border-white/15 p-5 text-sm text-[#b7a898]">
              Click the blacksmith to open the create form.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-1 text-sm text-[#ffaaa4]">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="text-[#8a7b68]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SmithPortrait() {
  return (
    <svg viewBox="0 0 80 96" aria-hidden className="mx-auto h-28 w-24" fill="none">
      <rect x="22" y="8" width="36" height="28" fill="#2a2118" stroke="#e7b56a" strokeWidth="2" />
      <rect x="30" y="16" width="6" height="4" fill="#e7b56a" />
      <rect x="44" y="16" width="6" height="4" fill="#e7b56a" />
      <rect x="18" y="38" width="44" height="36" fill="#3a2a1c" stroke="#c48a45" strokeWidth="2" />
      <rect x="8" y="78" width="64" height="10" fill="#5c4030" />
      <rect x="48" y="70" width="22" height="6" fill="#e7b56a" />
    </svg>
  );
}
