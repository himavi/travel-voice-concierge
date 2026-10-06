/**
 * Simple energy-based speech endpointer for voice-lite mode.
 *
 * Fed 40 ms PCM chunks with their RMS. Tracks an adaptive noise floor while
 * idle, declares speech onset after a few loud chunks, and end-of-speech after
 * `silenceMs` of quiet. Keeps a short pre-roll so the first syllable isn't
 * clipped. In Live mode it is used only to drive the local "listening" status;
 * Gemini does its own server-side turn detection.
 */

export interface EndpointerOptions {
  chunkMs: number;
  /** Absolute RMS floor below which nothing counts as speech. */
  minRms: number;
  /** Onset requires RMS above noiseFloor × this. */
  noiseRatio: number;
  /** Consecutive loud ms needed to declare onset. */
  onsetMs: number;
  /** Quiet ms after speech that ends the utterance. */
  silenceMs: number;
  /** Utterances with less voiced time than this are discarded as blips. */
  minSpeechMs: number;
  /** Hard cap (backend accepts ≤ 30 s). */
  maxMs: number;
  preRollMs: number;
}

const DEFAULTS: EndpointerOptions = {
  chunkMs: 40,
  minRms: 0.012,
  noiseRatio: 2.5,
  onsetMs: 120,
  silenceMs: 1000,
  minSpeechMs: 250,
  maxMs: 28000,
  preRollMs: 320,
};

export type EndpointerEvent =
  | { type: "start" }
  | { type: "end"; audio: Int16Array[]; voicedMs: number; durationMs: number }
  | { type: "discard" };

export class EnergyEndpointer {
  private readonly o: EndpointerOptions;
  private noiseFloor = 0.005;
  private preRoll: Int16Array[] = [];
  private recorded: Int16Array[] = [];
  private inSpeech = false;
  private loudRun = 0;
  private quietMs = 0;
  private voicedMs = 0;
  private durationMs = 0;

  constructor(options: Partial<EndpointerOptions> = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  get speaking(): boolean {
    return this.inSpeech;
  }

  /** Drop any partial utterance and pre-roll (e.g. after Aria finished talking). */
  reset(): void {
    this.preRoll = [];
    this.recorded = [];
    this.inSpeech = false;
    this.loudRun = 0;
    this.quietMs = 0;
    this.voicedMs = 0;
    this.durationMs = 0;
  }

  /** End the current utterance now (user tapped "done"). */
  forceEnd(): EndpointerEvent | null {
    if (!this.inSpeech) return null;
    return this.finish();
  }

  push(chunk: Int16Array, rms: number): EndpointerEvent | null {
    const { chunkMs } = this.o;
    const threshold = Math.max(this.o.minRms, this.noiseFloor * this.o.noiseRatio);
    const loud = rms > threshold;

    if (!this.inSpeech) {
      // Adapt the floor only on quiet chunks so speech doesn't raise it.
      if (!loud) this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
      this.preRoll.push(chunk);
      const maxPre = Math.ceil(this.o.preRollMs / chunkMs);
      while (this.preRoll.length > maxPre) this.preRoll.shift();

      this.loudRun = loud ? this.loudRun + chunkMs : 0;
      if (this.loudRun >= this.o.onsetMs) {
        this.inSpeech = true;
        this.recorded = this.preRoll;
        this.preRoll = [];
        this.voicedMs = this.loudRun;
        this.durationMs = this.recorded.length * chunkMs;
        this.quietMs = 0;
        return { type: "start" };
      }
      return null;
    }

    this.recorded.push(chunk);
    this.durationMs += chunkMs;
    if (loud) {
      this.voicedMs += chunkMs;
      this.quietMs = 0;
    } else {
      this.quietMs += chunkMs;
    }
    if (this.quietMs >= this.o.silenceMs || this.durationMs >= this.o.maxMs) {
      return this.finish();
    }
    return null;
  }

  private finish(): EndpointerEvent {
    const audio = this.recorded;
    const voicedMs = this.voicedMs;
    const durationMs = this.durationMs;
    this.reset();
    if (voicedMs < this.o.minSpeechMs) return { type: "discard" };
    return { type: "end", audio, voicedMs, durationMs };
  }
}
