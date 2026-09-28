// Campos que cada entidade aceita na importação (TÓPICO 2 §28; mapeamento
// de colunas veio na Fase 7 do TÓPICO 13 §29). Ficam fora de actions.ts
// porque um módulo "use server" só pode exportar funções async — constante
// exportada de lá quebra a compilação. São consumidos pelo Server Action
// (para validar o destino escolhido) e pela tela (para montar o seletor).
// A ordem é a que aparece na tela.
export const CAMPOS_PESSOAS = [
  "tipo_documento",
  "documento",
  "nome",
  "nome_fantasia",
  "telefone",
  "email",
  "logradouro",
  "cidade",
  "uf",
  "cep",
] as const;

export const CAMPOS_ITENS = [
  "codigo",
  "descricao",
  "tipo",
  "classificacao",
  "unidade_principal",
] as const;
