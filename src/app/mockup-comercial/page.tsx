"use client";

// PREVIEW DE DESIGN — não lê nem grava dado real (sem Supabase, sem
// actions). Existe só pra avaliar um padrão visual novo antes de migrar
// telas de verdade. Usa os componentes reais (Modal, Card, Badge, Button)
// como base, mas aqui extrapola a paleta/sombra de propósito (ver
// comentário acima de ACCENT) — é exploração, não o token final.
// Apagar depois que o padrão for aprovado/rejeitado.

import { useState } from "react";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Building2,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Paleta de exploração — o token atual (globals.css) só define
// primary/success/warning/danger. Pra avaliar "mais moderno" de verdade,
// isto testa cor por categoria (não por status) em vez de tudo verde. Se
// aprovado, essas 4 cores viram tokens reais em @theme, não hex espalhado.
const ACCENT = {
  teal: { bg: "bg-primary", soft: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
  blue: { bg: "bg-blue-500", soft: "bg-blue-500/10", text: "text-blue-600", ring: "ring-blue-500/20" },
  amber: { bg: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20" },
  violet: { bg: "bg-violet-500", soft: "bg-violet-500/10", text: "text-violet-600", ring: "ring-violet-500/20" },
} as const;

const ORCAMENTOS = [
  { id: "1", numero: "ORC-0042", cliente: "Mercado Bom Preço", obra: "Fachada loja 2 — Av. Brasil", data: "28 set", status: "aprovado" as const, total: 18400 },
  { id: "2", numero: "ORC-0041", cliente: "Condomínio Jardins", obra: "Guarda-corpo bloco B", data: "27 set", status: "rascunho" as const, total: 6230 },
  { id: "3", numero: "ORC-0040", cliente: "Studio Arquitetura RM", obra: "Box banheiro — apto 302", data: "25 set", status: "rascunho" as const, total: 2890 },
  { id: "4", numero: "ORC-0039", cliente: "Restaurante Varanda", obra: "Divisória ambiente interno", data: "22 set", status: "rejeitado" as const, total: 9150 },
  { id: "5", numero: "ORC-0038", cliente: "João Pereira", obra: "—", data: "19 set", status: "aprovado" as const, total: 3420 },
];

const STATUS_STYLE = {
  rascunho: { dot: "bg-text-muted", label: "Rascunho", text: "text-text-muted" },
  aprovado: { dot: "bg-emerald-500", label: "Aprovado", text: "text-emerald-600" },
  rejeitado: { dot: "bg-rose-500", label: "Rejeitado", text: "text-rose-600" },
} as const;

const KANBAN_COLUNAS = [
  {
    estagio: "qualificacao",
    label: "Qualificação",
    accent: ACCENT.blue,
    cards: [
      { cliente: "Mercado Bom Preço", descricao: "Fachada loja 3 (nova unidade)", valor: 22000 },
    ],
  },
  {
    estagio: "proposta",
    label: "Proposta",
    accent: ACCENT.amber,
    cards: [
      { cliente: "Hospital Santa Clara", descricao: "Esquadrias ala nova", valor: 54000 },
    ],
  },
  {
    estagio: "negociacao",
    label: "Negociação",
    accent: ACCENT.violet,
    cards: [
      { cliente: "Incorporadora Vallée", descricao: "Box banheiro — 40 unidades", valor: 128000 },
    ],
  },
  {
    estagio: "ganha",
    label: "Ganha",
    accent: { bg: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-500/20" },
    cards: [
      { cliente: "Studio Arquitetura RM", descricao: "Cobertura varanda", valor: 15400 },
    ],
  },
] as const;

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// Sparkline decorativa (SVG estático, dado fixo) — só pra mostrar o
// efeito. Numa migração de verdade, viria de uma agregação real (ex.:
// total de orçamentos aprovados por dia nos últimos 14 dias).
function Sparkline({ points, colorClass }: { points: number[]; colorClass: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-7 w-full ${colorClass}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  delta,
  deltaUp,
  accent,
  trend,
}: {
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean;
  accent: (typeof ACCENT)[keyof typeof ACCENT];
  trend: number[];
}) {
  return (
    <Card padding="none" className="overflow-hidden border-none shadow-sm ring-1 ring-border-subtle">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-text-muted">{label}</p>
          <span
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              deltaUp ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
            }`}
          >
            {deltaUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta}
          </span>
        </div>
        <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-text">{value}</p>
      </div>
      <div className={`px-4 pb-3 ${accent.text}`}>
        <Sparkline points={trend} colorClass={accent.text} />
      </div>
      <div className={`h-1 w-full ${accent.bg}`} />
    </Card>
  );
}

function Avatar({ name, accent }: { name: string; accent: (typeof ACCENT)[keyof typeof ACCENT] }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${accent.soft} ${accent.text}`}>
      {initials(name)}
    </span>
  );
}

const ACCENT_CYCLE = [ACCENT.teal, ACCENT.blue, ACCENT.violet, ACCENT.amber];

const TABS = [
  { slug: "orcamentos", label: "Orçamentos" },
  { slug: "pipeline", label: "Pipeline" },
] as const;

export default function MockupComercialPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["slug"]>("orcamentos");
  const [novoOrcamentoOpen, setNovoOrcamentoOpen] = useState(false);

  return (
    <div className="min-h-full bg-gradient-to-b from-primary/5 to-transparent">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
              <Sparkles size={20} strokeWidth={2} />
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-primary">Preview · padrão novo</p>
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-text">Comercial</h1>
            </div>
          </div>
          <Button
            variant="primary"
            className="gap-1.5 rounded-xl px-4 py-2.5 shadow-sm"
            onClick={() => setNovoOrcamentoOpen(true)}
          >
            <Plus size={16} strokeWidth={2.5} />
            Novo orçamento
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Em aberto" value="R$ 9,1 mil" delta="+8%" deltaUp accent={ACCENT.teal} trend={[4, 6, 5, 7, 6, 8, 9]} />
          <StatCard label="Aprovados (mês)" value="R$ 21,8 mil" delta="+22%" deltaUp accent={ACCENT.blue} trend={[10, 9, 12, 14, 13, 18, 22]} />
          <StatCard label="Taxa de conversão" value="64%" delta="-3%" deltaUp={false} accent={ACCENT.amber} trend={[70, 68, 66, 69, 65, 63, 64]} />
          <StatCard label="Ticket médio" value="R$ 8,0 mil" delta="+5%" deltaUp accent={ACCENT.violet} trend={[6, 7, 6, 7, 8, 7, 8]} />
        </div>

        <div className="mt-7 flex items-center justify-between">
          <div className="flex gap-1 rounded-xl bg-page-bg p-1">
            {TABS.map((t) => (
              <button
                key={t.slug}
                onClick={() => setTab(t.slug)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                  tab === t.slug ? "bg-white text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "orcamentos" && (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border-subtle">
            {ORCAMENTOS.map((o, i) => {
              const s = STATUS_STYLE[o.status];
              const accent = ACCENT_CYCLE[i % ACCENT_CYCLE.length];
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-4 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-page-bg/60"
                >
                  <Avatar name={o.cliente} accent={accent} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text">{o.cliente}</span>
                      <span className="shrink-0 rounded-md bg-page-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                        {o.numero}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                      <Building2 size={12} />
                      {o.obra} · {o.data}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-text">
                    {currency(o.total)}
                  </span>
                  <button className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-page-bg hover:text-text">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "pipeline" && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            {KANBAN_COLUNAS.map((col) => (
              <div key={col.estagio} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-text">
                    <span className={`h-2 w-2 rounded-full ${col.accent.bg}`} />
                    {col.label}
                  </span>
                  <span className="rounded-full bg-page-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                    {col.cards.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {col.cards.map((c, idx) => (
                    <div
                      key={idx}
                      className={`cursor-default rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-border-subtle transition-all hover:-translate-y-0.5 hover:shadow-md`}
                    >
                      <div className={`-mx-3.5 -mt-3.5 mb-3 h-1 rounded-t-xl ${col.accent.bg}`} />
                      <p className="text-sm font-semibold text-text">{c.cliente}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{c.descricao}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${col.accent.soft} ${col.accent.text}`}>
                          {currency(c.valor)}
                        </span>
                        <ArrowUpRight size={14} className="text-text-muted" />
                      </div>
                    </div>
                  ))}
                  <button className="rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-text-muted transition-colors hover:border-primary/40 hover:text-primary">
                    + adicionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={novoOrcamentoOpen} onClose={() => setNovoOrcamentoOpen(false)} title="Novo orçamento">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-text">
            Cliente
            <Select defaultValue="">
              <option value="" disabled>
                Selecione um cliente
              </option>
              <option>Mercado Bom Preço</option>
              <option>Condomínio Jardins</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            Obra (opcional)
            <Select defaultValue="">
              <option value="">Sem obra</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            Validade
            <Input type="date" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            Condição comercial
            <Input placeholder="ex.: 30/60/90 dias" />
          </label>
          <Button variant="primary" className="mt-1" onClick={() => setNovoOrcamentoOpen(false)}>
            Criar orçamento
          </Button>
        </div>
      </Modal>
    </div>
  );
}
