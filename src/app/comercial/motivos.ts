// Lista fixa compartilhada por oportunidades (motivo de perda) e orçamentos
// (motivo de rejeição) — mesma lista no banco, nos dois CHECKs.
export const MOTIVOS_NAO_FECHAMENTO = [
  { value: "preco", label: "Preço" },
  { value: "prazo", label: "Prazo" },
  { value: "concorrente", label: "Concorrente" },
  { value: "condicao_comercial", label: "Condição comercial" },
  { value: "especificacao", label: "Especificação" },
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "projeto_cancelado", label: "Projeto cancelado" },
  { value: "falta_orcamento", label: "Falta de orçamento" },
  { value: "produto_inadequado", label: "Produto inadequado" },
  { value: "outros", label: "Outros" },
] as const;
