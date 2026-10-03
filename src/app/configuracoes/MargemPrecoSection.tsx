"use client";

import { upsertMargemPrecoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Row = { id: string; margem_percentual: number } | null;

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MargemPrecoSection({ row, canManage }: { row: Row; canManage: boolean }) {
  const margem = row ? Number(row.margem_percentual) : null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Margem de preço</h2>
      <p className="mt-1 text-xs text-text-muted">
        Margem única da empresa, usada para sugerir sozinho o preço de venda das peças
        configuráveis no orçamento: <strong>preço = custo ÷ (1 − margem)</strong>. O vendedor sempre
        vê o detalhamento do custo e pode ajustar o preço antes de adicionar o item. Sem margem
        configurada, o orçamento calcula o custo, mas não sugere preço.
      </p>

      <form action={upsertMargemPrecoAction} className="mt-3 flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-text">
          Margem (%)
          <Input
            name="margem_percentual"
            type="number"
            step="0.01"
            min={0}
            max={99.99}
            placeholder="ex.: 30"
            defaultValue={margem ?? ""}
            required
            disabled={!canManage}
            className="w-24"
          />
        </label>
        {canManage && (
          <Button type="submit" variant="primary">
            Salvar
          </Button>
        )}
      </form>

      {margem === null ? (
        <p className="mt-2 text-xs text-danger">Margem ainda não configurada — o orçamento não vai sugerir preço.</p>
      ) : (
        <p className="mt-2 text-xs text-text-muted">
          Exemplo com a margem atual: custo de {currency(100)} → preço de {currency(100 / (1 - margem / 100))}.
        </p>
      )}
    </section>
  );
}
