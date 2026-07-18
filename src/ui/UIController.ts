import type { Game, GameMode } from '../game/Game';
import type { SaveData, SaveStore, UpgradeState } from '../game/save';

interface DebugStats {
  fps: number;
  quality: string;
  distance: number;
  speed: number;
  origin: number;
}

type Language = 'ru' | 'en';
type TranslationKey = keyof typeof translations.ru;

const translations = {
  ru: {
    gameTitle: 'Снежный Разгон',
    menuTitle: 'Снежный<br />Разгон',
    menuEyebrow: 'БЕСКОНЕЧНЫЙ СПУСК',
    menuDescription: 'Запускай героя, собирай монеты и мчись всё дальше.',
    launchUpgrade: 'Разгон',
    sledUpgrade: 'Санки',
    incomeUpgrade: 'Доход',
    level: 'Ур.',
    start: 'НАЧАТЬ ЗАЕЗД',
    controlNote: 'Проводи пальцем влево и вправо во время спуска',
    hold: 'УДЕРЖИВАЙ',
    buildPower: 'Набери мощность',
    release: 'Отпусти палец, чтобы стартовать',
    distanceUnit: 'м',
    speedUnit: 'км/ч',
    resultEyebrow: 'ЗАЕЗД ЗАВЕРШЁН',
    newRecord: 'Новый рекорд!',
    collected: 'Собрано',
    doubleAd: 'УДВОИТЬ ЗА РЕКЛАМУ',
    rewardClaimed: 'НАГРАДА ПОЛУЧЕНА',
    again: 'ЕЩЁ РАЗ',
    menu: 'В МЕНЮ',
    pause: 'Пауза',
    resume: 'ПРОДОЛЖИТЬ',
    quit: 'ЗАВЕРШИТЬ ЗАЕЗД',
    notEnoughCoins: 'Не хватает монет',
    upgradeBought: 'Улучшение куплено!',
    adUnavailable: 'Реклама сейчас недоступна',
    rewardDoubled: 'Награда удвоена: +{coins} монет',
    perfectLanding: 'ИДЕАЛЬНОЕ ПРИЗЕМЛЕНИЕ',
    loadingSettings: 'Загружаем настройки…',
    loadingPlatform: 'Подключаем платформу…',
    loadingCloud: 'Синхронизируем прогресс…',
    loadingWorld: 'Готовим бесконечный склон…',
    ready: 'Готово!',
    startupError: 'Не удалось запустить игру. Обновите страницу.',
  },
  en: {
    gameTitle: 'Snow Sling',
    menuTitle: 'Snow<br />Sling',
    menuEyebrow: 'ENDLESS DOWNHILL',
    menuDescription: 'Launch your rider, collect coins, and travel farther every run.',
    launchUpgrade: 'Launch',
    sledUpgrade: 'Sled',
    incomeUpgrade: 'Income',
    level: 'Lv.',
    start: 'START RUN',
    controlNote: 'Swipe left and right while riding downhill',
    hold: 'HOLD',
    buildPower: 'Build your power',
    release: 'Release to launch',
    distanceUnit: 'm',
    speedUnit: 'km/h',
    resultEyebrow: 'RUN COMPLETE',
    newRecord: 'New record!',
    collected: 'Collected',
    doubleAd: 'DOUBLE WITH AN AD',
    rewardClaimed: 'REWARD CLAIMED',
    again: 'PLAY AGAIN',
    menu: 'MENU',
    pause: 'Paused',
    resume: 'RESUME',
    quit: 'END RUN',
    notEnoughCoins: 'Not enough coins',
    upgradeBought: 'Upgrade purchased!',
    adUnavailable: 'Ad is unavailable right now',
    rewardDoubled: 'Reward doubled: +{coins} coins',
    perfectLanding: 'PERFECT LANDING',
    loadingSettings: 'Loading settings…',
    loadingPlatform: 'Connecting platform…',
    loadingCloud: 'Syncing progress…',
    loadingWorld: 'Preparing the endless slope…',
    ready: 'Ready!',
    startupError: 'The game could not start. Refresh the page.',
  },
} as const;

export class UIController {
  private screens = new Map<string, HTMLElement>();
  private toastTimer = 0;
  private comboTimer = 0;
  private language: Language = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';

  constructor() {
    for (const id of ['loading', 'menu', 'launch-screen', 'result', 'pause']) {
      this.screens.set(id, this.element<HTMLElement>(id));
    }
    this.setLanguage(this.language);
  }

  setLanguage(language: string): void {
    this.language = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    document.documentElement.lang = this.language;
    document.title = this.translate('gameTitle');
    this.element('loading-title').textContent = this.translate('gameTitle');
    this.element('menu-eyebrow').textContent = this.translate('menuEyebrow');
    this.element('menu-title').innerHTML = this.translate('menuTitle');
    this.element('menu-description').textContent = this.translate('menuDescription');
    this.element('start-button').textContent = this.translate('start');
    this.element('control-note').textContent = this.translate('controlNote');
    this.element('launch-overline').textContent = this.translate('hold');
    this.element('launch-title').textContent = this.translate('buildPower');
    this.element('launch-hint').textContent = this.translate('release');
    this.element('distance-unit').textContent = this.translate('distanceUnit');
    this.element('speed-unit').textContent = this.translate('speedUnit');
    this.element('result-eyebrow').textContent = this.translate('resultEyebrow');
    this.element('result-distance-unit').textContent = this.translate('distanceUnit');
    this.element('new-record').textContent = this.translate('newRecord');
    this.element('collected-label').textContent = this.translate('collected');
    this.element('again-button').textContent = this.translate('again');
    this.element('menu-button').textContent = this.translate('menu');
    this.element('pause-title').textContent = this.translate('pause');
    this.element('resume-button').textContent = this.translate('resume');
    this.element('quit-button').textContent = this.translate('quit');
    document.querySelector<HTMLElement>('[data-label="launch"]')!.textContent = this.translate('launchUpgrade');
    document.querySelector<HTMLElement>('[data-label="sled"]')!.textContent = this.translate('sledUpgrade');
    document.querySelector<HTMLElement>('[data-label="income"]')!.textContent = this.translate('incomeUpgrade');
    document.querySelectorAll<HTMLElement>('.upgrade-copy small').forEach((element) => {
      const level = element.querySelector<HTMLElement>('[data-level]')?.textContent ?? '1';
      element.textContent = `${this.translate('level')} `;
      const span = document.createElement('span');
      const kind = element.closest<HTMLButtonElement>('[data-upgrade]')?.dataset.upgrade;
      if (kind) span.dataset.level = kind;
      span.textContent = level;
      element.append(span);
    });
    this.setDoubleButtonEnabled(!this.element<HTMLButtonElement>('double-button').disabled);
  }

  translate(key: TranslationKey, variables: Record<string, string | number> = {}): string {
    let text: string = translations[this.language][key];
    for (const [name, value] of Object.entries(variables)) text = text.replace(`{${name}}`, String(value));
    return text;
  }

  bindGame(game: Game, save: SaveStore): void {
    this.element<HTMLButtonElement>('start-button').addEventListener('click', () => game.beginLaunch());
    this.element<HTMLButtonElement>('pause-button').addEventListener('click', () => game.pause());
    this.element<HTMLButtonElement>('resume-button').addEventListener('click', () => game.resume());
    this.element<HTMLButtonElement>('quit-button').addEventListener('click', () => game.quitRun());
    this.element<HTMLButtonElement>('again-button').addEventListener('click', () => game.beginLaunch());
    this.element<HTMLButtonElement>('menu-button').addEventListener('click', () => game.returnToMenu());
    this.element<HTMLButtonElement>('double-button').addEventListener('click', () => void game.doubleReward());

    document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.upgrade as keyof UpgradeState;
        if (!save.buyUpgrade(kind)) {
          this.toast(this.translate('notEnoughCoins'));
          button.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' },
          ], { duration: 240 });
          return;
        }
        this.toast(this.translate('upgradeBought'));
        this.refreshMenu(save.data, save);
      });
    });
  }

  setLoading(progress: number, text: string): void {
    this.element<HTMLElement>('loading-bar').style.width = `${Math.round(progress * 100)}%`;
    this.element<HTMLElement>('loading-text').textContent = text;
  }

  hideLoading(): void {
    this.element('loading').classList.add('hidden');
  }

  showMode(mode: GameMode): void {
    const map: Record<GameMode, string | null> = {
      menu: 'menu',
      launch: 'launch-screen',
      running: null,
      paused: 'pause',
      result: 'result',
    };
    for (const screen of this.screens.values()) screen.classList.add('hidden');
    const target = map[mode];
    if (target) this.element(target).classList.remove('hidden');
    this.element('hud').classList.toggle('hidden', mode !== 'running');
  }

  refreshMenu(data: SaveData, save: SaveStore): void {
    this.element('menu-coins').textContent = Math.floor(data.coins).toString();
    this.element('menu-best').textContent = `${Math.floor(data.bestDistance)} ${this.translate('distanceUnit')}`;
    (['launch', 'sled', 'income'] as const).forEach((kind) => {
      const level = data.upgrades[kind];
      const levelElement = document.querySelector<HTMLElement>(`[data-level="${kind}"]`);
      const costElement = document.querySelector<HTMLElement>(`[data-cost="${kind}"]`);
      if (levelElement) levelElement.textContent = level.toString();
      if (costElement) costElement.textContent = save.upgradeCost(kind).toString();
      const button = document.querySelector<HTMLButtonElement>(`[data-upgrade="${kind}"]`);
      if (button) button.classList.toggle('affordable', data.coins >= save.upgradeCost(kind));
    });
  }

  updateLaunchPower(power: number): void {
    const fill = this.element<HTMLElement>('power-fill');
    fill.style.width = `${Math.round(power * 100)}%`;
    fill.classList.toggle('perfect', power > 0.78 && power < 0.94);
  }

  updateHud(distance: number, speed: number, coins: number): void {
    this.element('distance-value').textContent = Math.floor(distance).toString();
    this.element('speed-value').textContent = Math.floor(speed).toString();
    this.element('run-coins').textContent = Math.floor(coins).toString();
  }

  showResult(distance: number, coins: number, newRecord: boolean): void {
    this.element('result-distance').textContent = Math.floor(distance).toString();
    this.element('result-coins').textContent = Math.floor(coins).toString();
    this.element('new-record').classList.toggle('hidden', !newRecord);
    this.setDoubleButtonEnabled(true);
  }

  updateResultCoins(coins: number): void {
    this.element('result-coins').textContent = Math.floor(coins).toString();
  }

  setDoubleButtonEnabled(value: boolean): void {
    const button = this.element<HTMLButtonElement>('double-button');
    button.disabled = !value;
    button.textContent = value ? this.translate('doubleAd') : this.translate('rewardClaimed');
  }

  showCombo(text: string): void {
    const combo = this.element('combo');
    combo.textContent = text;
    combo.classList.remove('hidden');
    window.clearTimeout(this.comboTimer);
    this.comboTimer = window.setTimeout(() => combo.classList.add('hidden'), 1100);
  }

  toast(text: string): void {
    const toast = this.element('toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 1800);
  }

  updateDebug(enabled: boolean, stats: DebugStats): void {
    const debug = this.element('debug');
    debug.classList.toggle('hidden', !enabled);
    if (!enabled) return;
    debug.textContent = `FPS ${stats.fps.toFixed(0)}\nquality ${stats.quality}\ndistance ${stats.distance}\nspeed ${stats.speed.toFixed(1)}\norigin ${stats.origin}`;
  }

  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing UI element #${id}`);
    return element as T;
  }
}
