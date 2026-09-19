"use client";

import {
  gerarPropostaAction,
  marcarPropostaEnviadaAction,
  registrarAceitePropostaAction,
  registrarRecusaPropostaAction,
  cancelarPropostaAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Orcamento = { id: string; numero: string; status: string; pessoa_id: string };
type Pessoa = { id: string; nome: string };

type PropostaStatus = "rascunho" | "enviada" | "aceita" | "recusada" | "cancelada";

type Snapshot = {
  numero_orcamento: string;
  valor_total: number;
  condicao_comercial: string | null;
  itens: { codigo: string; descricao: string; quantidade: number; preco_unitario: number; subtotal: number }[];
};

type Proposta = {
  id: string;
  orcamento_id: string;
  numero: string;
  status: PropostaStatus;
  validade: string;
  snapshot: Snapshot;
  canal: string | null;
  destinatario: string | null;
};

const STATUS_LABEL: Record<PropostaStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<PropostaStatus, "neutral" | "success" | "danger" | "warning"> = {
  rascunho: "neutral",
  enviada: "warning",
  aceita: "success",
  recusada: "danger",
  cancelada: "danger",
};

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isVencida(proposta: Proposta) {
  return proposta.status === "enviada" && proposta.validade < new Date().toISOString().slice(0, 10);
}

export default function PropostasSection({
  propostas,
  orcamentosAprovados,
  todasPessoas,
  canManage,
}: {
  propostas: Proposta[];
  orcamentosAprovados: Orcamento[];
  todasPessoas: Pessoa[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const orcamentosSemProposta = orcamentosAprovados.filter(
    (o) => !propostas.some((p) => p.orcamento_id === o.id && p.status !== "cancelada" && p.status !== "recusada"),
  );

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-text">Proposta comercial</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Ampliação de escopo do TÓPICO 10 (ADR-002 v2.4, 19/09/2026): documento gerado como retrato
        do orçamento aprovado no momento da geração, sem versionamento nem PDF/layout
        configurável. Custo e margem nunca aparecem aqui — só no orçamento, para quem gerencia.
      </p>

      {canManage && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-[13px] font-medium text-text">Gerar proposta</h3>
          {orcamentosSemProposta.length === 0 ? (
            <p className="text-xs text-text-muted">
              Nenhum orçamento aprovado sem proposta ativa no momento.
            </p>
          ) : (
            <form action={gerarPropostaAction} className="flex flex-wrap items-center gap-1.5">
              <Select name="orcamento_id" defaultValue="" required className="min-w-48">
                <option value="" disabled>
                  Orçamento aprovado
                </option>
                {orcamentosSemProposta.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.numero} — {pessoaNome(o.pessoa_id)}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-1 text-xs text-text">
                Validade
                <Input name="validade" type="date" required />
              </label>
              <Button type="submit" variant="primary">
                Gerar proposta
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {propostas.map((p) => {
          const vencida = isVencida(p);
          return (
            <Card key={p.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{p.numero}</strong>
                <span className="text-text-muted">orçamento {p.snapshot.numero_orcamento}</span>
                <Badge variant={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                {vencida && <Badge variant="danger">Vencida</Badge>}
                <span className="text-text-muted">validade: {p.validade}</span>
                <span className="ml-auto font-semibold text-text">{currency(p.snapshot.valor_total)}</span>
              </div>

              <ul className="mt-1.5 text-xs text-text-muted">
                {p.snapshot.itens.map((it) => (
                  <li key={it.codigo}>
                    {it.codigo} — {it.descricao}: {it.quantidade} × {currency(it.preco_unitario)} ={" "}
                    {currency(it.subtotal)}
                  </li>
                ))}
              </ul>

              {canManage && p.status === "rascunho" && (
                <form action={marcarPropostaEnviadaAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <Input name="canal" placeholder="canal (e-mail, portal...)" className="w-40" />
                  <Input name="destinatario" placeholder="destinatário" className="w-44" />
                  <Button type="submit" variant="primary">
                    Marcar como enviada
                  </Button>
                </form>
              )}

              {canManage && p.status === "enviada" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <form action={registrarAceitePropostaAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="forcar" value="false" />
                    <Button type="submit" variant="primary" disabled={vencida}>
                      Registrar aceite
                    </Button>
                  </form>
                  {vencida && (
                    <form action={registrarAceitePropostaAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="forcar" value="true" />
                      <Button type="submit" variant="secondary">
                        Aceitar mesmo vencida
                      </Button>
                    </form>
                  )}
                  <form action={registrarRecusaPropostaAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <Input name="observacao" placeholder="motivo da recusa" className="w-40" />
                    <Button type="submit" variant="danger">
                      Registrar recusa
                    </Button>
                  </form>
                </div>
              )}

              {canManage && (p.status === "rascunho" || p.status === "enviada") && (
                <form action={cancelarPropostaAction} className="mt-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" variant="danger">
                    Cancelar proposta
                  </Button>
                </form>
              )}
            </Card>
          );
        })}
        {propostas.length === 0 && <p className="text-xs text-text-muted">Nenhuma proposta ainda.</p>}
      </div>
    </section>
  );
}
