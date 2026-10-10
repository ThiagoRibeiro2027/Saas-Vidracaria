"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Th } from "./Table";

// Cabeçalho de coluna clicável pra ordenar a lista (lida no servidor via
// `ordenar=campo:asc|desc` na URL). Clicar alterna asc → desc → remove
// ordenação; preserva os demais parâmetros e sempre volta pra página 1
// (resultado reordenado, paginação antiga não faz sentido).
export function SortableTh({
  field,
  children,
  paramOrdenar = "ordenar",
  paramPagina = "pagina",
}: {
  field: string;
  children: React.ReactNode;
  paramOrdenar?: string;
  paramPagina?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const atual = searchParams.get(paramOrdenar);
  const [campoAtual, direcaoAtual] = atual ? atual.split(":") : [null, null];
  const ativo = campoAtual === field;

  const proximaDirecao = !ativo ? "asc" : direcaoAtual === "asc" ? "desc" : null;

  function href() {
    const p = new URLSearchParams(searchParams.toString());
    if (proximaDirecao) p.set(paramOrdenar, `${field}:${proximaDirecao}`);
    else p.delete(paramOrdenar);
    p.delete(paramPagina);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <Th>
      <Link href={href()} className="flex items-center gap-1 hover:text-text" aria-label={`Ordenar por ${children}`}>
        {children}
        {ativo && direcaoAtual === "asc" && <ArrowUp size={12} aria-hidden="true" />}
        {ativo && direcaoAtual === "desc" && <ArrowDown size={12} aria-hidden="true" />}
        {!ativo && <ArrowUpDown size={12} className="opacity-40" aria-hidden="true" />}
      </Link>
    </Th>
  );
}
