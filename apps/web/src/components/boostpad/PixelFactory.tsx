"use client";

import Link from "next/link";
import { STAGE_IMAGE_IDS, STAGE_IMAGES } from "@/lib/boostPad";
import { BattleFrame } from "../battle/BattleFrame";
import type { BoostPadForm } from "./useBoostPadForm";

const LINE = "Bring me a token, and I'll forge the boss.";

const INPUT =
  "mt-2 w-full border-2 border-[#092B61] bg-white px-3 py-2 font-pixel text-[16px] leading-none text-[#092B61] outline-none placeholder:text-[#6d7c9c]";

/**
 * Create form in battle windows. The walkable factory opens this after you talk to the smith.
 * The page itself is web form mode when visited directly.
 */
export function PixelFactory({ pad, overlay = false }: { pad: BoostPadForm; overlay?: boolean }) {
  const { arena, account, connected, formOpen, openForm, closeForm, form, errors, handoff, edit, setStageCount, chooseImage, submit } = pad;
  const talking = overlay || formOpen;

  return (
    <main className={overlay ? "font-pixel text-white [-webkit-font-smoothing:none]" : "h-dvh overflow-y-auto bg-[#0c2044] font-pixel text-white [-webkit-font-smoothing:none]"}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
        <header className="flex items-start justify-between gap-3">
          <BattleFrame tone="navy">
            <p className="px-4 py-3 text-[18px] leading-none">{overlay ? "BLACKSMITH" : "WEB FORM MODE"}</p>
          </BattleFrame>
          {overlay ? (
            <button
              type="button"
              onClick={closeForm}
              className="bg-[#092B61] px-2 py-1 text-[16px] leading-none text-white shadow-[3px_3px_0_#041833] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
            >
              ESC · WALK
            </button>
          ) : (
            <Link
              href="/"
              className="bg-[#092B61] px-2 py-1 text-[16px] leading-none text-white shadow-[3px_3px_0_#041833] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
            >
              ESC · HUB
            </Link>
          )}
        </header>

        <div className={overlay ? "" : "grid items-start gap-4 lg:grid-cols-[180px_minmax(0,1fr)]"}>
          {overlay ? null : (
          <button
            type="button"
            onClick={openForm}
            className="w-[148px] border-[3px] border-[#f3ead2] bg-[#16356e] px-2 pb-2 pt-2 text-left shadow-[3px_3px_0_#041833] transition-transform duration-150 ease-[var(--ease-out-strong)] [border-radius:8px] active:scale-[0.97]"
          >
            <SmithPortrait />
            <p className="mt-1 text-center text-[16px] leading-none text-[#f6e7b2]">BLACKSMITH</p>
          </button>
          )}

          {talking ? (
            <form onSubmit={submit} noValidate>
              <BattleFrame>
                <p className="px-4 py-3 text-[18px] leading-snug text-[#092B61]">{LINE}</p>
              </BattleFrame>

              <div className="mt-3">
                <BattleFrame>
                  <fieldset className="space-y-4 px-4 py-4 text-[#092B61]">
                    <legend className="text-[16px] leading-none">CREATE A BOSS</legend>

                    <div>
                      <p className="text-[16px] leading-none">1 · CONNECT WALLET</p>
                      {connected && account ? (
                        <p className="mt-2 text-[16px] leading-none">{shortAddress(account)}</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void arena.connect().catch(() => undefined)}
                          disabled={arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
                          className="mt-2 bg-[#092B61] px-3 py-2 text-[16px] leading-none text-white transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] disabled:opacity-40"
                        >
                          {arena.wallet.status === "missing" ? "NO WALLET" : "CONNECT WALLET"}
                        </button>
                      )}
                      {arena.wallet.error ? <FieldError>{arena.wallet.error}</FieldError> : null}
                    </div>

                    <label className="block">
                      <span className="text-[16px] leading-none">2 · TOKEN</span>
                      <input
                        value={form.token}
                        onChange={(event) => edit({ ...form, token: event.target.value })}
                        placeholder="MockUSD"
                        className={INPUT}
                        aria-invalid={Boolean(errors.token)}
                      />
                      {errors.token ? <FieldError>{errors.token}</FieldError> : null}
                    </label>

                    <label className="block">
                      <span className="text-[16px] leading-none">3 · POOL AMOUNT</span>
                      <input
                        inputMode="decimal"
                        value={form.poolAmount}
                        onChange={(event) => edit({ ...form, poolAmount: event.target.value })}
                        placeholder="Tokens into the pool"
                        className={INPUT}
                        aria-invalid={Boolean(errors.poolAmount)}
                      />
                      {errors.poolAmount ? <FieldError>{errors.poolAmount}</FieldError> : null}
                    </label>

                    <label className="block">
                      <span className="text-[16px] leading-none">4 · TARGET VOLUME</span>
                      <input
                        inputMode="decimal"
                        value={form.targetVolume}
                        onChange={(event) => edit({ ...form, targetVolume: event.target.value })}
                        placeholder="Trading volume"
                        className={INPUT}
                        aria-invalid={Boolean(errors.targetVolume)}
                      />
                      {errors.targetVolume ? <FieldError>{errors.targetVolume}</FieldError> : null}
                    </label>

                    <label className="block">
                      <span className="text-[16px] leading-none">5 · FINAL PRIZE %</span>
                      <input
                        inputMode="decimal"
                        value={form.prizePercent}
                        onChange={(event) => edit({ ...form, prizePercent: event.target.value })}
                        placeholder="Share of the pool"
                        className={INPUT}
                        aria-invalid={Boolean(errors.prizePercent)}
                      />
                      <p className="mt-2 text-[14px] leading-snug text-[#2b4a8b]/80">Released when the final stage is cleared.</p>
                      {errors.prizePercent ? <FieldError>{errors.prizePercent}</FieldError> : null}
                    </label>

                    <div>
                      <p className="text-[16px] leading-none">6 · STAGES</p>
                      <div className="mt-2 flex gap-2">
                        {([1, 2, 3] as const).map((count) => (
                          <button
                            key={count}
                            type="button"
                            aria-pressed={form.stageCount === count}
                            onClick={() => setStageCount(count)}
                            className={`px-3 py-2 text-[16px] leading-none transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] ${
                              form.stageCount === count ? "bg-[#092B61] text-white" : "border-2 border-[#092B61] bg-white text-[#092B61]"
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                      {errors.stageCount ? <FieldError>{errors.stageCount}</FieldError> : null}
                    </div>

                    <div>
                      <p className="text-[16px] leading-none">7 · STAGE IMAGES</p>
                      <div className="mt-2 space-y-3">
                        {Array.from({ length: form.stageCount }, (_, index) => (
                          <div key={index}>
                            <p className="text-[14px] leading-none">Stage {index + 1}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {STAGE_IMAGE_IDS.map((id) => {
                                const selected = form.stageImages[index] === id;
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => chooseImage(index, id)}
                                    className={`w-20 border-2 bg-[#1a1612] p-1 transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] ${
                                      selected ? "border-[#092B61]" : "border-[#092B61]/25"
                                    }`}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- existing boss art */}
                                    <img src={STAGE_IMAGES[id].src} alt="" className="h-16 w-full object-contain [image-rendering:pixelated]" />
                                    <span className="mt-1 block text-center text-[12px] leading-none text-[#f3e2c4]">{STAGE_IMAGES[id].label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {errors.stageImages ? <FieldError>{errors.stageImages}</FieldError> : null}
                    </div>

                    <button
                      type="submit"
                      disabled={!connected}
                      className="bg-[#092B61] px-4 py-3 text-[16px] leading-none text-white transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] disabled:opacity-40"
                    >
                      FORGE DESCRIPTION
                    </button>
                    {!connected ? <p className="text-[14px] leading-snug text-[#2b4a8b]/80">Connect a wallet before forging.</p> : null}
                  </fieldset>
                </BattleFrame>
              </div>

              {handoff && account ? (
                <div className="mt-3" role="status">
                  <BattleFrame tone="navy">
                    <div className="space-y-2 px-4 py-3 text-[16px] leading-snug">
                      <p>READY FOR THE CONTRACT HANDOFF</p>
                      <p>Account · {shortAddress(account)}</p>
                      <p>Token · {handoff.token}</p>
                      <p>Pool amount · {handoff.poolAmount}</p>
                      <p>Target volume · {handoff.targetVolume}</p>
                      <p>Final prize · {handoff.prizePercent}% of the pool amount</p>
                      <p>Stages · {handoff.stageCount}</p>
                      <p>{handoff.stageImages.map((id, index) => `Stage ${index + 1} ${STAGE_IMAGES[id].label}`).join(" · ")}</p>
                    </div>
                  </BattleFrame>
                </div>
              ) : null}
            </form>
          ) : (
            <BattleFrame>
              <p className="px-4 py-4 text-[18px] leading-snug text-[#092B61]">Click the blacksmith to open the create form.</p>
            </BattleFrame>
          )}
        </div>
      </div>
    </main>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function FieldError({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-2 text-[14px] leading-snug text-[#c0392b]">
      {children}
    </p>
  );
}

function SmithPortrait() {
  return (
    <svg viewBox="0 0 80 72" aria-hidden className="mx-auto h-[84px] w-[70px]" shapeRendering="crispEdges">
      <rect width="80" height="72" fill="#16356e" />
      <rect x="26" y="8" width="28" height="22" fill="#f3ead2" />
      <rect x="30" y="14" width="6" height="4" fill="#16356e" />
      <rect x="44" y="14" width="6" height="4" fill="#16356e" />
      <rect x="18" y="32" width="44" height="28" fill="#c48a45" />
      <rect x="46" y="52" width="26" height="6" fill="#e7b56a" />
      <rect x="8" y="62" width="64" height="6" fill="#5c4030" />
    </svg>
  );
}
