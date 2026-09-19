"use client";

import { upsertOportunidadeAction, mudarEstagioOportunidadeAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OportunidadesSection({
  oportunidades,
  todasPessoas,
  canManage,
}: {
  oportunidades: Oportunidade[];
  todasPessoas: Pessoa[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-text">Oportunidades e funil comercial</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Ampliação de escopo do TÓPICO 10 (ADR-002 v2.4, 19/09/2026): funil fixo, não configurável
        por empresa nesta fase. &quot;Cliente/prospect&quot; reaproveita o cadastro de Pessoas — uma
        oportunidade pode apontar para uma pessoa que ainda não tem papel Cliente; convertê-la em
        cliente é feito em Cadastros.
      </p>

      {canManage && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-[13px] font-medium text-text">Nova oportunidade</h3>
          {todasPessoas.length === 0 ? (
            <p className="text-xs text-text-muted">Nenhuma pessoa cadastrada — cadastre uma em Cadastros antes.</p>
          ) : (
            <form action={upsertOportunidadeAction} className="flex flex-wrap items-center gap-1.5">
              <Select name="pessoa_id" defaultValue="" required className="min-w-40">
                <option value="" disabled>
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
              <Button type="submit" variant="primary">
                Criar oportunidade
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {oportunidades.map((op) => {
          const editavel = canManage && op.estagio !== "ganha" && op.estagio !== "perdida";
          return (
            <Card key={op.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{pessoaNome(op.pessoa_id)}</strong>
                <span className="text-text-muted">{op.descricao ?? "—"}</span>
                {op.origem && <span className="text-text-muted">origem: {op.origem}</span>}
                <Badge variant={ESTAGIO_TONE[op.estagio]}>{ESTAGIO_LABEL[op.estagio]}</Badge>
                {op.motivo_perda && (
                  <span className="text-text-muted">
                    motivo: {MOTIVOS_PERDA.find((m) => m.value === op.motivo_perda)?.label ?? op.motivo_perda}
                  </span>
                )}
                {op.valor_potencial != null && (
                  <span className="ml-auto font-semibold text-text">{currency(op.valor_potencial)}</span>
                )}
                {op.probabilidade != null && <span className="text-text-muted">{op.probabilidade}%</span>}
              </div>

              {editavel && <MudarEstagioForm oportunidadeId={op.id} estagioAtual={op.estagio} />}
            </Card>
          );
        })}
        {oportunidades.length === 0 && <p className="text-xs text-text-muted">Nenhuma oportunidade ainda.</p>}
      </div>
    </section>
  );
}

function MudarEstagioForm({ oportunidadeId, estagioAtual }: { oportunidadeId: string; estagioAtual: Estagio }) {
  return (
    <form action={mudarEstagioOportunidadeAction} className="mt-2 flex flex-wrap items-center gap-1.5">
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
      <Button type="submit" variant="primary">
        Mudar estágio
      </Button>
    </form>
  );
}
