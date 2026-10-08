"use client";

import { useState } from "react";
import {
  criarEquipeAction,
  definirAtivoEquipeAction,
  adicionarMembroEquipeAction,
  removerMembroEquipeAction,
  criarInstalacaoAction,
  adicionarItemInstalacaoAction,
  removerItemInstalacaoAction,
  cancelarInstalacaoAction,
  registrarOcorrenciaInstalacaoAction,
  decidirNovaFabricacaoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { formatarData } from "@/lib/formato/data";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type Profile = { id: string; display_name: string };
type Equipe = { id: string; nome: string; ativo: boolean };
type EquipeMembro = { id: string; equipe_id: string; profile_id: string };
type Instalacao = {
  id: string;
  pedido_id: string;
  equipe_id: string;
  numero: string;
  status: "agendada" | "em_execucao" | "concluida" | "aceita" | "cancelada";
  data_agendada: string;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  aceite_nome_cliente: string | null;
};
type InstalacaoItem = {
  id: string;
  instalacao_id: string;
  pedido_item_id: string;
  quantidade: number;
  quantidade_instalada: number;
  quantidade_pendente: number;
};
type Ocorrencia = { id: string; instalacao_id: string; descricao: string; registrado_em: string };
export type DanoExibicao = {
  solicitacaoId: string;
  instalacaoNumero: string;
  itemLabel: string;
  quantidade: number;
  causa: string;
  descricao: string | null;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_LABEL: Record<Instalacao["status"], string> = {
  agendada: "Agendada",
  em_execucao: "Em execução",
  concluida: "Concluída",
  aceita: "Aceita",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<Instalacao["status"], "neutral" | "success" | "warning" | "danger"> = {
  agendada: "neutral",
  em_execucao: "warning",
  concluida: "success",
  aceita: "success",
  cancelada: "danger",
};

// 2026-10-04: tela larga + aba "Visão geral" (ver page.tsx/VisaoGeralSection)
// + paginação server-side em Agenda/Danos + linha compacta que expande em
// consulta primeiro — os formulários de ação (adicionar item, cancelar,
// registrar ocorrência, adicionar membro) deixam de ficar sempre abertos e
// passam a aparecer atrás de um botão, mesmo padrão já aplicado em
// Expedição/Qualidade/RH/Contratos.
export default function InstalacaoSection({
  activeTab,
  pedidos,
  agPaginacao,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  profiles,
  equipes,
  equipeMembrosPorEquipe,
  instalacoesPorPedido,
  itensPorInstalacao,
  entreguePorPedidoItem,
  jaUsadoInstalacaoPorPedidoItem,
  ocorrenciasPorInstalacao,
  danos,
  dnPaginacao,
  canManage,
  canDecidirDano,
}: {
  activeTab: "geral" | "equipes" | "agenda" | "danos";
  pedidos: Pedido[];
  agPaginacao: PaginacaoInfo;
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  profiles: Profile[];
  equipes: Equipe[];
  equipeMembrosPorEquipe: Map<string, EquipeMembro[]>;
  instalacoesPorPedido: Map<string, Instalacao[]>;
  itensPorInstalacao: Map<string, InstalacaoItem[]>;
  entreguePorPedidoItem: Map<string, number>;
  jaUsadoInstalacaoPorPedidoItem: Map<string, number>;
  ocorrenciasPorInstalacao: Map<string, Ocorrencia[]>;
  danos: DanoExibicao[];
  dnPaginacao: PaginacaoInfo;
  canManage: boolean;
  canDecidirDano: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : null);
  const itemLabel = (itemId: string) => {
    const it = itens.find((i) => i.id === itemId);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };
  const profileNome = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? "(usuário removido)";
  const equipeNome = (id: string) => equipes.find((e) => e.id === id)?.nome ?? "(equipe removida)";

  const [selectedEquipeId, setSelectedEquipeId] = useState<string | null>(null);
  const equipeSelecionada = equipes.find((e) => e.id === selectedEquipeId) ?? null;

  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const pedidoSelecionado = pedidos.find((p) => p.id === selectedPedidoId) ?? null;

  return (
    <>
      {activeTab === "equipes" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Equipes de instalação</h2>

        {canManage && (
          <form action={criarEquipeAction} className="mt-2 flex gap-1.5">
            <Input name="nome" placeholder="nome da nova equipe" required className="w-56" />
            <Button type="submit" variant="primary">
              Criar equipe
            </Button>
          </form>
        )}

        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Nome</Th>
              <Th>Status</Th>
              <Th>Membros</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {equipes.map((eq) => {
              const membros = equipeMembrosPorEquipe.get(eq.id) ?? [];
              return (
                <tr
                  key={eq.id}
                  onClick={() => setSelectedEquipeId((prev) => (prev === eq.id ? null : eq.id))}
                  className={`cursor-pointer ${selectedEquipeId === eq.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
                >
                  <Td className="font-medium text-text">{eq.nome}</Td>
                  <Td>
                    <StatusPill tone={eq.ativo ? "success" : "danger"}>{eq.ativo ? "Ativa" : "Inativa"}</StatusPill>
                  </Td>
                  <Td className="text-text-muted">{membros.length}</Td>
                </tr>
              );
            })}
            {equipes.length === 0 && (
              <tr>
                <Td colSpan={3} className="text-text-muted">
                  Nenhuma equipe cadastrada ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>

        {equipeSelecionada && (
          <EquipeDetalhe
            equipe={equipeSelecionada}
            membros={equipeMembrosPorEquipe.get(equipeSelecionada.id) ?? []}
            profiles={profiles}
            profileNome={profileNome}
            canManage={canManage}
          />
        )}
      </section>
      )}

      {activeTab === "agenda" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Pedidos liberados — agenda de instalação</h2>
        <p className="mt-1 text-xs text-text-muted">Clique num pedido para ver e agendar instalações.</p>

        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Número</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Instalações</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {pedidos.map((ped) => {
              const obra = obraNome(ped.obra_id);
              const instalacoes = instalacoesPorPedido.get(ped.id) ?? [];
              return (
                <tr
                  key={ped.id}
                  onClick={() => setSelectedPedidoId((prev) => (prev === ped.id ? null : ped.id))}
                  className={`cursor-pointer ${selectedPedidoId === ped.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
                >
                  <Td className="font-medium text-text">{ped.numero}</Td>
                  <Td>{pessoaNome(ped.pessoa_id)}</Td>
                  <Td className="text-text-muted">{obra ?? "sem obra associada"}</Td>
                  <Td className="text-text-muted">{instalacoes.length}</Td>
                </tr>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <Td colSpan={4} className="text-text-muted">
                  Nenhum pedido liberado ainda — a instalação só entra depois da liberação (TÓPICO 3).
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
        <Paginacao {...agPaginacao} paramPagina="ag_pagina" paramPorPagina="ag_por_pagina" />

        {pedidoSelecionado && (
          <PedidoInstalacoesDetalhe
            pedido={pedidoSelecionado}
            itensDoPedido={pedidoItensPorPedido.get(pedidoSelecionado.id) ?? []}
            instalacoes={instalacoesPorPedido.get(pedidoSelecionado.id) ?? []}
            obraNome={obraNome(pedidoSelecionado.obra_id)}
            equipesAtivas={equipes.filter((e) => e.ativo)}
            equipeNome={equipeNome}
            itemLabel={itemLabel}
            itensPorInstalacao={itensPorInstalacao}
            ocorrenciasPorInstalacao={ocorrenciasPorInstalacao}
            entreguePorPedidoItem={entreguePorPedidoItem}
            jaUsadoInstalacaoPorPedidoItem={jaUsadoInstalacaoPorPedidoItem}
            canManage={canManage}
          />
        )}
      </section>
      )}

      {activeTab === "danos" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Danos em obra — solicitações de nova fabricação pendentes</h2>
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Instalação</Th>
              <Th>Item</Th>
              <Th>Qtd.</Th>
              <Th>Causa</Th>
              <Th>Descrição</Th>
              {canDecidirDano && <Th />}
            </DenseTableHeaderRow>
          </thead>
          <tbody>
              {danos.map((d) => (
                <tr key={d.solicitacaoId}>
                  <Td>{d.instalacaoNumero}</Td>
                  <Td>{d.itemLabel}</Td>
                  <Td>{num(d.quantidade)}</Td>
                  <Td>{d.causa}</Td>
                  <Td>{d.descricao ?? "—"}</Td>
                  {canDecidirDano && (
                    <Td>
                      <div className="flex gap-1">
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={d.solicitacaoId} />
                          <input type="hidden" name="decisao" value="aprovada" />
                          <Button type="submit" variant="primary">
                            Aprovar
                          </Button>
                        </form>
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={d.solicitacaoId} />
                          <input type="hidden" name="decisao" value="rejeitada" />
                          <Button type="submit" variant="danger">
                            Rejeitar
                          </Button>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
              {danos.length === 0 && (
                <tr>
                  <Td colSpan={canDecidirDano ? 6 : 5}>
                    <span className="text-text-muted">Nenhuma solicitação pendente.</span>
                  </Td>
                </tr>
              )}
            </tbody>
        </DenseTable>
        <Paginacao {...dnPaginacao} paramPagina="dn_pagina" paramPorPagina="dn_por_pagina" />
      </section>
      )}
    </>
  );
}

function EquipeDetalhe({
  equipe,
  membros,
  profiles,
  profileNome,
  canManage,
}: {
  equipe: Equipe;
  membros: EquipeMembro[];
  profiles: Profile[];
  profileNome: (id: string) => string;
  canManage: boolean;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const membrosIds = new Set(membros.map((m) => m.profile_id));
  const disponiveis = profiles.filter((p) => !membrosIds.has(p.id));

  return (
    <Card padding="xs" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-text">Membros de {equipe.nome}</strong>
        {canManage && (
          <form action={definirAtivoEquipeAction} className="ml-auto">
            <input type="hidden" name="equipe_id" value={equipe.id} />
            <input type="hidden" name="ativo" value={(!equipe.ativo).toString()} />
            <Button type="submit" variant="secondary" size="sm">
              {equipe.ativo ? "Desativar" : "Ativar"}
            </Button>
          </form>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {membros.map((m) => (
          <span key={m.id} className="flex items-center gap-1 rounded bg-page-bg px-1.5 py-0.5 text-xs">
            {profileNome(m.profile_id)}
            {canManage && (
              <form action={removerMembroEquipeAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="cursor-pointer text-xs text-danger">
                  ×
                </button>
              </form>
            )}
          </span>
        ))}
        {membros.length === 0 && <span className="text-xs text-text-muted">Sem membros.</span>}
      </div>
      {canManage && disponiveis.length > 0 && (
        adicionando ? (
          <form action={adicionarMembroEquipeAction} onSubmit={() => setAdicionando(false)} className="mt-1.5 flex gap-1">
            <input type="hidden" name="equipe_id" value={equipe.id} />
            <Select name="profile_id" defaultValue="" required>
              <option value="" disabled>
                Adicionar membro
              </option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary" size="sm">
              Adicionar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdicionando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="mt-1.5" onClick={() => setAdicionando(true)}>
            + Adicionar membro
          </Button>
        )
      )}
    </Card>
  );
}

function PedidoInstalacoesDetalhe({
  pedido,
  itensDoPedido,
  instalacoes,
  obraNome,
  equipesAtivas,
  equipeNome,
  itemLabel,
  itensPorInstalacao,
  ocorrenciasPorInstalacao,
  entreguePorPedidoItem,
  jaUsadoInstalacaoPorPedidoItem,
  canManage,
}: {
  pedido: Pedido;
  itensDoPedido: PedidoItem[];
  instalacoes: Instalacao[];
  obraNome: string | null;
  equipesAtivas: Equipe[];
  equipeNome: (id: string) => string;
  itemLabel: (itemId: string) => string;
  itensPorInstalacao: Map<string, InstalacaoItem[]>;
  ocorrenciasPorInstalacao: Map<string, Ocorrencia[]>;
  entreguePorPedidoItem: Map<string, number>;
  jaUsadoInstalacaoPorPedidoItem: Map<string, number>;
  canManage: boolean;
}) {
  const [criando, setCriando] = useState(false);

  return (
    <Card padding="xs" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-text">Instalações do pedido {pedido.numero}</strong>
        {obraNome && canManage && !criando && (
          <Button type="button" variant="primary" size="sm" className="ml-auto" onClick={() => setCriando(true)}>
            + Nova instalação
          </Button>
        )}
      </div>

      {!obraNome && (
        <p className="mt-1.5 text-xs text-text-muted">Pedido sem obra associada — instalação exige obra definida (TÓPICO 3/2).</p>
      )}

      {obraNome && canManage && criando && (
        <form action={criarInstalacaoAction} onSubmit={() => setCriando(false)} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="pedido_id" value={pedido.id} />
          <Select name="equipe_id" defaultValue="" required>
            <option value="" disabled>
              Equipe
            </option>
            {equipesAtivas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
          <Input name="data_agendada" type="date" required />
          <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
          <Button type="submit" variant="primary" size="sm">
            Agendar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setCriando(false)}>
            Cancelar
          </Button>
          {equipesAtivas.length === 0 && <span className="text-[11px] text-warning">Cadastre uma equipe ativa primeiro.</span>}
        </form>
      )}

      <div className="mt-2 flex flex-col gap-2.5">
        {instalacoes.map((inst) => {
          const itensElegiveis = itensDoPedido
            .map((pi) => {
              const entregue = entreguePorPedidoItem.get(pi.id) ?? 0;
              const jaUsado = jaUsadoInstalacaoPorPedidoItem.get(pi.id) ?? 0;
              return { pedidoItem: pi, disponivel: entregue - jaUsado };
            })
            .filter((x) => x.disponivel > 0);

          return (
            <InstalacaoBloco
              key={inst.id}
              inst={inst}
              itensDoPedido={itensDoPedido}
              instItens={itensPorInstalacao.get(inst.id) ?? []}
              ocorrencias={ocorrenciasPorInstalacao.get(inst.id) ?? []}
              itensElegiveis={itensElegiveis}
              itemLabel={itemLabel}
              equipeNome={equipeNome}
              canManage={canManage}
            />
          );
        })}
        {instalacoes.length === 0 && <p className="text-xs text-text-muted">Nenhuma instalação agendada ainda para este pedido.</p>}
      </div>
    </Card>
  );
}

function InstalacaoBloco({
  inst,
  itensDoPedido,
  instItens,
  ocorrencias,
  itensElegiveis,
  itemLabel,
  equipeNome,
  canManage,
}: {
  inst: Instalacao;
  itensDoPedido: PedidoItem[];
  instItens: InstalacaoItem[];
  ocorrencias: Ocorrencia[];
  itensElegiveis: { pedidoItem: PedidoItem; disponivel: number }[];
  itemLabel: (itemId: string) => string;
  equipeNome: (id: string) => string;
  canManage: boolean;
}) {
  const [acao, setAcao] = useState<"nenhuma" | "adicionarItem" | "cancelar" | "ocorrencia">("nenhuma");

  return (
    <div className="rounded-md border border-border-subtle p-2">
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <strong>{inst.numero}</strong>
        <Badge variant={STATUS_TONE[inst.status]}>{STATUS_LABEL[inst.status]}</Badge>
        <span className="text-text-muted">{equipeNome(inst.equipe_id)}</span>
        <span className="text-text-muted">{formatarData(inst.data_agendada)}</span>
        {inst.status === "cancelada" && inst.motivo_cancelamento && <span className="text-text-muted">Motivo: {inst.motivo_cancelamento}</span>}
        {inst.status === "aceita" && inst.aceite_nome_cliente && <span className="text-text-muted">Aceito por: {inst.aceite_nome_cliente}</span>}
      </div>

      <Table className="mt-1.5">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Qtd.</Th>
            <Th>Instalada</Th>
            <Th>Pendente</Th>
            {canManage && inst.status === "agendada" && <Th />}
          </tr>
        </thead>
        <tbody>
          {instItens.map((ii) => {
            const pi = itensDoPedido.find((p) => p.id === ii.pedido_item_id);
            return (
              <tr key={ii.id}>
                <Td>{pi ? itemLabel(pi.item_id) : "(item removido)"}</Td>
                <Td>{num(ii.quantidade)}</Td>
                <Td>{num(ii.quantidade_instalada)}</Td>
                <Td>{num(ii.quantidade_pendente)}</Td>
                {canManage && inst.status === "agendada" && (
                  <Td>
                    <form action={removerItemInstalacaoAction}>
                      <input type="hidden" name="id" value={ii.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Remover
                      </Button>
                    </form>
                  </Td>
                )}
              </tr>
            );
          })}
          {instItens.length === 0 && (
            <tr>
              <Td colSpan={canManage && inst.status === "agendada" ? 5 : 4}>
                <span className="text-text-muted">Sem itens montados ainda.</span>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      {canManage && (inst.status === "agendada" || inst.status === "em_execucao") && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {inst.status === "agendada" && itensElegiveis.length > 0 && acao !== "adicionarItem" && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("adicionarItem")}>
                + Adicionar item
              </Button>
            )}
            {acao !== "cancelar" && (
              <Button type="button" variant="outlineDanger" size="sm" onClick={() => setAcao("cancelar")}>
                Cancelar
              </Button>
            )}
          </div>

          {acao === "adicionarItem" && (
            <form action={adicionarItemInstalacaoAction} onSubmit={() => setAcao("nenhuma")} className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="instalacao_id" value={inst.id} />
              <Select name="pedido_item_id" defaultValue="" required className="min-w-48">
                <option value="" disabled>
                  Item disponível
                </option>
                {itensElegiveis.map(({ pedidoItem, disponivel }) => (
                  <option key={pedidoItem.id} value={pedidoItem.id}>
                    {itemLabel(pedidoItem.item_id)} (disponível: {num(disponivel)})
                  </option>
                ))}
              </Select>
              <Input name="quantidade" type="number" step="0.001" min="0.001" placeholder="quantidade" required className="w-20" />
              <Button type="submit" variant="primary" size="sm">
                Adicionar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Cancelar
              </Button>
            </form>
          )}

          {acao === "cancelar" && (
            <form action={cancelarInstalacaoAction} onSubmit={() => setAcao("nenhuma")} className="flex items-center gap-1.5">
              <input type="hidden" name="instalacao_id" value={inst.id} />
              <Input name="motivo" placeholder="motivo do cancelamento (opcional)" className="w-52" />
              <Button type="submit" variant="danger" size="sm">
                Confirmar cancelamento
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Voltar
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="mt-2">
        <p className="mb-1 text-xs text-text-muted">Ocorrências</p>
        {ocorrencias.map((oc) => (
          <p key={oc.id} className="mb-0.5 text-xs">
            <span className="text-text-muted">{new Date(oc.registrado_em).toLocaleString("pt-BR")} — </span>
            {oc.descricao}
          </p>
        ))}
        {ocorrencias.length === 0 && <p className="text-xs text-text-muted">Nenhuma registrada.</p>}
        {canManage && inst.status !== "cancelada" && (
          acao === "ocorrencia" ? (
            <form action={registrarOcorrenciaInstalacaoAction} onSubmit={() => setAcao("nenhuma")} className="mt-1 flex gap-1">
              <input type="hidden" name="instalacao_id" value={inst.id} />
              <Input name="descricao" placeholder="descrever ocorrência" required className="flex-1" />
              <Button type="submit" variant="primary" size="sm">
                Registrar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => setAcao("ocorrencia")}>
              + Registrar ocorrência
            </Button>
          )
        )}
      </div>
    </div>
  );
}
