"use client";

import { useEffect, useRef } from "react";

/**
 * Aria's voice orb, drawn on a canvas.
 *
 * Visual language (one accent, motion only where it explains state):
 *  - ambient:   lit core, rings breathe slowly       → "mic open, say something"
 *  - listening: rings follow the real mic level       → "I can hear you"
 *  - thinking:  cool core, a single arc sweeps a ring → "working on it"
 *  - speaking:  core swells, rings ripple outward     → "Aria is talking"
 *  - muted:     dim, still                            → "mic off"
 *  - standby:   warm but still                        → "text chat; tap for voice"
 *  - waking:    cool, slow sweep                      → "server cold-starting"
 *
 * All parameters ease toward their per-state targets every frame, so state
 * changes morph instead of snapping. With prefers-reduced-motion the orb
 * renders one static frame per state.
 */
export type OrbState = "muted" | "standby" | "ambient" | "listening" | "thinking" | "speaking" | "waking";

interface Props {
  state: OrbState;
  /** CSS pixels (square). */
  size: number;
  /** 0–1 live input level, sampled every frame while listening. */
  getLevel?: () => number;
  className?: string;
}

type RGB = [number, number, number];
const ACCENT: RGB = [231, 184, 119];
const THINK: RGB = [169, 177, 191];
const MUTED: RGB = [112, 110, 106];

interface Params {
  color: RGB;
  glow: number;   // halo + ring intensity
  core: number;   // core radius multiplier
  bright: number; // core luminance
  amp: number;    // ring displacement
  sweep: number;  // thinking arc opacity
  speed: number;  // phase speed
}

const TARGETS: Record<OrbState, Params> = {
  muted:     { color: MUTED,  glow: 0.08, core: 0.9,  bright: 0.42, amp: 0.0,  sweep: 0, speed: 0.25 },
  standby:   { color: ACCENT, glow: 0.16, core: 0.92, bright: 0.5,  amp: 0.0,  sweep: 0, speed: 0.25 },
  ambient:   { color: ACCENT, glow: 0.42, core: 1.0,  bright: 0.86, amp: 0.1,  sweep: 0, speed: 0.55 },
  waking:    { color: THINK,  glow: 0.2,  core: 0.92, bright: 0.55, amp: 0.03, sweep: 1, speed: 0.55 },
  listening: { color: ACCENT, glow: 0.62, core: 1.0,  bright: 1.0,  amp: 0.26, sweep: 0, speed: 1.15 },
  thinking:  { color: THINK,  glow: 0.32, core: 0.93, bright: 0.72, amp: 0.05, sweep: 1, speed: 0.9 },
  speaking:  { color: ACCENT, glow: 0.78, core: 1.04, bright: 1.0,  amp: 0.5,  sweep: 0, speed: 1.55 },
};

const RING_POINTS = 120;

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [8, 8, 9];

export function OrbCanvas({ state, size, getLevel, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelFnRef = useRef(getLevel);
  stateRef.current = state;
  levelFnRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    const onMq = () => { reduced = mq.matches; lastStatic = null; };
    mq.addEventListener?.("change", onMq);

    const c = size / 2;
    const R = size * 0.235;
    const cur: Params = { ...TARGETS[stateRef.current], color: [...TARGETS[stateRef.current].color] as RGB };
    let t = 0;
    let level = 0;
    let last = performance.now();
    let raf = 0;
    let lastStatic: OrbState | null = null;

    const draw = (energy: number, lvl: number) => {
      const s = stateRef.current;
      ctx.clearRect(0, 0, size, size);

      // Halo
      const halo = ctx.createRadialGradient(c, c, R * 0.5, c, c, R * 2.15);
      halo.addColorStop(0, rgba(cur.color, cur.glow * 0.32));
      halo.addColorStop(1, rgba(cur.color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // Waveform rings
      const amp = cur.amp * (s === "listening" || s === "speaking" ? 0.3 + energy : 0.55 + 0.45 * energy);
      for (let i = 0; i < 3; i++) {
        const base = R * (1.24 + i * 0.17);
        const disp = R * amp * (0.42 - i * 0.07);
        ctx.beginPath();
        for (let p = 0; p <= RING_POINTS; p++) {
          const a = (p / RING_POINTS) * Math.PI * 2;
          // Low harmonics only: smooth, liquid rings rather than jagged contours.
          const w =
            0.6 * Math.sin(2 * a + t * 1.1 + i * 1.7) +
            0.4 * Math.sin(3 * a - t * 1.5 + i * 0.9);
          const r = base + disp * w;
          const x = c + Math.cos(a) * r;
          const y = c + Math.sin(a) * r;
          if (p === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = rgba(cur.color, (0.5 - i * 0.14) * (0.3 + cur.glow));
        ctx.lineWidth = i === 0 ? 1.4 : 1.1;
        ctx.stroke();
      }

      // Thinking / waking: one arc sweeping the middle ring
      if (cur.sweep > 0.02) {
        const rr = R * 1.41;
        const a0 = t * 2.4;
        const segs = 18;
        const span = 1.25;
        ctx.lineCap = "round";
        for (let k = 0; k < segs; k++) {
          const f = k / segs;
          ctx.beginPath();
          ctx.arc(c, c, rr, a0 + f * span, a0 + (f + 1 / segs) * span + 0.01);
          ctx.strokeStyle = rgba(cur.color, cur.sweep * 0.85 * f);
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }

      // Core: a lit sphere
      const swell = s === "speaking" ? energy * 0.06 : s === "listening" ? lvl * 0.07 : 0;
      const cr = R * cur.core * (1 + swell);
      const lit = mix(cur.color, WHITE, 0.38);
      const deep = mix(cur.color, BLACK, 0.62);
      const g = ctx.createRadialGradient(c - cr * 0.34, c - cr * 0.4, cr * 0.05, c, c, cr * 1.04);
      g.addColorStop(0, rgba(mix(deep, lit, cur.bright), 1));
      g.addColorStop(0.5, rgba(mix(deep, cur.color, cur.bright), 1));
      g.addColorStop(1, rgba(mix(BLACK, deep, 0.35 + cur.bright * 0.65), 1));
      ctx.beginPath();
      ctx.arc(c, c, cr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = stateRef.current;
      const target = TARGETS[s];

      if (reduced) {
        if (lastStatic === s) return;
        lastStatic = s;
        Object.assign(cur, target, { color: [...target.color] as RGB });
        t = 1.2;
        draw(s === "speaking" ? 0.55 : s === "listening" ? 0.45 : 0.5, 0.3);
        return;
      }

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt * 5);
      cur.glow += (target.glow - cur.glow) * k;
      cur.core += (target.core - cur.core) * k;
      cur.bright += (target.bright - cur.bright) * k;
      cur.amp += (target.amp - cur.amp) * k;
      cur.sweep += (target.sweep - cur.sweep) * k;
      cur.speed += (target.speed - cur.speed) * k;
      cur.color = mix(cur.color, target.color, k);
      t += dt * cur.speed * 1.6;

      const raw = s === "listening" && levelFnRef.current ? levelFnRef.current() : 0;
      level += (raw - level) * (raw > level ? 0.35 : 0.1);

      let energy: number;
      if (s === "listening") energy = Math.min(1, 0.12 + level * 1.1);
      else if (s === "speaking") {
        // Syllable-like envelope: Aria's output level isn't exposed, so
        // speaking motion is synthetic but stays inside the same visual range.
        const env = Math.abs(Math.sin(t * 3.3)) * (0.6 + 0.4 * Math.sin(t * 0.9 + 1.3));
        energy = Math.min(1, 0.2 + env * 0.75);
      } else energy = 0.5 + 0.5 * Math.sin(t * 0.8);

      draw(energy, level);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener?.("change", onMq);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}
