import Phaser from "phaser";
import { BOSSES, type BossDefinition, type BossId } from "./bosses";
import type { GameBridge } from "./bridge";
import { createGroundTextures, makeCroppedTexture } from "./textures";

export const WORLD = { width: 1440, height: 900 } as const;
const SPAWN = { x: 720, y: 760 } as const;
const PLAYER_SPEED = 190;
/** Labels sit above every y-sorted prop. */
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

export class HubScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private gates: Gate[] = [];
  private nearGate: Gate | null = null;
  private modalOpen = false;
  private reduceMotion = false;
  private unsubscribe: (() => void)[] = [];

  constructor() {
    super("hub");
  }

  init(data: { bridge: GameBridge }) {
    this.bridge = data.bridge;
  }

  preload() {
    this.load.image("player-master", "/images/player-you-master.png");
    for (const boss of BOSSES) {
      if (boss.portrait) this.load.image(`portrait-master-${boss.id}`, boss.portrait);
    }
  }

  create() {
    createGroundTextures(this);
    // Strip the embedded "YOU" label and size the player for the hub.
    makeCroppedTexture(this, "player", "player-master", { x: 330, y: 40, w: 600, h: 1010 }, 72);
    makeCroppedTexture(this, "portrait-cat", "portrait-master-cat", { x: 120, y: 60, w: 880, h: 1240 }, 96);
    makeCroppedTexture(this, "portrait-macro-whale", "portrait-master-macro-whale", { x: 160, y: 80, w: 940, h: 940 }, 96);

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.buildGround();
    const obstacles = this.buildObstacles();
    this.buildGates(obstacles);
    this.buildPlayer();
    this.physics.add.collider(this.player, obstacles);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setRoundPixels(true);

    this.setupInput();
    this.watchReducedMotion();

    this.unsubscribe.push(
      this.bridge.onCommand("ui:modal", ({ open }) => {
        this.modalOpen = open;
        if (open) this.player.setVelocity(0, 0);
        // Hand the keyboard to React while a panel or control owns focus.
        if (this.input.keyboard) this.input.keyboard.enabled = !open;
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
      playerScaleY: this.player.scaleY,
      nearGate: this.nearGate?.boss.id ?? null,
      glowScale: this.nearGate?.glow.scaleX ?? null,
      glowAlpha: this.nearGate?.glow.alpha ?? null,
      reduceMotion: this.reduceMotion,
    });
    (window as unknown as { __bpHub?: () => ReturnType<typeof probe> }).__bpHub = probe;
    this.unsubscribe.push(() => {
      delete (window as unknown as { __bpHub?: unknown }).__bpHub;
    });
  }

  update(time: number) {
    this.updateMovement(time);
    this.updateGateProximity();
  }

  private buildGround() {
    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, "tile-grass").setOrigin(0).setDepth(0);

    const path = (x: number, y: number, w: number, h: number) =>
      this.add.tileSprite(x, y, w, h, "tile-path").setOrigin(0).setDepth(1);

    // Spawn to plaza, plaza to each gate.
    path(690, 520, 60, 300);
    this.add.tileSprite(560, 400, 320, 150, "tile-plaza").setOrigin(0).setDepth(1);
    path(290, 330, 60, 120);
    path(290, 440, 300, 50);
    path(1090, 330, 60, 120);
    path(850, 440, 300, 50);
    path(690, 230, 60, 180);

    // Pond in the lower-left as decor.
    this.add.ellipse(190, 720, 260, 150, 0x2b5a8a).setDepth(1);
    this.add.ellipse(190, 720, 220, 115, 0x3872ad).setDepth(1);
    this.add.ellipse(160, 700, 60, 22, 0x6fa8dc, 0.6).setDepth(1);
  }

  private buildObstacles(): Phaser.Physics.Arcade.StaticGroup {
    const group = this.physics.add.staticGroup();

    const tree = (x: number, y: number, r = 34) => {
      this.add.ellipse(x, y + 4, r * 2.1, r * 0.9, 0x000000, 0.22).setDepth(1);
      this.add.rectangle(x, y + 8, 14, 22, 0x5a3b21).setDepth(y);
      this.add.circle(x, y - 18, r, 0x2b6b3a).setDepth(y);
      this.add.circle(x - 10, y - 26, r * 0.62, 0x3a8a4b).setDepth(y);
      const body = this.add.rectangle(x, y + 6, r * 1.2, 24).setVisible(false);
      group.add(body);
    };
    const rock = (x: number, y: number, w = 44, h = 30) => {
      this.add.ellipse(x, y + h * 0.35, w * 1.15, h * 0.6, 0x000000, 0.22).setDepth(1);
      this.add.ellipse(x, y, w, h, 0x7a7f8f).setDepth(y);
      this.add.ellipse(x - w * 0.15, y - h * 0.18, w * 0.5, h * 0.4, 0x9aa0b1).setDepth(y);
      const body = this.add.rectangle(x, y + 4, w * 0.9, h * 0.7).setVisible(false);
      group.add(body);
    };

    [
      [120, 180], [200, 120], [1300, 160], [1370, 260], [1330, 520], [90, 460],
      [480, 700], [560, 820], [1000, 780], [1150, 700], [440, 200], [1000, 200],
      [860, 640], [580, 640],
    ].forEach(([x, y]) => tree(x, y));
    [[420, 560], [1020, 560], [1250, 820], [60, 320]].forEach(([x, y]) => rock(x, y));

    // Pond collision.
    const pond = this.add.rectangle(190, 720, 240, 120).setVisible(false);
    group.add(pond);

    return group;
  }

  private buildGates(obstacles: Phaser.Physics.Arcade.StaticGroup) {
    for (const boss of BOSSES) {
      const { x, y } = boss.gate;
      const color = GATE_COLORS[boss.id];

      // Stone base and pillars.
      this.add.ellipse(x, y + 46, 190, 40, 0x000000, 0.25).setDepth(1);
      this.add.rectangle(x, y + 30, 160, 34, 0x3a3d4a).setDepth(y + 30);
      this.add.rectangle(x, y + 30, 160, 6, 0x50546a).setOrigin(0.5, 1).setDepth(y + 30);
      this.add.rectangle(x - 66, y - 30, 22, 110, 0x4a4e60).setDepth(y + 30);
      this.add.rectangle(x + 66, y - 30, 22, 110, 0x4a4e60).setDepth(y + 30);
      this.add.rectangle(x, y - 90, 170, 20, 0x4a4e60).setDepth(y + 30);

      // Portal glow behind the portrait.
      const glow = this.add.circle(x, y - 30, 58, color, boss.locked ? 0.18 : 0.32).setDepth(y + 29);
      this.add.circle(x, y - 30, 50, 0x0b0e18, 0.85).setDepth(y + 29);

      if (boss.locked) {
        // Padlock.
        this.add.rectangle(x, y - 22, 34, 28, 0x8a8fa3).setDepth(y + 31);
        this.add.circle(x, y - 42, 12, 0x000000, 0).setStrokeStyle(6, 0x8a8fa3).setDepth(y + 31);
        this.add.rectangle(x, y - 22, 6, 10, 0x2a2d38).setDepth(y + 32);
      } else {
        this.add.image(x, y - 34, `portrait-${boss.id}`).setDepth(y + 31);
      }

      // Name plate.
      const label = this.add
        .text(x, y + 62, boss.locked ? "LOCKED" : boss.name.toUpperCase(), {
          fontFamily: "var(--font-dm-mono), monospace",
          fontSize: "12px",
          color: boss.locked ? "#9aa0b4" : "#f3f3f8",
          letterSpacing: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(LABEL_DEPTH + 1);
      const plate = this.add
        .rectangle(x, label.y + label.height / 2, label.width + 20, label.height + 8, 0x0b0e18, 0.75)
        .setDepth(LABEL_DEPTH);
      plate.setStrokeStyle(1, color, 0.6);

      // Collision with the gate structure.
      const body = this.add.rectangle(x, y + 8, 170, 80).setVisible(false);
      obstacles.add(body);

      this.gates.push({
        boss,
        zone: new Phaser.Geom.Rectangle(x - 100, y + 50, 200, 110),
        glow,
      });
    }
  }

  private buildPlayer() {
    this.player = this.physics.add.sprite(SPAWN.x, SPAWN.y, "player");
    this.player.setOrigin(0.5, 1).setDepth(SPAWN.y);
    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(26, 16).setOffset((this.player.width - 26) / 2, this.player.height - 16);
    this.add.ellipse(0, 0, 36, 12, 0x000000, 0.3).setDepth(2).setName("player-shadow");
  }

  private setupInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys("W,A,S,D") as HubScene["wasd"];
    // Phaser calls preventDefault on every captured key page-wide, which
    // swallows Space on focused React buttons. Read keys without capturing.
    keyboard.clearCaptures();
    // Event-driven so a quick tap registers regardless of frame timing.
    const interact = () => {
      if (this.modalOpen || !this.nearGate) return;
      this.bridge.emit("gate:enter", { bossId: this.nearGate.boss.id });
    };
    keyboard.on("keydown-E", interact);
    keyboard.on("keydown-ENTER", interact);
    keyboard.on("keydown-SPACE", interact);
  }

  /** Mirror prefers-reduced-motion inside the canvas; CSS cannot reach Phaser tweens. */
  private watchReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      this.reduceMotion = query.matches;
      this.player.setScale(1, 1);
      if (this.nearGate) this.startGatePulse(this.nearGate);
    };
    apply();
    query.addEventListener("change", apply);
    this.unsubscribe.push(() => query.removeEventListener("change", apply));
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

  private updateMovement(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.modalOpen || !this.cursors) {
      body.setVelocity(0, 0);
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

    if (vx !== 0) this.player.setFlipX(vx < 0);

    // Walk bob until a real walking sheet exists. Decorative, so it obeys reduced motion.
    const moving = vx !== 0 || vy !== 0;
    this.player.setScale(1, moving && !this.reduceMotion ? 1 + Math.sin(time / 70) * 0.03 : 1);
    this.player.setDepth(this.player.y);

    const shadow = this.children.getByName("player-shadow") as Phaser.GameObjects.Ellipse | null;
    shadow?.setPosition(this.player.x, this.player.y - 2);
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
