import type { Metadata } from "next";
import { Saira_Condensed, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { ConnectButton } from "@/components/ConnectButton";
import { DelphiWordmark } from "@/components/Logo";
import { ReloadToHome } from "@/components/ReloadToHome";
import { CONTRACT_CONFIGURED, NETWORK_LABEL } from "@/lib/config";

const saira = Saira_Condensed({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-saira" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-cormorant" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Delphi — AI-resolved prediction markets on GenLayer",
  description:
    "Stake on the outcome of any question. When it settles, an AI-validator panel reads the resolution source and pays the winners — no central oracle.",
};

const navLinks = [
  { href: "/markets", label: "Markets" },
  { href: "/new", label: "Create" },
  { href: "/positions", label: "Positions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${saira.variable} ${cormorant.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen flex flex-col">
        <WalletProvider>
          <ReloadToHome />
          <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur border-b border-hairline">
            <nav className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
              <Link href="/" className="hover:opacity-80 transition-opacity">
                <DelphiWordmark />
              </Link>
              <div className="flex items-center gap-1 sm:gap-3">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="hidden sm:inline-block px-3 py-2 mono uppercase tracking-[0.18em] text-xs text-muted hover:text-ink transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
                <ConnectButton />
              </div>
            </nav>
          </header>

          {!CONTRACT_CONFIGURED && (
            <div className="border-b border-hairline bg-surface-soft text-warning text-center px-4 py-2 mono text-xs uppercase tracking-[0.15em]">
              Contract address not set — define NEXT_PUBLIC_CONTRACT_ADDRESS
            </div>
          )}

          <main className="flex-1 relative">{children}</main>

          <footer className="border-t border-hairline">
            <div className="mx-auto max-w-6xl px-5 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <DelphiWordmark />
              <p className="eyebrow">The oracle decides · Sealed on GenLayer · {NETWORK_LABEL}</p>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
