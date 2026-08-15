import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Voice Concierge | Atlys",
  description: "Voice-powered AI travel assistant — tell us where you want to go",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
