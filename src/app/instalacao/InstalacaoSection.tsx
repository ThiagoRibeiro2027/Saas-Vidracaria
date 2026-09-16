"use client";

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
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

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

const STATUS_COLOR: Record<Instalacao["status"], string> = {
  agendada: "#6b7a75",
  em_execucao: "#b7791f",
  concluida: "#1f5d57",
  aceita: "#1f5d57",
  cancelada: "#9b2c2c",
};

export default function InstalacaoSection({
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
      <section>
        <h2 style={sectionTitleStyle}>Equipes de instalação</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {equipes.map((eq) => {
            const membros = equipeMembrosPorEquipe.get(eq.id) ?? [];
            const membrosIds = new Set(membros.map((m) => m.profile_id));
            const disponiveis = profiles.filter((p) => !membrosIds.has(p.id));
            return (
              <div key={eq.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "8px 10px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                  <strong style={{ fontSize: "13px" }}>{eq.nome}</strong>
                  <span style={{ color: eq.ativo ? "#1f5d57" : "#9b2c2c" }}>{eq.ativo ? "Ativa" : "Inativa"}</span>
                  {canManage && (
                    <form action={definirAtivoEquipeAction}>
                      <input type="hidden" name="equipe_id" value={eq.id} />
                      <input type="hidden" name="ativo" value={(!eq.ativo).toString()} />
                      <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                        {eq.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                  {membros.map((m) => (
                    <span
                      key={m.id}
                      style={{ fontSize: "12px", background: "#f4f6f5", borderRadius: "4px", padding: "2px 6px", display: "flex", gap: "4px", alignItems: "center" }}
                    >
                      {profileNome(m.profile_id)}
                      {canManage && (
                        <form action={removerMembroEquipeAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <button type="submit" style={{ border: "none", background: "none", color: "#9b2c2c", cursor: "pointer", fontSize: "12px" }}>
                            ×
                          </button>
                        </form>
                      )}
                    </span>
                  ))}
                  {membros.length === 0 && <span style={{ fontSize: "12px", color: "#6b7a75" }}>Sem membros.</span>}
                </div>
                {canManage && disponiveis.length > 0 && (
                  <form action={adicionarMembroEquipeAction} style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                    <input type="hidden" name="equipe_id" value={eq.id} />
                    <select name="profile_id" defaultValue="" required style={inputStyle}>
                      <option value="" disabled>
                        Adicionar membro
                      </option>
                      {disponiveis.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" style={buttonStyle}>
                      Adicionar
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {equipes.length === 0 && <p style={hintStyle}>Nenhuma equipe cadastrada ainda.</p>}
          {canManage && (
            <form action={criarEquipeAction} style={{ display: "flex", gap: "4px" }}>
              <input name="nome" placeholder="nome da nova equipe" required style={{ ...inputStyle, flex: 1 }} />
              <button type="submit" style={buttonStyle}>
                Criar equipe
              </button>
            </form>
          )}
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Pedidos liberados — agenda de instalação</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {pedidos.map((ped) => {
            const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
            const instalacoes = instalacoesPorPedido.get(ped.id) ?? [];
            const obra = obraNome(ped.obra_id);
            const equipesAtivas = equipes.filter((e) => e.ativo);

            return (
              <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}>
                  <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                  <span>{pessoaNome(ped.pessoa_id)}</span>
                  <span style={{ color: "#6b7a75" }}>{obra ?? "sem obra associada"}</span>
                </div>

                {!obra && (
                  <p style={hintStyle}>Pedido sem obra associada — instalação exige obra definida (TÓPICO 3/2).</p>
                )}

                {obra && canManage && (
                  <form
                    action={criarInstalacaoAction}
                    style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginTop: "6px" }}
                  >
                    <input type="hidden" name="pedido_id" value={ped.id} />
                    <select name="equipe_id" defaultValue="" required style={inputStyle}>
                      <option value="" disabled>
                        Equipe
                      </option>
                      {equipesAtivas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </select>
                    <input name="data_agendada" type="date" required style={inputStyle} />
                    <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "180px" }} />
                    <button type="submit" style={buttonStyle}>
                      Nova instalação
                    </button>
                    {equipesAtivas.length === 0 && (
                      <span style={{ fontSize: "11px", color: "#b7791f" }}>Cadastre uma equipe ativa primeiro.</span>
                    )}
                  </form>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
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
                      <div key={inst.id} style={{ border: "1px solid #eef1ef", borderRadius: "6px", padding: "8px 10px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                          <strong>{inst.numero}</strong>
                          <span style={{ fontFamily: "monospace", color: STATUS_COLOR[inst.status] }}>
                            {STATUS_LABEL[inst.status]}
                          </span>
                          <span style={{ color: "#6b7a75" }}>{equipeNome(inst.equipe_id)}</span>
                          <span style={{ color: "#6b7a75" }}>
                            {new Date(`${inst.data_agendada}T00:00:00`).toLocaleDateString("pt-BR")}
                          </span>
                          {inst.status === "cancelada" && inst.motivo_cancelamento && (
                            <span style={{ color: "#6b7a75" }}>Motivo: {inst.motivo_cancelamento}</span>
                          )}
                          {inst.status === "aceita" && inst.aceite_nome_cliente && (
                            <span style={{ color: "#6b7a75" }}>Aceito por: {inst.aceite_nome_cliente}</span>
                          )}
                        </div>

                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                          <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                              <th style={thStyle}>Item</th>
                              <th style={thStyle}>Qtd.</th>
                              <th style={thStyle}>Instalada</th>
                              <th style={thStyle}>Pendente</th>
                              {canManage && inst.status === "agendada" && <th style={thStyle}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {instItens.map((ii) => {
                              const pi = itensDoPedido.find((p) => p.id === ii.pedido_item_id);
                              return (
                                <tr key={ii.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                                  <td style={tdStyle}>{pi ? itemLabel(pi.item_id) : "(item removido)"}</td>
                                  <td style={tdStyle}>{num(ii.quantidade)}</td>
                                  <td style={tdStyle}>{num(ii.quantidade_instalada)}</td>
                                  <td style={tdStyle}>{num(ii.quantidade_pendente)}</td>
                                  {canManage && inst.status === "agendada" && (
                                    <td style={tdStyle}>
                                      <form action={removerItemInstalacaoAction}>
                                        <input type="hidden" name="id" value={ii.id} />
                                        <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                                          Remover
                                        </button>
                                      </form>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                            {instItens.length === 0 && (
                              <tr>
                                <td style={tdStyle} colSpan={canManage && inst.status === "agendada" ? 5 : 4}>
                                  <span style={{ color: "#6b7a75" }}>Sem itens montados ainda.</span>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                        {canManage && inst.status === "agendada" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                            {itensElegiveis.length > 0 && (
                              <form
                                action={adicionarItemInstalacaoAction}
                                style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}
                              >
                                <input type="hidden" name="instalacao_id" value={inst.id} />
                                <select name="pedido_item_id" defaultValue="" required style={inputStyle}>
                                  <option value="" disabled>
                                    Item disponível
                                  </option>
                                  {itensElegiveis.map(({ pedidoItem, disponivel }) => (
                                    <option key={pedidoItem.id} value={pedidoItem.id}>
                                      {itemLabel(pedidoItem.item_id)} (disponível: {num(disponivel)})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  name="quantidade"
                                  type="number"
                                  step="0.001"
                                  min="0.001"
                                  placeholder="quantidade"
                                  required
                                  style={{ ...inputStyle, width: "80px" }}
                                />
                                <button type="submit" style={buttonStyle}>
                                  Adicionar item
                                </button>
                              </form>
                            )}
                          </div>
                        )}

                        {canManage && (inst.status === "agendada" || inst.status === "em_execucao") && (
                          <form
                            action={cancelarInstalacaoAction}
                            style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "8px" }}
                          >
                            <input type="hidden" name="instalacao_id" value={inst.id} />
                            <input name="motivo" placeholder="motivo do cancelamento (opcional)" style={{ ...inputStyle, width: "200px" }} />
                            <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                              Cancelar
                            </button>
                          </form>
                        )}

                        <div style={{ marginTop: "8px" }}>
                          <p style={{ ...hintStyle, margin: "0 0 4px" }}>Ocorrências</p>
                          {ocorrencias.map((oc) => (
                            <p key={oc.id} style={{ fontSize: "12px", margin: "0 0 2px" }}>
                              <span style={{ color: "#6b7a75" }}>
                                {new Date(oc.registrado_em).toLocaleString("pt-BR")} —{" "}
                              </span>
                              {oc.descricao}
                            </p>
                          ))}
                          {ocorrencias.length === 0 && <p style={{ ...hintStyle, margin: 0 }}>Nenhuma registrada.</p>}
                          {canManage && inst.status !== "cancelada" && (
                            <form
                              action={registrarOcorrenciaInstalacaoAction}
                              style={{ display: "flex", gap: "4px", marginTop: "4px" }}
                            >
                              <input type="hidden" name="instalacao_id" value={inst.id} />
                              <input name="descricao" placeholder="descrever ocorrência" required style={{ ...inputStyle, flex: 1 }} />
                              <button type="submit" style={buttonStyle}>
                                Registrar ocorrência
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {instalacoes.length === 0 && <p style={hintStyle}>Nenhuma instalação agendada ainda para este pedido.</p>}
                </div>
              </div>
            );
          })}
          {pedidos.length === 0 && (
            <p style={hintStyle}>Nenhum pedido liberado ainda — a instalação só entra depois da liberação (TÓPICO 3).</p>
          )}
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Danos em obra — solicitações de nova fabricação pendentes</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
              <th style={thStyle}>Instalação</th>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Qtd.</th>
              <th style={thStyle}>Causa</th>
              <th style={thStyle}>Descrição</th>
              {canDecidirDano && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {todosDanos.map((d) => {
              const solicitacao = solicitacoesPendentesPorDano.get(d.id)!;
              return (
                <tr key={d.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                  <td style={tdStyle}>{d.instalacaoNumero}</td>
                  <td style={tdStyle}>
                    {(() => {
                      const pi = pedidoItemById.get(d.pedidoItemId);
                      return pi ? itemLabel(pi.item_id) : "(item removido)";
                    })()}
                  </td>
                  <td style={tdStyle}>{num(d.quantidade)}</td>
                  <td style={tdStyle}>{d.causa}</td>
                  <td style={tdStyle}>{d.descricao ?? "—"}</td>
                  {canDecidirDano && (
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={solicitacao.id} />
                          <input type="hidden" name="decisao" value="aprovada" />
                          <button type="submit" style={buttonStyle}>
                            Aprovar
                          </button>
                        </form>
                        <form action={decidirNovaFabricacaoAction}>
                          <input type="hidden" name="solicitacao_id" value={solicitacao.id} />
                          <input type="hidden" name="decisao" value="rejeitada" />
                          <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                            Rejeitar
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {todosDanos.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canDecidirDano ? 6 : 5}>
                  <span style={{ color: "#6b7a75" }}>Nenhuma solicitação pendente.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
