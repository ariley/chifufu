import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  metadataBase: new URL("https://chifufu.com"),
  title: "Chifufu - Cheap food decisions, made easier",
  description:
    "A simple upcoming app for comparing nearby groceries, takeout, and everyday food stops before you spend.",
  icons: {
    icon: "/chifufu-icon.png",
    apple: "/chifufu-icon.png",
  },
  openGraph: {
    title: "Chifufu - Cheap food decisions, made easier",
    description:
      "A simple upcoming app for comparing nearby groceries, takeout, and everyday food stops before you spend.",
    images: ["/chifufu-icon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fbfaf6] text-[#193126]">
        <nav className="sticky top-0 z-50 border-b border-[#dfe9df] bg-[#fbfaf6]/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link
              href="/"
              className="flex items-center gap-3 text-sm font-semibold tracking-widest text-[#1D9E75]"
            >
              <Image
                src="/chifufu-icon.png"
                alt=""
                width={28}
                height={28}
                className="rounded-md"
                priority
              />
              CHIFUFU
            </Link>
            <a
              href="#early-access"
              className="rounded-lg border border-[#b7d8c0] bg-white px-4 py-2 text-sm font-semibold text-[#193126] transition hover:border-[#1D9E75]"
            >
              Early access
            </a>
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}
