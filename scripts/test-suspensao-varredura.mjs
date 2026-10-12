// Auditoria TR Systems 12/10/2026 — varredura da checagem de empresa suspensa.
//
// CLAUDE.md regra 2: "toda mutação de tenant rejeita empresa suspensa
// (assert_company_not_suspended())". test-governance.mjs prova isso por
// comportamento em 4 pontos de entrada; este script prova COBERTURA: varre o
// catálogo do banco (pg_proc) e exige que toda função de ESCRITA, chamável
// por `authenticated`, chegue em assert_company_not_suspended() — direto,
// via assert_tenant_write()/assert_tenant_write_any(), ou chamando outra
// função que chega (fecho transitivo). Quem não chega precisa estar na
// lista de exceções abaixo, com o motivo; função nova de escrita sem guarda
// e sem exceção justificada reprova o teste.
//
// Limites do método (é análise do texto da função, não execução):
//  - "escrita" = o corpo contém INSERT INTO / UPDATE x SET / DELETE FROM;
//  - "guardada" = o corpo cita um helper de guarda ou o nome de outra função
//    guardada. Não prova que a guarda roda em TODOS os ramos (uma guarda
//    dentro de um `if` conta). Para ramo a ramo, o teste de comportamento
//    do módulo continua necessário (modelo: test-governance.mjs, seção 3);
//  - só enxerga SECURITY DEFINER com EXECUTE para `authenticated` (as
//    funções sistema_* só de service_role ficam de fora de propósito).
//
// Não toca dados: só consulta o catálogo. Roda contra o banco de
// DATABASE_URL (padrão: banco local do `supabase start`).
//
// Uso: node scripts/test-suspensao-varredura.mjs

import { execFileSync } from "node:child_process";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

// Funções de escrita que NÃO precisam rejeitar empresa suspensa, e por quê.
// Cada entrada é uma decisão consciente — adicionar aqui exige o motivo.
const EXCECOES = {
  // --- Operação de plataforma: é justamente o que opera sobre empresa suspensa
  transition_company_status: "platform_admin move o ciclo de existência do tenant (inclusive o suspende)",
  transition_subscription: "platform_admin suspende/reativa a assinatura; precisa funcionar em tenant suspenso",
  anonymize_activity_logs_for_user: "LGPD: platform_admin anonimiza mesmo com tenant suspenso (ADR-010)",
  purge_activity_logs_older_than_retention: "retenção: platform_admin expurga logs de qualquer tenant (ADR-009 §3.4)",
  log_platform_admin_access: "trilha de acesso de suporte do platform_admin; company_id nulo (evento de plataforma)",
  // --- Rastro técnico e do próprio usuário, sem dado de negócio do tenant
  log_system_event: "observabilidade técnica; precisa registrar falhas também de tenant suspenso",
  complete_password_change: "o usuário troca a própria senha; não é mutação de dado do tenant",
  marcar_notificacao_lida: "marca a própria notificação como lida; sem efeito em dado de negócio",
  registrar_sincronizacao_offline: "carimbo de sincronização do próprio aparelho de campo",
  // --- Internas: só deveriam ser chamadas por função que já tem a guarda.
  // ATENÇÃO: hoje elas também estão com EXECUTE aberto (achado 3 da auditoria
  // de 12/10/2026 — EXECUTE herdado de PUBLIC). Enquanto o grant não for
  // fechado, a cobertura delas depende de ninguém chamá-las direto.
  liberar_reserva_interna: "interna; chamada por liberar_reserva/consumir_reserva (achado 3: grant aberto)",
  recalcular_agregados_producao: "interna; recalculo disparado por apontamento (achado 3: grant aberto)",
  recalcular_situacao_ordem_producao: "interna; recalculo disparado por apontamento (achado 3: grant aberto)",
  snapshot_revisao_peca: "interna; chamada pelas funções de composição de peça (achado 3: grant aberto)",
  criar_op_lote_operacoes: "interna; chamada por criar_ordem_producao (achado 3: grant aberto)",
  avaliar_regras_automacao: "interna; chamada pelo trigger de integracao_operacoes (achado 3: grant aberto)",
  notificar_usuarios_com_permissao: "interna; chamada pelas funções de negócio que notificam (achado 3: grant aberto)",
  gerar_bom_sugerida_a_partir_da_conversao: "interna; chamada por converter_orcamento_em_pedido (achado 3: grant aberto)",
  submeter_aprovacao_compra: "interna; chamada por concluir_selecao_cotacao (achado 3: grant aberto)",
  submeter_aprovacao_financeiro: "interna; chamada por submeter_pagamento_titulo (achado 3: grant aberto)",
};

// Fecho transitivo: base = funções que citam um helper de guarda; depois,
// toda função que cita o nome de uma função já guardada.
const VARREDURA = `
with recursive fn as (
  select p.oid, p.proname, lower(p.prosrc) as src,
         has_function_privilege('authenticated', p.oid, 'execute') as exec_auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
),
base as (
  select oid, proname from fn
  where src ~ '\\m(assert_company_not_suspended|assert_tenant_write|assert_tenant_write_any)\\M'
     or proname in ('assert_company_not_suspended','assert_tenant_write','assert_tenant_write_any')
),
closure as (
  select oid, proname from base
  union
  select f.oid, f.proname from fn f join closure c on f.src ~ ('\\m' || c.proname || '\\M')
),
escritoras as (
  select distinct proname from fn
  where exec_auth and src ~ '\\m(insert\\s+into|update\\s+[a-z_.]+\\s+set|delete\\s+from)\\M'
)
select json_build_object(
  'escritoras', (select count(*) from escritoras),
  'guardadas',  (select count(*) from escritoras where proname in (select proname from closure)),
  'helpers',    (select coalesce(json_agg(proname order by proname), '[]'::json) from fn
                 where proname in ('assert_company_not_suspended','assert_tenant_write','assert_tenant_write_any')),
  'sem_guarda', (select coalesce(json_agg(proname order by proname), '[]'::json) from escritoras
                 where proname not in (select proname from closure)),
  'existentes', (select coalesce(json_agg(proname order by proname), '[]'::json) from fn)
);
`;

function main() {
  console.log("1. Varredura do catálogo (pg_proc)");
  const r = JSON.parse(psql(VARREDURA));

  check("os 3 helpers de guarda existem no banco", ["assert_company_not_suspended", "assert_tenant_write", "assert_tenant_write_any"].every((h) => r.helpers.includes(h)));
  // Guarda contra passar no vazio: se a varredura quebrar e não achar nada, o
  // resto do teste "passaria" sem provar coisa alguma.
  check(`a varredura enxerga um volume plausível de funções de escrita (${r.escritoras} encontradas)`, r.escritoras >= 100);
  check(`a maioria já chega na guarda (${r.guardadas} de ${r.escritoras})`, r.guardadas >= 80);

  console.log("\n2. Toda função de escrita chega em assert_company_not_suspended() ou tem exceção justificada");
  const semGuarda = r.sem_guarda;
  const naoJustificadas = semGuarda.filter((n) => !(n in EXCECOES));
  check(
    "nenhuma função de escrita chamável por authenticated ficou sem guarda e sem exceção",
    naoJustificadas.length === 0,
  );
  if (naoJustificadas.length > 0) {
    console.error("    Sem guarda de suspensão e fora da lista de exceções:");
    for (const n of naoJustificadas) console.error(`      - ${n}()`);
    console.error(
      "    Corrigir: chamar assert_tenant_write()/assert_tenant_write_any() (ou assert_company_not_suspended())\n" +
        "    na função, ou — se a operação PRECISA funcionar em tenant suspenso — documentar a exceção neste arquivo.",
    );
  }

  console.log("\n3. A lista de exceções não apodrece");
  const existentes = new Set(r.existentes);
  const semGuardaSet = new Set(semGuarda);
  const obsoletas = Object.keys(EXCECOES).filter((n) => !existentes.has(n));
  const jaGuardadas = Object.keys(EXCECOES).filter((n) => existentes.has(n) && !semGuardaSet.has(n));
  check("toda exceção listada ainda existe no banco", obsoletas.length === 0);
  if (obsoletas.length) console.error(`    Remover da lista (função não existe mais): ${obsoletas.join(", ")}`);
  check("toda exceção listada continua sem guarda (senão a exceção já não é necessária)", jaGuardadas.length === 0);
  if (jaGuardadas.length) console.error(`    Já guardadas, remover da lista: ${jaGuardadas.join(", ")}`);

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
