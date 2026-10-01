"use client";

// PREVIEW DE DESIGN — segunda opção de identidade visual, propositalmente
// oposta à v1/v2 (/mockup-comercial): lá era cor por categoria, sombra,
// kanban (estilo CRM consumer tipo Pipedrive/HubSpot). Aqui é monocromático,
// densidade de dado, tabela de verdade, cantos retos — estilo
// enterprise/financeiro (tipo Stripe/Linear). Não lê nem grava dado real.
// Apagar depois que o padrão for aprovado/rejeitado.

import { useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const ORCAMENTOS = [
  { id: "1", numero: "ORC-0042", cliente: "Mercado Bom Preço", obra: "Fachada loja 2 — Av. Brasil", data: "28/09", status: "aprovado" as const, total: 18400 },
  { id: "2", numero: "ORC-0041", cliente: "Condomínio Jardins", obra: "Guarda-corpo bloco B", data: "27/09", status: "rascunho" as const, total: 6230 },
  { id: "3", numero: "ORC-0040", cliente: "Studio Arquitetura RM", obra: "Box banheiro — apto 302", data: "25/09", status: "rascunho" as const, total: 2890 },
  { id: "4", numero: "ORC-0039", cliente: "Restaurante Varanda", obra: "Divisória ambiente interno", data: "22/09", status: "rejeitado" as const, total: 9150 },
  { id: "5", numero: "ORC-0038", cliente: "João Pereira", obra: "—", data: "19/09", status: "aprovado" as const, total: 3420 },
];

const STATUS_STYLE = {
  rascunho: "text-text-muted",
  aprovado: "text-emerald-700",
  rejeitado: "text-rose-700",
} as const;

const STATUS_LABEL = { rascunho: "Rascunho", aprovado: "Aprovado", rejeitado: "Rejeitado" } as const;

const PIPELINE = [
  { label: "Qualificação", valor: 22000, n: 1 },
  { label: "Proposta", valor: 54000, n: 1 },
  { label: "Negociação", valor: 128000, n: 1 },
  { label: "Ganha", valor: 15400, n: 1 },
] as const;
const PIPELINE_TOTAL = PIPELINE.reduce((s, p) => s + p.valor, 0);
const PIPELINE_SHADE = ["bg-text-muted/30", "bg-text-muted/55", "bg-text-muted/80", "bg-text"];

function Metric({
  label,
  value,
  delta,
  deltaUp,
  border = true,
}: {
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean;
  border?: boolean;
}) {
  return (
    <div className={`flex-1 px-5 py-4 ${border ? "border-l border-border" : ""}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-xl font-semibold tracking-tight text-text">{value}</span>
        <span className={`flex items-center text-xs font-medium ${deltaUp ? "text-emerald-700" : "text-rose-700"}`}>
          {deltaUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {delta}
        </span>
      </div>
    </div>
  );
}

const TABS = ["orcamentos", "pipeline"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { orcamentos: "Orçamentos", pipeline: "Pipeline" };

export default function MockupComercialBPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("orcamentos");

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Preview · identidade B</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-text">Comercial</h1>
        </div>
        <Button variant="secondary" className="rounded-md border-text/15 px-3.5 py-2 text-sm">
          + Novo orçamento
        </Button>
      </div>

      <div className="mt-6 flex divide-x divide-border rounded-md border border-border">
        <Metric label="Em aberto" value="R$ 9,1 mil" delta="8%" deltaUp border={false} />
        <Metric label="Aprovados (mês)" value="R$ 21,8 mil" delta="22%" deltaUp />
        <Metric label="Taxa de conversão" value="64%" delta="3%" deltaUp={false} />
        <Metric label="Ticket médio" value="R$ 8,0 mil" delta="5%" deltaUp />
      </div>

      <div className="mt-8 flex gap-5 border-b border-border text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 font-medium transition-colors ${
              tab === t ? "border-text text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "orcamentos" && (
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              <th className="border-b border-border py-2.5 text-left font-medium">Cliente</th>
              <th className="border-b border-border py-2.5 text-left font-medium">Número</th>
              <th className="border-b border-border py-2.5 text-left font-medium">Obra</th>
              <th className="border-b border-border py-2.5 text-left font-medium">Data</th>
              <th className="border-b border-border py-2.5 text-left font-medium">Status</th>
              <th className="border-b border-border py-2.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {ORCAMENTOS.map((o) => (
              <tr key={o.id} className="group">
                <td className="border-b border-border-subtle py-3 font-medium text-text">
                  <span className="border-b border-transparent group-hover:border-text/30">{o.cliente}</span>
                </td>
                <td className="border-b border-border-subtle py-3 font-mono text-xs text-text-muted">{o.numero}</td>
                <td className="border-b border-border-subtle py-3 text-text-muted">{o.obra}</td>
                <td className="border-b border-border-subtle py-3 text-text-muted">{o.data}</td>
                <td className={`border-b border-border-subtle py-3 font-medium ${STATUS_STYLE[o.status]}`}>
                  {STATUS_LABEL[o.status]}
                </td>
                <td className="border-b border-border-subtle py-3 text-right font-mono font-medium text-text">
                  {currency(o.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "pipeline" && (
        <div className="mt-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-page-bg">
            {PIPELINE.map((p, i) => (
              <div key={p.label} className={PIPELINE_SHADE[i]} style={{ width: `${(p.valor / PIPELINE_TOTAL) * 100}%` }} />
            ))}
          </div>
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted">
                <th className="border-b border-border py-2.5 text-left font-medium">Estágio</th>
                <th className="border-b border-border py-2.5 text-left font-medium">Oportunidades</th>
                <th className="border-b border-border py-2.5 text-right font-medium">Valor</th>
                <th className="border-b border-border py-2.5 text-right font-medium">% do funil</th>
              </tr>
            </thead>
            <tbody>
              {PIPELINE.map((p, i) => (
                <tr key={p.label}>
                  <td className="border-b border-border-subtle py-3 font-medium text-text">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${PIPELINE_SHADE[i]}`} />
                      {p.label}
                    </span>
                  </td>
                  <td className="border-b border-border-subtle py-3 text-text-muted">{p.n}</td>
                  <td className="border-b border-border-subtle py-3 text-right font-mono font-medium text-text">
                    {currency(p.valor)}
                  </td>
                  <td className="border-b border-border-subtle py-3 text-right text-text-muted">
                    {((p.valor / PIPELINE_TOTAL) * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
