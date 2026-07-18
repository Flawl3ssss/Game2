import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { SeededRandom, hash32 } from './random';

export interface CoinEntity {
  active: boolean;
  collected: boolean;
  x: number;
  absZ: number;
  yOffset: number;
  slot: number;
}

export interface ObstacleEntity {
  active: boolean;
  x: number;
  absZ: number;
  radius: number;
  slot: number;
}

export interface RampEntity {
  active: boolean;
  x: number;
  absZ: number;
  width: number;
  slot: number;
}

export interface BoostEntity {
  active: boolean;
  used: boolean;
  x: number;
  absZ: number;
  width: number;
  slot: number;
}

interface TreeEntity {
  active: boolean;
  x: number;
  absZ: number;
  scale: number;
  slot: number;
}

interface Chunk {
  index: number;
  terrain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  coins: CoinEntity[];
  obstacles: ObstacleEntity[];
  ramps: RampEntity[];
  boosts: BoostEntity[];
  trees: TreeEntity[];
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);

export class InfiniteWorld {
  readonly group = new THREE.Group();
  readonly seed: number;
  originDistance = 0;
  originHeightOffset = 0;

  readonly coins: CoinEntity[] = [];
  readonly obstacles: ObstacleEntity[] = [];
  readonly ramps: RampEntity[] = [];
  readonly boosts: BoostEntity[] = [];

  private readonly chunks: Chunk[] = [];
  private readonly trees: TreeEntity[] = [];
  private maxChunkIndex = -1;
  private readonly snowMaterial: THREE.MeshStandardMaterial;
  private readonly coinMesh: THREE.InstancedMesh;
  private readonly rockMesh: THREE.InstancedMesh;
  private readonly rampMesh: THREE.InstancedMesh;
  private readonly boostMesh: THREE.InstancedMesh;
  private readonly trunkMesh: THREE.InstancedMesh;
  private readonly crownMesh: THREE.InstancedMesh;

  constructor(private readonly scene: THREE.Scene, seed: number) {
    this.seed = seed;
    this.group.name = 'infinite-world';
    this.scene.add(this.group);

    const chunkCount = GAME_CONFIG.activeChunks + GAME_CONFIG.chunksBehind;
    const coinCount = chunkCount * GAME_CONFIG.maxCoinsPerChunk;
    const rockCount = chunkCount * GAME_CONFIG.maxRocksPerChunk;
    const rampCount = chunkCount * GAME_CONFIG.maxRampsPerChunk;
    const boostCount = chunkCount * GAME_CONFIG.maxBoostsPerChunk;
    const treeCount = chunkCount * GAME_CONFIG.maxTreesPerChunk;

    this.snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xeaf8ff,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    });

    this.coinMesh = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.38, 0.12, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0x6b3b00, emissiveIntensity: 0.28, roughness: 0.35, metalness: 0.5 }),
      coinCount,
    );
    this.rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.95, 0),
      new THREE.MeshStandardMaterial({ color: 0x718090, roughness: 0.96, flatShading: true }),
      rockCount,
    );
    this.rampMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.2, 0.45, 4.8),
      new THREE.MeshStandardMaterial({ color: 0x75d1ff, roughness: 0.75, flatShading: true }),
      rampCount,
    );
    this.boostMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.8, 0.08, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xff6fcf, emissive: 0x6f0c55, emissiveIntensity: 0.8, roughness: 0.35 }),
      boostCount,
    );
    this.trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.8, 5),
      new THREE.MeshStandardMaterial({ color: 0x674f3a, roughness: 1, flatShading: true }),
      treeCount,
    );
    this.crownMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.15, 3.2, 7),
      new THREE.MeshStandardMaterial({ color: 0x0f6070, roughness: 0.9, flatShading: true }),
      treeCount,
    );

    for (const instanced of [this.coinMesh, this.rockMesh, this.rampMesh, this.boostMesh, this.trunkMesh, this.crownMesh]) {
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.frustumCulled = false;
      this.group.add(instanced);
    }
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.rampMesh.castShadow = true;
    this.rampMesh.receiveShadow = true;
    this.trunkMesh.castShadow = true;
    this.crownMesh.castShadow = true;

    for (let i = 0; i < coinCount; i += 1) this.coinMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < rockCount; i += 1) this.rockMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < rampCount; i += 1) this.rampMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < boostCount; i += 1) this.boostMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < treeCount; i += 1) {
      this.trunkMesh.setMatrixAt(i, HIDDEN);
      this.crownMesh.setMatrixAt(i, HIDDEN);
    }

    this.createChunks(chunkCount);
  }

  reset(): void {
    this.originDistance = 0;
    this.originHeightOffset = 0;
    this.maxChunkIndex = -1;
    for (let i = 0; i < this.chunks.length; i += 1) this.assignChunk(this.chunks[i], i);
    this.maxChunkIndex = this.chunks.length - 1;
    this.flushInstances();
  }

  update(playerLocalZ: number, elapsed: number): void {
    const absoluteZ = this.originDistance + playerLocalZ;
    const playerChunk = Math.floor(absoluteZ / GAME_CONFIG.chunkLength);
    const minimumChunk = Math.max(0, playerChunk - GAME_CONFIG.chunksBehind);
    const desiredMax = minimumChunk + this.chunks.length - 1;

    while (this.maxChunkIndex < desiredMax) {
      const oldest = this.chunks.reduce((a, b) => (a.index < b.index ? a : b));
      this.assignChunk(oldest, this.maxChunkIndex + 1);
      this.maxChunkIndex += 1;
    }

    for (const coin of this.coins) {
      if (!coin.active || coin.collected) continue;
      const y = this.heightAtAbsolute(coin.absZ, coin.x) - this.originHeightOffset + coin.yOffset + Math.sin(elapsed * 5 + coin.slot) * 0.12;
      position.set(coin.x, y, coin.absZ - this.originDistance);
      quaternion.setFromAxisAngle(up, elapsed * 2.4 + coin.slot);
      scale.setScalar(1);
      matrix.compose(position, quaternion, scale);
      this.coinMesh.setMatrixAt(coin.slot, matrix);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  shiftOrigin(shiftZ: number, shiftY: number): void {
    this.originDistance += shiftZ;
    this.originHeightOffset += shiftY;
    for (const chunk of this.chunks) {
      chunk.terrain.position.z -= shiftZ;
      chunk.terrain.position.y -= shiftY;
    }
    this.refreshAllInstances();
  }

  floorHeight(localZ: number, x: number): number {
    return this.heightAtAbsolute(this.originDistance + localZ, x) - this.originHeightOffset;
  }

  roadHalfWidth(absoluteZ: number): number {
    return GAME_CONFIG.roadHalfWidth + Math.sin(absoluteZ * 0.005) * 1.2;
  }

  hideCoin(coin: CoinEntity): void {
    coin.collected = true;
    this.coinMesh.setMatrixAt(coin.slot, HIDDEN);
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  hideBoost(boost: BoostEntity): void {
    boost.used = true;
    this.boostMesh.setMatrixAt(boost.slot, HIDDEN);
    this.boostMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const child of this.group.children) {
      if ('geometry' in child) (child.geometry as THREE.BufferGeometry).dispose();
      if ('material' in child) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    }
  }

  private createChunks(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const geometry = new THREE.PlaneGeometry(
        GAME_CONFIG.terrainWidth,
        GAME_CONFIG.chunkLength,
        GAME_CONFIG.terrainSegmentsX,
        GAME_CONFIG.terrainSegmentsZ,
      );
      geometry.rotateX(-Math.PI / 2);
      const terrain = new THREE.Mesh(geometry, this.snowMaterial);
      terrain.receiveShadow = true;
      this.group.add(terrain);

      const chunk: Chunk = { index: -1, terrain, coins: [], obstacles: [], ramps: [], boosts: [], trees: [] };
      const coinStart = i * GAME_CONFIG.maxCoinsPerChunk;
      const rockStart = i * GAME_CONFIG.maxRocksPerChunk;
      const rampStart = i * GAME_CONFIG.maxRampsPerChunk;
      const boostStart = i * GAME_CONFIG.maxBoostsPerChunk;
      const treeStart = i * GAME_CONFIG.maxTreesPerChunk;

      for (let j = 0; j < GAME_CONFIG.maxCoinsPerChunk; j += 1) {
        const item: CoinEntity = { active: false, collected: false, x: 0, absZ: 0, yOffset: 1.35, slot: coinStart + j };
        chunk.coins.push(item);
        this.coins.push(item);
      }
      for (let j = 0; j < GAME_CONFIG.maxRocksPerChunk; j += 1) {
        const item: ObstacleEntity = { active: false, x: 0, absZ: 0, radius: 1, slot: rockStart + j };
        chunk.obstacles.push(item);
        this.obstacles.push(item);
      }
      for (let j = 0; j < GAME_CONFIG.maxRampsPerChunk; j += 1) {
        const item: RampEntity = { active: false, x: 0, absZ: 0, width: 2.5, slot: rampStart + j };
        chunk.ramps.push(item);
        this.ramps.push(item);
      }
      for (let j = 0; j < GAME_CONFIG.maxBoostsPerChunk; j += 1) {
        const item: BoostEntity = { active: false, used: false, x: 0, absZ: 0, width: 2.6, slot: boostStart + j };
        chunk.boosts.push(item);
        this.boosts.push(item);
      }
      for (let j = 0; j < GAME_CONFIG.maxTreesPerChunk; j += 1) {
        const item: TreeEntity = { active: false, x: 0, absZ: 0, scale: 1, slot: treeStart + j };
        chunk.trees.push(item);
        this.trees.push(item);
      }
      this.chunks.push(chunk);
    }
  }

  private assignChunk(chunk: Chunk, index: number): void {
    chunk.index = index;
    const startAbsZ = index * GAME_CONFIG.chunkLength;
    chunk.terrain.position.set(0, 0, startAbsZ - this.originDistance + GAME_CONFIG.chunkLength / 2);
    this.updateTerrain(chunk, startAbsZ);
    this.generateContent(chunk, startAbsZ);
  }

  private updateTerrain(chunk: Chunk, startAbsZ: number): void {
    const vertices = chunk.terrain.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < vertices.count; i += 1) {
      const x = vertices.getX(i);
      const absZ = startAbsZ + vertices.getZ(i) + GAME_CONFIG.chunkLength / 2;
      vertices.setY(i, this.heightAtAbsolute(absZ, x) - this.originHeightOffset);
    }
    vertices.needsUpdate = true;
    chunk.terrain.geometry.computeVertexNormals();
    chunk.terrain.geometry.computeBoundingSphere();
  }

  private heightAtAbsolute(absZ: number, x: number): number {
    const descent = -absZ * 0.055;
    const waves = Math.sin(absZ * 0.016) * 0.55 + Math.sin(absZ * 0.0045 + 1.7) * 1.2;
    const detail = Math.sin(absZ * 0.038 + x * 0.13) * 0.13;
    const outside = Math.max(0, Math.abs(x) - this.roadHalfWidth(absZ));
    return descent + waves + detail + outside * outside * 0.045;
  }

  private generateContent(chunk: Chunk, startAbsZ: number): void {
    const rng = new SeededRandom(hash32(this.seed ^ Math.imul(chunk.index, 1013904223)));
    const difficulty = Math.min(1, chunk.index / 42);
    this.clearChunkInstances(chunk);

    const safeStart = chunk.index < 2 ? 18 : 5;
    const coinCount = chunk.index === 0 ? 10 : rng.int(7, GAME_CONFIG.maxCoinsPerChunk);
    const style = rng.int(0, 3);
    const lane = rng.range(-5.5, 5.5);
    for (let i = 0; i < coinCount; i += 1) {
      const coin = chunk.coins[i];
      const t = coinCount <= 1 ? 0.5 : i / (coinCount - 1);
      coin.active = true;
      coin.absZ = startAbsZ + safeStart + t * (GAME_CONFIG.chunkLength - safeStart - 6);
      coin.x = style === 0 ? lane : style === 1 ? Math.sin(t * Math.PI * 2) * 5.5 : style === 2 ? THREE.MathUtils.lerp(-6, 6, t) : THREE.MathUtils.lerp(6, -6, t);
      coin.yOffset = rng.chance(0.15) ? 2.1 : 1.35;
      this.setCoinMatrix(coin, 0);
    }

    const obstacleCount = chunk.index < 2 ? 0 : rng.int(1, Math.max(1, Math.round(2 + difficulty * 3)));
    for (let i = 0; i < Math.min(obstacleCount, chunk.obstacles.length); i += 1) {
      const obstacle = chunk.obstacles[i];
      obstacle.active = true;
      obstacle.x = rng.range(-8.2, 8.2);
      obstacle.absZ = startAbsZ + rng.range(12, GAME_CONFIG.chunkLength - 7);
      obstacle.radius = rng.range(0.8, 1.25);
      this.setRockMatrix(obstacle, rng.range(0, Math.PI));
    }

    if (chunk.index > 0 && rng.chance(0.38 + difficulty * 0.12)) {
      const ramp = chunk.ramps[0];
      ramp.active = true;
      ramp.x = rng.range(-5.5, 5.5);
      ramp.absZ = startAbsZ + rng.range(22, GAME_CONFIG.chunkLength - 9);
      this.setRampMatrix(ramp);
    }

    if (chunk.index > 2 && rng.chance(0.28)) {
      const boost = chunk.boosts[0];
      boost.active = true;
      boost.x = rng.range(-5.7, 5.7);
      boost.absZ = startAbsZ + rng.range(14, GAME_CONFIG.chunkLength - 8);
      this.setBoostMatrix(boost);
    }

    const treeCount = rng.int(14, GAME_CONFIG.maxTreesPerChunk);
    for (let i = 0; i < treeCount; i += 1) {
      const tree = chunk.trees[i];
      tree.active = true;
      tree.x = (rng.chance(0.5) ? -1 : 1) * rng.range(12.8, GAME_CONFIG.terrainWidth / 2 - 1.4);
      tree.absZ = startAbsZ + rng.range(2, GAME_CONFIG.chunkLength - 2);
      tree.scale = rng.range(0.72, 1.35);
      this.setTreeMatrices(tree);
    }
    this.flushInstances();
  }

  private clearChunkInstances(chunk: Chunk): void {
    for (const item of chunk.coins) {
      item.active = false;
      item.collected = false;
      this.coinMesh.setMatrixAt(item.slot, HIDDEN);
    }
    for (const item of chunk.obstacles) {
      item.active = false;
      this.rockMesh.setMatrixAt(item.slot, HIDDEN);
    }
    for (const item of chunk.ramps) {
      item.active = false;
      this.rampMesh.setMatrixAt(item.slot, HIDDEN);
    }
    for (const item of chunk.boosts) {
      item.active = false;
      item.used = false;
      this.boostMesh.setMatrixAt(item.slot, HIDDEN);
    }
    for (const item of chunk.trees) {
      item.active = false;
      this.trunkMesh.setMatrixAt(item.slot, HIDDEN);
      this.crownMesh.setMatrixAt(item.slot, HIDDEN);
    }
  }

  private setCoinMatrix(coin: CoinEntity, elapsed: number): void {
    position.set(coin.x, this.heightAtAbsolute(coin.absZ, coin.x) - this.originHeightOffset + coin.yOffset, coin.absZ - this.originDistance);
    quaternion.setFromAxisAngle(up, elapsed + coin.slot);
    scale.setScalar(1);
    matrix.compose(position, quaternion, scale);
    this.coinMesh.setMatrixAt(coin.slot, matrix);
  }

  private setRockMatrix(obstacle: ObstacleEntity, rotation = 0): void {
    position.set(obstacle.x, this.heightAtAbsolute(obstacle.absZ, obstacle.x) - this.originHeightOffset + obstacle.radius * 0.65, obstacle.absZ - this.originDistance);
    quaternion.setFromEuler(new THREE.Euler(0, rotation, 0));
    scale.setScalar(obstacle.radius);
    matrix.compose(position, quaternion, scale);
    this.rockMesh.setMatrixAt(obstacle.slot, matrix);
  }

  private setRampMatrix(ramp: RampEntity): void {
    position.set(ramp.x, this.heightAtAbsolute(ramp.absZ, ramp.x) - this.originHeightOffset + 0.35, ramp.absZ - this.originDistance);
    quaternion.setFromEuler(new THREE.Euler(-0.18, 0, 0));
    scale.set(1, 1, 1);
    matrix.compose(position, quaternion, scale);
    this.rampMesh.setMatrixAt(ramp.slot, matrix);
  }

  private setBoostMatrix(boost: BoostEntity): void {
    position.set(boost.x, this.heightAtAbsolute(boost.absZ, boost.x) - this.originHeightOffset + 0.08, boost.absZ - this.originDistance);
    quaternion.identity();
    scale.set(1, 1, 1);
    matrix.compose(position, quaternion, scale);
    this.boostMesh.setMatrixAt(boost.slot, matrix);
  }

  private setTreeMatrices(tree: TreeEntity): void {
    const ground = this.heightAtAbsolute(tree.absZ, tree.x) - this.originHeightOffset;
    const localZ = tree.absZ - this.originDistance;
    quaternion.identity();
    position.set(tree.x, ground + 0.9 * tree.scale, localZ);
    scale.setScalar(tree.scale);
    matrix.compose(position, quaternion, scale);
    this.trunkMesh.setMatrixAt(tree.slot, matrix);
    position.set(tree.x, ground + 2.55 * tree.scale, localZ);
    matrix.compose(position, quaternion, scale);
    this.crownMesh.setMatrixAt(tree.slot, matrix);
  }

  private refreshAllInstances(): void {
    for (const coin of this.coins) coin.active && !coin.collected ? this.setCoinMatrix(coin, 0) : this.coinMesh.setMatrixAt(coin.slot, HIDDEN);
    for (const obstacle of this.obstacles) obstacle.active ? this.setRockMatrix(obstacle) : this.rockMesh.setMatrixAt(obstacle.slot, HIDDEN);
    for (const ramp of this.ramps) ramp.active ? this.setRampMatrix(ramp) : this.rampMesh.setMatrixAt(ramp.slot, HIDDEN);
    for (const boost of this.boosts) boost.active && !boost.used ? this.setBoostMatrix(boost) : this.boostMesh.setMatrixAt(boost.slot, HIDDEN);
    for (const tree of this.trees) {
      if (tree.active) this.setTreeMatrices(tree);
      else {
        this.trunkMesh.setMatrixAt(tree.slot, HIDDEN);
        this.crownMesh.setMatrixAt(tree.slot, HIDDEN);
      }
    }
    this.flushInstances();
  }

  private flushInstances(): void {
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.rampMesh.instanceMatrix.needsUpdate = true;
    this.boostMesh.instanceMatrix.needsUpdate = true;
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.crownMesh.instanceMatrix.needsUpdate = true;
  }
}
