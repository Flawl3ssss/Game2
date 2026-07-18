import './style.css';
import { SnowGame, type SnowGameUi } from './SnowGame';

function requireElement<T extends HTMLElement>(id: string, constructor: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Не найден элемент интерфейса: #${id}`);
  return element;
}

const canvas = requireElement('playcanvas-app', HTMLCanvasElement);
const menu = requireElement('menu', HTMLElement);
const menuTitle = requireElement('menu-title', HTMLElement);
const menuCopy = requireElement('menu-copy', HTMLParagraphElement);
const startButton = requireElement('start-button', HTMLButtonElement);
const distanceValue = requireElement('distance-value', HTMLElement);
const coinsValue = requireElement('coins-value', HTMLElement);
const controlHint = requireElement('control-hint', HTMLParagraphElement);
const fatalError = requireElement('fatal-error', HTMLPreElement);

let hintTimer = 0;

const ui: SnowGameUi = {
  setDistance(value: number): void {
    distanceValue.textContent = `${Math.floor(value)} м`;
  },
  setCoins(value: number): void {
    coinsValue.textContent = String(value);
  },
  hideMenu(): void {
    menu.classList.add('is-hidden');
  },
  showMenu(title: string, copy: string, buttonLabel: string): void {
    menuTitle.textContent = title;
    menuCopy.textContent = copy;
    startButton.textContent = buttonLabel;
    menu.classList.remove('is-hidden');
  },
  showControlHint(): void {
    window.clearTimeout(hintTimer);
    controlHint.classList.add('is-visible');
    hintTimer = window.setTimeout(() => controlHint.classList.remove('is-visible'), 2600);
  },
};

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  fatalError.textContent = message;
  fatalError.classList.add('is-visible');
  console.error(error);
}

try {
  const game = new SnowGame(canvas, ui);
  startButton.addEventListener('click', () => game.startRun());
} catch (error: unknown) {
  showFatalError(error);
}

window.addEventListener('error', (event) => showFatalError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));
