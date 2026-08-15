"use client";

import { useEffect, useRef, useState } from "react";

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const trail1Ref = useRef<HTMLDivElement>(null);
  const trail2Ref = useRef<HTMLDivElement>(null);

  const pos = useRef({ x: -300, y: -300 });
  const t1  = useRef({ x: -300, y: -300 });
  const t2  = useRef({ x: -300, y: -300 });

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
      pos.current = { x: -300, y: -300 };
      t1.current  = { x: -300, y: -300 };
      t2.current  = { x: -300, y: -300 };
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);

    let raf: number;
    const tick = () => {
      t1.current.x += (pos.current.x - t1.current.x) * 0.22;
      t1.current.y += (pos.current.y - t1.current.y) * 0.22;
      t2.current.x += (t1.current.x  - t2.current.x) * 0.14;
      t2.current.y += (t1.current.y  - t2.current.y) * 0.14;

      if (cursorRef.current)
        cursorRef.current.style.transform = `translate(${pos.current.x}px,${pos.current.y}px)`;
      if (trail1Ref.current)
        trail1Ref.current.style.transform = `translate(${t1.current.x}px,${t1.current.y}px)`;
      if (trail2Ref.current)
        trail2Ref.current.style.transform = `translate(${t2.current.x}px,${t2.current.y}px)`;

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

  const scale = clicking ? 0.82 : hovering ? 1.25 : 1;

  return (
    <div aria-hidden="true">
      {/* Trail 2 — far */}
      <div
        ref={trail2Ref}
        style={{
          position: "fixed", top: -4, left: -4,
          width: 8, height: 8, borderRadius: "50%",
          background: "rgba(255,166,130,0.35)",
          filter: "blur(2px)",
          pointerEvents: "none", zIndex: 9999996,
          willChange: "transform",
        }}
      />

      {/* Trail 1 — near */}
      <div
        ref={trail1Ref}
        style={{
          position: "fixed", top: -5, left: -5,
          width: 10, height: 10, borderRadius: "50%",
          background: "rgba(255,138,92,0.5)",
          filter: "blur(1px)",
          pointerEvents: "none", zIndex: 9999997,
          willChange: "transform",
        }}
      />

      {/* Cursor */}
      <div
        ref={cursorRef}
        style={{
          position: "fixed", top: 0, left: 0,
          pointerEvents: "none", zIndex: 9999999,
          willChange: "transform",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40" height="40"
          viewBox="0 0 24 24"
          style={{
            transform: `scale(${scale}) rotate(-30deg)`,
            transformOrigin: "center center",
            transition: "transform 0.12s ease",
            marginLeft: "-20px",
            marginTop: "-20px",
            filter: hovering
              ? "drop-shadow(0 0 6px #FFE0B8) drop-shadow(0 0 12px #F5A623)"
              : "drop-shadow(0 0 4px #FFD08A) drop-shadow(0 0 8px #FF6B4A)",
          }}
        >
          {/*
            Clean minimal airplane icon — single unified path.
            Standard "top-view" plane pointing up-right after rotation.
          */}
          <path
            d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1l3.5 1v-1.5L13 19v-5.5z"
            fill="#E8523A"
            stroke="white"
            strokeWidth="0.6"
          />
        </svg>
      </div>
    </div>
  );
}
