// Regressão de fuso na exibição de datas (achado de 28/09/2026): coluna
// Postgres `date` chega como "2027-06-01" e `new Date("2027-06-01")` é
// meia-noite UTC — em Brasília (UTC-3), 31/05 às 21h. A tabela mostrava
// um dia a menos do que o formulário de edição, lado a lado na mesma
// linha (manutenção preventiva em RecursosSection).
//
// Teste puro: não toca no banco, não cria tenant, roda sozinho
// (`node scripts/test-formatar-data.mjs`). Ele mesmo se reexecuta com
// TZ=America/Sao_Paulo — num host em UTC o bug simplesmente não aparece
// e o teste passaria sem testar nada.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatarData, parseDataLocal } from "../src/lib/formato/data.ts";

const TZ = "America/Sao_Paulo";

if (process.env.TZ !== TZ) {
  const { status } = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, TZ },
    stdio: "inherit",
  });
  process.exit(status ?? 1);
}

let falhas = 0;
function check(descricao, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${descricao}${ok ? "" : ` — esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`}`);
}

// Fixa o cenário: em UTC-3 o parsing ingênuo realmente perde um dia. Se
// isto parar de valer, os testes abaixo deixam de provar qualquer coisa.
check(
  "cenário: new Date bare de date pura volta um dia (o bug)",
  new Date("2027-06-01").toLocaleDateString("pt-BR"),
  "31/05/2027",
);

check("data pura mantém o dia gravado", formatarData("2027-06-01"), "01/06/2027");
check("virada de mês (dia 1)", formatarData("2027-03-01"), "01/03/2027");
check("virada de ano (1º de janeiro)", formatarData("2027-01-01"), "01/01/2027");
check("último dia do ano", formatarData("2026-12-31"), "31/12/2026");
check("29 de fevereiro de ano bissexto", formatarData("2028-02-29"), "29/02/2028");

check("null vira travessão", formatarData(null), "—");
check("undefined vira travessão", formatarData(undefined), "—");
check("string vazia vira travessão", formatarData(""), "—");
check("ausente customizável", formatarData(null, "nunca"), "nunca");

// timestamptz tem hora e fuso: converter para o fuso local é o certo, e a
// função não pode sabotar isso grudando T00:00:00 num valor que já tem
// hora (viraria Invalid Date). 02:00 UTC do dia 1 é 23:00 do dia 31 em
// Brasília — o dia anterior aqui está correto, não é o bug.
check(
  "timestamptz perto da virada converte para o fuso local",
  formatarData("2027-06-01T02:00:00+00:00"),
  "31/05/2027",
);
check(
  "timestamptz no meio do dia",
  formatarData("2027-06-01T15:30:00+00:00"),
  "01/06/2027",
);

const d = parseDataLocal("2027-06-01");
check("parseDataLocal: dia", d.getDate(), 1);
check("parseDataLocal: mês (0-based)", d.getMonth(), 5);
check("parseDataLocal: ano", d.getFullYear(), 2027);
check("parseDataLocal: meia-noite local", d.getHours(), 0);

// O mesmo parsing sustenta o rótulo "(vencido)" do financeiro: um título
// que vence hoje não pode aparecer vencido enquanto o dia não virou.
const hoje = new Date();
const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
check(
  "vencimento de hoje não conta como vencido",
  parseDataLocal(hojeIso) < new Date(new Date().toDateString()),
  false,
);

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
