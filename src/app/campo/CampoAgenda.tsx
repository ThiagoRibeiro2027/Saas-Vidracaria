"use client";

import Link from "next/link";
import { useCampo } from "./CampoProvider";
import { STATUS_LABEL, STATUS_TONE, type PacoteInstalacao } from "./types";
import { formatarData } from "@/lib/formato/data";
import { StatusPill } from "@/components/ui/StatusPill";

export default function CampoAgenda() {
  const { pacote, fila } = useCampo();
  const instalacoes = ((pacote?.data as PacoteInstalacao[] | undefined) ?? []).slice().sort((a, b) => a.data_agendada.localeCompare(b.data_agendada));

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="my-2 text-lg font-semibold text-text">Minhas instalações</h1>
      {pacote === null && <p className="text-sm text-text-muted">Carregando dados locais…</p>}
      {pacote !== null && instalacoes.length === 0 && (
        <p className="text-sm text-text-muted">Nenhuma instalação agendada para as suas equipes.</p>
      )}
      <ul className="flex list-none flex-col gap-2 p-0">
        {instalacoes.map((inst) => {
          const pendenciasFila = fila.filter((f) => f.instalacaoId === inst.id).length;
          return (
            <li key={inst.id}>
              <Link
                href={`/campo/${inst.id}`}
                className="block rounded-lg border border-border bg-surface px-4 py-3 text-text no-underline shadow-sm"
              >
                <div className="flex items-center justify-between text-sm">
                  <strong>{inst.numero}</strong>
                  <StatusPill tone={STATUS_TONE[inst.status]}>{STATUS_LABEL[inst.status]}</StatusPill>
                </div>
                <div className="mt-1 text-xs text-text">
                  {inst.obra?.nome ?? "Obra não definida"} — {inst.pessoa.nome}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Agendada para {formatarData(inst.data_agendada)} · Pedido {inst.pedido.numero}
                </div>
                {pendenciasFila > 0 && (
                  <div className="mt-1 text-xs text-warning">{pendenciasFila} ação(ões) local(is) aguardando envio</div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
