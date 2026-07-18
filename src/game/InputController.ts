export class InputController {
  steer = 0;
  private keyLeft = false;
  private keyRight = false;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerCurrentX = 0;
  private enabled = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    target.addEventListener('pointermove', this.onPointerMove, { passive: false });
    target.addEventListener('pointerup', this.onPointerUp, { passive: false });
    target.addEventListener('pointercancel', this.onPointerUp, { passive: false });
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.steer = 0;
      this.pointerId = null;
      this.keyLeft = false;
      this.keyRight = false;
    }
  }

  update(): void {
    if (!this.enabled) {
      this.steer = 0;
      return;
    }
    const keyboard = Number(this.keyRight) - Number(this.keyLeft);
    if (keyboard !== 0) this.steer = keyboard;
    else if (this.pointerId !== null) this.steer = Math.max(-1, Math.min(1, (this.pointerCurrentX - this.pointerStartX) / 85));
    else this.steer *= 0.82;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      this.keyLeft = true;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      this.keyRight = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.keyLeft = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.keyRight = false;
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerCurrentX = event.clientX;
    this.target.setPointerCapture?.(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.pointerCurrentX = event.clientX;
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.pointerId = null;
  };
}
