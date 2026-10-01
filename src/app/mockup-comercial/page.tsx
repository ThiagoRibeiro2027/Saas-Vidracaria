"use client";

// PREVIEW DE DESIGN — não lê nem grava dado real (sem Supabase, sem
// actions). Existe só pra avaliar um padrão visual novo antes de migrar
// telas de verdade. Reusa os componentes reais já existentes em
// src/components/ui/ (Tabs, Modal, Button, Card, Badge) em vez de
// reinventar — só o conteúdo/layout da página é novo. Apagar depois que o
// padrão for aprovado/rejeitado.

import { useState } from "react";
import {
  Plus,
  FileText,
  TrendingUp,
  CheckCircle2,
  Wallet,
  ChevronRight,
  Building2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ORCAMENTOS = [
  { id: "1", numero: "ORC-0042", cliente: "Mercado Bom Preço", obra: "Fachada loja 2 — Av. Brasil", data: "28/09/2026", status: "aprovado" as const, total: 18400 },
  { id: "2", numero: "ORC-0041", cliente: "Condomínio Jardins", obra: "Guarda-corpo bloco B", data: "27/09/2026", status: "rascunho" as const, total: 6230 },
  { id: "3", numero: "ORC-0040", cliente: "Studio Arquitetura RM", obra: "Box banheiro — apto 302", data: "25/09/2026", status: "rascunho" as const, total: 2890 },
  { id: "4", numero: "ORC-0039", cliente: "Restaurante Varanda", obra: "Divisória ambiente interno", data: "22/09/2026", status: "rejeitado" as const, total: 9150 },
  { id: "5", numero: "ORC-0038", cliente: "João Pereira", obra: "—", data: "19/09/2026", status: "aprovado" as const, total: 3420 },
];

const OPORTUNIDADES = [
  { id: "1", cliente: "Hospital Santa Clara", descricao: "Esquadrias ala nova", estagio: "proposta" as const, valor: 54000 },
  { id: "2", cliente: "Incorporadora Vallée", descricao: "Box banheiro — 40 unidades", estagio: "negociacao" as const, valor: 128000 },
  { id: "3", cliente: "Mercado Bom Preço", descricao: "Fachada loja 3 (nova unidade)", estagio: "qualificacao" as const, valor: 22000 },
  { id: "4", cliente: "Studio Arquitetura RM", descricao: "Cobertura varanda", estagio: "ganha" as const, valor: 15400 },
];

const PROPOSTAS = [
  { id: "1", numero: "PROP-0012", cliente: "Mercado Bom Preço", status: "enviada" as const, total: 18400 },
  { id: "2", numero: "PROP-0011", cliente: "João Pereira", status: "aceita" as const, total: 3420 },
];

const STATUS_TONE = {
  rascunho: "neutral",
  aprovado: "success",
  rejeitado: "danger",
  cancelado: "danger",
  enviada: "neutral",
  aceita: "success",
} as const;

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  enviada: "Enviada",
  aceita: "Aceita",
};

const ESTAGIO_LABEL: Record<string, string> = {
  qualificacao: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganha: "Ganha",
  perdida: "Perdida",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card padding="sm" className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="mt-0.5 text-lg font-semibold leading-tight text-text">{value}</p>
        <p className="mt-0.5 text-xs text-text-muted">{hint}</p>
      </div>
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
      {initials(name)}
    </span>
  );
}

// Mesmo formato de TabItem/Tabs real (src/components/ui/Tabs.tsx), só que
// aqui o clique troca estado local em vez de navegar por ?tab= — o
// componente real é dirigido por URL (Server Component), e esta página é
// "use client" só pra viabilizar o preview sem servidor/dados. Numa
// migração de verdade, isto volta a ser <Tabs tabs={...} active={tab}
// basePath="/comercial" /> dirigido pelo searchParams, igual à tela real.
const TABS = [
  { slug: "orcamentos", label: "Orçamentos" },
  { slug: "oportunidades", label: "Oportunidades" },
  { slug: "propostas", label: "Propostas" },
] as const;

export default function MockupComercialPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["slug"]>("orcamentos");
  const [novoOrcamentoOpen, setNovoOrcamentoOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-primary">PREVIEW — padrão visual novo</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">Comercial</h1>
          <p className="mt-1 text-sm text-text-muted">
            Orçamentos, oportunidades e propostas em um só lugar.
          </p>
        </div>
        <Button variant="primary" className="gap-1.5" onClick={() => setNovoOrcamentoOpen(true)}>
          <Plus size={16} strokeWidth={2.5} />
          Novo orçamento
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={FileText} label="Em aberto" value="3" hint={currency(12350)} />
        <StatCard icon={CheckCircle2} label="Aprovados (mês)" value="2" hint={currency(21820)} />
        <StatCard icon={TrendingUp} label="Taxa de conversão" value="64%" hint="últimos 30 dias" />
        <StatCard icon={Wallet} label="Ticket médio" value={currency(8018)} hint="5 orçamentos" />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.slug}
            onClick={() => setTab(t.slug)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.slug
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orcamentos" && (
        <div className="mt-4 flex flex-col gap-2">
          {ORCAMENTOS.map((o) => (
            <Card
              key={o.id}
              padding="sm"
              className="flex items-center gap-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
            >
              <Avatar name={o.cliente} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{o.cliente}</span>
                  <span className="shrink-0 font-mono text-xs text-text-muted">{o.numero}</span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                  <Building2 size={12} />
                  {o.obra} · {o.data}
                </p>
              </div>
              <Badge variant={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
              <span className="w-28 shrink-0 text-right text-sm font-semibold text-text">
                {currency(o.total)}
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted" />
            </Card>
          ))}
        </div>
      )}

      {tab === "oportunidades" && (
        <div className="mt-4 flex flex-col gap-2">
          {OPORTUNIDADES.map((o) => (
            <Card key={o.id} padding="sm" className="flex items-center gap-3">
              <Avatar name={o.cliente} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-text">{o.cliente}</span>
                <p className="mt-0.5 truncate text-xs text-text-muted">{o.descricao}</p>
              </div>
              <Badge variant={o.estagio === "ganha" ? "success" : "neutral"}>
                {ESTAGIO_LABEL[o.estagio]}
              </Badge>
              <span className="w-28 shrink-0 text-right text-sm font-semibold text-text">
                {currency(o.valor)}
              </span>
            </Card>
          ))}
        </div>
      )}

      {tab === "propostas" && (
        <div className="mt-4 flex flex-col gap-2">
          {PROPOSTAS.map((p) => (
            <Card key={p.id} padding="sm" className="flex items-center gap-3">
              <Avatar name={p.cliente} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{p.cliente}</span>
                  <span className="shrink-0 font-mono text-xs text-text-muted">{p.numero}</span>
                </div>
              </div>
              <Badge variant={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              <span className="w-28 shrink-0 text-right text-sm font-semibold text-text">
                {currency(p.total)}
              </span>
            </Card>
          ))}
        </div>
      )}

      {/* Modal real (src/components/ui/Modal.tsx) — mostra o padrão pra
          formulário de criação em vez do form cru dentro do header, que é
          como a tela real faz hoje. Puramente visual aqui: sem action. */}
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
