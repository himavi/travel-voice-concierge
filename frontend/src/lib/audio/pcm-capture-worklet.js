/* eslint-disable no-undef */
/**
 * AudioWorklet: microphone → 16 kHz mono Int16 PCM, emitted in ~40 ms chunks.
 *
 * Runs on the audio rendering thread. `sampleRate` is the AudioWorkletGlobalScope
 * global holding the context's real rate (usually 44.1/48 kHz). We never rely
 * on getUserMedia/AudioContext honouring a requested 16 kHz rate: Safari
 * ignores it, so we always downmix + resample here with linear interpolation.
 *
 * Each message posted to the main thread is
 *   { pcm: ArrayBuffer (Int16 LE samples), rms: number (0..1) }
 * with the ArrayBuffer transferred (zero-copy).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.chunkSamples = Math.round((this.targetRate * (opts.chunkMs || 40)) / 1000);
    this.ratio = sampleRate / this.targetRate; // input samples per output sample
    // Resampler state: `pos` is the read position of the next output sample,
    // relative to the start of the current input block, where index -1 is the
    // last sample of the previous block (kept in `prev`).
    this.pos = 0;
    this.prev = 0;
    this.chunk = new Int16Array(this.chunkSamples);
    this.fill = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const n = input[0].length;
    const channels = input.length;

    // Downmix to mono.
    let mono = input[0];
    if (channels > 1) {
      mono = new Float32Array(n);
      for (let c = 0; c < channels; c++) {
        const ch = input[c];
        for (let i = 0; i < n; i++) mono[i] += ch[i];
      }
      for (let i = 0; i < n; i++) mono[i] /= channels;
    }

    // Linear-interpolation resample across block boundaries.
    while (this.pos < n - 1) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i < 0 ? this.prev : mono[i];
      const b = mono[i + 1];
      this.push(a + (b - a) * frac);
      this.pos += this.ratio;
    }
    this.pos -= n;
    this.prev = mono[n - 1];

    return true;
  }

  push(sample) {
    const s = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    this.chunk[this.fill++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.sumSq += s * s;
    if (this.fill === this.chunkSamples) {
      const rms = Math.sqrt(this.sumSq / this.chunkSamples);
      const out = this.chunk;
      this.port.postMessage({ pcm: out.buffer, rms }, [out.buffer]);
      this.chunk = new Int16Array(this.chunkSamples);
      this.fill = 0;
      this.sumSq = 0;
    }
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
