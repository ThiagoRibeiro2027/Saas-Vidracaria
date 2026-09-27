"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Compras (ADR-011, 9 fases) vive em rotas separadas, não em abas ?tab=
// como Comercial — cada fase tem seu próprio page.tsx com fetch próprio,
// grande demais pra unificar num único arquivo sem risco. Esta barra dá
// a mesma experiência visual de abas (Comercial: Orçamentos/
// Oportunidades/Propostas), navegando entre rotas de verdade — sem
// mexer no fetch/lógica já testada de cada fase (achado de teste
// manual, 27/09/2026: o menu lateral só linkava a 1ª fase).
const COMPRAS_TABS = [
  { href: "/compras", label: "Fornecedores e Políticas" },
  { href: "/compras/solicitacoes", label: "Solicitações" },
  { href: "/compras/cotacoes", label: "Cotações" },
  { href: "/compras/pedidos", label: "Pedidos" },
  { href: "/compras/recebimentos", label: "Recebimentos" },
  { href: "/compras/fornecedores", label: "Avaliação de Fornecedores" },
  { href: "/compras/mapa", label: "Mapa de Necessidades" },
  { href: "/compras/orcamento", label: "Orçado × Realizado" },
  { href: "/compras/dashboard", label: "Dashboard" },
  { href: "/compras/configuracoes", label: "Configurações" },
] as const;

export default function ComprasTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {COMPRAS_TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
