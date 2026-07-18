import type { SaveData } from '../game/save';

export class YandexPlatform {
  private sdk: YaGamesSDK | null = null;
  private player: YaPlayer | null = null;
  private gameplayActive = false;
  language = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  isNative = false;

  async init(): Promise<void> {
    if (this.isLocalHost()) return;

    try {
      if (!window.YaGames) await this.loadSdkScript();
      if (!window.YaGames) return;
      this.sdk = await window.YaGames.init();
      this.isNative = true;
      this.language = this.sdk.environment?.i18n?.lang?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
      try {
        this.player = await this.sdk.getPlayer?.() ?? null;
      } catch {
        this.player = null;
      }
    } catch (error) {
      console.warn('Yandex SDK fallback mode:', error);
      this.sdk = null;
      this.player = null;
    }
  }

  private isLocalHost(): boolean {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  }

  private loadSdkScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-yandex-sdk]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('SDK load failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = '/sdk.js';
      script.async = true;
      script.dataset.yandexSdk = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('SDK load failed'));
      document.head.append(script);
    });
  }

  ready(): void {
    this.sdk?.features?.LoadingAPI?.ready();
  }

  startGameplay(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.sdk?.features?.GameplayAPI?.start();
  }

  stopGameplay(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.sdk?.features?.GameplayAPI?.stop();
  }

  async loadCloudSave(): Promise<unknown> {
    if (!this.player) return null;
    try {
      const data = await this.player.getData(['save']);
      return data.save ?? null;
    } catch {
      return null;
    }
  }

  async saveCloud(data: SaveData): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.setData({ save: data }, false);
    } catch (error) {
      console.warn('Cloud save failed:', error);
    }
  }

  showRewarded(onPause: () => void, onResume: () => void): Promise<boolean> {
    if (!this.sdk?.adv?.showRewardedVideo) {
      onPause();
      return new Promise((resolve) => {
        window.setTimeout(() => {
          onResume();
          resolve(true);
        }, 550);
      });
    }

    return new Promise((resolve) => {
      let rewarded = false;
      this.sdk?.adv?.showRewardedVideo({
        callbacks: {
          onOpen: onPause,
          onRewarded: () => { rewarded = true; },
          onClose: () => { onResume(); resolve(rewarded); },
          onError: () => { onResume(); resolve(false); },
        },
      });
    });
  }
}
