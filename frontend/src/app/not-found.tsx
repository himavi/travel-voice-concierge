import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ background: "#05030f" }}
    >
      <p className="text-5xl mb-4" aria-hidden="true">🛰️</p>
      <h1 className="text-lg font-semibold mb-2" style={{ color: "#f3e8ff" }}>
        Lost in space
      </h1>
      <p className="text-sm max-w-xs mb-6" style={{ color: "#9c8fc0" }}>
        This page doesn&apos;t exist. Let&apos;s get you back on course.
      </p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-105"
        style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
      >
        Back home
      </Link>
    </div>
  );
}
