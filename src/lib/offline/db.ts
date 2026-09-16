"use client";

// Armazenamento local da PWA de campo (TÓPICO 16, ADR-005 §7/§11/§12).
// IndexedDB cru (sem biblioteca) — a superfície é pequena o bastante
// (dois object stores) para não justificar uma dependência nova.
//
// "pacote": um único registro com o retorno de pacote_offline_instalacoes()
// e o horário do SERVIDOR (server_now(), nunca o relógio do dispositivo —
// ADR-005 §10) da última sincronização confirmada.
//
// "fila": operações de campo pendentes de envio (execução, ocorrência,
// dano, nova fabricação, conclusão, aceite), cada uma com um
// client_operation_id gerado no dispositivo (ADR-005 §11) usado como chave
// de idempotência no servidor (public.sync_claim(), ver migration
// 20260916010000). Nunca guarda ações de agenda (criar_instalacao,
// adicionar/remover item, gestão de equipe) — essas são só-síncronas.

const DB_NAME = "campo-instalacao";
const DB_VERSION = 1;
const STORE_PACOTE = "pacote";
const STORE_FILA = "fila";
const PACOTE_KEY = "current";

export type OperacaoFila = {
  id: string; // client_operation_id
  rpc:
    | "iniciar_execucao_instalacao"
    | "registrar_execucao_item_instalacao"
    | "concluir_instalacao"
    | "registrar_aceite_instalacao"
    | "registrar_ocorrencia_instalacao"
    | "registrar_dano_instalacao"
    | "solicitar_nova_fabricacao";
  params: Record<string, unknown>;
  label: string; // descrição curta pra UI ("Execução — 4 unidades", etc.)
  instalacaoId: string;
  criadoEm: string; // hora do fato, local do dispositivo (ADR-005 §10)
  status: "pendente" | "erro";
  tentativas: number;
  erro?: string;
};

export type PacoteOffline = {
  data: unknown[];
  syncedAt: string; // server_now() no momento da sincronização
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste ambiente."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PACOTE)) {
        db.createObjectStore(STORE_PACOTE);
      }
      if (!db.objectStoreNames.contains(STORE_FILA)) {
        db.createObjectStore(STORE_FILA, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function salvarPacote(pacote: PacoteOffline): Promise<void> {
  await tx(STORE_PACOTE, "readwrite", (store) => store.put(pacote, PACOTE_KEY));
}

export async function lerPacote(): Promise<PacoteOffline | null> {
  const result = await tx<PacoteOffline | undefined>(STORE_PACOTE, "readonly", (store) => store.get(PACOTE_KEY));
  return result ?? null;
}

export async function enfileirar(op: OperacaoFila): Promise<void> {
  await tx(STORE_FILA, "readwrite", (store) => store.put(op));
}

export async function listarFila(): Promise<OperacaoFila[]> {
  return tx<OperacaoFila[]>(STORE_FILA, "readonly", (store) => store.getAll());
}

export async function removerDaFila(id: string): Promise<void> {
  await tx(STORE_FILA, "readwrite", (store) => store.delete(id));
}

export async function atualizarNaFila(op: OperacaoFila): Promise<void> {
  await tx(STORE_FILA, "readwrite", (store) => store.put(op));
}
