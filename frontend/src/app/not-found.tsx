import Link from "next/link";
import { AriaMark } from "@/components/layout/AriaMark";

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-bg">
      <AriaMark size={40} />
      <h1 className="mt-6 font-serif text-[32px] leading-tight text-ink">Off the map</h1>
      <p className="mt-2 text-[15px] max-w-xs leading-relaxed text-ink-2">
        This page doesn&apos;t exist. Let&apos;s get you back on course.
      </p>
      <Link href="/" className="btn btn-primary mt-8">
        Back to Aria
      </Link>
    </main>
  );
}
