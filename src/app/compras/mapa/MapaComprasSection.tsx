"use client";

import { gerarNecessidadesPoliticaAction, upsertFeriadoAction, removerFeriadoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusPill } from "@/components/ui/StatusPill";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

type LinhaMapa = {
  item_id: string;
  item_codigo: string;
  item_descricao: string;
  necessidade_aberta: number;
  saldo_disponivel: number;
  saldo_projetado: number;
  data_necessaria_mais_proxima: string | null;
  lead_time_dias: number;
  data_recomendada_compra: string | null;
  risco: "critico" | "atencao" | "ok";
};

type Feriado = { id: string; data: string; descricao: string | null };

const RISCO_LABEL: Record<string, string> = { critico: "Crítico", atencao: "Atenção", ok: "Ok" };
const RISCO_TONE: Record<string, "danger" | "warning" | "success"> = { critico: "danger", atencao: "warning", ok: "success" };

export default function MapaComprasSection({
  mapa,
  feriados,
  canManage,
}: {
  mapa: LinhaMapa[];
  feriados: Feriado[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="text-sm font-semibold text-text">Necessidades × risco de ruptura</h2>
        {canManage && (
          <form action={gerarNecessidadesPoliticaAction} className="my-3">
            <Button type="submit" variant="primary">
              Gerar necessidades das políticas de abastecimento
            </Button>
          </form>
        )}
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Item</Th>
              <Th>Necessidade aberta</Th>
              <Th>Saldo disponível</Th>
              <Th>Saldo projetado</Th>
              <Th>Necessária em</Th>
              <Th>Lead time</Th>
              <Th>Recomendação de compra</Th>
              <Th>Risco</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {mapa.map((linha) => (
              <tr key={linha.item_id}>
                <Td>{linha.item_codigo} — {linha.item_descricao}</Td>
                <Td>{linha.necessidade_aberta}</Td>
                <Td>{linha.saldo_disponivel}</Td>
                <Td>{linha.saldo_projetado}</Td>
                <Td>{formatarData(linha.data_necessaria_mais_proxima)}</Td>
                <Td>{linha.lead_time_dias}d</Td>
                <Td>{formatarData(linha.data_recomendada_compra)}</Td>
                <Td>
                  <StatusPill tone={RISCO_TONE[linha.risco]}>{RISCO_LABEL[linha.risco]}</StatusPill>
                </Td>
              </tr>
            ))}
            {mapa.length === 0 && (
              <tr>
                <Td colSpan={8} className="text-text-muted">
                  Nenhuma necessidade aberta no momento.
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Calendário de feriados</h2>
        <p className="mt-1 text-xs text-text-muted">Usado por &quot;Recomendação de compra&quot; acima — nunca recomenda comprar num fim de semana ou feriado.</p>

        {canManage && (
          <form action={upsertFeriadoAction} className="my-3 flex flex-wrap items-center gap-1.5">
            <Input name="data" type="date" required />
            <Input name="descricao" placeholder="descrição (opcional)" className="w-44" />
            <Button type="submit" variant="primary">
              Adicionar feriado
            </Button>
          </form>
        )}

        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Data</Th>
              <Th>Descrição</Th>
              {canManage && <Th />}
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {feriados.map((f) => (
              <tr key={f.id}>
                <Td>{formatarData(f.data)}</Td>
                <Td>{f.descricao ?? "—"}</Td>
                {canManage && (
                  <Td>
                    <form action={removerFeriadoAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Remover
                      </Button>
                    </form>
                  </Td>
                )}
              </tr>
            ))}
            {feriados.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 3 : 2} className="text-text-muted">
                  Nenhum feriado cadastrado.
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </section>
    </div>
  );
}
