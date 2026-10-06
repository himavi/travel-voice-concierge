/**
 * Gapless scheduled playback on a shared AudioContext.
 *
 * - `enqueuePcm16()` takes raw little-endian PCM16 (Gemini Live sends 24 kHz
 *   mono in small chunks) and schedules each chunk right after the previous one.
 * - `playEncoded()` decodes a whole compressed clip (the voice-lite MP3) and
 *   schedules it the same way.
 * - `flush()` stops everything immediately (barge-in).
 * - `onStart` fires when playback goes from silent to audible, `onIdle` when
 *   the queue fully drains (or is flushed). Agent "speaking" status is driven
 *   from these, never from the server.
 */
export class PcmPlayer {
  onStart: (() => void) | null = null;
  onIdle: (() => void) | null = null;

  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private generation = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  /** Schedule PCM16 LE bytes (mono) at `sampleRate`. */
  enqueuePcm16(bytes: Uint8Array, sampleRate = 24000): void {
    const samples = Math.floor(bytes.byteLength / 2);
    if (samples === 0) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
    const buffer = this.ctx.createBuffer(1, samples, sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) ch[i] = view.getInt16(i * 2, true) / 0x8000;
    this.schedule(buffer);
  }

  /** Decode and play a whole compressed clip (MP3/WAV). Resolves once scheduled. */
  async playEncoded(bytes: Uint8Array): Promise<void> {
    const gen = this.generation;
    const copy = bytes.slice().buffer; // decodeAudioData detaches its input
    const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      // Callback form as well as the promise: older Safari only has callbacks.
      const p = this.ctx.decodeAudioData(copy, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
    if (gen !== this.generation) return; // flushed while decoding
    this.schedule(buffer);
  }

  /** Stop all queued/playing audio now. */
  flush(): void {
    this.generation++;
    const wasPlaying = this.sources.size > 0;
    for (const src of Array.from(this.sources)) {
      src.onended = null;
      try { src.stop(); } catch { /* not started */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    this.sources.clear();
    this.nextTime = 0;
    if (wasPlaying) this.onIdle?.();
  }

  dispose(): void {
    this.flush();
    try { this.out.disconnect(); } catch { /* ignore */ }
  }

  private schedule(buffer: AudioBuffer): void {
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);

    const now = this.ctx.currentTime;
    // Small lead on a fresh start absorbs network jitter between chunks.
    const startAt = this.nextTime > now ? this.nextTime : now + 0.05;
    this.nextTime = startAt + buffer.duration;

    const wasIdle = this.sources.size === 0;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      try { src.disconnect(); } catch { /* ignore */ }
      if (this.sources.size === 0) {
        this.nextTime = 0;
        this.onIdle?.();
      }
    };
    src.start(startAt);
    if (wasIdle) this.onStart?.();
  }
}
