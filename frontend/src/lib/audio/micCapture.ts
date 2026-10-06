/**
 * Microphone capture through the PCM AudioWorklet.
 *
 * The AudioContext must already exist (created inside the user's tap for iOS);
 * this only wires `getUserMedia` → worklet and forwards 16 kHz Int16 chunks.
 */

export const CAPTURE_RATE = 16000;
export const CAPTURE_CHUNK_MS = 40;

export class AudioWorkletUnsupportedError extends Error {
  constructor() {
    super("AudioWorklet is not supported in this browser");
    this.name = "AudioWorkletUnsupportedError";
  }
}

export function supportsAudioWorklet(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    "audioWorklet" in AudioContext.prototype
  );
}

/** Ask for the mic with the browser's own echo/noise/gain processing on. */
export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/**
 * iOS/Safari 16.4+: route audio as a call (mic + speaker together) so playback
 * isn't ducked or sent to the earpiece once the mic opens. No-op elsewhere.
 */
export function setPlayAndRecordSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = "play-and-record";
  } catch {
    // Older WebKit exposes the object read-only — nothing to do.
  }
}

const loadedContexts = new WeakSet<BaseAudioContext>();

export interface MicCapture {
  stop(): void;
}

export async function startMicCapture(
  ctx: AudioContext,
  stream: MediaStream,
  onChunk: (pcm: Int16Array, rms: number) => void,
): Promise<MicCapture> {
  if (!supportsAudioWorklet() || !ctx.audioWorklet) throw new AudioWorkletUnsupportedError();

  if (!loadedContexts.has(ctx)) {
    // webpack emits the worklet as a static asset and rewrites this URL.
    await ctx.audioWorklet.addModule(new URL("./pcm-capture-worklet.js", import.meta.url));
    loadedContexts.add(ctx);
  }

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetRate: CAPTURE_RATE, chunkMs: CAPTURE_CHUNK_MS },
  });
  // Some engines only pull a node that reaches the destination; route it
  // through a muted gain so nothing is audible.
  const sink = ctx.createGain();
  sink.gain.value = 0;

  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
    onChunk(new Int16Array(e.data.pcm), e.data.rms);
  };
  source.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);

  return {
    stop() {
      node.port.onmessage = null;
      try { source.disconnect(); } catch { /* already disconnected */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
      try { sink.disconnect(); } catch { /* already disconnected */ }
    },
  };
}
