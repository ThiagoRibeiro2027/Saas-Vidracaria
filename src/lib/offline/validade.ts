// Cálculo de validade/bloqueio da PWA de campo (ADR-005 §8/§9/§28) —
// extraído de sync.ts (que depende de IndexedDB/./db, só existente no
// navegador) pra que esta parte, puramente matemática, seja importável e
// testável fora do navegador (scripts/test-offline-validade.mjs).

export const JANELA_BLOQUEIO_DIAS = 3; // ADR-005 §9
export const JANELA_EXPIRACAO_DIAS = 7; // ADR-005 §8

// ADR-005 §28 ("Alertas preventivos"): o sistema deve avisar da
// "aproximação" dos limites acima, não só anunciar o bloqueio quando ele
// já aconteceu — "os alertas deverão priorizar a sincronização antes que
// o usuário fique impedido". O ADR não fixa um número exato de dias de
// antecedência (só a existência do aviso); ~2/3 da janela é a mesma
// proporção usada nos dois limiares, não dois números escolhidos à parte.
export const JANELA_ALERTA_BLOQUEIO_DIAS = 2; // 2/3 de JANELA_BLOQUEIO_DIAS
export const JANELA_ALERTA_EXPIRACAO_DIAS = 5; // ~2/3 de JANELA_EXPIRACAO_DIAS

export type EstadoValidade = {
  diasSemSync: number | null; // null = nunca sincronizou
  bloqueadoParaCriar: boolean; // >= 3 dias sem sync confirmado
  expirado: boolean; // >= 7 dias sem sync confirmado
  aproximandoBloqueio: boolean; // >= 2 dias e ainda não bloqueado — ADR-005 §28
  aproximandoExpiracao: boolean; // >= 5 dias e ainda não expirado — ADR-005 §28
};

export function calcularValidade(syncedAt: string | null, agoraMs: number): EstadoValidade {
  if (!syncedAt) {
    return { diasSemSync: null, bloqueadoParaCriar: true, expirado: true, aproximandoBloqueio: false, aproximandoExpiracao: false };
  }
  // Math.max(0, ...): "now" do cliente (Date.now(), só para exibição) e
  // syncedAt (server_now(), autoritativo) podem divergir por alguns
  // milissegundos de latência/relógio — sem o clamp, uma sincronização
  // muito recente mostra um valor negativo sem sentido ("-0.0d") em vez
  // de simplesmente "0 dias".
  const diasSemSync = Math.max(0, (agoraMs - new Date(syncedAt).getTime()) / 86_400_000);
  const bloqueadoParaCriar = diasSemSync >= JANELA_BLOQUEIO_DIAS;
  const expirado = diasSemSync >= JANELA_EXPIRACAO_DIAS;
  return {
    diasSemSync,
    bloqueadoParaCriar,
    expirado,
    aproximandoBloqueio: !bloqueadoParaCriar && diasSemSync >= JANELA_ALERTA_BLOQUEIO_DIAS,
    aproximandoExpiracao: !expirado && diasSemSync >= JANELA_ALERTA_EXPIRACAO_DIAS,
  };
}
