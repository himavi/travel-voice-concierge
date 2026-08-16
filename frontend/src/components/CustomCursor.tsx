"use client";

import { useEffect, useRef, useState } from "react";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  const pos  = useRef({ x: -100, y: -100 });
  const ring = useRef({ x: -100, y: -100 });

  const [ready,    setReady]    = useState(false);
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    // Only take over the cursor for devices that actually have a precise
    // pointer (mouse/trackpad) and haven't asked for reduced motion.
    // Touch devices have no hover cursor at all, and forcing `cursor: none`
    // on them (or on reduced-motion users) would leave people with no
    // visible pointer and no accessible fallback.
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    document.documentElement.classList.add("custom-cursor-active");
    setReady(true);

    const onMove = (e: MouseEvent) => { pos.current = { x: e.clientX, y: e.clientY }; };
    const onDown = () => setClicking(true);
    const onUp   = () => setClicking(false);
    const onOver = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      setHovering(!!el.closest("button, a, input, [role='button']"));
    };

    const onLeave = () => {
      pos.current  = { x: -100, y: -100 };
      ring.current = { x: -100, y: -100 };
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);

    // The dot tracks the pointer exactly; the ring eases toward it a beat
    // behind — that lag is what reads as "magnetic" rather than just a
    // second copy of the same dot.
    let raf: number;
    const tick = () => {
      ring.current.x += (pos.current.x - ring.current.x) * 0.2;
      ring.current.y += (pos.current.y - ring.current.y) * 0.2;

      if (dotRef.current)
        dotRef.current.style.transform = `translate(${pos.current.x}px,${pos.current.y}px)`;
      if (ringRef.current)
        ringRef.current.style.transform = `translate(${ring.current.x}px,${ring.current.y}px)`;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("custom-cursor-active");
    };
  }, []);

  if (!ready) return null;

  const ringSize = hovering ? 40 : 26;
  const dotSize = clicking ? 4 : hovering ? 0 : 6;

  return (
    <div aria-hidden="true">
      {/* Outer ring — lags slightly behind, expands on hover */}
      <div
        ref={ringRef}
        style={{
          position: "fixed", top: 0, left: 0,
          pointerEvents: "none", zIndex: 9999998,
          willChange: "transform",
        }}
      >
        <div style={{
          width: ringSize, height: ringSize,
          marginLeft: -ringSize / 2, marginTop: -ringSize / 2,
          borderRadius: "50%",
          // A neutral off-white ring (not coral) so it stays visible whether
          // it's sitting over the dark canvas or over a coral-colored button
          // — a coral-on-coral ring nearly disappeared during testing.
          border: `1.5px solid ${hovering ? "rgba(245,241,234,0.9)" : "rgba(245,241,234,0.4)"}`,
          background: hovering ? "rgba(245,241,234,0.1)" : "transparent",
          boxShadow: hovering ? "0 0 16px rgba(255,107,74,0.5)" : "none",
          transition: "width 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), margin 0.25s cubic-bezier(0.16,1,0.3,1), background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
        }} />
      </div>

      {/* Inner dot — tracks the pointer exactly, shrinks to nothing on
          hover so the ring alone frames the interactive target */}
      <div
        ref={dotRef}
        style={{
          position: "fixed", top: 0, left: 0,
          pointerEvents: "none", zIndex: 9999999,
          willChange: "transform",
        }}
      >
        <div style={{
          width: dotSize, height: dotSize,
          marginLeft: -dotSize / 2, marginTop: -dotSize / 2,
          borderRadius: "50%",
          background: "#FF6B4A",
          boxShadow: "0 0 8px rgba(255,107,74,0.7)",
          transition: "width 0.15s ease, height 0.15s ease, margin 0.15s ease",
        }} />
      </div>
    </div>
  );
}
