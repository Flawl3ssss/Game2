import './style.css';
import { Game } from './game/Game';
import { SaveStore } from './game/save';
import { YandexPlatform } from './platform/YandexPlatform';
import { UIController } from './ui/UIController';

async function bootstrap(): Promise<void> {
  const ui = new UIController();
  const save = new SaveStore();
  const platform = new YandexPlatform();

  ui.setLoading(0.15, ui.translate('loadingSettings'));
  save.loadLocal();

  ui.setLoading(0.4, ui.translate('loadingPlatform'));
  await platform.init();
  ui.setLanguage(platform.language);

  ui.setLoading(0.62, ui.translate('loadingCloud'));
  const cloud = await platform.loadCloudSave();
  save.mergeCloud(cloud);

  ui.setLoading(0.78, ui.translate('loadingWorld'));
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas not found');
  const game = new Game(canvas, ui, save, platform);
  ui.bindGame(game, save);
  if (new URLSearchParams(location.search).has('qa')) {
    (window as Window & { __snowGame?: Game }).__snowGame = game;
  }
  ui.refreshMenu(save.data, save);

  ui.setLoading(1, ui.translate('ready'));
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  ui.hideLoading();
  game.startLoop();
  platform.ready();

  window.addEventListener('beforeunload', () => {
    save.saveLocal();
    void platform.saveCloud(save.data);
  });
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.textContent = new UIController().translate('startupError');
});
