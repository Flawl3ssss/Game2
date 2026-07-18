import * as THREE from 'three';
import { GAME_CONFIG, type QualityLevel } from './config';

export class QualityManager {
  level: QualityLevel = 'high';
  private elapsed = 0;
  private frames = 0;
  private averageFps = 60;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    if (cores <= 4 || memory <= 3) this.level = 'medium';
    if (cores <= 2 || memory <= 2) this.level = 'low';
    this.apply();
  }

  sample(dt: number): void {
    this.elapsed += dt;
    this.frames += 1;
    if (this.elapsed < 3) return;
    this.averageFps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;

    if (this.averageFps < 38 && this.level === 'high') {
      this.level = 'medium';
      this.apply();
    } else if (this.averageFps < 27 && this.level === 'medium') {
      this.level = 'low';
      this.apply();
    }
  }

  get fps(): number {
    return this.averageFps;
  }

  private apply(): void {
    const scale = this.level === 'high' ? 1 : this.level === 'medium' ? 0.82 : 0.68;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * scale, GAME_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = this.level !== 'low';
  }
}
