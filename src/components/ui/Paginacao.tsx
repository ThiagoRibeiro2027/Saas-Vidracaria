"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { OPCOES_POR_PAGINA, type Paginacao as PaginacaoInfo } from "@/lib/paginacao";

// Rodapé de lista paginada no servidor: o estado vive na URL (`pagina` e
// `por_pagina`), então a página recarrega só a faixa pedida e o botão
// Voltar do navegador funciona. Preserva os demais parâmetros (ex.: `tab`).
export function Paginacao({
  pagina,
  porPagina,
  total,
  totalPaginas,
  paramPagina = "pagina",
  paramPorPagina = "por_pagina",
}: PaginacaoInfo & {
  // Uma página com mais de uma lista paginada (ex.: Comercial tem
  // Orçamentos e Oportunidades na mesma rota, em abas) precisa de nomes de
  // parâmetro diferentes na URL — senão paginar uma lista bagunça a outra.
  paramPagina?: string;
  paramPorPagina?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function href(alvo: number, novoPorPagina?: number) {
    const p = new URLSearchParams(searchParams.toString());
    if (alvo <= 1) p.delete(paramPagina);
    else p.set(paramPagina, String(alvo));
    if (novoPorPagina !== undefined) p.set(paramPorPagina, String(novoPorPagina));
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const naPrimeira = pagina <= 1;
  const naUltima = pagina >= totalPaginas;

  // Função que devolve JSX (não um componente aninhado) pra não recriar o
  // tipo do elemento a cada render.
  function botao(alvo: number, desativado: boolean, rotulo: string, icone: React.ReactNode) {
    const classes = "flex h-7 w-7 items-center justify-center rounded text-text-muted";
    if (desativado) {
      return (
        <span key={rotulo} aria-label={rotulo} aria-disabled="true" className={`${classes} opacity-40`}>
          {icone}
        </span>
      );
    }
    return (
      <Link key={rotulo} href={href(alvo)} aria-label={rotulo} className={`${classes} hover:bg-page-bg hover:text-text`}>
        {icone}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle bg-page-bg px-3 py-2 text-xs text-text-muted">
      <div className="flex items-center gap-0.5">
        {botao(1, naPrimeira, "Primeira página", <ChevronsLeft size={15} />)}
        {botao(pagina - 1, naPrimeira, "Página anterior", <ChevronLeft size={15} />)}
        <form
          key={pagina}
          onSubmit={(e) => {
            e.preventDefault();
            const valor = Number(new FormData(e.currentTarget).get("pagina"));
            if (!Number.isInteger(valor)) return;
            router.push(href(Math.min(Math.max(valor, 1), totalPaginas)));
          }}
          className="flex items-center overflow-hidden rounded border border-border"
        >
          <input
            name="pagina"
            type="number"
            min={1}
            max={totalPaginas}
            defaultValue={pagina}
            aria-label="Ir para a página"
            className="w-14 bg-surface px-2 py-0.5 text-center text-text focus:outline-none"
          />
          <span className="bg-text-muted px-2 py-0.5 font-medium text-surface">de {totalPaginas}</span>
        </form>
        {botao(pagina + 1, naUltima, "Próxima página", <ChevronRight size={15} />)}
        {botao(totalPaginas, naUltima, "Última página", <ChevronsRight size={15} />)}
      </div>

      <label className="flex items-center gap-1.5">
        Por página
        <select
          value={porPagina}
          onChange={(e) => router.push(href(1, Number(e.target.value)))}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-text focus:outline-none"
        >
          {OPCOES_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <span className="ml-auto">{total} registro(s)</span>
    </div>
  );
}
