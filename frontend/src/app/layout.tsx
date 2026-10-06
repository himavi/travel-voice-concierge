import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font: no external font request, no layout shift.
// Instrument Serif for display, Instrument Sans for UI, JetBrains Mono for
// the engineering surfaces (decision trace, timestamps, provenance).
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const description =
  "Aria is a voice-first AI travel & visa concierge. Talk about your trip; she answers visa questions from a verified, dated knowledge base and builds your travel profile live.";

export const metadata: Metadata = {
  title: "Aria — AI travel & visa concierge",
  description,
  applicationName: "Aria",
  authors: [{ name: "Himanshu Kumar Singh", url: "https://hksingh.vercel.app" }],
  openGraph: {
    title: "Aria — AI travel & visa concierge",
    description,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Aria — AI travel & visa concierge",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0C0E",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
