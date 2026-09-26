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
};

export type GameCommands = {
  /** React opened or closed a panel; the scene pauses movement input while open. */
  "ui:modal": { open: boolean };
};

type Listener<T> = (payload: T) => void;

export class GameBridge {
  private eventListeners = new Map<keyof GameEvents, Set<Listener<unknown>>>();
  private commandListeners = new Map<keyof GameCommands, Set<Listener<unknown>>>();

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
    return () => set.delete(listener as Listener<unknown>);
  }

  send<K extends keyof GameCommands>(command: K, payload: GameCommands[K]): void {
    this.commandListeners.get(command)?.forEach((l) => l(payload));
  }

  clear(): void {
    this.eventListeners.clear();
    this.commandListeners.clear();
  }
}
