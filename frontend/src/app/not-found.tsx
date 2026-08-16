import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ background: "rgba(255,107,74,0.1)", border: "1px solid rgba(255,107,74,0.25)" }}
      >
        <Compass className="w-6 h-6" style={{ color: "#FF8A65" }} aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold mb-2 font-display" style={{ color: "var(--ink)" }}>
        Off the map
      </h1>
      <p className="text-sm max-w-xs mb-6 leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        This page doesn&apos;t exist. Let&apos;s get you back on course.
      </p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-105"
        style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
      >
        Back home
      </Link>
    </div>
  );
}
