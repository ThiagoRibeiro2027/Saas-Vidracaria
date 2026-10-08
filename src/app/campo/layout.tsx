import type { Metadata, Viewport } from "next";
import { CampoProvider } from "./CampoProvider";
import CampoServiceWorker from "./CampoServiceWorker";
import StatusBar from "./StatusBar";

// TÓPICO 16 — plataforma de campo (ADR-008). Escopo isolado do resto do
// SaaS: manifest e service worker próprios (ADR-008 §5), registrados só
// aqui — o desktop (demais rotas) continua sem nenhum comportamento de PWA.
export const metadata: Metadata = {
  title: "Campo — Instalação",
  manifest: "/campo-manifest.json",
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1f5d57",
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return (
    <CampoProvider>
      <CampoServiceWorker />
      <div className="flex min-h-dvh flex-col bg-page-bg">
        <StatusBar />
        <div className="flex-1">{children}</div>
      </div>
    </CampoProvider>
  );
}
