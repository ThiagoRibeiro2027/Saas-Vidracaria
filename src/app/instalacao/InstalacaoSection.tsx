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
type Dano = {
  id: string;
  instalacao_item_id: string;
  quantidade: number;
  causa: string;
  descricao: string | null;
  registrado_em: string;
};
type Solicitacao = { id: string; dano_id: string; motivo: string | null; status: string; solicitado_em: string };

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

export default function InstalacaoSection({
  activeTab,
  pedidos,
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
  danosPorInstalacaoItem,
  solicitacoesPendentesPorDano,
  canManage,
  canDecidirDano,
}: {
  activeTab: "equipes" | "agenda" | "danos";
  pedidos: Pedido[];
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
  danosPorInstalacaoItem: Map<string, Dano[]>;
  solicitacoesPendentesPorDano: Map<string, Solicitacao>;
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

  const pedidoItemById = new Map<string, PedidoItem>();
  for (const [, list] of pedidoItensPorPedido) {
    for (const pi of list) pedidoItemById.set(pi.id, pi);
  }

  const [selectedEquipeId, setSelectedEquipeId] = useState<string | null>(null);
  const equipeSelecionada = equipes.find((e) => e.id === selectedEquipeId) ?? null;

  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const pedidoSelecionado = pedidos.find((p) => p.id === selectedPedidoId) ?? null;

  const todosDanos: Array<Dano & { pedidoItemId: string; instalacaoId: string; instalacaoNumero: string }> = [];
  for (const [, instalacoesDoPedido] of instalacoesPorPedido) {
    for (const inst of instalacoesDoPedido) {
      for (const item of itensPorInstalacao.get(inst.id) ?? []) {
        for (const dano of danosPorInstalacaoItem.get(item.id) ?? []) {
          if (solicitacoesPendentesPorDano.has(dano.id)) {
            todosDanos.push({ ...dano, pedidoItemId: item.pedido_item_id, instalacaoId: inst.id, instalacaoNumero: inst.numero });
          }
        }
      }
    }
  }

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

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <form action={definirAtivoEquipeAction}>
              <input type="hidden" name="equipe_id" value={equipeSelecionada?.id ?? ""} />
              <input type="hidden" name="ativo" value={(!equipeSelecionada?.ativo).toString()} />
              <Button type="submit" variant="secondary" disabled={!equipeSelecionada}>
                {equipeSelecionada?.ativo ?? true ? "Desativar" : "Ativar"}
              </Button>
            </form>
            <span className="ml-auto text-xs text-text-muted">
              {equipeSelecionada ? `${equipeSelecionada.nome} selecionada` : "nenhuma equipe selecionada"}
            </span>
          </div>
        )}

        <div className="mt-2 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Status</Th>
                <Th>Membros</Th>
              </tr>
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
                      <Badge variant={eq.ativo ? "success" : "danger"}>{eq.ativo ? "Ativa" : "Inativa"}</Badge>
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
          </Table>
        </div>

        {equipeSelecionada && (
          <Card padding="xs" className="mt-3">
            <strong className="text-sm text-text">Membros de {equipeSelecionada.nome}</strong>
            {(() => {
              const membros = equipeMembrosPorEquipe.get(equipeSelecionada.id) ?? [];
              const membrosIds = new Set(membros.map((m) => m.profile_id));
              const disponiveis = profiles.filter((p) => !membrosIds.has(p.id));
              return (
                <>
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
                    <form action={adicionarMembroEquipeAction} className="mt-1.5 flex gap-1">
                      <input type="hidden" name="equipe_id" value={equipeSelecionada.id} />
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
                      <Button type="submit" variant="primary">
                        Adicionar
                      </Button>
                    </form>
                  )}
                </>
              );
            })()}
          </Card>
        )}
      </section>
      )}

      {activeTab === "agenda" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Pedidos liberados — agenda de instalação</h2>

        <div className="mt-2 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Cliente</Th>
                <Th>Obra</Th>
                <Th>Instalações</Th>
              </tr>
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
          </Table>
        </div>

        {pedidoSelecionado && (() => {
          const itensDoPedido = pedidoItensPorPedido.get(pedidoSelecionado.id) ?? [];
          const instalacoes = instalacoesPorPedido.get(pedidoSelecionado.id) ?? [];
          const obra = obraNome(pedidoSelecionado.obra_id);
          const equipesAtivas = equipes.filter((e) => e.ativo);

          return (
            <Card padding="xs" className="mt-3">
              <strong className="text-sm text-text">Instalações do pedido {pedidoSelecionado.numero}</strong>

              {!obra && (
                <p className="mt-1.5 text-xs text-text-muted">
                  Pedido sem obra associada — instalação exige obra definida (TÓPICO 3/2).
                </p>
              )}

              {obra && canManage && (
                <form action={criarInstalacaoAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="pedido_id" value={pedidoSelecionado.id} />
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
                  <Button type="submit" variant="primary">
                    Nova instalação
                  </Button>
                  {equipesAtivas.length === 0 && (
                    <span className="text-[11px] text-warning">Cadastre uma equipe ativa primeiro.</span>
                  )}
                </form>
              )}

              <div className="mt-2 flex flex-col gap-2.5">
                {instalacoes.map((inst) => {
                  const instItens = itensPorInstalacao.get(inst.id) ?? [];
                  const ocorrencias = ocorrenciasPorInstalacao.get(inst.id) ?? [];

                  const itensElegiveis = itensDoPedido
                    .map((pi) => {
                      const entregue = entreguePorPedidoItem.get(pi.id) ?? 0;
                      const jaUsado = jaUsadoInstalacaoPorPedidoItem.get(pi.id) ?? 0;
                      return { pedidoItem: pi, disponivel: entregue - jaUsado };
                    })
                    .filter((x) => x.disponivel > 0);

                  return (
                    <div key={inst.id} className="rounded-md border border-border-subtle p-2">
                      <div className="flex flex-wrap items-baseline gap-2 text-xs">
                        <strong>{inst.numero}</strong>
                        <Badge variant={STATUS_TONE[inst.status]}>{STATUS_LABEL[inst.status]}</Badge>
                        <span className="text-text-muted">{equipeNome(inst.equipe_id)}</span>
                        <span className="text-text-muted">
                          {new Date(`${inst.data_agendada}T00:00:00`).toLocaleDateString("pt-BR")}
                        </span>
                        {inst.status === "cancelada" && inst.motivo_cancelamento && (
                          <span className="text-text-muted">Motivo: {inst.motivo_cancelamento}</span>
                        )}
                        {inst.status === "aceita" && inst.aceite_nome_cliente && (
                          <span className="text-text-muted">Aceito por: {inst.aceite_nome_cliente}</span>
                        )}
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
                                      <Button type="submit" variant="danger">
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

                      {canManage && inst.status === "agendada" && itensElegiveis.length > 0 && (
                        <form action={adicionarItemInstalacaoAction} className="mt-2 flex flex-wrap items-center gap-1.5">
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
                          <Input
                            name="quantidade"
                            type="number"
                            step="0.001"
                            min="0.001"
                            placeholder="quantidade"
                            required
                            className="w-20"
                          />
                          <Button type="submit" variant="primary">
                            Adicionar item
                          </Button>
                        </form>
                      )}

                      {canManage && (inst.status === "agendada" || inst.status === "em_execucao") && (
                        <form action={cancelarInstalacaoAction} className="mt-2 flex items-center gap-1.5">
                          <input type="hidden" name="instalacao_id" value={inst.id} />
                          <Input name="motivo" placeholder="motivo do cancelamento (opcional)" className="w-52" />
                          <Button type="submit" variant="danger">
                            Cancelar
                          </Button>
                        </form>
                      )}

                      <div className="mt-2">
                        <p className="mb-1 text-xs text-text-muted">Ocorrências</p>
                        {ocorrencias.map((oc) => (
                          <p key={oc.id} className="mb-0.5 text-xs">
                            <span className="text-text-muted">
                              {new Date(oc.registrado_em).toLocaleString("pt-BR")} —{" "}
                            </span>
                            {oc.descricao}
                          </p>
                        ))}
                        {ocorrencias.length === 0 && <p className="text-xs text-text-muted">Nenhuma registrada.</p>}
                        {canManage && inst.status !== "cancelada" && (
                          <form action={registrarOcorrenciaInstalacaoAction} className="mt-1 flex gap-1">
                            <input type="hidden" name="instalacao_id" value={inst.id} />
                            <Input name="descricao" placeholder="descrever ocorrência" required className="flex-1" />
                            <Button type="submit" variant="primary">
                              Registrar ocorrência
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
                {instalacoes.length === 0 && (
                  <p className="text-xs text-text-muted">Nenhuma instalação agendada ainda para este pedido.</p>
                )}
              </div>
            </Card>
          );
        })()}
      </section>
      )}

      {activeTab === "danos" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Danos em obra — solicitações de nova fabricação pendentes</h2>
        <Table className="mt-2">
          <thead>
            <tr>
              <Th>Instalação</Th>
              <Th>Item</Th>
              <Th>Qtd.</Th>
              <Th>Causa</Th>
              <Th>Descrição</Th>
              {canDecidirDano && <Th />}
            </tr>
          </thead>
          <tbody>
            {todosDanos.map((d) => {
              const solicitacao = solicitacoesPendentesPorDano.get(d.id)!;
              return (
                <tr key={d.id}>
                  <Td>{d.instalacaoNumero}</Td>
                  <Td>
                    {(() => {
                      const pi = pedidoItemById.get(d.pedidoItemId);
                      return pi ? itemLabel(pi.item_id) : "(item removido)";
                    })()}
                  </Td>
                  <Td>{num(d.quantidade)}</Td>
                  <Td>{d.causa}</Td>
                  <Td>{d.descricao ?? "—"}</Td>
                  {canDecidirDano && (
                    <Td>
                      <div className="flex gap-1">
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={solicitacao.id} />
                          <input type="hidden" name="decisao" value="aprovada" />
                          <Button type="submit" variant="primary">
                            Aprovar
                          </Button>
                        </form>
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={solicitacao.id} />
                          <input type="hidden" name="decisao" value="rejeitada" />
                          <Button type="submit" variant="danger">
                            Rejeitar
                          </Button>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
            {todosDanos.length === 0 && (
              <tr>
                <Td colSpan={canDecidirDano ? 6 : 5}>
                  <span className="text-text-muted">Nenhuma solicitação pendente.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>
      )}
    </>
  );
}
