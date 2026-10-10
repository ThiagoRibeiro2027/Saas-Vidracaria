"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { OPCOES_POR_PAGINA, type Paginacao as PaginacaoInfo } from "@/lib/paginacao";

// Painel de lista paginada no servidor: o estado vive na URL (`pagina` e
// `por_pagina`), então a página recarrega só a faixa pedida e o botão
// Voltar do navegador funciona. Preserva os demais parâmetros (ex.: `tab`).
//
// 2026-10-10: `posicao="topo"` (pedido do responsável do produto — melhor
// visualização e ajuste logo de cara) encosta o painel à direita da tabela
// em vez de ocupar a largura toda como rodapé; `por_pagina` passa a ser
// lembrado em localStorage por tela (chave inclui o pathname), então o
// usuário não perde a preferência ao sair e voltar — só o tamanho da
// página é lembrado, não a página exata (lista muda com o tempo).
export function Paginacao({
  pagina,
  porPagina,
  total,
  totalPaginas,
  paramPagina = "pagina",
  paramPorPagina = "por_pagina",
  posicao = "rodape",
}: PaginacaoInfo & {
  // Uma página com mais de uma lista paginada (ex.: Comercial tem
  // Orçamentos e Oportunidades na mesma rota, em abas) precisa de nomes de
  // parâmetro diferentes na URL — senão paginar uma lista bagunça a outra.
  paramPagina?: string;
  paramPorPagina?: string;
  posicao?: "topo" | "rodape";
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

  const chavePreferencia = `pag_por_pagina:${pathname}:${paramPorPagina}`;

  // Ao montar: se o usuário já tem uma preferência salva de itens por
  // página pra esta tela, diferente da que está em uso agora, e a URL não
  // trouxe `por_pagina` explicitamente (ex.: link compartilhado), aplica a
  // preferência silenciosamente. Nunca sobrescreve uma escolha explícita
  // da URL.
  useEffect(() => {
    if (searchParams.has(paramPorPagina)) return;
    try {
      const salvo = Number(window.localStorage.getItem(chavePreferencia));
      if ((OPCOES_POR_PAGINA as readonly number[]).includes(salvo) && salvo !== porPagina) {
        router.replace(href(pagina, salvo));
      }
    } catch {
      // localStorage indisponível (navegação privada, storage bloqueado) — ignora.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function salvarPreferencia(valor: number) {
    try {
      window.localStorage.setItem(chavePreferencia, String(valor));
    } catch {
      // localStorage indisponível — a navegação ainda funciona, só não lembra.
    }
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

  const containerClasses =
    posicao === "topo"
      ? "flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-b border-border-subtle pb-2 mb-2 text-xs text-text-muted"
      : "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle bg-page-bg px-3 py-2 text-xs text-text-muted";

  return (
    <div className={containerClasses}>
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
          onChange={(e) => {
            const valor = Number(e.target.value);
            salvarPreferencia(valor);
            router.push(href(1, valor));
          }}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-text focus:outline-none"
        >
          {OPCOES_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <span className={posicao === "topo" ? "" : "ml-auto"}>{total} registro(s)</span>
    </div>
  );
}
