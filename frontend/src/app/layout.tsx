import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";

// Self-hosted via next/font — no external CDN request, zero layout shift,
// and it keeps working the same on free static hosting.
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Load cursor only on client — it uses browser APIs
const CustomCursor = dynamic(
  () => import("@/components/CustomCursor").then(m => ({ default: m.CustomCursor })),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Atlys Travel Concierge — AI Voice Agent",
  description: "Talk to Aria, your AI travel concierge — visa requirements, trip planning, and instant answers, entirely by voice.",
  openGraph: {
    title: "Atlys Travel Concierge",
    description: "Talk to Aria, your AI travel concierge — visa requirements, trip planning, and instant answers, entirely by voice.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15110D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
