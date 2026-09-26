"use client";

import type { DeploymentState } from "@/lib/useBossPool";
import { useWorldChannel } from "@/lib/useWorldChannel";
import type { WorldChannelEvent } from "@/lib/worldChannel";

/**
 * Bottom-left ambient feed of world activity (Dark HUD theme). Real on-chain rows carry a LIVE dot and
 * an explorer link; mock rows are dim ambient background with no link. Read-only — see useWorldChannel.
 */
export function WorldChannel({ deployment }: { deployment: DeploymentState }) {
  const { events, mode, realError, expanded, toggle } = useWorldChannel(deployment);
  const hasChain = events.some((event) => event.source === "chain");
  const isLive = mode === "blended" && hasChain;
  const statusLabel = mode === "blended-degraded" ? "UPDATES UNAVAILABLE · ambient only"
    : mode === "mock-only" ? "AMBIENT"
      : isLive ? "LIVE" : "STANDBY";
  const visible = expanded ? events.slice(0, 8) : events.slice(0, 1);

  return (
    <section
      aria-label="World channel"
      className="pointer-events-auto w-[min(20rem,calc(100vw-1.5rem))] self-start rounded-lg border border-white/12 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-dim backdrop-blur-[2px]"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 focus-visible:outline-2"
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${isLive ? "bg-live shadow-[0_0_12px_rgba(79,218,165,0.55)]" : "bg-dim"}`}
          />
          <span className="eyebrow">WORLD CHANNEL</span>
        </span>
        <span className={`text-[9px] ${realError ? "text-danger" : isLive ? "text-live-soft" : "text-dim"}`}>{statusLabel}</span>
      </button>
      <ol
        role="log"
        aria-label="World channel feed"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        className={`mt-1.5 ${expanded ? "max-h-40 overflow-y-auto overscroll-contain" : ""} focus-visible:outline-2`}
      >
        {visible.length === 0 && <li className="py-1 text-dim">Listening for world activity…</li>}
        {visible.map((event, index) => <WorldRow key={event.id} event={event} hideOnMobile={index > 0} />)}
      </ol>
    </section>
  );
}

function WorldRow({ event, hideOnMobile }: { event: WorldChannelEvent; hideOnMobile: boolean }) {
  const time = new Date(event.timestamp);
  const chain = event.source === "chain";
  const body = (
    <span className={chain ? "text-live-soft" : "text-dim"}>
      {event.actor !== "—" && <span className="font-semibold text-fog">{event.actor} </span>}
      {event.message}
    </span>
  );
  return (
    <li className={`world-row items-baseline justify-between gap-2 border-t border-white/5 py-1 first:border-t-0 ${hideOnMobile ? "hidden sm:flex" : "flex"}`}>
      <span className="min-w-0 break-words">
        {chain && event.explorerUrl
          ? <a href={event.explorerUrl} target="_blank" rel="noreferrer" className="hover:underline focus-visible:outline-2">{body}<span className="sr-only"> · View confirmed transaction</span></a>
          : body}
      </span>
      <time dateTime={time.toISOString()} className="shrink-0 text-[9px] text-faint">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
      </time>
    </li>
  );
}
