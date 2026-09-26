"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROBINHOOD_TESTNET_CHAIN_ID } from "@boss-pool/chain";
import type { DeploymentState } from "./useBossPool";
import {
  addWorldEvent, blendWorldEvents, createSeededRng, generateMockEvents, mockIntervalMs, selectMode,
  toWorldEvent, type WorldChannelEvent, type WorldChannelMode, type WorldEventContext,
} from "./worldChannel";

const POLL_MS = 5_000;
const BLOCKS_PER_PAGE = 1_000n;
const MOCK_POOL_SIZE = 48;
const MIN_REAL_BURST = 3;
const IDLE_SEED = 1_337;

export type WorldChannelState = {
  events: WorldChannelEvent[];
  mode: WorldChannelMode;
  realError: boolean;
  expanded: boolean;
  toggle: () => void;
};

/**
 * Drives the World Channel feed: a real global `readActivity` poll (generalized from BattleActivityLog)
 * blended with a deterministic ambient mock stream, plus the §3.5 fallback state machine. Read-only —
 * it never writes game state, sends a transaction, or bridges an event.
 */
export function useWorldChannel(deployment: DeploymentState): WorldChannelState {
  const [events, setEvents] = useState<WorldChannelEvent[]>([]);
  const [realError, setRealError] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const eventsRef = useRef<WorldChannelEvent[]>([]);
  const skipNextMock = useRef(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const live = deployment.kind === "live" ? deployment : null;
  const context = live?.context;
  const manifest = context?.manifest;
  const publicClient = context?.publicClient;
  const publicSdk = context?.publicSdk;
  const hpDecimals = live?.round.hpToken.decimals;
  const hpSymbol = live?.round.hpToken.symbol;
  const chainId = manifest?.chainId;
  const seed = manifest ? (manifest.deployedAtBlock >>> 0) || 1 : IDLE_SEED;

  // Real global feed. Stable context sub-objects as deps so a 5s round refresh does not tear down the loop.
  useEffect(() => {
    if (!manifest || !publicClient || !publicSdk || hpDecimals === undefined || hpSymbol === undefined) return;
    if (chainId === ROBINHOOD_TESTNET_CHAIN_ID) return;
    const deploymentBlock = BigInt(manifest.deployedAtBlock);
    const ctx: WorldEventContext = { explorer: publicClient.chain?.blockExplorers?.default.url, hpDecimals, hpSymbol };
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const head = await publicClient.getBlockNumber({ cacheTime: 0 });
        const fromBlock = head - BLOCKS_PER_PAGE + 1n > deploymentBlock ? head - BLOCKS_PER_PAGE + 1n : deploymentBlock;
        const page = await publicSdk.readActivity({ fromBlock, toBlock: head, maxBlocks: Number(BLOCKS_PER_PAGE) });
        if (!active) return;
        const knownChain = new Set(eventsRef.current.filter((event) => event.source === "chain").map((event) => event.id));
        const fresh = page.entries.reduce((count, entry) => {
          const mapped = toWorldEvent(entry, ctx);
          return mapped && !knownChain.has(mapped.id) ? count + 1 : count;
        }, 0);
        if (fresh >= MIN_REAL_BURST) skipNextMock.current = true; // Let a real burst breathe before the next mock beat.
        setEvents((current) => blendWorldEvents(
          current.filter((event) => event.source === "mock" || event.blockNumber === undefined || event.blockNumber <= head),
          page, manifest, ctx,
        ));
        setRealError(false);
      } catch {
        // Keep the rows already shown; the next successful poll clears the degraded flag.
        if (active) setRealError(true);
      } finally {
        if (active) timer = window.setTimeout(poll, POLL_MS);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [manifest, publicClient, publicSdk, hpDecimals, hpSymbol, chainId]);

  // Deterministic ambient stream so the panel is never blank; rate-limited when real events surge.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const cadence = createSeededRng((seed ^ 0x9e3779b9) >>> 0);
    let pool = generateMockEvents(seed, MOCK_POOL_SIZE);
    let cursor = 0;
    let generation = 0;
    const tick = () => {
      if (!active) return;
      if (skipNextMock.current) {
        skipNextMock.current = false;
      } else {
        if (cursor >= pool.length) {
          generation += 1;
          pool = generateMockEvents(seed + generation, MOCK_POOL_SIZE);
          cursor = 0;
        }
        const next = pool[cursor];
        cursor += 1;
        // Re-stamp arrival time so mock rows interleave with real rows by wall-clock order.
        if (next) setEvents((current) => addWorldEvent(current, { ...next, timestamp: Date.now() }));
      }
      timer = window.setTimeout(tick, mockIntervalMs(cadence));
    };
    timer = window.setTimeout(tick, mockIntervalMs(cadence));
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [seed]);

  const mode = selectMode({ live: live !== null, chainId, realErrored: realError });
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  return { events, mode, realError, expanded, toggle };
}
