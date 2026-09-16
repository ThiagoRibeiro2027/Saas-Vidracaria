"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { enfileirar, type OperacaoFila, type PacoteOffline } from "@/lib/offline/db";
import { calcularValidade, drenarFila, estadoLocal, refreshPacote, retentarOperacao, type EstadoValidade } from "@/lib/offline/sync";

type NovaOperacao = Pick<OperacaoFila, "rpc" | "params" | "label" | "instalacaoId">;

type CampoContextValue = {
  online: boolean;
  pacote: PacoteOffline | null;
  fila: OperacaoFila[];
  sincronizando: boolean;
  ultimoErro: string | null;
  validade: EstadoValidade;
  // Achado do code-review: a tela de detalhe mostrava todos os botões de
  // ação (execução, ocorrência, dano, aceite) pra qualquer usuário com
  // instalacao.view, mesmo sem instalacao.manage/aceite — o servidor
  // sempre rejeitava (assert_tenant_write), mas só na hora de sincronizar,
  // o que é particularmente ruim offline (erro tardio e sem contexto).
  canManage: boolean;
  canAceite: boolean;
  sincronizar: () => Promise<void>;
  enfileirarAcao: (op: NovaOperacao) => Promise<void>;
  retentar: (id: string) => Promise<void>;
};

const CampoContext = createContext<CampoContextValue | null>(null);

export function useCampo(): CampoContextValue {
  const ctx = useContext(CampoContext);
  if (!ctx) throw new Error("useCampo() precisa estar dentro de <CampoProvider>.");
  return ctx;
}

export function CampoProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [online, setOnline] = useState(true);
  const [pacote, setPacote] = useState<PacoteOffline | null>(null);
  const [fila, setFila] = useState<OperacaoFila[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoErro, setUltimoErro] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canAceite, setCanAceite] = useState(false);
  // Date.now() não pode ser chamado direto no corpo do componente (render
  // precisa ser puro) — "agora" vive em estado, atualizado pelo efeito de
  // sincronização periódica (ADR-005 §10 trata isso como referência do
  // dispositivo, só para exibição; a validade oficial usa server_now()).
  const [now, setNow] = useState(() => Date.now());

  const recarregarLocal = useCallback(async () => {
    const local = await estadoLocal();
    setPacote(local.pacote);
    setFila(local.fila);
  }, []);

  const sincronizar = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSincronizando(true);
    try {
      const drenagem = await drenarFila(supabase);
      if (drenagem.interrompidaPorRede) {
        setUltimoErro("Sem conexão — tentativa de sincronização interrompida.");
      } else {
        const refresh = await refreshPacote(supabase);
        setUltimoErro(refresh.ok ? null : refresh.erro);
      }
      await recarregarLocal();
    } finally {
      setSincronizando(false);
    }
  }, [supabase, recarregarLocal]);

  useEffect(() => {
    // IIFE de propósito (em vez de chamar recarregarLocal()/sincronizar()
    // direto no corpo do efeito): o setState decorrente do carregamento
    // inicial precisa acontecer no retorno de uma função assíncrona, não
    // como instrução síncrona de topo do efeito (react-hooks/set-state-in-effect).
    let ativo = true;
    (async () => {
      await recarregarLocal();
      if (!ativo) return;
      setOnline(navigator.onLine);
      // Só relevante online (offline, o RPC falha e os estados ficam no
      // valor default seguro "false" — os botões continuam escondidos,
      // nunca aparecem liberados por engano).
      if (navigator.onLine) {
        const [manage, aceite] = await Promise.all([
          supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "manage" }),
          supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "aceite" }),
        ]);
        if (!ativo) return;
        setCanManage(!!manage.data);
        setCanAceite(!!aceite.data);
      }
      await sincronizar();
    })();

    const onOnline = () => {
      setOnline(true);
      sincronizar();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // ADR-005 §28 — alerta preventivo: tenta sincronizar periodicamente
    // enquanto o app estiver aberto, não só ao reconectar.
    const interval = window.setInterval(() => {
      setNow(Date.now());
      sincronizar();
    }, 60_000);
    return () => {
      ativo = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enfileirarAcao = useCallback(
    async (op: NovaOperacao) => {
      const id = crypto.randomUUID();
      await enfileirar({
        ...op,
        id,
        criadoEm: new Date().toISOString(),
        status: "pendente",
        tentativas: 0,
      });
      await recarregarLocal();
      if (typeof navigator !== "undefined" && navigator.onLine) await sincronizar();
    },
    [recarregarLocal, sincronizar],
  );

  const retentar = useCallback(
    async (id: string) => {
      await retentarOperacao(id);
      await recarregarLocal();
      await sincronizar();
    },
    [recarregarLocal, sincronizar],
  );

  const validade = calcularValidade(pacote?.syncedAt ?? null, now);

  return (
    <CampoContext.Provider
      value={{ online, pacote, fila, sincronizando, ultimoErro, validade, canManage, canAceite, sincronizar, enfileirarAcao, retentar }}
    >
      {children}
    </CampoContext.Provider>
  );
}
