"use client";

import { useActionState, useState } from "react";
import { apontarProducaoAction, iniciarOperacaoLoteAction } from "../../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusPill } from "@/components/ui/StatusPill";

export type OperacaoApontamentoData = {
  id: string;
  lote: number;
  sequencia: number;
  descricao: string;
  status: "planejada" | "em_andamento" | "concluida";
  planejada: number;
  produzida: number;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  iniciadaPor: string | null;
};

const STATUS_LABEL = { planejada: "Aguardando", em_andamento: "Em andamento", concluida: "Concluída" } as const;
const STATUS_TONE = { planejada: "neutral", em_andamento: "warning", concluida: "success" } as const;

const dataHora = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function duracao(inicio: string, fim: string) {
  const min = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export default function OperacaoApontamento({ operacao: o, canManage }: { operacao: OperacaoApontamentoData; canManage: boolean }) {
  const [erroInicio, setErroInicio] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [state, formAction, pendente] = useActionState(apontarProducaoAction, undefined);

  async function iniciar() {
    setIniciando(true);
    setErroInicio(null);
    const res = await iniciarOperacaoLoteAction(o.id);
    if (res?.error) setErroInicio(res.error);
    setIniciando(false);
  }

  return (
    <section className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-text-muted">
            Lote {o.lote} · etapa {o.sequencia}
          </p>
          <h2 className="text-base font-medium text-text">{o.descricao}</h2>
        </div>
        <StatusPill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusPill>
      </div>

      <p className="mt-1 text-xs text-text-muted">
        Produzido {o.produzida} de {o.planejada}
      </p>
      {o.iniciadaEm && (
        <p className="text-xs text-text-muted">
          Início {dataHora(o.iniciadaEm)}
          {o.iniciadaPor ? ` por ${o.iniciadaPor}` : ""}
          {o.concluidaEm ? ` · fim ${dataHora(o.concluidaEm)} · tempo ${duracao(o.iniciadaEm, o.concluidaEm)}` : ""}
        </p>
      )}

      {canManage && o.status === "planejada" && (
        <div className="mt-3">
          <Button type="button" variant="primary" className="w-full py-3 text-base" onClick={iniciar} disabled={iniciando}>
            {iniciando ? "Iniciando..." : "Iniciar"}
          </Button>
          {erroInicio && <p className="mt-1 text-xs text-danger">{erroInicio}</p>}
        </div>
      )}

      {canManage && o.status === "em_andamento" && (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="op_lote_operacao_id" value={o.id} />
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-xs text-text-muted">
              Produzida
              <Input name="quantidade_produzida" type="number" inputMode="decimal" min="0" step="any" placeholder="0" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-text-muted">
              Perdida
              <Input name="quantidade_rejeitada" type="number" inputMode="decimal" min="0" step="any" placeholder="0" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-text-muted">
              Retrabalho
              <Input name="quantidade_retrabalho" type="number" inputMode="decimal" min="0" step="any" placeholder="0" />
            </label>
          </div>
          <Button type="submit" variant="primary" className="w-full py-3 text-base" disabled={pendente}>
            {pendente ? "Registrando..." : "Finalizar / registrar"}
          </Button>
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </section>
  );
}
