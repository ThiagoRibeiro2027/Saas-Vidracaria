import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

// ADR-013 (Identidade D), §2.1 — faixa de cabeçalho de página. Substitui o
// padrão antigo de `<p className="font-mono text-[11px] text-primary">...`
// solto no topo de cada page.tsx. `bg-primary` já é a cor da empresa
// (sobrescrita por company.cor_primaria, ver globals.css) — a faixa
// acompanha a identidade de cada cliente automaticamente, sem mudança
// aqui. Sem lógica de negócio: breadcrumb/título/backHref vêm todos de
// quem chama.
export function PageHeader({
  breadcrumb,
  title,
  backHref,
  actions,
}: {
  /** Ex.: ["Comercial", "Orçamentos", "Gestão de Orçamentos"]. */
  breadcrumb: string[];
  title: string;
  /** Quando presente, mostra a seta de voltar antes do título. */
  backHref?: string;
  /** Slot à direita — badges, ícones de ajuda, etc. */
  actions?: ReactNode;
}) {
  return (
    <div className="bg-primary px-6 py-3 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] text-white/70">{breadcrumb.join(" › ")}</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-base font-bold">
            {backHref && (
              <Link href={backHref} aria-label="Voltar">
                <ChevronLeft size={18} />
              </Link>
            )}
            {title}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-3 text-white/80">{actions}</div>}
      </div>
    </div>
  );
}
