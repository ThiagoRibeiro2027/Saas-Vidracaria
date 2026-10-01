// Leitura de data vinda do banco sem perder um dia no caminho.
//
// Coluna Postgres `date` (sem hora) chega ao JavaScript como "2027-06-01".
// `new Date("2027-06-01")` é especificado como meia-noite **UTC**; no fuso
// de Brasília (UTC-3) isso vira 31/05/2027 às 21h, e qualquer formatação
// local imprime **31/05/2027** — um dia antes do que está gravado. O
// mesmo desvio erra comparações: um vencimento de hoje fica "atrás" da
// meia-noite local o dia inteiro e aparece como vencido antes da hora.
//
// O sufixo `T00:00:00` (sem `Z`) muda a interpretação para meia-noite
// **local**, que é o que uma data sem hora significa para quem digitou.
//
// Coluna `timestamptz` não tem esse problema — o valor já carrega hora e
// fuso, e convertê-lo para o fuso local é justamente o comportamento
// desejado. Por isso `parseDataLocal` só aplica o sufixo a um valor no
// formato "YYYY-MM-DD": um timestamp completo passa intacto, e chamar
// estas funções com ele continua correto.

const SOMENTE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Converte um valor do banco em `Date`, lendo data pura no fuso local. */
export function parseDataLocal(valor: string): Date {
  return new Date(SOMENTE_DATA.test(valor) ? `${valor}T00:00:00` : valor);
}

/** Formata uma data do banco em pt-BR (dd/mm/aaaa). */
export function formatarData(valor: string | null | undefined, ausente = "—"): string {
  if (!valor) return ausente;
  return parseDataLocal(valor).toLocaleDateString("pt-BR");
}
