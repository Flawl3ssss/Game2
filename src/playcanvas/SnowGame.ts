import * as pc from 'playcanvas';

export interface SnowGameUi {
  setDistance(value: number): void;
  setCoins(value: number): void;
  hideMenu(): void;
  showMenu(title: string, copy: string, buttonLabel: string): void;
  showControlHint(): void;
}

type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone';
type ItemKind = 'coin' | 'obstacle' | 'boost' | 'ramp' | 'tree';

interface PooledItem {
  readonly entity: pc.Entity;
  readonly kind: ItemKind;
  used: boolean;
}

interface WorldChunk {
  readonly root: pc.Entity;
  readonly coins: PooledItem[];
  readonly obstacles: PooledItem[];
  readonly boosts: PooledItem[];
  readonly ramps: PooledItem[];
  readonly trees: PooledItem[];
  absoluteIndex: number;
}

interface RunState {
  running: boolean;
  targetX: number;
  playerX: number;
  playerY: number;
  jumpVelocity: number;
  baseSpeed: number;
  boostTime: number;
  distance: number;
  coins: number;
  nextChunkIndex: number;
}

const CHUNK_LENGTH = 24;
const CHUNK_COUNT = 8;
const PLAYER_Z = 3.2;
const TRACK_HALF_WIDTH = 5.15;
const MAX_PLAYER_X = 4.45;
const GRAVITY = 17;

export class SnowGame {
  private readonly app: pc.Application;
  private readonly ui: SnowGameUi;
  private readonly canvas: HTMLCanvasElement;
  private readonly chunks: WorldChunk[] = [];
  private readonly sled: pc.Entity;
  private readonly camera: pc.Entity;
  private readonly state: RunState = {
    running: false,
    targetX: 0,
    playerX: 0,
    playerY: 0,
    jumpVelocity: 0,
    baseSpeed: 11,
    boostTime: 0,
    distance: 0,
    coins: 0,
    nextChunkIndex: CHUNK_COUNT,
  };

  private pointerActive = false;
  private leftPressed = false;
  private rightPressed = false;
  private resumeAfterVisibility = false;

  public constructor(canvas: HTMLCanvasElement, ui: SnowGameUi) {
    this.canvas = canvas;
    this.ui = ui;
    this.app = new pc.Application(canvas);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.72, 0.79, 0.9);

    const scene = this.createScene();
    this.sled = scene.sled;
    this.camera = scene.camera;

    this.createWorld();
    this.bindInput();
    this.app.on('update', (dt: number) => this.update(Math.min(dt, 0.05)));
    this.app.start();
  }

  public startRun(): void {
    this.resetRun();
    this.state.running = true;
    this.ui.hideMenu();
    this.ui.showControlHint();
  }

  private createScene(): { sled: pc.Entity; camera: pc.Entity } {
    const snow = this.createMaterial(new pc.Color(0.91, 0.97, 1), 0.18, 0);
    const red = this.createMaterial(new pc.Color(0.92, 0.055, 0.045), 0.58, 0.08);
    const dark = this.createMaterial(new pc.Color(0.035, 0.075, 0.12), 0.42, 0.22);
    const sky = new pc.Color(0.43, 0.76, 0.96);

    const camera = new pc.Entity('Camera');
    camera.addComponent('camera', {
      clearColor: sky,
      farClip: 210,
      nearClip: 0.1,
      fov: 57,
    });
    camera.setPosition(0, 6.6, 14.4);
    camera.lookAt(0, 0.4, -17);
    this.app.root.addChild(camera);

    const sun = new pc.Entity('Sun');
    sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.965, 0.9),
      intensity: 1.5,
      castShadows: true,
      shadowDistance: 72,
      shadowResolution: 1024,
    });
    sun.setEulerAngles(42, 32, 0);
    this.app.root.addChild(sun);

    const fill = new pc.Entity('SkyFill');
    fill.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.45, 0.63, 0.85),
      intensity: 0.34,
      castShadows: false,
    });
    fill.setEulerAngles(55, -125, 0);
    this.app.root.addChild(fill);

    const sled = new pc.Entity('PlayerSled');
    this.app.root.addChild(sled);
    this.createPrimitive('SledBody', 'box', red, new pc.Vec3(1.38, 0.3, 2.35), new pc.Vec3(0, 0.52, 0), sled);
    this.createPrimitive('Seat', 'box', dark, new pc.Vec3(0.94, 0.28, 0.94), new pc.Vec3(0, 0.82, 0.2), sled);
    this.createPrimitive('RunnerLeft', 'box', dark, new pc.Vec3(0.13, 0.13, 2.72), new pc.Vec3(-0.57, 0.25, 0), sled);
    this.createPrimitive('RunnerRight', 'box', dark, new pc.Vec3(0.13, 0.13, 2.72), new pc.Vec3(0.57, 0.25, 0), sled);
    sled.setPosition(0, 0, PLAYER_Z);

    this.createPrimitive(
      'StartSnow',
      'box',
      snow,
      new pc.Vec3(TRACK_HALF_WIDTH * 2.4, 0.5, CHUNK_LENGTH),
      new pc.Vec3(0, -0.36, CHUNK_LENGTH * 0.9),
      this.app.root,
    );

    return { sled, camera };
  }

  private createWorld(): void {
    for (let slot = 0; slot < CHUNK_COUNT; slot += 1) {
      const chunk = this.createChunk(slot);
      chunk.root.setPosition(0, 0, -slot * CHUNK_LENGTH);
      this.rebuildChunk(chunk, slot);
      this.chunks.push(chunk);
    }
  }

  private createChunk(slot: number): WorldChunk {
    const snow = this.createMaterial(new pc.Color(0.91, 0.97, 1), 0.16, 0);
    const ice = this.createMaterial(new pc.Color(0.2, 0.78, 1), 0.84, 0.22, new pc.Color(0.02, 0.2, 0.32));
    const gold = this.createMaterial(new pc.Color(1, 0.58, 0.015), 0.8, 0.68, new pc.Color(0.16, 0.07, 0));
    const stone = this.createMaterial(new pc.Color(0.29, 0.34, 0.41), 0.13, 0.04);
    const trunk = this.createMaterial(new pc.Color(0.3, 0.135, 0.04), 0.16, 0);
    const pine = this.createMaterial(new pc.Color(0.025, 0.25, 0.14), 0.15, 0);
    const ramp = this.createMaterial(new pc.Color(0.18, 0.49, 0.78), 0.34, 0.04);

    const root = new pc.Entity(`Chunk-${slot}`);
    this.app.root.addChild(root);

    this.createPrimitive(
      'SnowSurface',
      'box',
      snow,
      new pc.Vec3(TRACK_HALF_WIDTH * 2.5, 0.5, CHUNK_LENGTH),
      new pc.Vec3(0, -0.36, 0),
      root,
    );

    const coins = Array.from({ length: 8 }, (_, index) => {
      const entity = this.createPrimitive(
        `Coin-${index}`,
        'cylinder',
        gold,
        new pc.Vec3(0.48, 0.12, 0.48),
        new pc.Vec3(0, 0, 0),
        root,
      );
      entity.setLocalEulerAngles(0, 0, 90);
      return this.makePooledItem(entity, 'coin');
    });

    const obstacles = Array.from({ length: 2 }, (_, index) => {
      const entity = this.createPrimitive(
        `Rock-${index}`,
        'sphere',
        stone,
        new pc.Vec3(1.16, 0.88, 1.02),
        new pc.Vec3(0, 0, 0),
        root,
      );
      return this.makePooledItem(entity, 'obstacle');
    });

    const boosts = [this.makePooledItem(
      this.createPrimitive('Boost', 'box', ice, new pc.Vec3(1.7, 0.08, 3.3), new pc.Vec3(0, 0, 0), root),
      'boost',
    )];

    const ramps = [this.makePooledItem(
      this.createPrimitive('Ramp', 'box', ramp, new pc.Vec3(2.5, 0.28, 2.7), new pc.Vec3(0, 0, 0), root),
      'ramp',
    )];
    ramps[0].entity.setLocalEulerAngles(-12, 0, 0);

    const trees = Array.from({ length: 6 }, (_, index) => {
      const tree = new pc.Entity(`Pine-${index}`);
      root.addChild(tree);
      this.createPrimitive('Trunk', 'cylinder', trunk, new pc.Vec3(0.28, 1.45, 0.28), new pc.Vec3(0, 0.68, 0), tree);
      this.createPrimitive('CrownLow', 'cone', pine, new pc.Vec3(1.65, 2.05, 1.65), new pc.Vec3(0, 2, 0), tree);
      this.createPrimitive('CrownHigh', 'cone', pine, new pc.Vec3(1.12, 1.65, 1.12), new pc.Vec3(0, 3.12, 0), tree);
      return this.makePooledItem(tree, 'tree');
    });

    return {
      root,
      coins,
      obstacles,
      boosts,
      ramps,
      trees,
      absoluteIndex: slot,
    };
  }

  private rebuildChunk(chunk: WorldChunk, absoluteIndex: number): void {
    chunk.absoluteIndex = absoluteIndex;
    const random = this.createRandom(absoluteIndex * 7919 + 113);
    const allItems = [...chunk.coins, ...chunk.obstacles, ...chunk.boosts, ...chunk.ramps, ...chunk.trees];

    for (const item of allItems) {
      item.entity.enabled = false;
      item.used = false;
    }

    for (let row = 0; row < 6; row += 1) {
      if (random() < 0.22) continue;
      const coin = chunk.coins[row];
      coin.entity.enabled = true;
      coin.entity.setLocalPosition((random() - 0.5) * 7.6, 0.93, -9.5 + row * 3.6);
    }

    if (absoluteIndex > 0) {
      const obstacleCount = absoluteIndex > 6 && random() > 0.6 ? 2 : 1;
      for (let index = 0; index < obstacleCount; index += 1) {
        const obstacle = chunk.obstacles[index];
        obstacle.entity.enabled = true;
        obstacle.entity.setLocalPosition((random() - 0.5) * 7.8, 0.55, -5 + index * 7 + random() * 2.5);
        obstacle.entity.setLocalEulerAngles(random() * 14, random() * 180, random() * 14);
      }
    }

    if (absoluteIndex > 1 && random() > 0.62) {
      const boost = chunk.boosts[0];
      boost.entity.enabled = true;
      boost.entity.setLocalPosition((random() - 0.5) * 6.8, 0.04, 5.5 + (random() - 0.5) * 4);
    }

    if (absoluteIndex > 2 && random() > 0.72) {
      const rampItem = chunk.ramps[0];
      rampItem.entity.enabled = true;
      rampItem.entity.setLocalPosition((random() - 0.5) * 6.7, 0.15, -1 + (random() - 0.5) * 4);
    }

    for (let index = 0; index < chunk.trees.length; index += 1) {
      const tree = chunk.trees[index];
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      tree.entity.enabled = true;
      tree.entity.setLocalPosition(
        side * (TRACK_HALF_WIDTH + 1.1 + random() * 2.5),
        0,
        -9 + row * 8 + random() * 2,
      );
      const scale = 0.72 + random() * 0.5;
      tree.entity.setLocalScale(scale, scale, scale);
      tree.entity.setLocalEulerAngles(0, random() * 360, 0);
    }
  }

  private update(dt: number): void {
    if (!this.state.running) {
      this.animateIdle(dt);
      return;
    }

    this.updateInput(dt);
    this.updatePlayer(dt);
    this.updateWorld(dt);
    this.updateItems(dt);
    this.updateCamera(dt);
    this.ui.setDistance(this.state.distance);
  }

  private updateInput(dt: number): void {
    if (this.leftPressed !== this.rightPressed) {
      const direction = this.leftPressed ? -1 : 1;
      this.state.targetX = pc.math.clamp(this.state.targetX + direction * dt * 7.5, -MAX_PLAYER_X, MAX_PLAYER_X);
    }
  }

  private updatePlayer(dt: number): void {
    const response = 1 - Math.exp(-dt * 9.5);
    this.state.playerX += (this.state.targetX - this.state.playerX) * response;

    if (this.state.playerY > 0 || this.state.jumpVelocity > 0) {
      this.state.jumpVelocity -= GRAVITY * dt;
      this.state.playerY += this.state.jumpVelocity * dt;
      if (this.state.playerY <= 0) {
        this.state.playerY = 0;
        this.state.jumpVelocity = 0;
      }
    }

    const lean = (this.state.targetX - this.state.playerX) * -6.2;
    const pitch = this.state.playerY > 0 ? -8 + this.state.jumpVelocity * -0.7 : 0;
    this.sled.setPosition(this.state.playerX, this.state.playerY, PLAYER_Z);
    this.sled.setEulerAngles(pitch, 0, lean);
  }

  private updateWorld(dt: number): void {
    const difficultySpeed = Math.min(13, this.state.distance * 0.0024);
    this.state.baseSpeed = 11 + difficultySpeed;
    this.state.boostTime = Math.max(0, this.state.boostTime - dt);
    const speed = this.state.baseSpeed + (this.state.boostTime > 0 ? 6.5 : 0);
    this.state.distance += speed * dt;

    let furthestZ = Number.POSITIVE_INFINITY;
    for (const chunk of this.chunks) {
      furthestZ = Math.min(furthestZ, chunk.root.getPosition().z);
    }

    for (const chunk of this.chunks) {
      chunk.root.translateLocal(0, 0, speed * dt);
      if (chunk.root.getPosition().z > CHUNK_LENGTH) {
        chunk.root.setPosition(0, 0, furthestZ - CHUNK_LENGTH);
        furthestZ -= CHUNK_LENGTH;
        this.rebuildChunk(chunk, this.state.nextChunkIndex);
        this.state.nextChunkIndex += 1;
      }
    }
  }

  private updateItems(dt: number): void {
    for (const chunk of this.chunks) {
      for (const coin of chunk.coins) {
        if (!coin.entity.enabled || coin.used) continue;
        coin.entity.rotateLocal(0, 190 * dt, 0);
        const position = coin.entity.getPosition();
        if (this.isClose(position, 0.82, 1.05)) {
          coin.used = true;
          coin.entity.enabled = false;
          this.state.coins += 1;
          this.ui.setCoins(this.state.coins);
        }
      }

      for (const boost of chunk.boosts) {
        if (!boost.entity.enabled || boost.used) continue;
        const position = boost.entity.getPosition();
        if (this.isClose(position, 1.18, 1.65)) {
          boost.used = true;
          boost.entity.enabled = false;
          this.state.boostTime = Math.max(this.state.boostTime, 1.45);
        }
      }

      for (const ramp of chunk.ramps) {
        if (!ramp.entity.enabled || ramp.used) continue;
        const position = ramp.entity.getPosition();
        if (this.state.playerY < 0.18 && this.isClose(position, 1.2, 1.55)) {
          ramp.used = true;
          this.state.jumpVelocity = 7.1;
        }
      }

      for (const obstacle of chunk.obstacles) {
        if (!obstacle.entity.enabled || obstacle.used || this.state.playerY > 0.72) continue;
        const position = obstacle.entity.getPosition();
        if (this.isClose(position, 1.02, 1.12)) {
          obstacle.used = true;
          this.finishRun();
          return;
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    const position = this.camera.getPosition();
    const targetX = this.state.playerX * 0.18;
    const response = 1 - Math.exp(-dt * 3.4);
    position.x += (targetX - position.x) * response;
    this.camera.setPosition(position.x, 6.6 + this.state.playerY * 0.18, 14.4);
    this.camera.lookAt(this.state.playerX * 0.08, 0.45 + this.state.playerY * 0.12, -17);
  }

  private animateIdle(dt: number): void {
    this.sled.rotateLocal(0, Math.sin(performance.now() * 0.0014) * dt * 2.2, 0);
    for (const chunk of this.chunks) {
      for (const coin of chunk.coins) {
        if (coin.entity.enabled) coin.entity.rotateLocal(0, 80 * dt, 0);
      }
    }
  }

  private resetRun(): void {
    Object.assign(this.state, {
      running: false,
      targetX: 0,
      playerX: 0,
      playerY: 0,
      jumpVelocity: 0,
      baseSpeed: 11,
      boostTime: 0,
      distance: 0,
      coins: 0,
      nextChunkIndex: CHUNK_COUNT,
    });

    this.sled.setPosition(0, 0, PLAYER_Z);
    this.sled.setEulerAngles(0, 0, 0);
    this.ui.setDistance(0);
    this.ui.setCoins(0);

    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index];
      chunk.root.setPosition(0, 0, -index * CHUNK_LENGTH);
      this.rebuildChunk(chunk, index);
    }
  }

  private finishRun(): void {
    this.state.running = false;
    this.ui.showMenu(
      'Столкновение',
      `Дистанция: ${Math.floor(this.state.distance)} м · Монеты: ${this.state.coins}`,
      'ЕЩЁ РАЗ',
    );
  }

  private bindInput(): void {
    const updatePointerTarget = (event: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.state.targetX = pc.math.clamp(normalizedX * (MAX_PLAYER_X + 0.35), -MAX_PLAYER_X, MAX_PLAYER_X);
    };

    this.canvas.addEventListener('pointerdown', (event) => {
      this.pointerActive = true;
      this.canvas.setPointerCapture(event.pointerId);
      updatePointerTarget(event);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.pointerActive) updatePointerTarget(event);
    });
    this.canvas.addEventListener('pointerup', (event) => {
      this.pointerActive = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.pointerActive = false;
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.leftPressed = true;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') this.rightPressed = true;
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.leftPressed = false;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') this.rightPressed = false;
    });

    window.addEventListener('resize', () => this.app.resizeCanvas());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.resumeAfterVisibility = this.state.running;
        this.state.running = false;
      } else if (this.resumeAfterVisibility) {
        this.state.running = true;
        this.resumeAfterVisibility = false;
      }
    });
  }

  private isClose(position: pc.Vec3, lateralDistance: number, forwardDistance: number): boolean {
    return Math.abs(position.x - this.state.playerX) < lateralDistance
      && Math.abs(position.z - PLAYER_Z) < forwardDistance;
  }

  private makePooledItem(entity: pc.Entity, kind: ItemKind): PooledItem {
    entity.enabled = false;
    return { entity, kind, used: false };
  }

  private createPrimitive(
    name: string,
    type: PrimitiveType,
    material: pc.StandardMaterial,
    scale: pc.Vec3,
    position: pc.Vec3,
    parent: pc.Entity,
  ): pc.Entity {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type });
    if (entity.render) {
      entity.render.material = material;
      entity.render.castShadows = true;
      entity.render.receiveShadows = true;
    }
    entity.setLocalScale(scale.x, scale.y, scale.z);
    entity.setLocalPosition(position.x, position.y, position.z);
    parent.addChild(entity);
    return entity;
  }

  private createMaterial(
    color: pc.Color,
    gloss: number,
    metalness: number,
    emissive = new pc.Color(0, 0, 0),
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.diffuse = color;
    material.gloss = gloss;
    material.metalness = metalness;
    material.emissive = emissive;
    material.update();
    return material;
  }

  private createRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
}
