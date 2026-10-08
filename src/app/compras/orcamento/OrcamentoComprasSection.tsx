"use client";

import { upsertOrcamentoCompraAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

type Linha = {
  id: string;
  categoria: string;
  periodo_inicio: string;
  periodo_fim: string;
  valor_orcado: number;
  comprometido: number;
  realizado: number;
};

export default function OrcamentoComprasSection({ linhas, canManage }: { linhas: Linha[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Orçamentos por categoria e período</h2>

      {canManage && (
        <form action={upsertOrcamentoCompraAction} className="my-3 flex flex-wrap items-center gap-1.5">
          <Input name="categoria" placeholder="categoria (classificação do item)" required className="w-44" />
          <Input name="periodo_inicio" type="date" required />
          <Input name="periodo_fim" type="date" required />
          <Input name="valor_orcado" type="number" min="0" step="0.01" placeholder="valor orçado (R$)" required className="w-32" />
          <Button type="submit" variant="primary">Salvar orçamento</Button>
        </form>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Categoria</Th>
            <Th>Período</Th>
            <Th>Orçado</Th>
            <Th>Comprometido</Th>
            <Th>Realizado</Th>
            <Th>Saldo</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const saldo = Number(l.valor_orcado) - Number(l.comprometido) - Number(l.realizado);
            return (
              <tr key={l.id}>
                <Td>{l.categoria}</Td>
                <Td>{formatarData(l.periodo_inicio)} — {formatarData(l.periodo_fim)}</Td>
                <Td>R$ {Number(l.valor_orcado).toFixed(2)}</Td>
                <Td>R$ {Number(l.comprometido).toFixed(2)}</Td>
                <Td>R$ {Number(l.realizado).toFixed(2)}</Td>
                <Td className={`font-semibold ${saldo < 0 ? "text-danger" : "text-primary"}`}>R$ {saldo.toFixed(2)}</Td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-text-muted">
                Nenhum orçamento configurado ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}
