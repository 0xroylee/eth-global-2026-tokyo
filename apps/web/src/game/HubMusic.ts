/** Original, quiet pentatonic garden loop. Shares the user-unlocked effects context. */
export class HubMusic {
  private timer: ReturnType<typeof setInterval> | undefined;
  private voices = new Set<OscillatorNode>();
  private next = 0;
  private beat = 0;

  constructor(private context: AudioContext) {}

  start() {
    if (this.timer !== undefined) return;
    this.next = this.context.currentTime + 0.04;
    this.beat = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* Already ended. */ }
      voice.disconnect();
    }
    this.voices.clear();
  }

  private note(midi: number, start: number, duration: number, gain: number) {
    const voice = this.context.createOscillator();
    const envelope = this.context.createGain();
    voice.type = "sine";
    voice.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    voice.connect(envelope).connect(this.context.destination);
    this.voices.add(voice);
    voice.onended = () => {
      this.voices.delete(voice);
      voice.disconnect();
      envelope.disconnect();
    };
    voice.start(start);
    voice.stop(start + duration + 0.02);
  }

  private schedule() {
    if (this.context.state !== "running") return;
    // Skip missed time rather than replaying a burst after a stalled frame.
    if (this.next < this.context.currentTime) this.next = this.context.currentTime + 0.04;
    const melody = [72, 76, 79, 0, 81, 79, 76, 0, 74, 76, 79, 76, 74, 72, 0, 0];
    const roots = [48, 45, 53, 55];
    while (this.next < this.context.currentTime + 0.16) {
      const pitch = melody[this.beat % melody.length]!;
      if (pitch) this.note(pitch, this.next, 0.75, 0.012);
      if (this.beat % 4 === 0) {
        const root = roots[Math.floor(this.beat / 4) % roots.length]!;
        this.note(root, this.next, 1.8, 0.009);
        this.note(root + 7, this.next, 1.8, 0.005);
      }
      this.beat = (this.beat + 1) % 16;
      this.next += 0.5;
    }
  }
}
