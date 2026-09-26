import Phaser from "phaser";
import { BOSSES, findBoss, isBossId, type BossDefinition, type BossId } from "./bosses";
import type { GameBridge } from "./bridge";
import { HUB_LAYERS, HUB_TILESET } from "./hubTiles";
import { makeCroppedTexture } from "./textures";
import { HubAtmosphere } from "./HubAtmosphere";

/** World units are map pixels; the camera zooms them for the viewport. */
const ZOOM = 3;
const PLAYER_SPEED = 80;
const GATE = { width: 48, height: 32 } as const;
/** Overhead tiles (fences, canopies) draw above every y-sorted sprite. */
const OVERHEAD_DEPTH = 5_000;
/** Labels sit above every y-sorted prop and the overhead layer. */
const LABEL_DEPTH = 10_000;

const GATE_COLORS: Record<BossId, number> = {
  cat: 0xf5b04a,
  "macro-whale": 0x5aa9ff,
  locked: 0x6b7080,
};

type Gate = {
  boss: BossDefinition;
  zone: Phaser.Geom.Rectangle;
  glow: Phaser.GameObjects.Arc;
  pulse?: Phaser.Tweens.Tween;
};

/** Frame sequences for animated tiles. Both cycles divide TILE_CLOCK_PERIOD. */
const TILE_ANIMATIONS: { frames: readonly number[]; durations: readonly number[] }[] = [
  { frames: [HUB_TILESET.gid.waterA, HUB_TILESET.gid.waterB], durations: [500, 500] },
  { frames: [HUB_TILESET.gid.waterB, HUB_TILESET.gid.waterA], durations: [500, 500] },
  { frames: [HUB_TILESET.gid.torchA, HUB_TILESET.gid.torchB, HUB_TILESET.gid.torchC], durations: [166, 167, 167] },
];
const TILE_CLOCK_PERIOD = 1000;
const WALK_ROWS = ["down", "left", "right", "up"] as const;
type Facing = (typeof WALK_ROWS)[number];
/** Neutral pose is the second cell of each direction row. */
const IDLE_COLUMN = 1;
/** Foot pixel row inside the 32×32 cell. Origin and the feet collider share it. */
const FOOT_ROW = 31;
const PAGE_CONTROL = "button, a, input, select, textarea, [contenteditable='true'], [role='button']";

function isPageControlTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(PAGE_CONTROL) !== null;
}

/** Shape of Phaser's per-tile data that `Tileset.getAnimatedTileId` reads. */
type TileAnimationData = {
  animation?: { tileid: number; duration: number; startTime: number }[];
  animationDuration?: number;
};

export class HubScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private gates: Gate[] = [];
  private tileset!: Phaser.Tilemaps.Tileset;
  private nearGate: Gate | null = null;
  private modalOpen = false;
  private reduceMotion = false;
  private facing: Facing = "down";
  private lastX = 0;
  private lastY = 0;
  private guideStep: "off" | "move" | "find" | "inspect" = "off";
  private guideDistance = 0;
  private guideMoved = false;
  private guideAnchorX = 0;
  private guideAnchorY = 0;
  private hintTarget: Gate | null = null;
  private hintArrow: Phaser.GameObjects.Triangle | null = null;
  private unsubscribe: (() => void)[] = [];
  private atmosphere!: HubAtmosphere;

  constructor() {
    super("hub");
  }

  init(data: { bridge: GameBridge }) {
    this.bridge = data.bridge;
  }

  preload() {
    this.load.tilemapTiledJSON("hub", "/game/hub.json");
    this.load.image("tiles", "/game/tiles.png");
    this.load.spritesheet("player-walk", "/game/player-compact-walk.png", { frameWidth: 32, frameHeight: 32 });
    for (const boss of BOSSES) {
      if (boss.portrait) this.load.image(`portrait-master-${boss.id}`, boss.portrait);
    }
  }

  create() {
    this.gates = [];
    this.nearGate = null;
    this.registerWalk();
    makeCroppedTexture(this, "portrait-cat", "portrait-master-cat", { x: 120, y: 60, w: 880, h: 1240 }, 28);
    makeCroppedTexture(this, "portrait-macro-whale", "portrait-master-macro-whale", { x: 160, y: 80, w: 940, h: 940 }, 28);

    const map = this.make.tilemap({ key: "hub" });
    const tileset = map.addTilesetImage(HUB_TILESET.name, "tiles");
    if (!tileset) throw new Error(`hub.json tileset '${HUB_TILESET.name}' did not resolve to image 'tiles'`);
    this.tileset = tileset;

    const ground = map.createLayer(HUB_LAYERS.ground, tileset, 0, 0)?.setDepth(0);
    map.createLayer(HUB_LAYERS.detail, tileset, 0, 0)?.setDepth(1);
    const props = map.createLayer(HUB_LAYERS.props, tileset, 0, 0)?.setDepth(2);
    map.createLayer(HUB_LAYERS.overhead, tileset, 0, 0)?.setDepth(OVERHEAD_DEPTH);
    const collision = map.createLayer(HUB_LAYERS.collision, tileset, 0, 0);
    if (!collision) throw new Error("hub.json is missing the collision layer");
    // Water lives on ground, torches on props. Keep their clocks wrapping on a frame boundary.
    for (const layer of [ground, props]) layer?.setTimerResetPeriod(TILE_CLOCK_PERIOD);
    // The collision layer duplicates blocking tiles so it can stay invisible.
    collision.setVisible(false);
    collision.setCollisionByExclusion([-1]);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    const spawn = map.findObject(HUB_LAYERS.markers, (o) => o.name === "spawn");
    if (!spawn || spawn.x === undefined || spawn.y === undefined) {
      throw new Error("hub.json is missing the spawn marker");
    }

    const gateBodies = this.buildGates(map);
    this.buildPlayer(spawn.x, spawn.y);
    this.physics.add.collider(this.player, collision);
    this.physics.add.collider(this.player, gateBodies);

    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setRoundPixels(true);

    this.setupInput();
    this.atmosphere = new HubAtmosphere(this, map);
    // Sets reduceMotion and applies tile animation for the current preference.
    this.watchReducedMotion();

    this.unsubscribe.push(
      this.bridge.onCommand("guide:step", ({ step }) => {
        const enteringMove = step === "move" && this.guideStep !== "move";
        this.guideStep = step;
        if (enteringMove) {
          this.guideDistance = 0;
          this.guideMoved = false;
          this.guideAnchorX = this.player.x;
          this.guideAnchorY = this.player.y;
        }
        if (step !== "find") this.hintArrow?.setVisible(false);
      }),
      this.bridge.onCommand("ui:modal", ({ open }) => {
        this.modalOpen = open;
        this.player.setVelocity(0, 0);
        if (open) this.showIdle();
        if (!this.input.keyboard) return;
        this.input.keyboard.enabled = !open;
        // Drop keys that went up while Phaser was ignoring the keyboard, so closing a panel does not resume a drift.
        if (!open) this.input.keyboard.resetKeys();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hintArrow?.destroy();
      this.hintArrow = null;
      this.unsubscribe.forEach((u) => u());
      this.unsubscribe = [];
    });

    this.exposeDevProbe();
    this.bridge.emit("scene:ready", {});
  }

  /** Read-only state for browser verification; absent in production builds. */
  private exposeDevProbe() {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    const probe = () => ({
      playerX: this.player.x,
      playerY: this.player.y,
      playerScaleY: this.player.scaleY,
      facing: this.facing,
      frame: this.player.frame.name,
      walking: this.player.anims.isPlaying,
      nearGate: this.nearGate?.boss.id ?? null,
      glowScale: this.nearGate?.glow.scaleX ?? null,
      glowAlpha: this.nearGate?.glow.alpha ?? null,
      reduceMotion: this.reduceMotion,
      guideStep: this.guideStep,
      guideDistance: this.guideDistance,
      hintVisible: this.hintArrow?.visible ?? false,
      gates: this.gates.map((g) => ({ id: g.boss.id, zone: { x: g.zone.x, y: g.zone.y, w: g.zone.width, h: g.zone.height } })),
    });
    (window as unknown as { __bpHub?: () => ReturnType<typeof probe> }).__bpHub = probe;
    this.unsubscribe.push(() => {
      delete (window as unknown as { __bpHub?: unknown }).__bpHub;
    });
  }

  update(time: number) {
    this.atmosphere.update(time, this.reduceMotion);
    this.updateMovement();
    this.updateGateProximity();
    this.updateGuideHint(time);
  }

  /** Gates come from the Tiled `markers` layer; returns their blocking bodies. */
  private buildGates(map: Phaser.Tilemaps.Tilemap): Phaser.Physics.Arcade.StaticGroup {
    const bodies = this.physics.add.staticGroup();
    const markers = map.getObjectLayer(HUB_LAYERS.markers);
    if (!markers) throw new Error("hub.json is missing the markers layer");

    for (const obj of markers.objects) {
      if (obj.name !== "gate") continue;
      const bossId = obj.properties?.find((p: { name: string }) => p.name === "bossId")?.value;
      if (!isBossId(bossId)) throw new Error(`Gate marker ${obj.id} has no valid bossId`);
      if (obj.x === undefined || obj.y === undefined) continue;

      const boss = findBoss(bossId);
      const color = GATE_COLORS[boss.id];
      const cx = obj.x + GATE.width / 2;
      const base = obj.y + GATE.height;

      // Stone base and pillars, sized to the 16px tile grid.
      this.add.ellipse(cx, base + 2, GATE.width + 6, 8, 0x000000, 0.25).setDepth(1);
      this.add.rectangle(cx, base - 4, GATE.width, 8, 0x3a3d4a).setDepth(base);
      this.add.rectangle(cx, base - 8, GATE.width, 2, 0x50546a).setOrigin(0.5, 1).setDepth(base);
      this.add.rectangle(cx - 20, base - 18, 6, 28, 0x4a4e60).setDepth(base);
      this.add.rectangle(cx + 20, base - 18, 6, 28, 0x4a4e60).setDepth(base);
      this.add.rectangle(cx, base - 32, GATE.width + 4, 5, 0x4a4e60).setDepth(base);

      // Portal glow behind the portrait.
      const glow = this.add.circle(cx, base - 18, 16, color, boss.locked ? 0.18 : 0.32).setDepth(base - 1);
      this.add.circle(cx, base - 18, 13, 0x0b0e18, 0.85).setDepth(base - 1);

      if (boss.locked) {
        this.add.rectangle(cx, base - 16, 10, 8, 0x8a8fa3).setDepth(base + 1);
        this.add.circle(cx, base - 22, 4, 0x000000, 0).setStrokeStyle(2, 0x8a8fa3).setDepth(base + 1);
        this.add.rectangle(cx, base - 16, 2, 3, 0x2a2d38).setDepth(base + 2);
      } else {
        this.add.image(cx, base - 19, `portrait-${boss.id}`).setDepth(base + 1);
      }

      // Name plate. Rendered at 3x resolution so the zoomed camera keeps it crisp.
      const label = this.add
        .text(cx, base + 6, boss.locked ? "LOCKED" : boss.name.toUpperCase(), {
          fontFamily: "var(--font-dm-mono), monospace",
          fontSize: "6px",
          color: boss.locked ? "#9aa0b4" : "#f3f3f8",
          letterSpacing: 1,
          resolution: ZOOM,
        })
        .setOrigin(0.5, 0)
        .setDepth(LABEL_DEPTH + 1);
      const plate = this.add
        .rectangle(cx, label.y + label.height / 2, label.width + 6, label.height + 3, 0x0b0e18, 0.75)
        .setDepth(LABEL_DEPTH);
      plate.setStrokeStyle(1, color, 0.6);

      bodies.add(this.add.rectangle(cx, obj.y + GATE.height / 2, GATE.width, GATE.height).setVisible(false));

      this.gates.push({
        boss,
        // Approach zone: the path tiles directly below the gate.
        zone: new Phaser.Geom.Rectangle(obj.x - 8, base, GATE.width + 16, 40),
        glow,
      });
    }

    return bodies;
  }

  private registerWalk() {
    WALK_ROWS.forEach((facing, row) => {
      const key = `player-walk-${facing}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("player-walk", { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }

  private idleFrame(facing: Facing = this.facing): number {
    return WALK_ROWS.indexOf(facing) * 4 + IDLE_COLUMN;
  }

  private showIdle() {
    if (this.player.anims.isPlaying) this.player.anims.stop();
    this.player.setFrame(this.idleFrame());
  }

  private buildPlayer(x: number, y: number) {
    this.facing = "down";
    this.lastX = x;
    this.lastY = y;
    this.player = this.physics.add.sprite(x, y, "player-walk", this.idleFrame());
    this.player.setOrigin(0.5, FOOT_ROW / 32).setScale(1).setDepth(y);
    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 8).setOffset((this.player.width - 12) / 2, FOOT_ROW - 8);
    this.add.ellipse(0, 0, 14, 4, 0x000000, 0.3).setDepth(2).setName("player-shadow");
  }

  private setupInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys("W,A,S,D") as HubScene["wasd"];
    // Phaser calls preventDefault on every captured key page-wide, which
    // swallows Space on focused React buttons. Read keys without capturing.
    keyboard.clearCaptures();
    // Listen on the window, not Phaser. A focused music or sound button otherwise
    // keeps the key event off the canvas, so E never reaches the gate.
    const interact = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || this.modalOpen || !this.nearGate) return;
      const inspect = event.key === "e" || event.key === "E";
      const activatesFocusedControl = event.key === " " || event.key === "Enter";
      if (!inspect && !activatesFocusedControl) return;
      if (activatesFocusedControl && isPageControlTarget(event)) return;
      const target = event.target;
      if (inspect && target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      this.bridge.emit("gate:enter", { bossId: this.nearGate.boss.id });
    };
    window.addEventListener("keydown", interact, true);
    this.unsubscribe.push(() => window.removeEventListener("keydown", interact, true));
  }

  /** Mirror prefers-reduced-motion inside the canvas; CSS cannot reach Phaser tweens. */
  private watchReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      this.reduceMotion = query.matches;
      this.player.setScale(1);
      this.showIdle();
      if (this.nearGate) this.startGatePulse(this.nearGate);
      this.applyTileAnimation();
    };
    apply();
    query.addEventListener("change", apply);
    this.unsubscribe.push(() => query.removeEventListener("change", apply));
  }

  /**
   * Water and torch frames through Phaser's tileset animation data, which the
   * tilemap renderer reads every frame. Reduced motion clears the data so
   * those tiles rest on their first frame.
   */
  private applyTileAnimation() {
    const data = this.tileset.tileData as Record<number, TileAnimationData | undefined>;
    for (const { frames, durations } of TILE_ANIMATIONS) {
      const local = frames[0]! - this.tileset.firstgid;
      if (this.reduceMotion) {
        const entry = data[local];
        if (!entry) continue;
        delete entry.animation;
        delete entry.animationDuration;
        continue;
      }
      let startTime = 0;
      const animation = frames.map((gid, i) => {
        const frame = { tileid: gid - this.tileset.firstgid, duration: durations[i]!, startTime };
        startTime += durations[i]!;
        return frame;
      });
      data[local] = { ...data[local], animation, animationDuration: startTime };
    }
  }

  private startGatePulse(gate: Gate) {
    gate.pulse?.stop();
    gate.glow.setScale(1);
    const lo = gate.boss.locked ? 0.25 : 0.45;
    const hi = gate.boss.locked ? 0.35 : 0.7;
    gate.pulse = this.tweens.add({
      targets: gate.glow,
      // Reduced motion keeps the alpha cue and drops the scale movement.
      ...(this.reduceMotion ? {} : { scale: { from: 1, to: 1.18 } }),
      alpha: { from: lo, to: hi },
      duration: this.reduceMotion ? 1100 : 650,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private updateMovement() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.modalOpen || !this.cursors) {
      body.setVelocity(0, 0);
      this.showIdle();
      this.guideAnchorX = this.player.x;
      this.guideAnchorY = this.player.y;
      return;
    }

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(vx, vy) || 1;
    body.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);

    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    if (ax > ay) this.facing = vx > 0 ? "right" : "left";
    else if (ay > ax) this.facing = vy > 0 ? "down" : "up";

    // Arcade resolves the previous frame's velocity before this update, so position delta is real movement.
    const moved = Math.hypot(this.player.x - this.lastX, this.player.y - this.lastY) > 0.2;
    this.lastX = this.player.x;
    this.lastY = this.player.y;
    const pushing = vx !== 0 || vy !== 0;
    this.trackGuideTravel(pushing);
    if (this.reduceMotion || !pushing || !moved) this.showIdle();
    else {
      const key = `player-walk-${this.facing}`;
      if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== key) this.player.play(key);
    }

    this.player.setScale(1).setFlipX(false).setDepth(this.player.y);
    const shadow = this.children.getByName("player-shadow") as Phaser.GameObjects.Ellipse | null;
    shadow?.setPosition(this.player.x, this.player.y - 1);
  }

  /** Counts resolved travel during the move step. Walls, pauses, and idle frames do not add distance. */
  private trackGuideTravel(pushing: boolean) {
    if (this.guideStep !== "move" || this.guideMoved) return;
    const travel = Math.hypot(this.player.x - this.guideAnchorX, this.player.y - this.guideAnchorY);
    if (!this.modalOpen && pushing && travel > 0.2) {
      this.guideDistance += travel;
      if (this.guideDistance >= 24) {
        this.guideMoved = true;
        this.bridge.emit("guide:moved", {});
      }
    }
    this.guideAnchorX = this.player.x;
    this.guideAnchorY = this.player.y;
  }

  private updateGuideHint(time: number) {
    const show = this.guideStep === "find" && !this.modalOpen;
    if (!show) {
      this.hintArrow?.setVisible(false);
      return;
    }
    const target = this.chooseHintGate();
    if (!target) {
      this.hintArrow?.setVisible(false);
      return;
    }
    if (!this.hintArrow) {
      this.hintArrow = this.add.triangle(0, 0, 0, 5, 4, -3, -4, -3, 0xf5b04a).setDepth(LABEL_DEPTH - 1);
    }
    const centerX = target.zone.x + target.zone.width / 2;
    const centerY = target.zone.y + target.zone.height / 2;
    const angle = Math.atan2(centerY - this.player.y, centerX - this.player.x);
    this.hintArrow
      .setPosition(this.player.x + Math.cos(angle) * 16, this.player.y - 14 + Math.sin(angle) * 16)
      .setRotation(angle - Math.PI / 2)
      .setVisible(true)
      .setAlpha(this.reduceMotion ? 0.9 : 0.65 + Math.sin(time / 420) * 0.2);
  }

  /** Nearest unlocked gate, keeping the current target until another is clearly closer. */
  private chooseHintGate(): Gate | null {
    const unlocked = this.gates.filter((gate) => !gate.boss.locked);
    if (unlocked.length === 0) return null;
    const distance = (gate: Gate) => {
      const centerX = gate.zone.x + gate.zone.width / 2;
      const centerY = gate.zone.y + gate.zone.height / 2;
      return Math.hypot(centerX - this.player.x, centerY - this.player.y);
    };
    const nearest = [...unlocked].sort(
      (a, b) => distance(a) - distance(b) || a.boss.id.localeCompare(b.boss.id),
    )[0]!;
    if (this.hintTarget && unlocked.includes(this.hintTarget) && distance(this.hintTarget) <= distance(nearest) + 24) {
      return this.hintTarget;
    }
    this.hintTarget = nearest;
    return nearest;
  }

  private updateGateProximity() {
    const px = this.player.x;
    const py = this.player.y;
    const hit = this.gates.find((g) => Phaser.Geom.Rectangle.Contains(g.zone, px, py)) ?? null;
    if (hit === this.nearGate) return;

    if (this.nearGate) {
      this.nearGate.pulse?.stop();
      this.nearGate.pulse = undefined;
      this.nearGate.glow.setScale(1).setAlpha(this.nearGate.boss.locked ? 0.18 : 0.32);
    }
    this.nearGate = hit;
    if (hit) this.startGatePulse(hit);
    this.bridge.emit("gate:near", { bossId: hit?.boss.id ?? null });
  }
}
