"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { atualizarNaFila, lerPacote, listarFila, removerDaFila, salvarPacote, type OperacaoFila } from "./db";

// Motor de sincronização da PWA de campo (ADR-005 §12/§13/§25). Drena a
// fila SEQUENCIALMENTE (uma operação por vez, aguardando a resposta antes
// de enviar a próxima) — de propósito: o mecanismo de idempotência do
// servidor (public.sync_claim(), migration 20260916010000) só é livre de
// corrida real porque o Postgres bloqueia um segundo INSERT concorrente
// pro mesmo client_operation_id até a primeira transação terminar; enviar
// em paralelo funcionaria, mas sequencial evita depender dessa espera e é
// mais fácil de raciocinar sobre "o que já foi confirmado".

export const JANELA_BLOQUEIO_DIAS = 3; // ADR-005 §9
export const JANELA_EXPIRACAO_DIAS = 7; // ADR-005 §8

export type EstadoValidade = {
  diasSemSync: number | null; // null = nunca sincronizou
  bloqueadoParaCriar: boolean; // >= 3 dias sem sync confirmado
  expirado: boolean; // >= 7 dias sem sync confirmado
};

export function calcularValidade(syncedAt: string | null, agoraMs: number): EstadoValidade {
  if (!syncedAt) {
    return { diasSemSync: null, bloqueadoParaCriar: true, expirado: true };
  }
  const diasSemSync = (agoraMs - new Date(syncedAt).getTime()) / 86_400_000;
  return {
    diasSemSync,
    bloqueadoParaCriar: diasSemSync >= JANELA_BLOQUEIO_DIAS,
    expirado: diasSemSync >= JANELA_EXPIRACAO_DIAS,
  };
}

// Erro de rede (fetch falhou antes de qualquer resposta do servidor) versus
// erro de validação (o servidor respondeu e rejeitou). Só o primeiro deve
// interromper o esvaziamento da fila — ADR-005 §12: "uma falha em um
// registro não deve necessariamente impedir a sincronização de registros
// independentes".
//
// postgrest-js só deixa "code" vazio quando a falha aconteceu ANTES de
// processar uma resposta do servidor (fetch rejeitado, corpo não-JSON) —
// qualquer erro que o Postgres/PostgREST efetivamente respondeu sempre
// carrega um code (P0001, 23505, PGRST..., etc.). Checar o texto da
// mensagem ("Failed to fetch") é frágil entre navegadores — o Safari usa
// "Load failed", sem a palavra "fetch" — por isso o discriminador é só a
// ausência de code, não um regex de mensagem.
function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string };
  return !err.code;
}

export async function refreshPacote(supabase: SupabaseClient): Promise<{ ok: true } | { ok: false; erro: string }> {
  const [{ data: now, error: nowError }, { data: pacote, error: pacoteError }] = await Promise.all([
    supabase.rpc("server_now"),
    supabase.rpc("pacote_offline_instalacoes"),
  ]);
  if (nowError || pacoteError) {
    return { ok: false, erro: (nowError ?? pacoteError)?.message ?? "Falha ao sincronizar." };
  }
  await salvarPacote({ data: (pacote as unknown[]) ?? [], syncedAt: now as string });
  return { ok: true };
}

export type ResultadoDrenagem = {
  processadas: number;
  comErro: number;
  interrompidaPorRede: boolean;
};

export async function drenarFila(supabase: SupabaseClient): Promise<ResultadoDrenagem> {
  const fila = (await listarFila()).filter((op) => op.status === "pendente");
  let processadas = 0;
  let comErro = 0;

  for (const op of fila) {
    const { error } = await supabase.rpc(op.rpc, { ...op.params, p_client_operation_id: op.id });
    if (!error) {
      await removerDaFila(op.id);
      processadas++;
      continue;
    }
    if (isNetworkError(error)) {
      return { processadas, comErro, interrompidaPorRede: true };
    }
    // Erro de validação do servidor (ADR-005 §14: revalidação sempre vence)
    // — fica marcada com erro, visível pro usuário decidir o que fazer,
    // sem travar o resto da fila.
    const atualizado: OperacaoFila = { ...op, status: "erro", tentativas: op.tentativas + 1, erro: error.message };
    await atualizarNaFila(atualizado);
    comErro++;
  }

  return { processadas, comErro, interrompidaPorRede: false };
}

export async function retentarOperacao(id: string): Promise<void> {
  const fila = await listarFila();
  const op = fila.find((o) => o.id === id);
  if (!op) return;
  await atualizarNaFila({ ...op, status: "pendente", erro: undefined });
}

export async function estadoLocal() {
  const [pacote, fila] = await Promise.all([lerPacote(), listarFila()]);
  return { pacote, fila };
}
