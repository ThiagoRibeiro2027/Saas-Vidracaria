"use client";

import { useState } from "react";
import { upsertMargemPrecoAction, upsertEncargosPrecoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Row = { id: string; margem_percentual: number } | null;

type Componentes = {
  regime_tributario: string | null;
  simples_nacional: number;
  icms: number;
  pis: number;
  cofins: number;
  iss: number;
  ipi: number;
  comissao: number;
  despesas_fixas: number;
  custo_financeiro_frete: number;
  soma_encargos: number;
} | null;

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const REGIMES = [
  ["mei", "MEI"],
  ["simples_nacional", "Simples Nacional"],
  ["lucro_presumido", "Lucro Presumido"],
  ["lucro_real", "Lucro Real"],
] as const;

const CAMPOS = [
  ["simples_nacional", "Simples Nacional (%)"],
  ["icms", "ICMS (%)"],
  ["pis", "PIS (%)"],
  ["cofins", "COFINS (%)"],
  ["iss", "ISS (%)"],
  ["ipi", "IPI (%)"],
  ["comissao", "Comissão (%)"],
  ["despesas_fixas", "Despesas fixas (%)"],
  ["custo_financeiro_frete", "Custo financeiro / frete (%)"],
] as const;

type Campo = (typeof CAMPOS)[number][0];

export default function MargemPrecoSection({
  row,
  componentes,
  canManage,
}: {
  row: Row;
  componentes: Componentes;
  canManage: boolean;
}) {
  const margem = row ? Number(row.margem_percentual) : null;
  const [valores, setValores] = useState<Record<Campo, string>>(() => {
    const inicial = {} as Record<Campo, string>;
    for (const [campo] of CAMPOS) {
      const v = componentes ? Number(componentes[campo]) : 0;
      inicial[campo] = v ? String(v) : "";
    }
    return inicial;
  });

  const encargos = CAMPOS.reduce((soma, [campo]) => {
    const n = Number(valores[campo].replace(",", "."));
    return soma + (Number.isFinite(n) ? n : 0);
  }, 0);
  const total = encargos + (margem ?? 0);
  const divisor = 1 - total / 100;
  const valido = margem !== null && divisor > 0;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Margem de preço</h2>
      <p className="mt-1 text-xs text-text-muted">
        Usada para sugerir sozinho o preço de venda das peças configuráveis no orçamento:{" "}
        <strong>preço = custo ÷ (1 − (impostos e encargos + margem de lucro))</strong>. O{" "}
        <strong>markup</strong> é o multiplicador do custo: 1 ÷ (1 − soma). O vendedor sempre vê o
        detalhamento do custo e pode ajustar o preço antes de adicionar o item. Sem margem configurada,
        o orçamento calcula o custo, mas não sugere preço.
      </p>

      <h3 className="mt-4 text-xs font-semibold text-text">Margem de lucro</h3>
      <form action={upsertMargemPrecoAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
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

      <h3 className="mt-5 text-xs font-semibold text-text">Impostos e encargos sobre o preço de venda</h3>
      <p className="mt-1 text-xs text-text-muted">
        Opcional. Informe os percentuais que a empresa paga sobre a venda; eles entram no cálculo do
        preço junto com a margem de lucro. O sistema não sugere alíquotas — confirme os valores com o
        seu contador.
      </p>
      <form action={upsertEncargosPrecoAction} className="mt-2 flex flex-col gap-2">
        <label className="flex items-center gap-1.5 text-xs text-text">
          Regime tributário
          <Select name="regime_tributario" defaultValue={componentes?.regime_tributario ?? ""} disabled={!canManage}>
            <option value="">não informado</option>
            {REGIMES.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-3">
          {CAMPOS.map(([campo, rotulo]) => (
            <label key={campo} className="flex flex-col gap-0.5 text-xs text-text">
              {rotulo}
              <Input
                name={campo}
                type="number"
                step="0.01"
                min={0}
                max={99.99}
                placeholder="0"
                value={valores[campo]}
                onChange={(e) => setValores((atual) => ({ ...atual, [campo]: e.target.value }))}
                disabled={!canManage}
                className="w-28"
              />
            </label>
          ))}
        </div>
        {canManage && (
          <div>
            <Button type="submit" variant="primary">
              Salvar impostos e encargos
            </Button>
          </div>
        )}
      </form>

      {margem === null ? (
        <p className="mt-3 text-xs text-danger">Margem ainda não configurada — o orçamento não vai sugerir preço.</p>
      ) : valido ? (
        <p className="mt-3 text-xs text-text-muted">
          Impostos e encargos: <strong>{encargos.toLocaleString("pt-BR")}%</strong> · margem de lucro:{" "}
          <strong>{margem.toLocaleString("pt-BR")}%</strong> · markup:{" "}
          <strong>×{(1 / divisor).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</strong>. Exemplo: custo de{" "}
          {currency(100)} → preço de {currency(100 / divisor)}.
        </p>
      ) : (
        <p className="mt-3 text-xs text-danger">
          A soma de impostos/encargos com a margem chega a 100% ou mais — o preço não pode ser calculado. Reduza algum
          percentual.
        </p>
      )}
    </section>
  );
}
