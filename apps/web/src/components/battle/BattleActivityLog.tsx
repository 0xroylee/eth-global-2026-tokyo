"use client";

import { useEffect, useState } from "react";
import { mergeBattleAttacks, type BattleAttack } from "@/lib/battle";
import { displayAmount, displayEstimate } from "@/lib/format";
import type { DeploymentState } from "@/lib/useBossPool";

type LiveDeployment = Extract<DeploymentState, { kind: "live" }>;
const BLOCKS_PER_PAGE = 1_000n;

export function BattleActivityLog({ live }: { live: LiveDeployment }) {
  const { context, round } = live;
  const { manifest, publicClient, publicSdk } = context;
  const deploymentBlock = BigInt(manifest.deployedAtBlock);
  const [attacks, setAttacks] = useState<BattleAttack[]>([]);
  const [oldestBlock, setOldestBlock] = useState<bigint | null>(null);
  const [olderToBlock, setOlderToBlock] = useState<bigint | null>(null);
  const [error, setError] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const explorer = publicClient.chain?.blockExplorers?.default.url;

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const head = await publicClient.getBlockNumber({ cacheTime: 0 });
        const fromBlock = head - BLOCKS_PER_PAGE + 1n > deploymentBlock ? head - BLOCKS_PER_PAGE + 1n : deploymentBlock;
        const page = await publicSdk.readActivity({ fromBlock, toBlock: head, maxBlocks: Number(BLOCKS_PER_PAGE) });
        if (!active) return;
        setAttacks((current) => mergeBattleAttacks(current.filter((entry) => entry.blockNumber <= head), page, manifest));
        setOldestBlock((current) => current === null || fromBlock < current ? fromBlock : current);
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) timer = window.setTimeout(poll, 5_000);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [deploymentBlock, manifest, publicClient, publicSdk]);

  useEffect(() => {
    if (olderToBlock === null) return;
    let active = true;
    const fromBlock = olderToBlock - BLOCKS_PER_PAGE + 1n > deploymentBlock
      ? olderToBlock - BLOCKS_PER_PAGE + 1n : deploymentBlock;
    setOlderError(false);
    void publicSdk.readActivity({ fromBlock, toBlock: olderToBlock, maxBlocks: Number(BLOCKS_PER_PAGE) })
      .then((page) => {
        if (!active) return;
        setAttacks((current) => mergeBattleAttacks(current, page, manifest));
        setOldestBlock((current) => current === null || fromBlock < current ? fromBlock : current);
      })
      .catch(() => { if (active) setOlderError(true); })
      .finally(() => { if (active) setOlderToBlock(null); });
    return () => { active = false; };
  }, [deploymentBlock, manifest, olderToBlock, publicSdk]);

  return (
    <section aria-label="Battle log" className="mt-2 flex min-h-0 flex-1 flex-col border-t border-[#2b4a8b]/30 pt-2 font-mono">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-[9px]">BATTLE LOG · STAGE {round.currentStage + 1}/3</h2>
        <span className={`text-[9px] ${error ? "text-[#8c443e]" : "text-[#526c9a]"}`}>
          {error ? "UPDATES UNAVAILABLE" : oldestBlock === null ? "LOADING" : "CONFIRMED ATTACKS"}
        </span>
      </div>
      <div role="log" aria-label="Confirmed attacks" aria-live="polite" aria-relevant="additions" tabIndex={0} className="mt-1 min-h-[48px] flex-1 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-[#2b4a8b]">
        {attacks.length === 0 && <p className="py-2 text-xs text-[#526c9a]">
          {error ? "Could not load attacks. Retrying automatically."
            : oldestBlock === null ? "Reading on-chain attacks…"
              : oldestBlock > deploymentBlock ? "No attacks in the recent blocks. Load older entries below."
                : "No confirmed attacks yet. Be the first to strike."}
        </p>}
        <ol className="divide-y divide-[#2b4a8b]/15">
          {attacks.map((attack) => {
            const timestamp = new Date(Number(attack.blockTimestamp) * 1_000);
            const text = <><span title={attack.player} className="font-bold">{attack.player.slice(0, 6)}…{attack.player.slice(-4)}</span> attacked · earned <span className="font-bold text-[#286f43]" title={`${displayAmount(attack.bossHPReceived, round.hpToken.decimals)} ${round.hpToken.symbol}`}>≈ {displayEstimate(attack.bossHPReceived, round.hpToken.decimals)} {round.hpToken.symbol}</span></>;
            return <li key={attack.id} className="flex items-baseline justify-between gap-3 py-1.5 text-xs leading-relaxed">
              <span className="min-w-0 break-words">
                {explorer ? <a href={`${explorer}/tx/${attack.transactionHash}`} target="_blank" rel="noreferrer" className="hover:underline focus-visible:outline-2">{text}<span className="sr-only"> · View confirmed transaction</span></a> : text}
              </span>
              <time dateTime={timestamp.toISOString()} title={timestamp.toLocaleString()} className="shrink-0 text-[10px] text-[#526c9a]">{timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
            </li>;
          })}
        </ol>
      </div>
      {oldestBlock !== null && oldestBlock > deploymentBlock && <button type="button" disabled={olderToBlock !== null} onClick={() => setOlderToBlock(oldestBlock - 1n)} className="mt-1 self-start text-[10px] underline underline-offset-2 focus-visible:outline-2 disabled:opacity-60">
        {olderToBlock !== null ? "Loading older attacks…" : olderError ? "Could not load older attacks · retry" : "Load older attacks"}
      </button>}
    </section>
  );
}
