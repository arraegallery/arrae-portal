import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARRAE Portal",
  description: "Artist applications and curation for ARRAE Gallery",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
