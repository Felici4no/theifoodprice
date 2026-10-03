import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "theifoodprice · laboratório de preços",
  description:
    "Laboratório pessoal de inteligência de preços de delivery. Projeto independente, sem afiliação com plataformas de delivery.",
};

export const viewport: Viewport = {
  themeColor: "#e5262e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight text-brand">theifoodprice</span>
              <span className="hidden text-xs text-muted sm:inline">laboratório pessoal de preços</span>
            </Link>
            <Nav variant="top" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:pb-12">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-24 text-xs text-muted md:pb-6">
          Projeto pessoal e independente. Sem afiliação com iFood ou qualquer plataforma de delivery.
          Números são estatística descritiva do histórico coletado — não são previsões.
        </footer>
        <Nav variant="bottom" />
      </body>
    </html>
  );
}
