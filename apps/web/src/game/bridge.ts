import type { BossId } from "./bosses";

/**
 * The only channel between React and the Phaser game.
 * Game -> React: events. React -> Game: commands.
 * Keep this surface small; both sides depend on it.
 */
export type GameEvents = {
  /** Player walked into / out of a gate's approach zone. */
  "gate:near": { bossId: BossId | null };
  /** Player pressed interact while inside a gate zone. */
  "gate:enter": { bossId: BossId };
  /** Scene finished booting and is ready for commands. */
  "scene:ready": Record<string, never>;
  /** A map or sprite file failed while the scene was loading. */
  "scene:error": Record<string, never>;
  /** The player traveled the guide's required distance during the move step. */
  "guide:moved": Record<string, never>;
  /** Player walked into / out of the closed east route. */
  "region:near": { exitId: "east-route" | null };
  /** Player inspected the closed east route. */
  "region:inspect": { exitId: "east-route" };
};

export type GuideSceneStep = "off" | "move" | "find" | "inspect";

export type GameCommands = {
  /** React opened or closed a panel; the scene pauses movement input while open. */
  "ui:modal": { open: boolean };
  /** Canonical round state read from the verified chain deployment. */
  "round:state": {
    status: number;
    currentStage: number;
    stageSold: readonly [bigint, bigint, bigint];
    stageCapacity: readonly [bigint, bigint, bigint];
  };
  /** Avoid presenting a stale stage label while the selected deployment is unavailable. */
  "round:unavailable": { label: string };
  /** A submitted attack is charging; it is not damage until a receipt confirms it. */
  "attack:pending": { active: boolean; stage?: number };
  /** One receipt-confirmed contribution, identified by its canonical event position. */
  "attack:confirmed": { transactionHash: `0x${string}`; logIndex: number; stage: number; bossHPOut: bigint };
  /** Which part of the beginner guide the scene should track. */
  "guide:step": { step: GuideSceneStep };
};

type Listener<T> = (payload: T) => void;

export class GameBridge {
  private eventListeners = new Map<keyof GameEvents, Set<Listener<unknown>>>();
  private commandListeners = new Map<keyof GameCommands, Set<Listener<unknown>>>();
  private latestCommands = new Map<keyof GameCommands, unknown>();
  private confirmedEffects = new Set<string>();

  on<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): () => void {
    const set = this.eventListeners.get(event) ?? new Set();
    set.add(listener as Listener<unknown>);
    this.eventListeners.set(event, set);
    return () => set.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.eventListeners.get(event)?.forEach((l) => l(payload));
  }

  onCommand<K extends keyof GameCommands>(command: K, listener: Listener<GameCommands[K]>): () => void {
    const set = this.commandListeners.get(command) ?? new Set();
    set.add(listener as Listener<unknown>);
    this.commandListeners.set(command, set);
    const latest = this.latestCommands.get(command);
    if (latest !== undefined) listener(latest as GameCommands[K]);
    return () => set.delete(listener as Listener<unknown>);
  }

  send<K extends keyof GameCommands>(command: K, payload: GameCommands[K]): void {
    if (command === "attack:confirmed") {
      const event = payload as GameCommands["attack:confirmed"];
      const key = `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
      if (this.confirmedEffects.has(key)) return;
      this.confirmedEffects.add(key);
    } else {
      if (command === "round:state") this.latestCommands.delete("round:unavailable");
      if (command === "round:unavailable") this.latestCommands.delete("round:state");
      this.latestCommands.set(command, payload);
    }
    this.commandListeners.get(command)?.forEach((l) => l(payload));
  }

  clear(): void {
    this.eventListeners.clear();
    this.commandListeners.clear();
    this.latestCommands.clear();
    this.confirmedEffects.clear();
  }
}
