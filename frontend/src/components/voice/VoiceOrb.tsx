"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentStatus } from "@/lib/types";
import clsx from "clsx";

interface Props {
  status: AgentStatus;
  liveMode: boolean;
  onTap: () => void;
  /** Live 0–1 mic amplitude, sampled from the real analyser each frame. */
  getInputLevel?: () => number;
}

function getLabel(status: AgentStatus, liveMode: boolean): string {
  switch (status) {
    case "listening": return "Listening — tap when you're done, or pause to send automatically";
    case "thinking":  return "Thinking";
    case "speaking":  return "Speaking — tap to interrupt";
    default:          return liveMode
      ? "Live — just start talking whenever you're ready. Tap to mute."
      : "Muted. Tap, or press Enter or Space, to resume listening";
  }
}

function getStatusText(status: AgentStatus, liveMode: boolean): string {
  switch (status) {
    case "listening": return "Listening — tap when done";
    case "thinking":  return "Thinking";
    case "speaking":  return "Speaking · tap to interrupt";
    default:          return liveMode ? "Live — just start talking" : "Muted — tap to resume";
  }
}

// Per-state look: point count kept low/consistent, everything else is
// interpolated toward smoothly each frame rather than swapped instantly.
const STATE_PARAMS: Record<string, {
  base: number; wobble: number; speed: number; reactive: number;
  colorA: string; colorB: string; glow: string;
}> = {
  idle:      { base: 0.62, wobble: 0.035, speed: 0.55, reactive: 0,    colorA: "#6B6255", colorB: "#48423A", glow: "rgba(255,107,74,0.10)" },
  ambient:   { base: 0.64, wobble: 0.05,  speed: 0.7,  reactive: 0,    colorA: "#FF8A65", colorB: "#E8523A", glow: "rgba(255,107,74,0.45)" },
  listening: { base: 0.62, wobble: 0.06,  speed: 1.3,  reactive: 0.34, colorA: "#F2726B", colorB: "#C43D33", glow: "rgba(240,82,90,0.55)" },
  thinking:  { base: 0.58, wobble: 0.09,  speed: 0.9,  reactive: 0,    colorA: "#A6ADBE", colorB: "#5B6274", glow: "rgba(139,147,168,0.4)" },
  speaking:  { base: 0.64, wobble: 0.1,   speed: 2.1,  reactive: 0,    colorA: "#FFD08A", colorB: "#F5A623", glow: "rgba(245,166,35,0.5)" },
  muted:     { base: 0.56, wobble: 0.02,  speed: 0.3,  reactive: 0,    colorA: "#5E594E", colorB: "#3A362E", glow: "rgba(255,255,255,0.08)" },
};

function stateKey(status: AgentStatus, liveMode: boolean): keyof typeof STATE_PARAMS {
  if (status === "listening") return "listening";
  if (status === "thinking") return "thinking";
  if (status === "speaking") return "speaking";
  return liveMode ? "ambient" : "muted";
}

const POINTS = 40;

export function VoiceOrb({ status, liveMode, onTap, getInputLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  // Smoothed, lerped-toward parameters so state changes morph, not snap.
  const currentRef = useRef({ ...STATE_PARAMS.idle });
  const levelRef = useRef(0); // smoothed audio level

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.36;

    const reduced = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const key = stateKey(status, liveMode);
      const target = STATE_PARAMS[key];
      const cur = currentRef.current;

      // Ease every visual parameter toward its target — this is what makes
      // state changes morph into each other instead of hard-cutting.
      const ease = reduced ? 1 : 0.06;
      cur.base = cur.base + (target.base - cur.base) * ease;
      cur.wobble = cur.wobble + (target.wobble - cur.wobble) * ease;
      cur.speed = cur.speed + (target.speed - cur.speed) * ease;
      cur.reactive = cur.reactive + (target.reactive - cur.reactive) * ease;

      const targetLevel = key === "listening" && getInputLevel ? getInputLevel() : 0;
      levelRef.current = levelRef.current + (targetLevel - levelRef.current) * 0.25;

      tRef.current += 0.012 * cur.speed;
      const t = tRef.current;

      ctx.clearRect(0, 0, size, size);

      // Ambient glow behind the blob — color/intensity blends with state.
      const glowR = maxR * 1.9;
      const glow = ctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, glowR);
      glow.addColorStop(0, blendGlow(currentRef.current, key));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Organic blob path — radius per point = base + multi-octave wobble +
      // live audio reactivity (only non-zero while listening).
      const pts: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const angle = (i / POINTS) * Math.PI * 2;
        const n1 = Math.sin(angle * 3 + t * 1.7) * cur.wobble;
        const n2 = Math.sin(angle * 5 - t * 1.1) * cur.wobble * 0.6;
        const n3 = Math.cos(angle * 2 + t * 0.6) * cur.wobble * 0.4;
        const audioBump = levelRef.current * cur.reactive * (0.6 + 0.4 * Math.sin(angle * 7 + t * 4));
        const r = maxR * (cur.base + n1 + n2 + n3 + audioBump);
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.quadraticCurveTo(x0, y0, mx, my);
      }
      ctx.closePath();

      const fill = ctx.createRadialGradient(cx - maxR * 0.25, cy - maxR * 0.3, maxR * 0.1, cx, cy, maxR * 1.1);
      fill.addColorStop(0, currentRef.current.colorA);
      fill.addColorStop(1, currentRef.current.colorB);
      ctx.fillStyle = fill;
      ctx.fill();

      // Faint edge stroke — keeps the blob legible even in the dim/muted
      // state, where the fill alone sits close to the canvas background.
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Soft inner highlight for a bit of dimensionality
      ctx.save();
      ctx.clip();
      const hi = ctx.createRadialGradient(cx - maxR * 0.3, cy - maxR * 0.35, 0, cx - maxR * 0.3, cy - maxR * 0.35, maxR * 0.9);
      hi.addColorStop(0, "rgba(255,255,255,0.28)");
      hi.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hi;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    // Interpolate colors as plain strings isn't smooth across hex — swap
    // color target instantly (it's a subtle enough shift under motion blur
    // of the morph) while every geometric param eases continuously.
    currentRef.current.colorA = STATE_PARAMS[stateKey(status, liveMode)].colorA;
    currentRef.current.colorB = STATE_PARAMS[stateKey(status, liveMode)].colorB;

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, liveMode]);

  function blendGlow(cur: { base: number }, key: string) {
    return STATE_PARAMS[key].glow;
  }

  const isListening = status === "listening";
  const isThinking  = status === "thinking";
  const isSpeaking  = status === "speaking";
  const isIdle      = status === "idle";
  const isAmbient   = isIdle && liveMode;
  const isMuted     = isIdle && !liveMode;

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      {/* Status label — crossfades between states instead of hard-swapping */}
      <div className="h-9 relative w-[260px]" role="status" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            key={getStatusText(status, liveMode)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="text-[11px] font-semibold tracking-[0.14em] uppercase absolute inset-x-0 text-center leading-relaxed"
            style={{
              color: isListening ? "#F0525A"
                   : isThinking  ? "#8B93A8"
                   : isSpeaking  ? "#F5A623"
                   : isAmbient   ? "#FF8A65"
                   : "#5E594E",
            }}
          >
            {getStatusText(status, liveMode)}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Orb wrapper */}
      <div className="relative flex items-center justify-center w-[220px] h-[220px]">
        {isAmbient && (
          <>
            <span className="absolute inset-[-14px] rounded-full border orbit"
              style={{ borderColor: "rgba(255,107,74,0.18)", borderStyle: "dashed" }} />
            <span className="absolute inset-[-28px] rounded-full border orbit-rev"
              style={{ borderColor: "rgba(255,107,74,0.1)", borderStyle: "dashed" }} />
          </>
        )}

        <button
          type="button"
          onClick={onTap}
          disabled={isThinking}
          aria-label={getLabel(status, liveMode)}
          aria-pressed={isListening}
          className={clsx(
            "relative z-10 rounded-full flex items-center justify-center transition-transform duration-300 touch-manipulation",
            (isIdle || isSpeaking) && "hover:scale-[1.03] active:scale-95",
            isListening && "scale-105",
          )}
          style={{ cursor: isThinking ? "not-allowed" : "pointer", width: 220, height: 220 }}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{ filter: "url(#orb-liquid)" }}
          />
          {/* Center icon — kept minimal so the blob itself carries the state */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {(isAmbient || isMuted) && (
              <svg className={clsx("w-9 h-9 drop-shadow-lg transition-opacity", isMuted && "opacity-70")}
                fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                {isMuted && <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />}
              </svg>
            )}
          </div>
        </button>
      </div>

      {/* SVG filter, referenced by the canvas via CSS `filter: url(#orb-liquid)`.
          Static (non-animated) displacement — an animated turbulence seed
          recomputes the whole filter every frame, which is a real perf cost;
          a fixed distortion still reads as organic/liquid at this scale
          while the actual motion comes from the canvas geometry above. */}
      <svg width="0" height="0" aria-hidden="true">
        <filter id="orb-liquid">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}
