import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Create2Wallet",
  description: "Single-owner smart contract wallet with CREATE2, EIP-712 and session keys",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <div className="min-h-screen">
            <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
              <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
                <h1 className="text-xl font-bold tracking-tight text-slate-100">
                  Create2Wallet
                </h1>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-400">
                  Sepolia · EIP-712 · Session Key
                </span>
              </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

