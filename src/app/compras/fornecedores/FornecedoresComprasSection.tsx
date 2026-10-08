"use client";

import { upsertCriterioAvaliacaoFornecedorAction, avaliarFornecedorAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

const CRITERIOS = [
  ["prazo", "Prazo"],
  ["divergencias", "Divergências"],
  ["rejeicoes", "Rejeições"],
  ["preco", "Preço"],
  ["volume", "Volume"],
] as const;
const PESO_DEFAULT = 20;

type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Criterio = { id: string; chave: string; peso: number };
type Avaliacao = { id: string; pessoa_id: string; periodo_inicio: string; periodo_fim: string; score: number | null; detalhamento: Record<string, { peso: number; score: number | null }> };
type SolicitacaoEmergencial = { id: string; numero: string; status: string; emergencial_motivo: string | null; emergencial_impacto: string | null; created_at: string };
type PedidoEmergencial = { id: string; numero: string; status: string; pessoa_id: string; created_at: string };
type Rastreio = { ok: boolean; data: unknown } | null;

function nomeFornecedor(pessoas: Pessoa[], id: string) {
  const p = pessoas.find((x) => x.id === id);
  return p?.nome_fantasia || p?.nome || id;
}

export default function FornecedoresComprasSection({
  fornecedores,
  criterios,
  avaliacoes,
  solicitacoesEmergenciais,
  pedidosEmergenciais,
  rastreioNecessidade,
  rastreioMaterial,
  canManage,
}: {
  fornecedores: Pessoa[];
  criterios: Criterio[];
  avaliacoes: Avaliacao[];
  solicitacoesEmergenciais: SolicitacaoEmergencial[];
  pedidosEmergenciais: PedidoEmergencial[];
  rastreioNecessidade: Rastreio;
  rastreioMaterial: Rastreio;
  canManage: boolean;
}) {
  const pesoPorChave = new Map(criterios.map((c) => [c.chave, Number(c.peso)]));

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="text-sm font-semibold text-text">Pesos dos critérios de avaliação (§35)</h2>
        <p className="mt-1 text-xs text-text-muted">Sem configuração, cada critério usa o default de 20% (soma 100%).</p>
        {canManage && (
          <div className="mt-2 flex flex-wrap gap-3">
            {CRITERIOS.map(([chave, label]) => (
              <form key={chave} action={upsertCriterioAvaliacaoFornecedorAction} className="flex items-center gap-1">
                <input type="hidden" name="chave" value={chave} />
                <label className="text-xs text-text">{label}</label>
                <Input name="peso" type="number" min="0" step="0.01" defaultValue={pesoPorChave.get(chave) ?? PESO_DEFAULT} className="w-16" />
                <Button type="submit" variant="primary" size="sm">Salvar</Button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Avaliar fornecedor</h2>
        {canManage && (
          <form action={avaliarFornecedorAction} className="my-3 flex flex-wrap items-center gap-1.5">
            <Select name="pessoa_id" required>
              <option value="">fornecedor…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome_fantasia || f.nome}</option>
              ))}
            </Select>
            <Input name="periodo_inicio" type="date" required />
            <Input name="periodo_fim" type="date" required />
            <Button type="submit" variant="primary">Avaliar</Button>
          </form>
        )}

        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Fornecedor</Th>
              <Th>Período</Th>
              <Th>Score</Th>
              <Th>Detalhamento</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {avaliacoes.map((a) => (
              <tr key={a.id}>
                <Td>{nomeFornecedor(fornecedores, a.pessoa_id)}</Td>
                <Td>
                  {formatarData(a.periodo_inicio)} — {formatarData(a.periodo_fim)}
                </Td>
                <Td className="font-semibold">{a.score !== null ? Number(a.score).toFixed(2) : "sem dado"}</Td>
                <Td>
                  {Object.entries(a.detalhamento).map(([chave, v]) => (
                    <span key={chave} className="mr-2 text-text-muted">
                      {chave}: {v.score !== null ? Number(v.score).toFixed(0) : "—"} (peso {v.peso})
                    </span>
                  ))}
                </Td>
              </tr>
            ))}
            {avaliacoes.length === 0 && (
              <tr>
                <Td colSpan={4} className="text-text-muted">
                  Nenhuma avaliação registrada ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Compras emergenciais (§32)</h2>
        <p className="mt-1 text-xs text-text-muted">Criação de compra emergencial fica em Solicitações de compra.</p>

        <p className="mb-0.5 mt-2 text-xs font-semibold text-text">Solicitações de compra emergenciais</p>
        {solicitacoesEmergenciais.map((sc) => (
          <div key={sc.id} className="mb-1 text-xs text-text-muted">
            <strong className="text-text">{sc.numero}</strong> — {sc.status} — {sc.emergencial_motivo} ({sc.emergencial_impacto})
          </div>
        ))}
        {solicitacoesEmergenciais.length === 0 && <p className="text-xs text-text-muted">Nenhuma SC emergencial registrada.</p>}

        <p className="mb-0.5 mt-2.5 text-xs font-semibold text-text">Pedidos de compra emergenciais</p>
        {pedidosEmergenciais.map((pc) => (
          <div key={pc.id} className="mb-1 text-xs text-text-muted">
            <strong className="text-text">{pc.numero}</strong> — {pc.status} — fornecedor {nomeFornecedor(fornecedores, pc.pessoa_id)}
          </div>
        ))}
        {pedidosEmergenciais.length === 0 && <p className="text-xs text-text-muted">Nenhum PC emergencial gerado ainda.</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Rastreabilidade (§39)</h2>
        <p className="mt-1 text-xs text-text-muted">Consulta pontual pelo id — necessidade→SC→cotação→negociação→aprovação→PC→recebimento→estoque, ou o caminho inverso a partir de uma movimentação.</p>

        <form method="get" className="my-3 flex items-center gap-1.5">
          <Input name="necessidade_id" placeholder="id da necessidade de compra" className="w-72" />
          <Button type="submit" variant="primary">Rastrear necessidade</Button>
        </form>
        {rastreioNecessidade && <RastreioResultado rastreio={rastreioNecessidade} />}

        <form method="get" className="my-3 flex items-center gap-1.5">
          <Input name="movimentacao_id" placeholder="id da movimentação de estoque" className="w-72" />
          <Button type="submit" variant="primary">Rastrear material (reverso)</Button>
        </form>
        {rastreioMaterial && <RastreioResultado rastreio={rastreioMaterial} />}
      </section>
    </div>
  );
}

function RastreioResultado({ rastreio }: { rastreio: { ok: boolean; data: unknown } }) {
  if (!rastreio.ok) {
    return <p className="text-xs text-danger">{String(rastreio.data)}</p>;
  }
  return (
    <pre className="max-h-[360px] overflow-x-auto rounded-md bg-page-bg p-2.5 text-[11px] text-text">
      {JSON.stringify(rastreio.data, null, 2)}
    </pre>
  );
}
