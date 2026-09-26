import Phaser from "phaser";

const TILE = 16;
/** Shown with the largest integer zoom that still fits the whole room. */
const COLS = 16;
const ROWS = 12;
const BACKDROP = "#1a1612";
/** Tile ids match public/game/workshop-tiles.png, left to right, top to bottom. */
const G = {
  floor: 1,
  worn: 2,
  mat: 3,
  wallTop: 4,
  brick: 5,
  base: 6,
  furnace: 7,
  anvil: 9,
  bench: 10,
  crate: 11,
  ingots: 12,
  coal: 13,
  tools: 14,
  sword: 15,
  post: 16,
} as const;
const PLAYER_SPEED = 80;
const FOOT_ROW = 31;
const IDLE_COLUMN = 1;
const WALK_ROWS = ["down", "left", "right", "up"] as const;
type Facing = (typeof WALK_ROWS)[number];

const DOOR = { left: 7, right: 10 } as const;

export type FactoryHooks = {
  paused: () => boolean;
  onNear: (near: boolean) => void;
  onDoor: (near: boolean) => void;
  onTalk: () => void;
  onLeave: () => void;
  onStrike: () => void;
  onReady: () => void;
  onError: () => void;
};

function factoryMap() {
  const ground = Array<number>(COLS * ROWS).fill(G.floor);
  const props = Array<number>(COLS * ROWS).fill(0);
  const at = (layer: number[], x: number, y: number, gid: number) => {
    layer[y * COLS + x] = gid;
  };
  for (let x = 0; x < COLS; x += 1) {
    at(ground, x, 0, G.wallTop);
    at(ground, x, 1, G.brick);
    if (x < DOOR.left || x >= DOOR.right) at(ground, x, ROWS - 1, G.base);
  }
  for (let y = 0; y < ROWS; y += 1) {
    at(ground, 0, y, G.post);
    at(ground, COLS - 1, y, G.post);
  }
  for (const [x, y] of [[3, 7], [12, 7], [4, 9], [11, 8]] as const) at(ground, x, y, G.worn);
  for (const [x, y] of [[8, 5], [8, 6]] as const) at(ground, x, y, G.mat);
  at(props, 6, 2, G.furnace);
  at(props, 4, 3, G.coal);
  at(props, 8, 5, G.anvil);
  at(props, 11, 3, G.bench);
  at(props, 12, 3, G.bench);
  at(props, 14, 1, G.tools);
  at(props, 14, 4, G.sword);
  at(props, 1, 8, G.crate);
  at(props, 2, 9, G.crate);
  at(props, 13, 8, G.ingots);

  const layer = (name: string, data: number[]) => ({
    id: name === "ground" ? 1 : 2,
    name,
    type: "tilelayer",
    width: COLS,
    height: ROWS,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });

  return {
    compressionlevel: -1,
    width: COLS,
    height: ROWS,
    tilewidth: TILE,
    tileheight: TILE,
    infinite: false,
    orientation: "orthogonal",
    renderorder: "right-down",
    type: "map",
    version: "1.10",
    tilesets: [{
      firstgid: 1,
      name: "workshop",
      image: "workshop-tiles.png",
      imagewidth: 128,
      imageheight: 32,
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: 16,
      columns: 8,
      margin: 0,
      spacing: 0,
    }],
    layers: [layer("ground", ground), layer("props", props)],
  };
}

/**
 * A small warm smithy. Walk up to the blacksmith and talk, or leave by the door.
 */
export class FactoryScene extends Phaser.Scene {
  private hooks!: FactoryHooks;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private facing: Facing = "down";
  private lastX = 0;
  private lastY = 0;
  private nearSmith = false;
  private nearDoor = false;
  private leaving = false;
  private reduceMotion = false;
  private smithZone!: Phaser.Geom.Rectangle;
  private smith!: Phaser.Physics.Arcade.Sprite;
  private highlight!: Phaser.GameObjects.Ellipse;
  private nameLabel!: Phaser.GameObjects.Text;
  private namePlate!: Phaser.GameObjects.Rectangle;
  private readonly onResize = () => this.fitCamera();

  constructor() {
    super("factory");
  }

  init(data: { hooks: FactoryHooks }) {
    this.hooks = data.hooks;
  }

  preload() {
    this.load.on("loaderror", () => this.hooks.onError());
    this.load.image("tiles", "/game/workshop-tiles.png");
    this.load.image("furnace-glow", "/game/workshop-glow.png");
    this.load.spritesheet("player-walk", "/game/player-compact-walk.png", { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("blacksmith", "/game/blacksmith.png", { frameWidth: 32, frameHeight: 32 });
    this.load.tilemapTiledJSON("factory", factoryMap());
  }

  create() {
    this.registerWalk();
    const map = this.make.tilemap({ key: "factory" });
    const tileset = map.addTilesetImage("workshop", "tiles");
    if (!tileset) {
      this.hooks.onError();
      return;
    }
    map.createLayer("ground", tileset, 0, 0)?.setDepth(0);
    map.createLayer("props", tileset, 0, 0)?.setDepth(2);

    const worldW = map.widthInPixels;
    const worldH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor(BACKDROP);

    const smithX = 8 * TILE + 8;
    const smithY = 4 * TILE;
    this.smithZone = new Phaser.Geom.Rectangle(7 * TILE, 6 * TILE, 3 * TILE, 2 * TILE);
    this.highlight = this.add.ellipse(smithX, smithY, 18, 6, 0xffc56a, 0).setDepth(smithY - 1);
    this.smith = this.physics.add.sprite(smithX, smithY, "blacksmith", 0);
    this.smith.setOrigin(0.5, FOOT_ROW / 32).setDepth(smithY).setImmovable(true);
    const smithBody = this.smith.body as Phaser.Physics.Arcade.Body;
    smithBody.setSize(14, 10).setOffset((this.smith.width - 14) / 2, FOOT_ROW - 10);
    this.nameLabel = this.add
      .text(smithX, smithY - 26, "BLACKSMITH", {
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize: "5px",
        color: "#f3e2c4",
        resolution: 1,
      })
      .setOrigin(0.5, 1)
      .setDepth(10_000);
    this.namePlate = this.add
      .rectangle(smithX, smithY - 26 - this.nameLabel.height / 2, this.nameLabel.width + 6, this.nameLabel.height + 3, 0x2a2118, 0.92)
      .setStrokeStyle(1, 0xc48a45)
      .setDepth(9_999);

    const glow = this.add.image(6 * TILE + 8, 2 * TILE + 8, "furnace-glow").setDepth(3);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduceMotion = motion.matches;
    if (this.reduceMotion) {
      glow.setAlpha(0.7);
      this.smith.setFrame(0);
    } else {
      this.tweens.add({
        targets: glow,
        alpha: 0.45,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      glow.setAlpha(0.85);
      this.smith.play("smith-hammer");
      this.smith.on("animationupdate", (_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
        if (frame.index !== 2) return;
        this.burstSparks(8 * TILE + 8, 5 * TILE + 8);
        this.hooks.onStrike();
      });
    }

    const spawnX = 8 * TILE + 8;
    const spawnY = 9 * TILE;
    this.facing = "up";
    this.lastX = spawnX;
    this.lastY = spawnY;
    this.player = this.physics.add.sprite(spawnX, spawnY, "player-walk", this.idleFrame());
    this.player.setOrigin(0.5, FOOT_ROW / 32).setDepth(spawnY).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 8).setOffset((this.player.width - 12) / 2, FOOT_ROW - 8);
    this.add.ellipse(spawnX, spawnY - 1, 14, 4, 0x000000, 0.3).setDepth(2).setName("player-shadow");
    this.physics.add.collider(this.player, this.smith);

    const blocks = this.physics.add.staticGroup();
    const block = (tx: number, ty: number) => {
      blocks.add(this.add.rectangle(tx * TILE + 8, ty * TILE + 8, 16, 16).setVisible(false));
    };
    for (let x = 0; x < COLS; x += 1) {
      block(x, 0);
      block(x, 1);
      if (x < DOOR.left || x >= DOOR.right) block(x, ROWS - 1);
    }
    for (let y = 2; y < ROWS - 1; y += 1) {
      block(0, y);
      block(COLS - 1, y);
    }
    for (const [tx, ty] of [[6, 2], [4, 3], [8, 5], [11, 3], [12, 3], [14, 1], [14, 4], [1, 8], [2, 9], [13, 8]] as const) {
      block(tx, ty);
    }
    this.physics.add.collider(this.player, blocks);

    this.cameras.main.stopFollow();
    this.cameras.main.setRoundPixels(true);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = keyboard.addKeys("W,A,S,D") as FactoryScene["wasd"];
      keyboard.clearCaptures();
    }
    const interact = (event: KeyboardEvent) => {
      if (event.repeat || this.hooks.paused() || !this.nearSmith) return;
      if (event.key !== "e" && event.key !== "E") return;
      const target = event.target;
      if (target instanceof Element && target.closest("button, a, input, select, textarea, [role='button']")) return;
      event.preventDefault();
      this.hooks.onTalk();
    };
    window.addEventListener("keydown", interact, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
      window.removeEventListener("keydown", interact, true);
    });

    this.hooks.onReady();
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.hooks.paused() || !this.cursors) {
      body.setVelocity(0, 0);
      this.showIdle();
      this.lastX = this.player.x;
      this.lastY = this.player.y;
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

    const moved = Math.hypot(this.player.x - this.lastX, this.player.y - this.lastY) > 0.2;
    this.lastX = this.player.x;
    this.lastY = this.player.y;
    const pushing = vx !== 0 || vy !== 0;
    if (this.reduceMotion || !pushing || !moved) this.showIdle();
    else {
      const key = `player-walk-${this.facing}`;
      if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== key) this.player.play(key);
    }
    this.player.setDepth(this.player.y);
    const shadow = this.children.getByName("player-shadow") as Phaser.GameObjects.Ellipse | null;
    shadow?.setPosition(this.player.x, this.player.y - 1);

    const near = this.smithZone.contains(this.player.x, this.player.y);
    if (near !== this.nearSmith) {
      this.nearSmith = near;
      this.hooks.onNear(near);
      this.highlight.setAlpha(near ? 0.55 : 0);
      if (near) this.smith.setTint(0xfff1d0);
      else this.smith.clearTint();
    }

    const inDoor =
      this.player.x >= DOOR.left * TILE &&
      this.player.x <= DOOR.right * TILE &&
      this.player.y >= (ROWS - 2) * TILE;
    if (inDoor !== this.nearDoor) {
      this.nearDoor = inDoor;
      this.hooks.onDoor(inDoor);
    }
    if (!this.leaving && this.player.y >= (ROWS - 1) * TILE && inDoor) {
      this.leaving = true;
      body.setVelocity(0, 0);
      this.hooks.onLeave();
    }
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
    if (!this.anims.exists("smith-hammer")) {
      this.anims.create({
        key: "smith-hammer",
        frames: [
          { key: "blacksmith", frame: 0, duration: 980 },
          { key: "blacksmith", frame: 1, duration: 260 },
          { key: "blacksmith", frame: 2, duration: 110 },
        ],
        repeat: -1,
      });
    }
  }

  /** A few pixels jump off the anvil for one strike, then fade. */
  private burstSparks(x: number, y: number) {
    for (let i = 0; i < 4; i += 1) {
      const spark = this.add.rectangle(x + (i - 1.5) * 2, y, 2, 2, i % 2 === 0 ? 0xffd278 : 0xff842a).setDepth(y + 2);
      this.tweens.add({
        targets: spark,
        y: y - 6 - i,
        alpha: 0,
        duration: 220,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private idleFrame(facing: Facing = this.facing): number {
    return WALK_ROWS.indexOf(facing) * 4 + IDLE_COLUMN;
  }

  private showIdle() {
    if (this.player.anims.isPlaying) this.player.anims.stop();
    this.player.setFrame(this.idleFrame());
  }

  private fitCamera() {
    const camera = this.cameras.main;
    const worldW = COLS * TILE;
    const worldH = ROWS * TILE;
    const zoom = Math.max(1, Math.min(Math.floor(this.scale.width / worldW) || 1, Math.floor(this.scale.height / worldH) || 1));
    camera.setZoom(zoom);
    const viewW = this.scale.width / zoom;
    const viewH = this.scale.height / zoom;
    const scrollX = (worldW - viewW) / 2;
    const scrollY = (worldH - viewH) / 2;
    camera.setBounds(scrollX, scrollY, viewW, viewH);
    camera.setScroll(scrollX, scrollY);
    this.nameLabel?.setResolution(1);
    if (this.nameLabel && this.namePlate) {
      this.namePlate.setSize(this.nameLabel.width + 6, this.nameLabel.height + 3);
      this.namePlate.setPosition(this.nameLabel.x, this.nameLabel.y - this.nameLabel.height / 2);
    }
  }
}
