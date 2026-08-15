import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "#FDF8F1" }}
    >
      <p className="text-5xl mb-4" aria-hidden="true">🧭</p>
      <h1 className="text-lg font-semibold mb-2" style={{ color: "#3A2E22" }}>
        Off the map
      </h1>
      <p className="text-sm max-w-xs mb-6" style={{ color: "#7A6248" }}>
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
