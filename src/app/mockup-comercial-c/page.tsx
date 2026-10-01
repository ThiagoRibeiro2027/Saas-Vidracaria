"use client";

// PREVIEW DE DESIGN — terceira opção. Feedback nas duas anteriores: a
// estrutura (cards/kanban) estava ok, mas a cor "não tinha personalidade"
// (referência citada: HubSpot/Pipedrive/Salesforce — cor SÓLIDA e
// confiante, não tom pastel suave). Esta versão mantém o layout da v2 mas
// troca preenchimento suave (bg-primary/10) por preenchimento cheio
// (bg-primary, texto branco) nos pontos de destaque, e soma uma cor de
// marca secundária (coral) ao verde — hoje são valores soltos, não
// tokens em globals.css ainda. Estático, sem Supabase/actions.

import { useState } from "react";
import { Plus, TrendingUp, TrendingDown, Building2, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Marca secundária de exploração (coral) ao lado do verde institucional —
// é a cor que falta pra "ter personalidade" segundo o feedback. Se
// aprovado, --color-coral entra em @theme de verdade.
const CORAL = "bg-[#ff6b4a]";
const CORAL_FORCE = "!bg-[#ff6b4a]"; // sobrepõe bg-primary do variant="primary" do Button real
const CORAL_TEXT = "text-[#ff6b4a]";

const STAT_TILES = [
  { label: "Em aberto", value: "R$ 9,1 mil", sub: "3 orçamentos", delta: "+8%", up: true, bg: "bg-primary" },
  { label: "Aprovados (mês)", value: "R$ 21,8 mil", sub: "2 orçamentos", delta: "+22%", up: true, bg: CORAL },
  { label: "Taxa de conversão", value: "64%", sub: "últimos 30 dias", delta: "-3%", up: false, bg: "bg-[#2f6fed]" },
  { label: "Ticket médio", value: "R$ 8,0 mil", sub: "5 orçamentos", delta: "+5%", up: true, bg: "bg-[#8b5cf6]" },
];

const ORCAMENTOS = [
  { id: "1", numero: "ORC-0042", cliente: "Mercado Bom Preço", obra: "Fachada loja 2 — Av. Brasil", data: "28 set", status: "aprovado" as const, total: 18400, accent: "bg-primary" },
  { id: "2", numero: "ORC-0041", cliente: "Condomínio Jardins", obra: "Guarda-corpo bloco B", data: "27 set", status: "rascunho" as const, total: 6230, accent: CORAL },
  { id: "3", numero: "ORC-0040", cliente: "Studio Arquitetura RM", obra: "Box banheiro — apto 302", data: "25 set", status: "rascunho" as const, total: 2890, accent: "bg-[#2f6fed]" },
  { id: "4", numero: "ORC-0039", cliente: "Restaurante Varanda", obra: "Divisória ambiente interno", data: "22 set", status: "rejeitado" as const, total: 9150, accent: "bg-[#8b5cf6]" },
  { id: "5", numero: "ORC-0038", cliente: "João Pereira", obra: "—", data: "19 set", status: "aprovado" as const, total: 3420, accent: "bg-primary" },
];

const STATUS_PILL = {
  rascunho: "bg-text-muted",
  aprovado: "bg-primary",
  rejeitado: `${CORAL}`,
} as const;
const STATUS_LABEL = { rascunho: "Rascunho", aprovado: "Aprovado", rejeitado: "Rejeitado" } as const;

const KANBAN = [
  { estagio: "Qualificação", accent: "bg-[#2f6fed]", cards: [{ cliente: "Mercado Bom Preço", descricao: "Fachada loja 3 (nova unidade)", valor: 22000 }] },
  { estagio: "Proposta", accent: CORAL, cards: [{ cliente: "Hospital Santa Clara", descricao: "Esquadrias ala nova", valor: 54000 }] },
  { estagio: "Negociação", accent: "bg-[#8b5cf6]", cards: [{ cliente: "Incorporadora Vallée", descricao: "Box banheiro — 40 unidades", valor: 128000 }] },
  { estagio: "Ganha", accent: "bg-primary", cards: [{ cliente: "Studio Arquitetura RM", descricao: "Cobertura varanda", valor: 15400 }] },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

const TABS = ["orcamentos", "pipeline"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { orcamentos: "Orçamentos", pipeline: "Pipeline" };

export default function MockupComercialCPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("orcamentos");
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${CORAL_TEXT}`}>
            Preview · identidade C
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-text">Comercial</h1>
        </div>
        <Button
          variant="primary"
          className={`gap-1.5 rounded-xl border-none px-4 py-2.5 font-semibold shadow-sm ${CORAL_FORCE} hover:opacity-90`}
          onClick={() => setOpen(true)}
        >
          <Plus size={16} strokeWidth={2.5} />
          Novo orçamento
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_TILES.map((s) => (
          <div key={s.label} className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-md ${s.bg}`}>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
            <div className="absolute -bottom-6 -right-10 h-24 w-24 rounded-full bg-white/10" />
            <p className="text-xs font-medium text-white/80">{s.label}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight">{s.value}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-white/70">{s.sub}</span>
              <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">
                {s.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {s.delta}
              </span>
            </div>
          </div>
        ))}
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

      {tab === "orcamentos" && (
        <div className="mt-4 flex flex-col gap-2.5">
          {ORCAMENTOS.map((o) => (
            <Card
              key={o.id}
              padding="none"
              className="flex items-center gap-4 overflow-hidden border-none p-3.5 shadow-sm ring-1 ring-border-subtle transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`h-10 w-1.5 shrink-0 self-stretch rounded-full ${o.accent}`} />
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${o.accent}`}>
                {initials(o.cliente)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-text">{o.cliente}</span>
                  <span className="shrink-0 rounded-md bg-page-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{o.numero}</span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                  <Building2 size={12} />
                  {o.obra} · {o.data}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${STATUS_PILL[o.status]}`}>
                {STATUS_LABEL[o.status]}
              </span>
              <span className="w-24 shrink-0 text-right text-base font-bold text-text">{currency(o.total)}</span>
              <button className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-page-bg hover:text-text">
                <MoreHorizontal size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === "pipeline" && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          {KANBAN.map((col) => (
            <div key={col.estagio} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-text">{col.estagio}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${col.accent}`}>
                  {col.cards.length}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {col.cards.map((c, idx) => (
                  <div key={idx} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border-subtle transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className={`h-1.5 ${col.accent}`} />
                    <div className="p-3.5">
                      <p className="text-sm font-bold text-text">{c.cliente}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{c.descricao}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold text-white ${col.accent}`}>
                          {currency(c.valor)}
                        </span>
                        <ArrowUpRight size={14} className="text-text-muted" />
                      </div>
                    </div>
                  </div>
                ))}
                <button className="rounded-xl border-2 border-dashed border-border py-2.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary/50 hover:text-primary">
                  + adicionar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Novo orçamento">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-text">
            Cliente
            <Select defaultValue="">
              <option value="" disabled>Selecione um cliente</option>
              <option>Mercado Bom Preço</option>
              <option>Condomínio Jardins</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            Obra (opcional)
            <Select defaultValue=""><option value="">Sem obra</option></Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            Validade
            <Input type="date" />
          </label>
          <Button variant="primary" className={`mt-1 border-none ${CORAL_FORCE} hover:opacity-90`} onClick={() => setOpen(false)}>
            Criar orçamento
          </Button>
        </div>
      </Modal>
    </div>
  );
}
