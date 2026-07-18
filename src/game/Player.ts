import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { InfiniteWorld } from './World';

export interface PlayerUpdateResult {
  collectedCoins: number;
  hit: boolean;
  jumped: boolean;
  boosted: boolean;
  landedPerfectly: boolean;
  stopped: boolean;
}

export class Player {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  speed = 0;
  xVelocity = 0;
  yVelocity = 0;
  grounded = true;
  visualTime = 0;
  private lowSpeedTime = 0;
  private lastRampSlot = -1;
  private lastObstacleSlot = -1;
  private body: THREE.Group;
  private sled: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.group.name = 'player';

    const sledMaterial = new THREE.MeshStandardMaterial({ color: 0xf24a72, roughness: 0.55, metalness: 0.1 });
    this.sled = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 2.5), sledMaterial);
    this.sled.position.y = 0.16;
    this.sled.castShadow = true;
    this.sled.receiveShadow = true;
    this.group.add(this.sled);

    const runnerMaterial = new THREE.MeshStandardMaterial({ color: 0x2e385d, roughness: 0.85, flatShading: true });
    const jacketMaterial = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.72, flatShading: true });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf2b88f, roughness: 0.85, flatShading: true });
    const hatMaterial = new THREE.MeshStandardMaterial({ color: 0x18a5a9, roughness: 0.8, flatShading: true });

    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.72, 4, 8), jacketMaterial);
    torso.position.y = 1.15;
    torso.rotation.x = 0.12;
    torso.castShadow = true;
    this.body.add(torso);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), skinMaterial);
    head.position.set(0, 1.95, -0.05);
    head.castShadow = true;
    this.body.add(head);

    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 8), hatMaterial);
    hat.position.set(0, 2.38, -0.08);
    hat.rotation.x = -0.14;
    hat.castShadow = true;
    this.body.add(hat);

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.65, 3, 6), runnerMaterial);
      leg.position.set(side * 0.28, 0.65, 0.25);
      leg.rotation.x = Math.PI / 2.9;
      leg.castShadow = true;
      this.body.add(leg);
    }

    this.group.add(this.body);
    scene.add(this.group);
  }

  reset(world: InfiniteWorld): void {
    this.position.set(0, world.floorHeight(7, 0) + GAME_CONFIG.playerGroundOffset, 7);
    this.speed = 0;
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.grounded = true;
    this.lowSpeedTime = 0;
    this.lastRampSlot = -1;
    this.lastObstacleSlot = -1;
    this.group.position.copy(this.position);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
  }

  launch(power: number, launchLevel: number): void {
    this.speed = 15.5 + power * 11 + (launchLevel - 1) * 1.4;
    this.yVelocity = 5.2 + power * 2.2;
    this.grounded = false;
  }

  update(dt: number, steer: number, world: InfiniteWorld, sledLevel: number): PlayerUpdateResult {
    const result: PlayerUpdateResult = {
      collectedCoins: 0,
      hit: false,
      jumped: false,
      boosted: false,
      landedPerfectly: false,
      stopped: false,
    };

    this.visualTime += dt;
    const absoluteZ = world.originDistance + this.position.z;
    const roadHalf = world.roadHalfWidth(absoluteZ);
    const outside = Math.max(0, Math.abs(this.position.x) - roadHalf);

    const handling = 22 + (sledLevel - 1) * 0.9;
    this.xVelocity += steer * handling * dt;
    this.xVelocity *= Math.pow(this.grounded ? 0.08 : 0.35, dt);
    this.xVelocity = THREE.MathUtils.clamp(this.xVelocity, -10.5, 10.5);
    this.position.x += this.xVelocity * dt;

    const maxSpeed = 27 + (sledLevel - 1) * 1.7;
    const slopeAcceleration = 4.4 - outside * 1.55;
    this.speed += slopeAcceleration * dt;
    this.speed *= Math.pow(outside > 0 ? 0.55 : 0.988, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, 0, maxSpeed);
    this.position.z += this.speed * dt;

    const floor = world.floorHeight(this.position.z, this.position.x) + GAME_CONFIG.playerGroundOffset;
    if (!this.grounded) {
      this.yVelocity -= GAME_CONFIG.gravity * dt;
      this.position.y += this.yVelocity * dt;
      if (this.position.y <= floor) {
        const impact = Math.abs(this.yVelocity);
        this.position.y = floor;
        this.yVelocity = 0;
        this.grounded = true;
        if (impact < 9.5 && Math.abs(this.xVelocity) < 7.2) {
          this.speed = Math.min(maxSpeed + 2.5, this.speed + 1.8);
          result.landedPerfectly = true;
        } else {
          this.speed *= 0.88;
        }
      }
    } else {
      this.position.y = THREE.MathUtils.lerp(this.position.y, floor, 1 - Math.pow(0.001, dt));
    }

    const collisionZRange = Math.max(2.2, this.speed * dt + 1.1);

    for (const coin of world.coins) {
      if (!coin.active || coin.collected) continue;
      const localZ = coin.absZ - world.originDistance;
      if (Math.abs(localZ - this.position.z) > collisionZRange) continue;
      const coinY = world.floorHeight(localZ, coin.x) + coin.yOffset;
      const dx = coin.x - this.position.x;
      const dy = coinY - this.position.y;
      const dz = localZ - this.position.z;
      if (dx * dx + dy * dy + dz * dz < 2.2) {
        world.hideCoin(coin);
        result.collectedCoins += 1;
      }
    }

    for (const ramp of world.ramps) {
      if (!ramp.active || ramp.slot === this.lastRampSlot || !this.grounded) continue;
      const localZ = ramp.absZ - world.originDistance;
      if (Math.abs(localZ - this.position.z) < collisionZRange + 1.4 && Math.abs(ramp.x - this.position.x) < ramp.width) {
        this.lastRampSlot = ramp.slot;
        this.grounded = false;
        this.yVelocity = 10.2 + Math.min(3.5, this.speed * 0.08);
        this.speed += 1.2;
        result.jumped = true;
      }
    }

    for (const boost of world.boosts) {
      if (!boost.active || boost.used) continue;
      const localZ = boost.absZ - world.originDistance;
      if (Math.abs(localZ - this.position.z) < collisionZRange + 1.3 && Math.abs(boost.x - this.position.x) < boost.width) {
        world.hideBoost(boost);
        this.speed = Math.min(maxSpeed + 5, this.speed + 6.5);
        result.boosted = true;
      }
    }

    for (const obstacle of world.obstacles) {
      if (!obstacle.active || obstacle.slot === this.lastObstacleSlot) continue;
      const localZ = obstacle.absZ - world.originDistance;
      if (Math.abs(localZ - this.position.z) > collisionZRange + 0.7) continue;
      if (Math.abs(obstacle.x - this.position.x) < obstacle.radius + 0.75 && this.position.y < floor + obstacle.radius * 1.6) {
        this.lastObstacleSlot = obstacle.slot;
        this.speed *= 0.52 + Math.min(0.16, (sledLevel - 1) * 0.018);
        this.xVelocity += (this.position.x <= obstacle.x ? -1 : 1) * 5.5;
        this.grounded = false;
        this.yVelocity = 4.2;
        result.hit = true;
      }
    }

    if (this.speed < GAME_CONFIG.minEndSpeed && this.position.z > 25) this.lowSpeedTime += dt;
    else this.lowSpeedTime = 0;
    result.stopped = this.lowSpeedTime > 1.7;

    this.group.position.copy(this.position);
    const targetRoll = THREE.MathUtils.clamp(-this.xVelocity * 0.055, -0.42, 0.42);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, targetRoll, 1 - Math.pow(0.015, dt));
    const jumpPitch = this.grounded ? 0 : THREE.MathUtils.clamp(-this.yVelocity * 0.025, -0.28, 0.32);
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, jumpPitch, 1 - Math.pow(0.02, dt));
    this.body.position.y = this.grounded ? Math.sin(this.visualTime * 10) * 0.035 : 0;

    return result;
  }

  shiftOrigin(shiftZ: number, shiftY: number): void {
    this.position.z -= shiftZ;
    this.position.y -= shiftY;
    this.group.position.copy(this.position);
  }
}
