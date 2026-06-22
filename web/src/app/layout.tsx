import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chifufu — Cheap Food Finder",
  description: "Find the cheapest food options near you — groceries, delivery, dining out, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white dark:bg-black">
        {/* Top nav */}
        <nav className="sticky top-0 z-50 border-b border-[#E5E5EA] dark:border-[#38383A] bg-white/90 dark:bg-black/90 backdrop-blur-sm">
          <div className="max-w-[640px] mx-auto px-6 h-12 flex items-center justify-between">
            <Link
              href="/"
              className="text-[#1D9E75] text-sm font-semibold tracking-widest"
            >
              CHIFUFU
            </Link>
            <a
              href="https://apps.apple.com/app/chifufu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#6C6C70] dark:text-[#ABABAB] hover:text-[#1D9E75] transition-colors"
            >
              Get the app →
            </a>
          </div>
        </nav>

        {/* Page content */}
        <main className="max-w-[640px] mx-auto w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
