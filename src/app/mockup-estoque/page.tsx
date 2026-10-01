"use client";

// PREVIEW DE DESIGN — Estoque na identidade visual C (aprovada no
// Comercial): cor sólida/confiante, tiles de indicador preenchidos, badge
// com fill, cor coral como destaque/alerta ao lado do verde da marca.
// Conteúdo espelha o /estoque real (saldo por item, reserva para pedidos,
// peças dimensionais) — só a camada visual é nova, dado é fictício.
// Estático, sem Supabase/actions. Apagar depois que o padrão for
// aprovado/rejeitado.

import { useState } from "react";
import { Boxes, AlertTriangle, ClipboardList, Layers, Plus, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const CORAL = "bg-[#ff6b4a]";
const CORAL_FORCE = "!bg-[#ff6b4a]"; // sobrepõe bg-primary do variant="primary" do Button real
const CORAL_TEXT = "text-[#ff6b4a]";

const STAT_TILES = [
  { label: "Itens cadastrados", value: "4", sub: "catálogo ativo", bg: "bg-primary" },
  { label: "Saldo baixo/crítico", value: "2", sub: "precisa de atenção", bg: CORAL },
  { label: "Pedidos com falta", value: "1", sub: "de 3 com reserva", bg: "bg-[#2f6fed]" },
  { label: "Peças dimensionais", value: "5", sub: "3 disponíveis", bg: "bg-[#8b5cf6]" },
];

type StatusSaldo = "ok" | "baixo" | "critico";
const SALDO_STYLE: Record<StatusSaldo, { bar: string; text: string; label: string }> = {
  ok: { bar: "bg-primary", text: "text-primary", label: "Normal" },
  baixo: { bar: "bg-amber-500", text: "text-amber-600", label: "Baixo" },
  critico: { bar: CORAL, text: CORAL_TEXT, label: "Crítico" },
};

const ITENS = [
  { codigo: "PERF-001", descricao: "Perfil de alumínio 6m", unidade: "m", fisico: 120, reservado: 45, status: "ok" as StatusSaldo },
  { codigo: "VID-010", descricao: "Vidro temperado 10mm", unidade: "m²", fisico: 32, reservado: 30, status: "baixo" as StatusSaldo },
  { codigo: "FER-200", descricao: "Fechadura multiponto", unidade: "UN", fisico: 8, reservado: 10, status: "critico" as StatusSaldo },
  { codigo: "SIL-050", descricao: "Silicone estrutural", unidade: "UN", fisico: 60, reservado: 12, status: "ok" as StatusSaldo },
];

const PEDIDOS = [
  { numero: "PED-0188", cliente: "Mercado Bom Preço", obra: "Fachada loja 2", itens: 4, completo: true },
  { numero: "PED-0190", cliente: "Condomínio Jardins", obra: "Guarda-corpo bloco B", itens: 3, completo: false },
  { numero: "PED-0191", cliente: "João Pereira", obra: "—", itens: 2, completo: true },
];

const DIMENSIONAIS = [
  {
    item: "Perfil de alumínio 6m",
    tipo: "linear (metro)",
    pecas: [
      { id: "BARRA-001", original: 6, disponivel: 6 },
      { id: "BARRA-002", original: 6, disponivel: 2.3 },
      { id: "BARRA-003", original: 6, disponivel: 0 },
    ],
  },
  {
    item: "Vidro temperado chapa",
    tipo: "área (m²)",
    pecas: [{ id: "CHAPA-010", original: 2.5, disponivel: 2.5 }],
  },
];

function barColor(ratio: number) {
  if (ratio <= 0) return CORAL;
  if (ratio < 0.3) return "bg-amber-500";
  return "bg-primary";
}

const TABS = ["saldo", "reservas", "dimensional"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  saldo: "Saldo por item",
  reservas: "Reservas",
  dimensional: "Peças dimensionais",
};

export default function MockupEstoquePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("saldo");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${CORAL_TEXT}`}>
            Preview · identidade C
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-text">Estoque</h1>
        </div>
        <Button variant="primary" className={`gap-1.5 rounded-xl border-none px-4 py-2.5 font-semibold shadow-sm ${CORAL_FORCE} hover:opacity-90`}>
          <Plus size={16} strokeWidth={2.5} />
          Registrar sobra
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_TILES.map((s, i) => {
          const Icon = [Boxes, AlertTriangle, ClipboardList, Layers][i];
          return (
            <div key={s.label} className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-md ${s.bg}`}>
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -right-10 h-24 w-24 rounded-full bg-white/10" />
              <Icon size={18} className="text-white/80" />
              <p className="mt-2 text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="text-xs font-medium text-white/80">{s.label}</p>
              <p className="mt-1 text-[11px] text-white/70">{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-7 flex gap-1 rounded-xl bg-page-bg p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
              tab === t ? `${CORAL} text-white shadow-sm` : "text-text-muted hover:text-text"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "saldo" && (
        <div className="mt-4 flex flex-col gap-2.5">
          {ITENS.map((it) => {
            const disponivel = it.fisico - it.reservado;
            const s = SALDO_STYLE[it.status];
            return (
              <Card
                key={it.codigo}
                padding="none"
                className="flex items-center gap-4 overflow-hidden border-none p-3.5 shadow-sm ring-1 ring-border-subtle"
              >
                <span className={`h-11 w-1.5 shrink-0 self-stretch rounded-full ${s.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-text">{it.descricao}</span>
                    <span className="shrink-0 rounded-md bg-page-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                      {it.codigo}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-xs font-medium ${s.text}`}>{s.label}</p>
                </div>
                <div className="flex shrink-0 gap-5 text-right">
                  <div>
                    <p className="text-[11px] text-text-muted">Físico</p>
                    <p className="text-sm font-semibold text-text">
                      {num(it.fisico)} {it.unidade}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-muted">Reservado</p>
                    <p className="text-sm font-semibold text-text">
                      {num(it.reservado)} {it.unidade}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-muted">Disponível</p>
                    <p className={`text-sm font-bold ${disponivel < 0 ? CORAL_TEXT : "text-text"}`}>
                      {num(disponivel)} {it.unidade}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "reservas" && (
        <div className="mt-4 flex flex-col gap-2.5">
          {PEDIDOS.map((p) => (
            <Card
              key={p.numero}
              padding="none"
              className="flex items-center gap-4 overflow-hidden border-none p-3.5 shadow-sm ring-1 ring-border-subtle transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`h-11 w-1.5 shrink-0 self-stretch rounded-full ${p.completo ? "bg-primary" : CORAL}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-text">{p.cliente}</span>
                  <span className="shrink-0 rounded-md bg-page-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                    {p.numero}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-muted">{p.obra} · {p.itens} itens</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${p.completo ? "bg-primary" : CORAL}`}>
                {p.completo ? "Completo" : "Com falta"}
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted" />
            </Card>
          ))}
        </div>
      )}

      {tab === "dimensional" && (
        <div className="mt-4 flex flex-col gap-4">
          {DIMENSIONAIS.map((grupo) => (
            <Card key={grupo.item} padding="sm" className="border-none shadow-sm ring-1 ring-border-subtle">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-text">{grupo.item}</span>
                <span className="text-xs text-text-muted">{grupo.tipo}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {grupo.pecas.map((p) => {
                  const ratio = p.disponivel / p.original;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 font-mono text-xs text-text-muted">{p.id}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-page-bg">
                        <div className={`h-full rounded-full ${barColor(ratio)}`} style={{ width: `${Math.max(ratio * 100, 3)}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs font-semibold text-text">
                        {num(p.disponivel)} / {num(p.original)} m
                      </span>
                      <span className={`w-20 shrink-0 text-right text-[11px] font-bold ${ratio <= 0 ? CORAL_TEXT : "text-text-muted"}`}>
                        {ratio <= 0 ? "Esgotada" : "Disponível"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
