// Paginação feita no servidor: a página lê `pagina` e `por_pagina` da URL,
// pede ao banco só a faixa certa (`.range`) e devolve a contagem total. Nunca
// confiar nos valores da URL — qualquer coisa fora do esperado cai no padrão.
export const OPCOES_POR_PAGINA = [10, 25, 50] as const;
export const POR_PAGINA_PADRAO = 25;

export type ParametrosPaginacao = { pagina?: string; por_pagina?: string };

export type Paginacao = {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
};

export function lerParametrosPaginacao(params: ParametrosPaginacao) {
  const porPaginaPedido = Number(params.por_pagina);
  const porPagina = (OPCOES_POR_PAGINA as readonly number[]).includes(porPaginaPedido)
    ? porPaginaPedido
    : POR_PAGINA_PADRAO;
  const paginaPedida = Number(params.pagina);
  const pagina = Number.isInteger(paginaPedida) && paginaPedida >= 1 ? paginaPedida : 1;
  return { pagina, porPagina };
}

// Ajusta a página pedida ao total real (ex.: URL antiga apontando pra uma
// página que deixou de existir) e calcula a faixa [from, to] do `.range()`.
export function calcularPaginacao(pagina: number, porPagina: number, total: number) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAjustada = Math.min(pagina, totalPaginas);
  const from = (paginaAjustada - 1) * porPagina;
  const paginacao: Paginacao = { pagina: paginaAjustada, porPagina, total, totalPaginas };
  return { paginacao, from, to: from + porPagina - 1 };
}
