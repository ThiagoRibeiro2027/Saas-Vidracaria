"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { upsertOportunidadeAction, mudarEstagioOportunidadeAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";

type Pessoa = { id: string; nome: string };

export type Estagio =
  | "prospeccao"
  | "contato"
  | "levantamento"
  | "qualificada"
  | "orcamento"
  | "negociacao"
  | "aprovacao"
  | "ganha"
  | "perdida";

type Oportunidade = {
  id: string;
  pessoa_id: string;
  origem: string | null;
  descricao: string | null;
  valor_potencial: number | null;
  probabilidade: number | null;
  previsao_fechamento: string | null;
  estagio: Estagio;
  motivo_perda: string | null;
  observacoes: string | null;
};

// Funil fixo (TÓPICO 10 §3, ADR-002 v2.4) — não configurável por empresa
// nesta fase. A ordem aqui é só de exibição no <select>; a função no banco
// não impõe sequência entre os estágios não-terminais.
const ESTAGIOS: { value: Estagio; label: string }[] = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "contato", label: "Contato" },
  { value: "levantamento", label: "Levantamento" },
  { value: "qualificada", label: "Qualificada" },
  { value: "orcamento", label: "Orçamento" },
  { value: "negociacao", label: "Negociação" },
  { value: "aprovacao", label: "Aprovação" },
  { value: "ganha", label: "Ganha" },
  { value: "perdida", label: "Perdida" },
];

const ESTAGIO_LABEL: Record<Estagio, string> = Object.fromEntries(
  ESTAGIOS.map((e) => [e.value, e.label]),
) as Record<Estagio, string>;

const ESTAGIO_TONE: Record<Estagio, "neutral" | "success" | "danger"> = {
  prospeccao: "neutral",
  contato: "neutral",
  levantamento: "neutral",
  qualificada: "neutral",
  orcamento: "neutral",
  negociacao: "neutral",
  aprovacao: "neutral",
  ganha: "success",
  perdida: "danger",
};

const MOTIVOS_PERDA = [
  { value: "preco", label: "Preço" },
  { value: "prazo", label: "Prazo" },
  { value: "concorrente", label: "Concorrente" },
  { value: "condicao_comercial", label: "Condição comercial" },
  { value: "especificacao", label: "Especificação" },
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "projeto_cancelado", label: "Projeto cancelado" },
  { value: "falta_orcamento", label: "Falta de orçamento" },
  { value: "produto_inadequado", label: "Produto inadequado" },
  { value: "outros", label: "Outros" },
];

const motivoPerdaLabel = (value: string | null) =>
  value ? (MOTIVOS_PERDA.find((m) => m.value === value)?.label ?? value) : null;

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLUNAS = 7;

// Mesmo padrão da lista de itens do orçamento (OrcamentosSection.tsx):
// cada oportunidade vira uma linha compacta; clicar abre o detalhe
// (mudança de estágio, se editável, ou só o que não coube na linha) no
// lugar da própria linha. Só uma fica aberta por vez.
export default function OportunidadesSection({
  oportunidades,
  paginacao,
  todasPessoas,
  canManage,
}: {
  oportunidades: Oportunidade[];
  paginacao: PaginacaoInfo;
  todasPessoas: Pessoa[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const [expandido, setExpandido] = useState<string | null>(null);

  function aoSalvar() {
    setExpandido(null);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Oportunidades e funil comercial</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Ampliação de escopo do TÓPICO 10 (ADR-002 v2.4, 19/09/2026): funil fixo, não configurável
        por empresa nesta fase. &quot;Cliente/prospect&quot; reaproveita o cadastro de Pessoas — uma
        oportunidade pode apontar para uma pessoa que ainda não tem papel Cliente; convertê-la em
        cliente é feito em Comercial → Clientes. Clique numa linha para abrir, revisar e mudar o estágio.
      </p>

      <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Cliente/prospect</Th>
              <Th>Descrição</Th>
              <Th>Origem</Th>
              <Th>Estágio</Th>
              <Th className="text-right">Valor potencial</Th>
              <Th className="text-right">Prob.</Th>
              <Th className="w-6" />
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {oportunidades.map((op) => (
              <OportunidadeLinha
                key={op.id}
                oportunidade={op}
                pessoaNome={pessoaNome(op.pessoa_id)}
                editavel={canManage && op.estagio !== "ganha" && op.estagio !== "perdida"}
                expandido={expandido === op.id}
                onToggle={() => setExpandido((atual) => (atual === op.id ? null : op.id))}
                onSaved={aoSalvar}
              />
            ))}
            {canManage && (
              <NovaOportunidadeLinha
                todasPessoas={todasPessoas}
                expandido={expandido === "novo"}
                onToggle={() => setExpandido((atual) => (atual === "novo" ? null : "novo"))}
                onSaved={aoSalvar}
              />
            )}
            {oportunidades.length === 0 && !canManage && (
              <tr>
                <Td colSpan={COLUNAS} className="text-text-muted">
                  Nenhuma oportunidade ainda.
                </Td>
              </tr>
            )}
          </tbody>
      </DenseTable>
      <Paginacao {...paginacao} paramPagina="op_pagina" paramPorPagina="op_por_pagina" />
    </section>
  );
}

function OportunidadeLinha({
  oportunidade,
  pessoaNome,
  editavel,
  expandido,
  onToggle,
  onSaved,
}: {
  oportunidade: Oportunidade;
  pessoaNome: string;
  editavel: boolean;
  expandido: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const linhaCompacta = (
    <tr onClick={onToggle} className="cursor-pointer hover:bg-page-bg">
      <Td className="font-medium text-text">{pessoaNome}</Td>
      <Td className="max-w-[220px] truncate text-text-muted">{oportunidade.descricao ?? "—"}</Td>
      <Td className="text-text-muted">{oportunidade.origem ?? "—"}</Td>
      <Td>
        <StatusPill tone={ESTAGIO_TONE[oportunidade.estagio]}>{ESTAGIO_LABEL[oportunidade.estagio]}</StatusPill>
      </Td>
      <Td className="text-right">
        {oportunidade.valor_potencial != null ? currency(oportunidade.valor_potencial) : "—"}
      </Td>
      <Td className="text-right">{oportunidade.probabilidade != null ? `${oportunidade.probabilidade}%` : "—"}</Td>
      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
    </tr>
  );

  if (!expandido) return linhaCompacta;

  return (
    <>
      {linhaCompacta}
      <tr>
        <Td colSpan={COLUNAS} className="bg-page-bg">
          <OportunidadeDetalhe oportunidade={oportunidade} editavel={editavel} onSaved={onSaved} />
        </Td>
      </tr>
    </>
  );
}

// 2026-10-04: componente próprio (montado só enquanto a linha está
// expandida, ver uso acima) pra que o estado local `mudandoEstagio` comece
// sempre em consulta a cada vez que a linha abre — mesmo padrão já
// aplicado em Clientes/Orçamentos/RH/Contratos. Antes, oportunidade
// editável pulava direto pro form de mudar estágio e escondia previsão de
// fechamento/motivo/observações por baixo; "Mudar estágio" agora é que
// revela o form.
function OportunidadeDetalhe({
  oportunidade,
  editavel,
  onSaved,
}: {
  oportunidade: Oportunidade;
  editavel: boolean;
  onSaved: () => void;
}) {
  const [mudandoEstagio, setMudandoEstagio] = useState(false);

  if (editavel && mudandoEstagio) {
    return (
      <MudarEstagioForm
        oportunidadeId={oportunidade.id}
        estagioAtual={oportunidade.estagio}
        onSaved={() => {
          onSaved();
          setMudandoEstagio(false);
        }}
        onCancel={() => setMudandoEstagio(false)}
      />
    );
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">Previsão de fechamento</dt>
          <dd className="text-text">{oportunidade.previsao_fechamento ?? "—"}</dd>
        </div>
        {oportunidade.motivo_perda && (
          <div>
            <dt className="text-text-muted">Motivo da perda</dt>
            <dd className="text-text">{motivoPerdaLabel(oportunidade.motivo_perda)}</dd>
          </div>
        )}
        {oportunidade.observacoes && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-text-muted">Observações</dt>
            <dd className="text-text">{oportunidade.observacoes}</dd>
          </div>
        )}
      </dl>
      {editavel && (
        <Button type="button" variant="secondary" size="sm" className="mt-1.5" onClick={() => setMudandoEstagio(true)}>
          Mudar estágio
        </Button>
      )}
    </>
  );
}

function MudarEstagioForm({
  oportunidadeId,
  estagioAtual,
  onSaved,
  onCancel,
}: {
  oportunidadeId: string;
  estagioAtual: Estagio;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await mudarEstagioOportunidadeAction(new FormData(e.currentTarget));
      onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mudar o estágio.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={oportunidadeId} />
      <Select name="estagio" defaultValue={estagioAtual}>
        {ESTAGIOS.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </Select>
      {/* Motivo só é exigido pelo banco quando estagio='perdida'; deixado sempre
          disponível aqui em vez de mostrar/esconder por JS — a validação real é
          a função no banco, isto é só conveniência de formulário único. */}
      <Select name="motivo_perda" defaultValue="">
        <option value="">Motivo (se perdida)</option>
        {MOTIVOS_PERDA.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="primary" disabled={enviando}>
        {enviando ? "Salvando..." : "Mudar estágio"}
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      )}
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </form>
  );
}

function NovaOportunidadeLinha({
  todasPessoas,
  expandido,
  onToggle,
  onSaved,
}: {
  todasPessoas: Pessoa[];
  expandido: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  if (!expandido) {
    return (
      <tr onClick={onToggle} className="cursor-pointer text-primary hover:bg-page-bg">
        <Td colSpan={COLUNAS}>+ Nova oportunidade</Td>
      </tr>
    );
  }

  if (todasPessoas.length === 0) {
    return (
      <tr>
        <Td colSpan={COLUNAS} className="bg-page-bg text-text-muted">
          Nenhuma pessoa cadastrada — cadastre uma em Comercial → Clientes antes.
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td colSpan={COLUNAS} className="bg-page-bg">
        <NovaOportunidadeForm todasPessoas={todasPessoas} onSaved={onSaved} />
      </Td>
    </tr>
  );
}

function NovaOportunidadeForm({ todasPessoas, onSaved }: { todasPessoas: Pessoa[]; onSaved: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await upsertOportunidadeAction(new FormData(e.currentTarget));
      onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar a oportunidade.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-1.5">
      <Select name="pessoa_id" defaultValue="" required className="min-w-40">
        {/* `hidden` em vez de `disabled`: mesma correção aplicada em
            OrcamentosSection.tsx (ver comentário lá) — evita que a primeira
            escolha no select não "grude". */}
        <option value="" hidden>
          Cliente/prospect
        </option>
        {todasPessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </Select>
      <Input name="descricao" placeholder="descrição" className="w-44" />
      <Input name="origem" placeholder="origem" className="w-28" />
      <Input name="valor_potencial" type="number" step="0.01" min="0" placeholder="valor potencial" className="w-32" />
      <Input name="probabilidade" type="number" step="1" min="0" max="100" placeholder="prob. %" className="w-20" />
      <label className="flex items-center gap-1 text-xs text-text">
        Previsão
        <Input name="previsao_fechamento" type="date" />
      </label>
      <Input name="observacoes" placeholder="observações" className="w-40" />
      <Button type="submit" variant="primary" disabled={enviando}>
        {enviando ? "Salvando..." : "Criar oportunidade"}
      </Button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </form>
  );
}
