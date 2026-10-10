"use client";

import { Fragment, useState, useActionState } from "react";
import {
  ajustarSaldoAction,
  reservarParaPedidoItemAction,
  liberarReservaAction,
  consumirReservaAction,
  registrarEntradaSobraAction,
  registrarPecaDimensionalAction,
  consumirPecaDimensionalAction,
  converterUnidadeDimensionalAction,
  type ConversaoState,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TIPOS_ITEM = [
  ["materia_prima", "Matéria-prima"],
  ["insumo", "Insumo"],
  ["componente", "Componente"],
  ["produto_intermediario", "Produto intermediário"],
  ["produto_acabado", "Produto acabado"],
  ["material_auxiliar", "Material auxiliar"],
  ["embalagem", "Embalagem"],
  ["servico", "Serviço"],
  ["outro", "Outro"],
] as const;

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  unidade_principal: string;
  dimensao_tipo: "linear" | "area" | null;
  peso_por_unidade_dimensao: number | null;
};
type PecaDimensional = {
  id: string;
  item_id: string;
  identificador: string | null;
  quantidade_original: number;
  quantidade_disponivel: number;
  situacao: "disponivel" | "esgotada";
  observacao: string | null;
  created_at: string;
};
type Saldo = { item_id: string; quantidade_fisica: number; quantidade_reservada: number };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type Reserva = { id: string; pedido_item_id: string; item_id: string; quantidade: number };

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function EstoqueSection({
  activeTab,
  itens,
  itensSaldoPagina,
  sdPaginacao,
  saldoPorItem,
  pedidos,
  rsPaginacao,
  pedidoItensPorPedido,
  reservaAtivaPorPedidoItem,
  pessoas,
  obras,
  itensDimensionalPagina,
  dmPaginacao,
  pecasDimensionais,
  canManage,
}: {
  activeTab: "geral" | "saldo" | "reserva" | "sobra" | "dimensional";
  itens: Item[];
  itensSaldoPagina: Item[];
  sdPaginacao: PaginacaoInfo;
  saldoPorItem: Map<string, Saldo>;
  pedidos: Pedido[];
  rsPaginacao: PaginacaoInfo;
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  reservaAtivaPorPedidoItem: Map<string, Reserva>;
  pessoas: Pessoa[];
  obras: Obra[];
  itensDimensionalPagina: Item[];
  dmPaginacao: PaginacaoInfo;
  pecasDimensionais: PecaDimensional[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const pedidoSelecionado = pedidos.find((p) => p.id === selectedPedidoId) ?? null;

  return (
    <>
      {activeTab === "saldo" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Saldo por item</h2>
        <p className="mt-1 text-xs text-text-muted">
          Sem módulo de Compras ainda (TÓPICO 18, M2) — ajuste é o único jeito de estabelecer ou
          corrigir saldo neste recorte. Disponível = físico − reservado.
        </p>
        <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
          <TableSearch paramBusca="sd_q" paramPagina="sd_pagina" placeholder="Buscar por código ou descrição..." />
          <FiltroTipoItem paramTipo="sd_tipo" paramPagina="sd_pagina" />
        </div>

        <Paginacao {...sdPaginacao} paramPagina="sd_pagina" paramPorPagina="sd_por_pagina" posicao="topo" />

        <DenseTable>
            <thead>
              <DenseTableHeaderRow>
                <SortableTh field="codigo" paramOrdenar="sd_ordenar" paramPagina="sd_pagina">Item</SortableTh>
                <Th>Físico</Th>
                <Th>Reservado</Th>
                <Th>Disponível</Th>
                <Th>Unidade</Th>
                {canManage && <Th />}
              </DenseTableHeaderRow>
            </thead>
            <tbody>
              {itensSaldoPagina.map((it) => {
                const saldo = saldoPorItem.get(it.id);
                return <SaldoItemRow key={it.id} item={it} saldo={saldo} canManage={canManage} />;
              })}
              {itensSaldoPagina.length === 0 && (
                <tr>
                  <Td colSpan={canManage ? 6 : 5}>
                    <span className="text-text-muted">Nenhum item cadastrado.</span>
                  </Td>
                </tr>
              )}
            </tbody>
        </DenseTable>
      </section>
      )}

      {activeTab === "reserva" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Reserva para pedidos liberados</h2>
        <p className="mt-1 text-xs text-text-muted">Clique num pedido para ver e reservar os itens.</p>

        <div className="mb-2 mt-3">
          <TableSearch paramBusca="rs_q" paramPagina="rs_pagina" placeholder="Buscar por número do pedido..." />
        </div>

        <Paginacao {...rsPaginacao} paramPagina="rs_pagina" paramPorPagina="rs_por_pagina" posicao="topo" />

        <DenseTable>
            <thead>
              <DenseTableHeaderRow>
                <SortableTh field="numero" paramOrdenar="rs_ordenar" paramPagina="rs_pagina">Número</SortableTh>
                <Th>Cliente</Th>
                <Th>Obra</Th>
                <Th>Itens</Th>
                <Th>Situação</Th>
              </DenseTableHeaderRow>
            </thead>
            <tbody>
              {pedidos.map((ped) => {
                const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
                const faltantes = itensDoPedido.filter((pi) => {
                  const reservado = reservaAtivaPorPedidoItem.get(pi.id)?.quantidade ?? 0;
                  return pi.quantidade - reservado > 0;
                }).length;
                return (
                  <tr
                    key={ped.id}
                    onClick={() => setSelectedPedidoId((prev) => (prev === ped.id ? null : ped.id))}
                    className={`cursor-pointer ${selectedPedidoId === ped.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
                  >
                    <Td className="font-medium text-text">{ped.numero}</Td>
                    <Td>{pessoaNome(ped.pessoa_id)}</Td>
                    <Td className="text-text-muted">{obraNome(ped.obra_id)}</Td>
                    <Td className="text-text-muted">{itensDoPedido.length}</Td>
                    <Td>
                      {faltantes > 0 ? (
                        <StatusPill tone="warning">{faltantes} com falta</StatusPill>
                      ) : (
                        <StatusPill tone="success">Completo</StatusPill>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {pedidos.length === 0 && (
                <tr>
                  <Td colSpan={5} className="text-text-muted">
                    Nenhum pedido liberado ainda — a reserva só entra depois da liberação (TÓPICO 3).
                  </Td>
                </tr>
              )}
            </tbody>
        </DenseTable>

        {pedidoSelecionado && (
          <Card padding="xs" className="mt-3">
            <strong className="text-sm text-text">Itens do pedido {pedidoSelecionado.numero}</strong>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Necessário</Th>
                  <Th>Reservado</Th>
                  <Th>Falta</Th>
                  {canManage && <Th />}
                </tr>
              </thead>
              <tbody>
                {(pedidoItensPorPedido.get(pedidoSelecionado.id) ?? []).map((pi) => {
                  const reserva = reservaAtivaPorPedidoItem.get(pi.id);
                  const reservado = reserva?.quantidade ?? 0;
                  const falta = pi.quantidade - reservado;
                  return (
                    <tr key={pi.id}>
                      <Td>{itemLabel(pi.item_id)}</Td>
                      <Td>{num(pi.quantidade)}</Td>
                      <Td>{num(reservado)}</Td>
                      <Td>
                        <span className={falta > 0 ? "text-warning" : "text-success"}>{num(falta)}</span>
                      </Td>
                      {canManage && (
                        <Td>
                          {reserva ? (
                            <div className="flex gap-1">
                              <form action={consumirReservaAction}>
                                <input type="hidden" name="id" value={reserva.id} />
                                <Button type="submit" variant="primary">
                                  Consumir
                                </Button>
                              </form>
                              <form action={liberarReservaAction}>
                                <input type="hidden" name="id" value={reserva.id} />
                                <Button type="submit" variant="secondary">
                                  Liberar
                                </Button>
                              </form>
                            </div>
                          ) : (
                            <form action={reservarParaPedidoItemAction}>
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <Button type="submit" variant="primary">
                                Reservar
                              </Button>
                            </form>
                          )}
                        </Td>
                      )}
                    </tr>
                  );
                })}
                {(pedidoItensPorPedido.get(pedidoSelecionado.id) ?? []).length === 0 && (
                  <tr>
                    <Td colSpan={canManage ? 5 : 4}>
                      <span className="text-text-muted">Pedido sem itens.</span>
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
      )}

      {activeTab === "sobra" && canManage && (
        <section>
          <h2 className="text-sm font-semibold text-text">Registrar entrada de sobra</h2>
          <p className="mt-1 text-xs text-text-muted">
            TÓPICO 6 §3 — sobra é sempre uma ação própria, separada de reservar/consumir: quem
            cortou o material registra o que sobrou.
          </p>
          <form action={registrarEntradaSobraAction} className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select name="item_id" defaultValue="" required>
              <option value="" disabled>
                Item
              </option>
              {itens.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.codigo} — {it.descricao}
                </option>
              ))}
            </Select>
            <Input name="quantidade" type="number" step="0.001" min="0.001" placeholder="quantidade" required className="w-[90px]" />
            <Input name="observacao" placeholder="observação (opcional)" className="w-52" />
            <Button type="submit" variant="primary">
              Registrar sobra
            </Button>
          </form>
        </section>
      )}

      {activeTab === "dimensional" && (
        <DimensionalTab
          itensTodos={itens.filter((i) => i.dimensao_tipo !== null)}
          itensPagina={itensDimensionalPagina}
          paginacao={dmPaginacao}
          pecasDimensionais={pecasDimensionais}
          canManage={canManage}
        />
      )}
    </>
  );
}

function SaldoItemRow({ item, saldo, canManage }: { item: Item; saldo: Saldo | undefined; canManage: boolean }) {
  const [ajustando, setAjustando] = useState(false);
  const fisica = saldo?.quantidade_fisica ?? 0;
  const reservada = saldo?.quantidade_reservada ?? 0;

  return (
    <tr>
      <Td>
        {item.codigo} — {item.descricao}
      </Td>
      <Td>{num(fisica)}</Td>
      <Td>{num(reservada)}</Td>
      <Td>{num(fisica - reservada)}</Td>
      <Td>{item.unidade_principal}</Td>
      {canManage && (
        <Td>
          {ajustando ? (
            <form action={ajustarSaldoAction} onSubmit={() => setAjustando(false)} className="flex items-center gap-1">
              <input type="hidden" name="item_id" value={item.id} />
              <Input name="quantidade_delta" type="number" step="0.001" placeholder="+/- qtd" required className="w-[70px]" />
              <Input name="motivo" placeholder="motivo" required className="w-28" />
              <Button type="submit" variant="primary" size="sm">
                Confirmar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAjustando(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAjustando(true)}>
              Ajustar
            </Button>
          )}
        </Td>
      )}
    </tr>
  );
}

// Fase 2 da ADR-011 (TÓPICO 7 §5-6, §9 base). Item com dimensao_tipo
// deixa de ser saldo escalar e passa a ter peça física individual: barra,
// chapa, bobina. Consumir parte de uma peça só reduz a disponível DELA — o
// que sobra já é a sobra reaproveitável, e é por isso que esta aba não tem
// "registrar sobra": sobra aqui não é entrada, é o saldo que ficou.
//
// A vedação do TÓPICO 4 §54 continua integral: isto é posição de estoque,
// nunca decisão de corte ou nesting.
function DimensionalTab({
  itensTodos,
  itensPagina,
  paginacao,
  pecasDimensionais,
  canManage,
}: {
  itensTodos: Item[];
  itensPagina: Item[];
  paginacao: PaginacaoInfo;
  pecasDimensionais: PecaDimensional[];
  canManage: boolean;
}) {
  if (paginacao.total === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-text">Peças dimensionais</h2>
        <p className="mt-1 text-xs text-text-muted">
          Nenhum item com controle dimensional ainda. Isso é opcional e por item: em{" "}
          <strong>Engenharia → Cadastro de itens</strong>, defina o controle dimensional como linear
          (barra/perfil, medido em metro) ou área (chapa/bobina/vidro, medido em m²). Todo o
          resto do catálogo segue com saldo escalar, sem mudança.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Peças dimensionais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cada linha é uma peça física. Consumir parte dela reduz só a quantidade disponível
        daquela peça — o que sobra continua ali, disponível para o próximo uso. Clique num item
        para ver e gerenciar as peças.
      </p>

      <ConversorUnidade itens={itensTodos} />

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch paramBusca="dm_q" paramPagina="dm_pagina" placeholder="Buscar por código ou descrição..." />
        <FiltroDimensao />
      </div>

      <Paginacao {...paginacao} paramPagina="dm_pagina" paramPorPagina="dm_por_pagina" posicao="topo" />

      <div className="overflow-x-auto">
        <DimensionalTable itens={itensPagina} pecasDimensionais={pecasDimensionais} canManage={canManage} />
      </div>
    </section>
  );
}

function DimensionalTable({
  itens,
  pecasDimensionais,
  canManage,
}: {
  itens: Item[];
  pecasDimensionais: PecaDimensional[];
  canManage: boolean;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <DenseTable>
      <thead>
        <DenseTableHeaderRow>
          <SortableTh field="codigo" paramOrdenar="dm_ordenar" paramPagina="dm_pagina">Item</SortableTh>
          <Th>Controle</Th>
          <Th>Disponível</Th>
          <Th className="w-6" />
        </DenseTableHeaderRow>
      </thead>
      <tbody>
        {itens.map((it) => {
          const pecas = pecasDimensionais.filter((p) => p.item_id === it.id);
          const disponiveis = pecas.filter((p) => p.situacao === "disponivel");
          const disponivelTotal = disponiveis.reduce((acc, p) => acc + Number(p.quantidade_disponivel), 0);
          const aberto = expandido === it.id;

          return (
            <Fragment key={it.id}>
              <tr onClick={() => setExpandido((atual) => (atual === it.id ? null : it.id))} className="cursor-pointer hover:bg-page-bg">
                <Td className="font-medium text-text">
                  {it.codigo} — {it.descricao}
                </Td>
                <Td className="text-text-muted">
                  {it.dimensao_tipo === "linear" ? "linear (metro)" : "área (m²)"}
                  {it.peso_por_unidade_dimensao
                    ? ` · ${num(it.peso_por_unidade_dimensao)} kg/${it.dimensao_tipo === "linear" ? "m" : "m²"}`
                    : " · sem peso configurado"}
                </Td>
                <Td className="text-text-muted">
                  {num(disponivelTotal)} {it.unidade_principal} em {disponiveis.length} peça(s)
                </Td>
                <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
              </tr>
              {aberto && (
                <tr>
                  <Td colSpan={4} className="bg-page-bg">
                    <ItemDimensionalDetalhe item={it} pecas={pecas} canManage={canManage} />
                  </Td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </DenseTable>
  );
}

function ItemDimensionalDetalhe({ item, pecas, canManage }: { item: Item; pecas: PecaDimensional[]; canManage: boolean }) {
  const [registrando, setRegistrando] = useState(false);

  return (
    <div>
      <Table>
        <thead>
          <tr>
            <Th>Identificação</Th>
            <Th>Original</Th>
            <Th>Disponível</Th>
            <Th>Situação</Th>
            {canManage && <Th>Consumir</Th>}
          </tr>
        </thead>
        <tbody>
          {pecas.map((p) => (
            <PecaDimensionalRow key={p.id} peca={p} canManage={canManage} />
          ))}
          {pecas.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 5 : 4}>
                <span className="text-text-muted">Nenhuma peça registrada para este item.</span>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      {canManage && (
        registrando ? (
          <form
            action={registrarPecaDimensionalAction}
            onSubmit={() => setRegistrando(false)}
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            <input type="hidden" name="item_id" value={item.id} />
            <Input
              name="quantidade"
              type="number"
              step="0.0001"
              min="0.0001"
              placeholder={`quantidade (${item.unidade_principal})`}
              required
              className="w-36"
            />
            <Input name="identificador" placeholder="identificação (opcional)" className="w-40" />
            <Input name="observacao" placeholder="observação (opcional)" className="w-44" />
            <Button type="submit" variant="primary" size="sm">
              Registrar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRegistrando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setRegistrando(true)}>
            + Registrar peça
          </Button>
        )
      )}
    </div>
  );
}

function PecaDimensionalRow({ peca, canManage }: { peca: PecaDimensional; canManage: boolean }) {
  const [consumindo, setConsumindo] = useState(false);

  return (
    <tr>
      <Td>
        {peca.identificador ?? "—"}
        {peca.observacao && <span className="ml-1 text-text-muted">({peca.observacao})</span>}
      </Td>
      <Td>{num(peca.quantidade_original)}</Td>
      <Td>{num(peca.quantidade_disponivel)}</Td>
      <Td>{peca.situacao === "disponivel" ? "Disponível" : "Esgotada"}</Td>
      {canManage && (
        <Td>
          {peca.situacao === "disponivel" ? (
            consumindo ? (
              <form action={consumirPecaDimensionalAction} onSubmit={() => setConsumindo(false)} className="flex items-center gap-1">
                <input type="hidden" name="peca_id" value={peca.id} />
                <Input
                  name="quantidade"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max={peca.quantidade_disponivel}
                  placeholder="qtd."
                  required
                  className="w-[80px]"
                />
                <Input name="observacao" placeholder="obs. (opcional)" className="w-32" />
                <Button type="submit" variant="primary" size="sm">
                  Confirmar
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setConsumindo(false)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => setConsumindo(true)}>
                Consumir
              </Button>
            )
          ) : (
            "—"
          )}
        </Td>
      )}
    </tr>
  );
}

// Conversão só lê (estoque.view) e devolve um número — o fator é a
// propriedade física do próprio item, não uma tabela genérica de unidades.
function ConversorUnidade({ itens }: { itens: Item[] }) {
  const [estado, formAction, pendente] = useActionState<ConversaoState, FormData>(
    converterUnidadeDimensionalAction,
    undefined,
  );
  const comPeso = itens.filter((i) => i.peso_por_unidade_dimensao !== null);

  if (comPeso.length === 0) return null;

  return (
    <Card className="mt-3">
      <p className="text-xs font-semibold text-text">Converter unidade ↔ peso</p>
      <form action={formAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Select name="item_id" defaultValue="" required>
          <option value="" disabled>
            Item
          </option>
          {comPeso.map((it) => (
            <option key={it.id} value={it.id}>
              {it.codigo} — {it.descricao}
            </option>
          ))}
        </Select>
        <Input name="quantidade" type="number" step="0.0001" min="0.0001" placeholder="quantidade" required className="w-28" />
        <Select name="sentido" defaultValue="para_peso">
          <option value="para_peso">de metro/m² para kg</option>
          <option value="de_peso">de kg para metro/m²</option>
        </Select>
        <Button type="submit" variant="secondary" disabled={pendente}>
          {pendente ? "Convertendo..." : "Converter"}
        </Button>
        {estado?.error && <span className="text-xs text-danger">{estado.error}</span>}
        {estado?.resultado !== undefined && (
          <span className="text-xs text-text">
            = <strong>{num(estado.resultado)}</strong> {estado.unidade}
          </span>
        )}
      </form>
    </Card>
  );
}

function FiltroTipoItem({ paramTipo, paramPagina }: { paramTipo: string; paramPagina: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get(paramTipo) ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set(paramTipo, novoValor);
    else p.delete(paramTipo);
    p.delete(paramPagina);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por tipo"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todos os tipos</option>
      {TIPOS_ITEM.map(([valor2, rotulo]) => (
        <option key={valor2} value={valor2}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}

function FiltroDimensao() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("dm_dimensao") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("dm_dimensao", novoValor);
    else p.delete("dm_dimensao");
    p.delete("dm_pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por tipo de controle"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Linear e área</option>
      <option value="linear">Linear (metro)</option>
      <option value="area">Área (m²)</option>
    </select>
  );
}
