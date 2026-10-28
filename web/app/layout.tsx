import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import Link from "next/link";
import { Toaster } from "sonner";
import { privacy } from "@/lib/copy/zh";
import "./globals.css";

const serif = Noto_Serif_SC({ weight: ["500", "600", "700"], variable: "--font-noto-serif", display: "swap", preload: false });
const sans = Noto_Sans_SC({ weight: ["400", "500", "700"], variable: "--font-noto-sans", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "形象护照 · 一张自拍，读懂你的脸、色彩和风格", template: "%s · 形象护照" },
  description: "上传一张正脸，看见适合你的发型、妆容和穿搭，带走一份能直接用的形象档案。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#191c1e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${serif.variable} ${sans.variable} ${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <header className="no-print sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-sm">
          <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-serif text-[16px] font-semibold tracking-[0.14em]">形象护照</span>
              <span className="hidden text-[10px] uppercase tracking-[0.28em] text-muted sm:inline">Aesthetic Passport</span>
            </Link>
            <nav className="flex items-center gap-4 text-[13px]">
              <Link href="/report/sample" className="text-muted hover:text-ink">示例报告</Link>
              <Link href="/start" className="rounded-full bg-accent px-3.5 py-1.5 font-medium text-[var(--ap-on-primary)] hover:opacity-90">
                开始
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="no-print mt-16 border-t border-rule pb-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-[12px] leading-6 text-muted sm:px-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {privacy.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>只描述特点，不评判长相 · 不给医美建议 · 不推断敏感属性</span>
              <Link href="/about" className="underline-offset-4 hover:underline">照片与数据说明</Link>
            </div>
          </div>
        </footer>
        <Toaster position="bottom-center" offset={84} toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }} />
      </body>
    </html>
  );
}
