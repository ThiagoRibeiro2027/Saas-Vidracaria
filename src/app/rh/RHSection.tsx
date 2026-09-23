"use client";

import { useState } from "react";
import {
  cancelarAfastamentoAction,
  cancelarDocumentoFuncionarioAction,
  desligarFuncionarioAction,
  encerrarAfastamentoAction,
  registrarAfastamentoAction,
  registrarDocumentoFuncionarioAction,
  upsertFuncionarioAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const TIPO_DOCUMENTO_LABEL: Record<string, string> = {
  admissao: "Documento de admissão",
  certificacao: "Certificação/treinamento",
  epi: "EPI",
  habilitacao: "Habilitação de equipamento",
};

const TIPO_AFASTAMENTO_LABEL: Record<string, string> = {
  afastamento: "Afastamento",
  ferias: "Férias",
};

type Funcionario = {
  id: string;
  nome: string;
  cargo: string | null;
  funcao: string | null;
  unidade_id: string | null;
  profile_id: string | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  status: "ativo" | "afastado" | "desligado";
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  observacoes: string | null;
};

type Documento = {
  id: string;
  funcionario_id: string;
  tipo: "admissao" | "certificacao" | "epi" | "habilitacao";
  nome: string;
  data_referencia: string | null;
  validade: string | null;
  observacoes: string | null;
  status: "ativo" | "cancelado";
  motivo_cancelamento: string | null;
};

type Afastamento = {
  id: string;
  funcionario_id: string;
  tipo: "afastamento" | "ferias";
  data_inicio: string;
  data_fim: string | null;
  motivo: string | null;
  observacoes: string | null;
  status: "ativo" | "cancelado";
  motivo_cancelamento: string | null;
};

type Unidade = { id: string; name: string };
type Profile = { id: string; display_name: string; login_identifier: string };

export default function RHSection({
  rows,
  unidades,
  profiles,
  documentos,
  afastamentos,
  canManage,
}: {
  rows: Funcionario[];
  unidades: Unidade[];
  profiles: Profile[];
  documentos: Documento[];
  afastamentos: Afastamento[];
  canManage: boolean;
}) {
  const unidadePorId = new Map(unidades.map((u) => [u.id, u.name]));
  const profilePorId = new Map(profiles.map((p) => [p.id, `${p.display_name} (${p.login_identifier})`]));
  const funcionarioPorId = new Map(rows.map((r) => [r.id, r.nome]));
  const profileIdsEmUso = new Set(rows.filter((r) => r.status !== "desligado" && r.profile_id).map((r) => r.profile_id));
  const funcionariosAtivos = rows.filter((r) => r.status !== "desligado");

  return (
    <>
      <section>
        <h2 style={sectionTitleStyle}>Funcionários</h2>
        <p style={hintStyle}>
          Cadastro de funcionários, vínculo com usuário do sistema e desligamento (que revoga o
          acesso do usuário vinculado). Sem folha de pagamento, encargos, rescisão, escala ou ponto.
        </p>

        {canManage && <FuncionarioForm row={null} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id))} />}

        <div style={{ overflowX: "auto", marginTop: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Cargo/Função</th>
                <th style={thStyle}>Unidade</th>
                <th style={thStyle}>Usuário vinculado</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{row.nome}</td>
                  <td style={tdStyle}>{[row.cargo, row.funcao].filter(Boolean).join(" — ") || "—"}</td>
                  <td style={tdStyle}>{row.unidade_id ? unidadePorId.get(row.unidade_id) ?? "—" : "—"}</td>
                  <td style={tdStyle}>{row.profile_id ? profilePorId.get(row.profile_id) ?? "—" : "—"}</td>
                  <td style={tdStyle}>
                    {STATUS_LABEL[row.status]}
                    {row.status === "desligado" && row.motivo_desligamento && ` — ${row.motivo_desligamento}`}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      {row.status !== "desligado" && (
                        <AcoesFuncionario row={row} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id) || p.id === row.profile_id)} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Documentos, EPI e habilitações</h2>
        <p style={hintStyle}>
          Documento de admissão, certificação/treinamento, entrega de EPI e habilitação para operar
          equipamento — uma estrutura só. Anexar o arquivo em si é feito pela tela de Arquivos.
          Cancelar corrige um registro errado, sem apagar o histórico.
        </p>

        {canManage && <DocumentoForm funcionarios={funcionariosAtivos} />}

        <div style={{ overflowX: "auto", marginTop: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Funcionário</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Referência</th>
                <th style={thStyle}>Validade</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{funcionarioPorId.get(doc.funcionario_id) ?? "—"}</td>
                  <td style={tdStyle}>{TIPO_DOCUMENTO_LABEL[doc.tipo]}</td>
                  <td style={tdStyle}>{doc.nome}</td>
                  <td style={tdStyle}>{doc.data_referencia ?? "—"}</td>
                  <td style={tdStyle}>{doc.validade ?? "—"}</td>
                  <td style={tdStyle}>
                    {doc.status === "ativo" ? "Ativo" : `Cancelado${doc.motivo_cancelamento ? ` — ${doc.motivo_cancelamento}` : ""}`}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      {doc.status === "ativo" && <CancelarDocumentoBotao id={doc.id} />}
                    </td>
                  )}
                </tr>
              ))}
              {documentos.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 7 : 6}>
                    Nenhum documento registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Afastamentos e férias</h2>
        <p style={hintStyle}>
          Registro simples de período (datas e motivo), sem cálculo de valores ou encargos —
          desacoplado do status do funcionário.
        </p>

        {canManage && <AfastamentoForm funcionarios={funcionariosAtivos} />}

        <div style={{ overflowX: "auto", marginTop: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Funcionário</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Início</th>
                <th style={thStyle}>Fim</th>
                <th style={thStyle}>Motivo</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {afastamentos.map((af) => (
                <tr key={af.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{funcionarioPorId.get(af.funcionario_id) ?? "—"}</td>
                  <td style={tdStyle}>{TIPO_AFASTAMENTO_LABEL[af.tipo]}</td>
                  <td style={tdStyle}>{af.data_inicio}</td>
                  <td style={tdStyle}>{af.data_fim ?? "em aberto"}</td>
                  <td style={tdStyle}>{af.motivo ?? "—"}</td>
                  <td style={tdStyle}>
                    {af.status === "ativo" ? "Ativo" : `Cancelado${af.motivo_cancelamento ? ` — ${af.motivo_cancelamento}` : ""}`}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      {af.status === "ativo" && <AcoesAfastamento row={af} />}
                    </td>
                  )}
                </tr>
              ))}
              {afastamentos.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 7 : 6}>
                    Nenhum período registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function FuncionarioForm({ row, unidades, profiles, onSubmit }: { row: Funcionario | null; unidades: Unidade[]; profiles: Profile[]; onSubmit?: () => void }) {
  return (
    <form
      action={upsertFuncionarioAction}
      onSubmit={onSubmit}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: row ? undefined : "#f5f7f5", padding: row ? undefined : "12px", borderRadius: row ? undefined : "6px" }}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <input name="nome" placeholder="nome" defaultValue={row?.nome ?? ""} required style={{ ...inputStyle, width: "160px" }} />
      <input name="cargo" placeholder="cargo" defaultValue={row?.cargo ?? ""} style={{ ...inputStyle, width: "110px" }} />
      <input name="funcao" placeholder="função" defaultValue={row?.funcao ?? ""} style={{ ...inputStyle, width: "110px" }} />
      <select name="unidade_id" defaultValue={row?.unidade_id ?? ""} style={inputStyle}>
        <option value="">unidade…</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <input name="data_admissao" type="date" defaultValue={row?.data_admissao ?? ""} style={inputStyle} />
      <input name="telefone" placeholder="telefone" defaultValue={row?.telefone ?? ""} style={{ ...inputStyle, width: "110px" }} />
      <select name="profile_id" defaultValue={row?.profile_id ?? ""} style={inputStyle}>
        <option value="">sem usuário vinculado</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name} ({p.login_identifier})</option>
        ))}
      </select>
      <select name="status" defaultValue={row?.status ?? "ativo"} style={inputStyle}>
        <option value="ativo">Ativo</option>
        <option value="afastado">Afastado</option>
      </select>
      <input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} style={{ ...inputStyle, width: "150px" }} />
      <button type="submit" style={buttonStyle}>
        {row ? "Salvar" : "Admitir"}
      </button>
    </form>
  );
}

function AcoesFuncionario({ row, unidades, profiles }: { row: Funcionario; unidades: Unidade[]; profiles: Profile[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar" | "desligar">("nenhum");

  if (modo === "editar") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <FuncionarioForm row={row} unidades={unidades} profiles={profiles} onSubmit={() => setModo("nenhum")} />
        <button onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de", width: "fit-content" }}>
          Fechar
        </button>
      </div>
    );
  }

  if (modo === "desligar") {
    return (
      <form action={desligarFuncionarioAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <input name="data_desligamento" type="date" style={inputStyle} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      <button onClick={() => setModo("editar")} style={buttonStyle}>
        Editar
      </button>
      <button onClick={() => setModo("desligar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Desligar
      </button>
    </div>
  );
}

function DocumentoForm({ funcionarios }: { funcionarios: Funcionario[] }) {
  return (
    <form
      action={registrarDocumentoFuncionarioAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}
    >
      <select name="funcionario_id" required style={inputStyle}>
        <option value="">funcionário…</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </select>
      <select name="tipo" required style={inputStyle}>
        <option value="">tipo…</option>
        <option value="admissao">Documento de admissão</option>
        <option value="certificacao">Certificação/treinamento</option>
        <option value="epi">EPI</option>
        <option value="habilitacao">Habilitação de equipamento</option>
      </select>
      <input name="nome" placeholder="nome do documento/EPI/equipamento" required style={{ ...inputStyle, width: "180px" }} />
      <input name="data_referencia" type="date" style={inputStyle} />
      <input name="validade" type="date" style={inputStyle} />
      <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "150px" }} />
      <button type="submit" style={buttonStyle}>
        Registrar
      </button>
    </form>
  );
}

function CancelarDocumentoBotao({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);

  if (aberto) {
    return (
      <form action={cancelarDocumentoFuncionarioAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setAberto(false)}>
        <input type="hidden" name="id" value={id} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setAberto(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <button onClick={() => setAberto(true)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
      Cancelar
    </button>
  );
}

function AfastamentoForm({ funcionarios }: { funcionarios: Funcionario[] }) {
  return (
    <form
      action={registrarAfastamentoAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}
    >
      <select name="funcionario_id" required style={inputStyle}>
        <option value="">funcionário…</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </select>
      <select name="tipo" required style={inputStyle}>
        <option value="">tipo…</option>
        <option value="afastamento">Afastamento</option>
        <option value="ferias">Férias</option>
      </select>
      <input name="data_inicio" type="date" required style={inputStyle} />
      <input name="data_fim" type="date" style={inputStyle} title="deixe em branco se o período ainda está em aberto" />
      <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
      <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "150px" }} />
      <button type="submit" style={buttonStyle}>
        Registrar
      </button>
    </form>
  );
}

function AcoesAfastamento({ row }: { row: Afastamento }) {
  const [modo, setModo] = useState<"nenhum" | "encerrar" | "cancelar">("nenhum");

  if (modo === "encerrar") {
    return (
      <form action={encerrarAfastamentoAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <input name="data_fim" type="date" required style={inputStyle} />
        <button type="submit" style={buttonStyle}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarAfastamentoAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {!row.data_fim && (
        <button onClick={() => setModo("encerrar")} style={buttonStyle}>
          Encerrar
        </button>
      )}
      <button onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Cancelar
      </button>
    </div>
  );
}
