"use client";

import {
  criarLoteFabrilAction,
  adicionarItemLoteFabrilAction,
  removerItemLoteFabrilAction,
  encerrarLoteFabrilAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

type LoteFabril = {
  id: string;
  nome: string;
  situacao: "aberto" | "encerrado";
  criterio_agrupamento: string | null;
  observacoes: string | null;
};
type LoteFabrilItem = { id: string; lote_fabril_id: string; op_lote_id: string; quantidade: number };
type OpLoteOpcao = { id: string; label: string };
export type ListaCorteLoteFabrilRow = {
  ordem_producao_numero: string;
  op_lote_numero: number;
  item_codigo: string;
  item_descricao: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  quantidade: number;
  margem_quebra_percentual: number | null;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const SITUACAO_LABEL: Record<LoteFabril["situacao"], string> = { aberto: "Aberto", encerrado: "Encerrado" };
const SITUACAO_TONE: Record<LoteFabril["situacao"], "success" | "neutral"> = { aberto: "success", encerrado: "neutral" };

export default function LotesFabrisSection({
  lotesFabris,
  itensPorLoteFabril,
  opLotesOpcoes,
  listaCortePorLoteFabril,
  canManage,
}: {
  lotesFabris: LoteFabril[];
  itensPorLoteFabril: Map<string, LoteFabrilItem[]>;
  opLotesOpcoes: OpLoteOpcao[];
  listaCortePorLoteFabril: Map<string, ListaCorteLoteFabrilRow[]>;
  canManage: boolean;
}) {
  const opLoteLabel = (id: string) => opLotesOpcoes.find((o) => o.id === id)?.label ?? "(lote removido)";

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Lotes fabris (TÓPICO 4 §14)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Agrupamento operacional e temporário de lotes de liberação (§12) de diferentes OPs, pra
        otimização (ex.: corte combinado). Não altera pedido, item, OP nem o lote de liberação
        original — um mesmo lote de liberação pode entrar em vários lotes fabris.
      </p>

      {canManage && (
        <form action={criarLoteFabrilAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Input name="nome" placeholder="Nome do lote fabril" required className="w-40" />
          <Input name="criterio_agrupamento" placeholder="Critério (opcional)" className="w-40" />
          <Input name="observacoes" placeholder="Observações (opcional)" className="w-40" />
          <Button type="submit" variant="primary">
            Criar lote fabril
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {lotesFabris.map((lf) => {
          const itens = itensPorLoteFabril.get(lf.id) ?? [];
          const listaCorte = listaCortePorLoteFabril.get(lf.id) ?? [];
          return (
            <Card key={lf.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2 text-xs">
                <strong className="text-sm text-text">{lf.nome}</strong>
                <Badge variant={SITUACAO_TONE[lf.situacao]}>{SITUACAO_LABEL[lf.situacao]}</Badge>
                {lf.criterio_agrupamento && (
                  <span className="text-text-muted">critério: {lf.criterio_agrupamento}</span>
                )}
                {canManage && lf.situacao === "aberto" && (
                  <form action={encerrarLoteFabrilAction}>
                    <input type="hidden" name="lote_fabril_id" value={lf.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Encerrar
                    </Button>
                  </form>
                )}
              </div>
              {lf.observacoes && <p className="mt-1 text-xs text-text-muted">{lf.observacoes}</p>}

              <div className="mt-2">
                <DenseTable>
                  <thead>
                    <DenseTableHeaderRow>
                      <Th>Lote de liberação</Th>
                      <Th>Quantidade agrupada</Th>
                      {canManage && lf.situacao === "aberto" && <Th />}
                    </DenseTableHeaderRow>
                  </thead>
                  <tbody>
                    {itens.map((it) => (
                      <tr key={it.id}>
                        <Td>{opLoteLabel(it.op_lote_id)}</Td>
                        <Td>{num(it.quantidade)}</Td>
                        {canManage && lf.situacao === "aberto" && (
                          <Td>
                            <form action={removerItemLoteFabrilAction}>
                              <input type="hidden" name="lote_fabril_item_id" value={it.id} />
                              <Button type="submit" variant="danger" size="sm">
                                Remover
                              </Button>
                            </form>
                          </Td>
                        )}
                      </tr>
                    ))}
                    {itens.length === 0 && (
                      <tr>
                        <Td colSpan={canManage ? 3 : 2}>
                          <span className="text-text-muted">Nenhum lote de liberação agrupado ainda.</span>
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </DenseTable>
              </div>

              {canManage && lf.situacao === "aberto" && (
                <form
                  action={adicionarItemLoteFabrilAction}
                  className="mt-2 flex flex-wrap items-center gap-1.5"
                >
                  <input type="hidden" name="lote_fabril_id" value={lf.id} />
                  <Select name="op_lote_id" required className="w-64">
                    <option value="">Selecione o lote de liberação...</option>
                    {opLotesOpcoes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <Input name="quantidade" type="number" step="0.001" min="0" placeholder="quantidade" className="w-24" />
                  <Button type="submit" variant="primary">
                    Adicionar
                  </Button>
                </form>
              )}

              {itens.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">Lista de corte combinada</summary>
                  <div className="mt-1.5 overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>OP / Lote</Th>
                          <Th>Item</Th>
                          <Th>Ambiente</Th>
                          <Th>Largura (mm)</Th>
                          <Th>Altura (mm)</Th>
                          <Th>Qtd.</Th>
                          <Th>Margem de quebra</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaCorte.map((row, idx) => (
                          <tr key={idx}>
                            <Td>
                              {row.ordem_producao_numero} / Lote {row.op_lote_numero}
                            </Td>
                            <Td>
                              {row.item_codigo} — {row.item_descricao}
                            </Td>
                            <Td>{row.ambiente ?? "—"}</Td>
                            <Td>{row.largura_mm != null ? num(row.largura_mm) : "—"}</Td>
                            <Td>{row.altura_mm != null ? num(row.altura_mm) : "—"}</Td>
                            <Td>{num(row.quantidade)}</Td>
                            <Td>{row.margem_quebra_percentual != null ? `${num(row.margem_quebra_percentual)}%` : "—"}</Td>
                          </tr>
                        ))}
                        {listaCorte.length === 0 && (
                          <tr>
                            <Td colSpan={7}>
                              <span className="text-text-muted">Sem dados de medida pros itens agrupados.</span>
                            </Td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                </details>
              )}
            </Card>
          );
        })}
        {lotesFabris.length === 0 && <p className="text-xs text-text-muted">Nenhum lote fabril criado ainda.</p>}
      </div>
    </section>
  );
}
