import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

// Load cursor only on client — it uses browser APIs
const CustomCursor = dynamic(
  () => import("@/components/CustomCursor").then(m => ({ default: m.CustomCursor })),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Travel Voice Concierge | Atlys",
  description: "Voice-powered AI travel assistant — tell us where you want to go",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FDF8F1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
