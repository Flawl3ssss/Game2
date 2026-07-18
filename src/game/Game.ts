import * as THREE from 'three';
import { AudioSystem } from './AudioSystem';
import { GAME_CONFIG } from './config';
import { InputController } from './InputController';
import { Player } from './Player';
import { QualityManager } from './QualityManager';
import type { SaveStore } from './save';
import { InfiniteWorld } from './World';
import type { UIController } from '../ui/UIController';
import type { YandexPlatform } from '../platform/YandexPlatform';

export type GameMode = 'menu' | 'launch' | 'running' | 'paused' | 'result';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 230);
  private readonly clock = new THREE.Clock();
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly quality: QualityManager;
  private readonly player: Player;
  private readonly world: InfiniteWorld;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.8);
  private mode: GameMode = 'menu';
  private pausedByVisibility = false;
  private charge = 0;
  private chargeDirection = 1;
  private chargePointerId: number | null = null;
  private runCoins = 0;
  private runDistance = 0;
  private runStartAbsolute = 0;
  private lastHudUpdate = 0;
  private animationFrame = 0;
  private debugEnabled = false;
  private rewardedUsed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly ui: UIController,
    private readonly save: SaveStore,
    private readonly platform: YandexPlatform,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x8bd7ff);
    this.scene.fog = new THREE.Fog(0x9fdfff, 40, 205);

    this.quality = new QualityManager(this.renderer);
    this.input = new InputController(canvas);
    this.world = new InfiniteWorld(this.scene, Math.floor(Math.random() * 0x7fffffff));
    this.player = new Player(this.scene);

    this.configureScene();
    this.bindEvents();
    this.resize();
    this.world.reset();
    this.player.reset(this.world);
    this.setMode('menu');
  }

  startLoop(): void {
    this.clock.start();
    const frame = (): void => {
      this.animationFrame = requestAnimationFrame(frame);
      const dt = Math.min(0.04, this.clock.getDelta());
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    frame();
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.world.dispose();
    this.renderer.dispose();
  }

  beginLaunch(): void {
    this.audio.unlock();
    this.resetRun();
    this.setMode('launch');
  }

  pause(): void {
    if (this.mode !== 'running') return;
    this.setMode('paused');
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.setMode('running');
  }

  quitRun(): void {
    if (this.mode !== 'running' && this.mode !== 'paused') return;
    this.finishRun();
  }

  returnToMenu(): void {
    this.setMode('menu');
    this.ui.refreshMenu(this.save.data, this.save);
  }

  debugWarp(localZ: number): void {
    if (this.mode !== 'running') return;
    this.player.position.z = Math.max(this.player.position.z, localZ);
    this.player.position.y = this.world.floorHeight(this.player.position.z, this.player.position.x) + GAME_CONFIG.playerGroundOffset;
    this.player.yVelocity = 0;
    this.player.grounded = true;
    this.player.group.position.copy(this.player.position);
  }

  async doubleReward(): Promise<void> {
    if (this.mode !== 'result' || this.rewardedUsed) return;
    this.rewardedUsed = true;
    this.ui.setDoubleButtonEnabled(false);
    const rewarded = await this.platform.showRewarded(
      () => { this.audio.setMuted(true); this.platform.stopGameplay(); },
      () => { this.audio.setMuted(!this.save.data.sound); },
    );
    if (!rewarded) {
      this.ui.toast(this.ui.translate('adUnavailable'));
      this.ui.setDoubleButtonEnabled(true);
      this.rewardedUsed = false;
      return;
    }
    this.save.data.coins += this.runCoins;
    this.save.saveLocal();
    void this.platform.saveCloud(this.save.data);
    this.ui.updateResultCoins(this.runCoins * 2);
    this.ui.toast(this.ui.translate('rewardDoubled', { coins: this.runCoins }));
  }

  private configureScene(): void {
    const hemisphere = new THREE.HemisphereLight(0xe3f7ff, 0x2b4f66, 2.25);
    this.scene.add(hemisphere);

    this.sun.position.set(-35, 55, -25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    this.scene.add(this.sun);

    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b8, fog: false }),
    );
    sunDisc.position.set(-42, 38, 115);
    this.scene.add(sunDisc);

    this.camera.position.set(0, 7, -7);
    this.camera.lookAt(0, 0, 10);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'running') {
        this.pausedByVisibility = true;
        this.setMode('paused');
      } else if (!document.hidden && this.pausedByVisibility && this.mode === 'paused') {
        this.pausedByVisibility = false;
        this.setMode('running');
      }
    });

    window.addEventListener('pointerdown', (event) => {
      if (this.mode !== 'launch' || this.chargePointerId !== null) return;
      event.preventDefault();
      this.chargePointerId = event.pointerId;
      this.audio.unlock();
    }, { passive: false });

    const releaseCharge = (event: PointerEvent): void => {
      if (this.mode !== 'launch' || this.chargePointerId !== event.pointerId) return;
      event.preventDefault();
      this.chargePointerId = null;
      this.startRunFromCharge();
    };
    window.addEventListener('pointerup', releaseCharge, { passive: false });
    window.addEventListener('pointercancel', releaseCharge, { passive: false });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && this.mode === 'launch' && this.chargePointerId === null) {
        event.preventDefault();
        this.chargePointerId = -1;
      }
      if (event.code === 'Escape') {
        if (this.mode === 'running') this.pause();
        else if (this.mode === 'paused') this.resume();
      }
      if (event.code === 'Backquote') this.debugEnabled = !this.debugEnabled;
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space' && this.mode === 'launch' && this.chargePointerId === -1) {
        event.preventDefault();
        this.chargePointerId = null;
        this.startRunFromCharge();
      }
    });
  }

  private resetRun(): void {
    this.world.reset();
    this.player.reset(this.world);
    this.charge = 0;
    this.chargeDirection = 1;
    this.runCoins = 0;
    this.runDistance = 0;
    this.runStartAbsolute = this.world.originDistance + this.player.position.z;
    this.rewardedUsed = false;
    this.ui.updateLaunchPower(0);
    this.ui.updateHud(0, 0, 0);
  }

  private startRunFromCharge(): void {
    const power = Math.max(0.08, this.charge);
    this.player.launch(power, this.save.data.upgrades.launch);
    this.audio.play('start');
    this.setMode('running');
  }

  private tick(dt: number): void {
    if (this.mode === 'launch') {
      if (this.chargePointerId !== null) {
        this.charge += this.chargeDirection * dt * 0.82;
        if (this.charge >= 1) { this.charge = 1; this.chargeDirection = -1; }
        if (this.charge <= 0.12 && this.chargeDirection < 0) { this.charge = 0.12; this.chargeDirection = 1; }
        this.ui.updateLaunchPower(this.charge);
      }
      this.animateIdle(dt);
    } else if (this.mode === 'running') {
      this.input.update();
      const result = this.player.update(dt, this.input.steer, this.world, this.save.data.upgrades.sled);
      this.world.update(this.player.position.z, this.player.visualTime);
      this.runDistance = Math.max(0, Math.floor(this.world.originDistance + this.player.position.z - this.runStartAbsolute));

      if (result.collectedCoins > 0) {
        this.runCoins += result.collectedCoins * this.save.data.upgrades.income;
        this.audio.play('coin');
      }
      if (result.jumped) this.audio.play('jump');
      if (result.hit) this.audio.play('hit');
      if (result.boosted) this.audio.play('boost');
      if (result.landedPerfectly) {
        this.ui.showCombo(this.ui.translate('perfectLanding'));
        this.runCoins += this.save.data.upgrades.income;
      }

      if (this.player.position.z > GAME_CONFIG.shiftDistance) {
        const shiftZ = GAME_CONFIG.shiftDistance;
        const shiftY = this.player.position.y;
        this.world.shiftOrigin(shiftZ, shiftY);
        this.player.shiftOrigin(shiftZ, shiftY);
        this.camera.position.z -= shiftZ;
        this.camera.position.y -= shiftY;
      }

      if (result.stopped) this.finishRun();
    } else {
      this.animateIdle(dt);
    }

    this.updateCamera(dt);
    this.quality.sample(dt);
    this.lastHudUpdate += dt;
    if (this.mode === 'running' && this.lastHudUpdate > 0.08) {
      this.lastHudUpdate = 0;
      this.ui.updateHud(this.runDistance, Math.round(this.player.speed * 3.6), this.runCoins);
    }
    this.ui.updateDebug(this.debugEnabled, {
      fps: this.quality.fps,
      quality: this.quality.level,
      distance: this.runDistance,
      speed: this.player.speed,
      origin: this.world.originDistance,
    });
  }

  private animateIdle(dt: number): void {
    this.player.visualTime += dt;
    this.player.group.position.y += Math.sin(this.player.visualTime * 2.5) * dt * 0.03;
    this.world.update(this.player.position.z, this.player.visualTime);
  }

  private updateCamera(dt: number): void {
    const player = this.player.position;
    const speedFactor = THREE.MathUtils.clamp(this.player.speed / 28, 0, 1);
    const desired = new THREE.Vector3(
      player.x * 0.52,
      player.y + 5.2 + speedFactor * 1.2,
      player.z - 10.5 - speedFactor * 3.2,
    );
    const smoothing = 1 - Math.pow(0.003, dt);
    this.camera.position.lerp(desired, smoothing);
    const lookTarget = new THREE.Vector3(player.x * 0.28, player.y + 0.9, player.z + 9 + speedFactor * 6);
    this.camera.lookAt(lookTarget);

    this.sun.position.set(player.x - 35, player.y + 55, player.z - 25);
    this.sun.target.position.set(player.x, player.y, player.z + 18);
    if (!this.sun.target.parent) this.scene.add(this.sun.target);
  }

  private finishRun(): void {
    if (this.mode === 'result') return;
    this.platform.stopGameplay();
    const reward = Math.max(3, this.runCoins + Math.floor(this.runDistance / 45) * this.save.data.upgrades.income);
    this.runCoins = reward;
    const oldBest = this.save.data.bestDistance;
    this.save.data.bestDistance = Math.max(oldBest, this.runDistance);
    this.save.data.coins += reward;
    this.save.saveLocal();
    void this.platform.saveCloud(this.save.data);
    this.ui.showResult(this.runDistance, reward, this.runDistance > oldBest);
    this.setMode('result');
  }

  private setMode(mode: GameMode): void {
    this.mode = mode;
    this.input.setEnabled(mode === 'running');
    this.ui.showMode(mode);
    if (mode === 'running') {
      this.platform.startGameplay();
      this.audio.setMuted(!this.save.data.sound);
    } else {
      this.platform.stopGameplay();
    }
    if (mode === 'paused') this.audio.setMuted(true);
    else if (mode !== 'running') this.audio.setMuted(!this.save.data.sound);
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
