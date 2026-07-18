export class AudioSystem {
  private context: AudioContext | null = null;
  private muted = false;

  setMuted(value: boolean): void {
    this.muted = value;
    if (!this.context) return;
    if (value) void this.context.suspend();
    else void this.context.resume();
  }

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended' && !this.muted) void this.context.resume();
  }

  play(type: 'coin' | 'jump' | 'hit' | 'boost' | 'start' | 'upgrade'): void {
    if (this.muted) return;
    this.unlock();
    const context = this.context;
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const frequency = {
      coin: 880,
      jump: 440,
      hit: 110,
      boost: 620,
      start: 300,
      upgrade: 740,
    }[type];
    oscillator.type = type === 'hit' ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'hit' ? 55 : frequency * 1.35, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'hit' ? 0.12 : 0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }
}
