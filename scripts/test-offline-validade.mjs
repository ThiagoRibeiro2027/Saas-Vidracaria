// Teste puro (sem banco) de calcularValidade() — achado da auditoria de
// gaps ADR-001 a ADR-012 (11/10/2026): ADR-005 §28 exige alerta
// preventivo "antes" dos bloqueios de 3/7 dias, não só o aviso quando o
// bloqueio já aconteceu. Cobre os limiares exatos (2.0d liga o alerta de
// bloqueio, 3.0d liga o bloqueio em si; 5.0d liga o alerta de expiração,
// 7.0d liga a expiração) e a transição correta entre "alerta" e
// "bloqueado"/"expirado" (nunca os dois ligados ao mesmo tempo).
//
// Uso: node scripts/test-offline-validade.mjs

import { calcularValidade, JANELA_BLOQUEIO_DIAS, JANELA_EXPIRACAO_DIAS, JANELA_ALERTA_BLOQUEIO_DIAS, JANELA_ALERTA_EXPIRACAO_DIAS } from "../src/lib/offline/validade.ts";

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

const AGORA = Date.now();
function syncedAtHaDias(dias) {
  return new Date(AGORA - dias * 86_400_000).toISOString();
}

console.log(`Janelas: bloqueio=${JANELA_BLOQUEIO_DIAS}d (alerta em ${JANELA_ALERTA_BLOQUEIO_DIAS}d), expiração=${JANELA_EXPIRACAO_DIAS}d (alerta em ${JANELA_ALERTA_EXPIRACAO_DIAS}d)`);

console.log("\n1. Nunca sincronizou");
{
  const v = calcularValidade(null, AGORA);
  check("bloqueado para criar", v.bloqueadoParaCriar);
  check("expirado", v.expirado);
  check("sem alerta (já está no estado terminal, não no 'aproximando')", !v.aproximandoBloqueio && !v.aproximandoExpiracao);
  check("diasSemSync é null", v.diasSemSync === null);
}

console.log("\n2. Recém sincronizado (0 dias) — tudo tranquilo");
{
  const v = calcularValidade(syncedAtHaDias(0), AGORA);
  check("não bloqueado, não expirado, nenhum alerta", !v.bloqueadoParaCriar && !v.expirado && !v.aproximandoBloqueio && !v.aproximandoExpiracao);
}

console.log("\n3. Logo antes do limiar de alerta de bloqueio (1.9d)");
{
  const v = calcularValidade(syncedAtHaDias(1.9), AGORA);
  check("ainda sem alerta", !v.aproximandoBloqueio);
  check("ainda não bloqueado", !v.bloqueadoParaCriar);
}

console.log("\n4. No limiar do alerta de bloqueio (2.0d) — ADR-005 §28");
{
  const v = calcularValidade(syncedAtHaDias(2.0), AGORA);
  check("alerta de bloqueio ligado", v.aproximandoBloqueio);
  check("ainda não bloqueado de fato (tempo de sincronizar antes)", !v.bloqueadoParaCriar);
}

console.log("\n5. No limiar do bloqueio em si (3.0d)");
{
  const v = calcularValidade(syncedAtHaDias(3.0), AGORA);
  check("bloqueado para criar", v.bloqueadoParaCriar);
  check("alerta de bloqueio desliga (virou bloqueio de verdade, não teria sentido mostrar os dois)", !v.aproximandoBloqueio);
  check("ainda não expirado", !v.expirado);
}

console.log("\n6. No limiar do alerta de expiração (5.0d)");
{
  const v = calcularValidade(syncedAtHaDias(5.0), AGORA);
  check("alerta de expiração ligado", v.aproximandoExpiracao);
  check("já bloqueado (passou dos 3d) mas ainda não expirado", v.bloqueadoParaCriar && !v.expirado);
}

console.log("\n7. No limiar da expiração em si (7.0d)");
{
  const v = calcularValidade(syncedAtHaDias(7.0), AGORA);
  check("expirado", v.expirado);
  check("alerta de expiração desliga (virou expiração de verdade)", !v.aproximandoExpiracao);
}

console.log("\n8. Bem depois (30d) — tudo no estado terminal, nenhum alerta residual");
{
  const v = calcularValidade(syncedAtHaDias(30), AGORA);
  check("bloqueado e expirado, sem nenhum alerta ligado", v.bloqueadoParaCriar && v.expirado && !v.aproximandoBloqueio && !v.aproximandoExpiracao);
}

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
