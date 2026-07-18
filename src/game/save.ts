export interface UpgradeState {
  launch: number;
  sled: number;
  income: number;
}

export interface SaveData {
  version: 1;
  coins: number;
  bestDistance: number;
  upgrades: UpgradeState;
  sound: boolean;
}

const DEFAULT_SAVE: SaveData = {
  version: 1,
  coins: 250,
  bestDistance: 0,
  upgrades: { launch: 1, sled: 1, income: 1 },
  sound: true,
};

export class SaveStore {
  private readonly key = 'snow-sling-save-v1';
  data: SaveData = structuredClone(DEFAULT_SAVE);

  loadLocal(): SaveData {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return this.data;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      this.data = {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed,
        upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades ?? {}) },
      };
    } catch {
      this.data = structuredClone(DEFAULT_SAVE);
    }
    return this.data;
  }

  mergeCloud(cloud: unknown): void {
    if (!cloud || typeof cloud !== 'object') return;
    const candidate = cloud as Partial<SaveData>;
    const cloudBest = Number(candidate.bestDistance ?? 0);
    const localBest = this.data.bestDistance;
    const cloudCoins = Number(candidate.coins ?? 0);
    const shouldPreferCloud = cloudBest > localBest || cloudCoins > this.data.coins;
    if (!shouldPreferCloud) return;
    this.data = {
      ...this.data,
      ...candidate,
      upgrades: { ...this.data.upgrades, ...(candidate.upgrades ?? {}) },
      version: 1,
    } as SaveData;
    this.saveLocal();
  }

  saveLocal(): void {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  upgradeCost(kind: keyof UpgradeState): number {
    const base = kind === 'launch' ? 100 : kind === 'sled' ? 120 : 90;
    const level = this.data.upgrades[kind];
    return Math.round(base * Math.pow(1.55, level - 1));
  }

  buyUpgrade(kind: keyof UpgradeState): boolean {
    const cost = this.upgradeCost(kind);
    if (this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.data.upgrades[kind] += 1;
    this.saveLocal();
    return true;
  }
}
