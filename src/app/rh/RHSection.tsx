"use client";

import { useState } from "react";
import { desligarFuncionarioAction, upsertFuncionarioAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
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

type Unidade = { id: string; name: string };
type Profile = { id: string; display_name: string; login_identifier: string };

export default function RHSection({
  rows,
  unidades,
  profiles,
  canManage,
}: {
  rows: Funcionario[];
  unidades: Unidade[];
  profiles: Profile[];
  canManage: boolean;
}) {
  const unidadePorId = new Map(unidades.map((u) => [u.id, u.name]));
  const profilePorId = new Map(profiles.map((p) => [p.id, `${p.display_name} (${p.login_identifier})`]));
  const profileIdsEmUso = new Set(rows.filter((r) => r.status !== "desligado" && r.profile_id).map((r) => r.profile_id));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Funcionários</h2>
      <p style={hintStyle}>
        Recorte mínimo do MVP: cadastro de funcionários, vínculo com usuário do sistema e
        desligamento (que revoga o acesso do usuário vinculado). Sem folha de pagamento, escala,
        ponto, documentos, EPI ou habilitações.
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
