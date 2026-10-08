"use client";

import { useState } from "react";
import {
  criarSolicitacaoCompraAction,
  criarCompraEmergencialAction,
  adicionarItemSolicitacaoAction,
  removerItemSolicitacaoAction,
  enviarSolicitacaoCompraAction,
  cancelarSolicitacaoCompraAction,
  criarCompraDiretaAction,
  cancelarCompraDiretaAction,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

const PRIORIDADES = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
  ["urgente", "Urgente"],
] as const;

const MOTIVOS_DIRETA = [
  ["urgencia", "Urgência"],
  ["baixo_valor", "Baixo valor"],
  ["item_nao_recorrente", "Item não recorrente"],
  ["outro", "Outro"],
] as const;

const STATUS_SC_LABEL: Record<string, string> = { rascunho: "Rascunho", aberta: "Aberta", cancelada: "Cancelada" };
const STATUS_SC_TONE: Record<string, "neutral" | "success" | "danger"> = { rascunho: "neutral", aberta: "success", cancelada: "danger" };
const STATUS_CD_LABEL: Record<string, string> = { registrada: "Registrada", cancelada: "Cancelada" };
const STATUS_CD_TONE: Record<string, "success" | "danger"> = { registrada: "success", cancelada: "danger" };

type Item = { id: string; codigo: string; descricao: string; unidade_principal: string; tipo: string };
type Necessidade = { id: string; item_id: string; quantidade: number; origem: string };
type Profile = { id: string; display_name: string };
type Solicitacao = {
  id: string;
  numero: string;
  solicitante_id: string;
  setor: string | null;
  prioridade: string;
  justificativa: string | null;
  status: "rascunho" | "aberta" | "cancelada";
  motivo_cancelamento: string | null;
  urgencia: "normal" | "emergencial";
  emergencial_motivo: string | null;
  emergencial_impacto: string | null;
};
type SolicitacaoItem = {
  id: string;
  solicitacao_compra_id: string;
  item_id: string;
  quantidade: number;
  data_necessaria: string | null;
  aplicacao: string | null;
  necessidade_compra_id: string | null;
  observacoes: string | null;
};
type CompraDireta = {
  id: string;
  item_id: string;
  quantidade: number;
  motivo: string;
  justificativa: string;
  responsavel_id: string;
  necessidade_compra_id: string | null;
  status: "registrada" | "cancelada";
  motivo_cancelamento: string | null;
};

export default function SolicitacoesComprasSection({
  solicitacoes,
  itensSolicitacao,
  comprasDiretas,
  itens,
  necessidades,
  profiles,
  canManage,
}: {
  solicitacoes: Solicitacao[];
  itensSolicitacao: SolicitacaoItem[];
  comprasDiretas: CompraDireta[];
  itens: Item[];
  necessidades: Necessidade[];
  profiles: Profile[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const profilePorId = new Map(profiles.map((p) => [p.id, p]));
  const itensPorSolicitacao = new Map<string, SolicitacaoItem[]>();
  for (const it of itensSolicitacao) {
    const list = itensPorSolicitacao.get(it.solicitacao_compra_id) ?? [];
    list.push(it);
    itensPorSolicitacao.set(it.solicitacao_compra_id, list);
  }

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="text-sm font-semibold text-text">Solicitações de compra</h2>
        {canManage && (
          <form action={criarSolicitacaoCompraAction} className="my-3 flex flex-wrap items-center gap-1.5">
            <Input name="setor" placeholder="setor (opcional)" className="w-28" />
            <Select name="prioridade" defaultValue="normal">
              {PRIORIDADES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
            <Input name="justificativa" placeholder="justificativa (opcional)" className="w-48" />
            <Button type="submit" variant="primary">Nova solicitação</Button>
          </form>
        )}

        {canManage && (
          <details className="mb-3">
            <summary className="cursor-pointer text-xs text-danger">Compra emergencial (§32) — urgência com motivo/impacto obrigatórios</summary>
            <form action={criarCompraEmergencialAction} className="mt-2 flex flex-wrap items-center gap-1.5">
              <Input name="setor" placeholder="setor (opcional)" className="w-28" />
              <Input name="motivo" placeholder="motivo da emergência" required className="w-40" />
              <Input name="justificativa" placeholder="justificativa" required className="w-40" />
              <Input name="impacto" placeholder="impacto operacional" required className="w-40" />
              <Button type="submit" variant="danger">Registrar compra emergencial</Button>
            </form>
          </details>
        )}

        <div className="flex flex-col gap-3">
          {solicitacoes.map((sc) => (
            <SolicitacaoCard
              key={sc.id}
              sc={sc}
              itensSc={itensPorSolicitacao.get(sc.id) ?? []}
              itemPorId={itemPorId}
              necessidades={necessidades}
              solicitanteNome={profilePorId.get(sc.solicitante_id)?.display_name ?? "—"}
              canManage={canManage}
            />
          ))}
          {solicitacoes.length === 0 && <p className="text-xs text-text-muted">Nenhuma solicitação de compra ainda.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Compras diretas</h2>
        <p className="mt-1 text-xs text-text-muted">Bypass deliberado da SC — sempre exige motivo e justificativa.</p>

        {canManage && (
          <form action={criarCompraDiretaAction} className="my-3 flex flex-wrap items-center gap-1.5">
            <Select name="item_id" required>
              <option value="">item…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
              ))}
            </Select>
            <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
            <Select name="motivo" required>
              <option value="">motivo…</option>
              {MOTIVOS_DIRETA.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
            <Input name="justificativa" placeholder="justificativa (obrigatória)" required className="w-48" />
            <Select name="necessidade_compra_id">
              <option value="">sem necessidade vinculada</option>
              {necessidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {itemPorId.get(n.item_id)?.codigo ?? n.item_id} — {n.quantidade} ({n.origem})
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary">Registrar compra direta</Button>
          </form>
        )}

        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Item</Th>
              <Th>Quantidade</Th>
              <Th>Motivo</Th>
              <Th>Justificativa</Th>
              <Th>Responsável</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {comprasDiretas.map((cd) => (
              <tr key={cd.id}>
                <Td>{itemPorId.get(cd.item_id)?.codigo ?? cd.item_id}</Td>
                <Td>{cd.quantidade}</Td>
                <Td>{MOTIVOS_DIRETA.find(([v]) => v === cd.motivo)?.[1] ?? cd.motivo}</Td>
                <Td>{cd.justificativa}</Td>
                <Td>{profilePorId.get(cd.responsavel_id)?.display_name ?? "—"}</Td>
                <Td>
                  <StatusPill tone={STATUS_CD_TONE[cd.status]}>{STATUS_CD_LABEL[cd.status]}</StatusPill>
                </Td>
                {canManage && (
                  <Td>
                    {cd.status === "registrada" && (
                      <form action={cancelarCompraDiretaAction}>
                        <input type="hidden" name="id" value={cd.id} />
                        <Button type="submit" variant="danger" size="sm">
                          Cancelar
                        </Button>
                      </form>
                    )}
                  </Td>
                )}
              </tr>
            ))}
            {comprasDiretas.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 7 : 6} className="text-text-muted">
                  Nenhuma compra direta registrada ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </section>
    </div>
  );
}

function SolicitacaoCard({
  sc,
  itensSc,
  itemPorId,
  necessidades,
  solicitanteNome,
  canManage,
}: {
  sc: Solicitacao;
  itensSc: SolicitacaoItem[];
  itemPorId: Map<string, Item>;
  necessidades: Necessidade[];
  solicitanteNome: string;
  canManage: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const emRascunho = sc.status === "rascunho";

  return (
    <Card padding="xs">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-sm text-text">{sc.numero}</strong>
        <StatusPill tone={STATUS_SC_TONE[sc.status]}>{STATUS_SC_LABEL[sc.status]}</StatusPill>
        {sc.urgencia === "emergencial" && <Badge variant="danger">EMERGENCIAL</Badge>}
        <span className="text-text-muted">{sc.setor ?? "—"}</span>
        <span className="text-text-muted">prioridade: {PRIORIDADES.find(([v]) => v === sc.prioridade)?.[1] ?? sc.prioridade}</span>
        <span className="text-text-muted">solicitante: {solicitanteNome}</span>
      </div>
      {sc.urgencia === "emergencial" && (
        <p className="mt-1 text-xs text-text-muted">Motivo: {sc.emergencial_motivo} — Impacto: {sc.emergencial_impacto}</p>
      )}
      {sc.justificativa && <p className="mt-1 text-xs text-text-muted">{sc.justificativa}</p>}
      {sc.status === "cancelada" && sc.motivo_cancelamento && <p className="mt-1 text-xs text-text-muted">Motivo do cancelamento: {sc.motivo_cancelamento}</p>}

      <DenseTable className="mt-2">
        <thead>
          <DenseTableHeaderRow>
            <Th>Item</Th>
            <Th>Qtd.</Th>
            <Th>Necessária em</Th>
            <Th>Necessidade vinculada</Th>
            {canManage && emRascunho && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {itensSc.map((it) => (
            <tr key={it.id}>
              <Td>{itemPorId.get(it.item_id)?.codigo ?? it.item_id}</Td>
              <Td>{it.quantidade}</Td>
              <Td>{formatarData(it.data_necessaria)}</Td>
              <Td>{it.necessidade_compra_id ? "vinculada" : "—"}</Td>
              {canManage && emRascunho && (
                <Td>
                  <form action={removerItemSolicitacaoAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Remover
                    </Button>
                  </form>
                </Td>
              )}
            </tr>
          ))}
          {itensSc.length === 0 && (
            <tr>
              <Td colSpan={canManage && emRascunho ? 5 : 4} className="text-text-muted">
                Sem itens ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>

      {canManage && emRascunho && (
        <div className="mt-2">
          {!mostrarForm ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarForm(true)}>
              Adicionar item
            </Button>
          ) : (
            <form
              action={adicionarItemSolicitacaoAction}
              onSubmit={() => setMostrarForm(false)}
              className="flex flex-wrap items-center gap-1.5"
            >
              <input type="hidden" name="solicitacao_compra_id" value={sc.id} />
              <Select name="item_id" required>
                <option value="">item…</option>
                {[...itemPorId.values()].map((i) => (
                  <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
                ))}
              </Select>
              <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
              <Input name="data_necessaria" type="date" />
              <Input name="aplicacao" placeholder="aplicação (opcional)" className="w-32" />
              <Select name="necessidade_compra_id">
                <option value="">sem necessidade vinculada</option>
                {necessidades.map((n) => (
                  <option key={n.id} value={n.id}>
                    {itemPorId.get(n.item_id)?.codigo ?? n.item_id} — {n.quantidade} ({n.origem})
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary">Salvar</Button>
              <Button type="button" variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      )}

      {canManage && sc.status !== "cancelada" && (
        <div className="mt-2 flex gap-1.5">
          {emRascunho && (
            <form action={enviarSolicitacaoCompraAction}>
              <input type="hidden" name="id" value={sc.id} />
              <Button type="submit" variant="primary" size="sm">Enviar</Button>
            </form>
          )}
          {!cancelando ? (
            <Button type="button" variant="outlineDanger" size="sm" onClick={() => setCancelando(true)}>
              Cancelar solicitação
            </Button>
          ) : (
            <form action={cancelarSolicitacaoCompraAction} className="flex items-center gap-1" onSubmit={() => setCancelando(false)}>
              <input type="hidden" name="id" value={sc.id} />
              <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
              <Button type="submit" variant="danger" size="sm">Confirmar</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCancelando(false)}>
                Voltar
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
