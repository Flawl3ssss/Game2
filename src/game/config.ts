export const GAME_CONFIG = {
  chunkLength: 64,
  activeChunks: 12,
  chunksBehind: 2,
  terrainWidth: 44,
  roadHalfWidth: 10.5,
  terrainSegmentsX: 12,
  terrainSegmentsZ: 14,
  maxCoinsPerChunk: 16,
  maxTreesPerChunk: 22,
  maxRocksPerChunk: 5,
  maxRampsPerChunk: 2,
  maxBoostsPerChunk: 2,
  shiftDistance: 640,
  gravity: 29,
  playerGroundOffset: 0.72,
  minEndSpeed: 5.2,
  maxPixelRatio: 1.65,
} as const;

export type QualityLevel = 'low' | 'medium' | 'high';
