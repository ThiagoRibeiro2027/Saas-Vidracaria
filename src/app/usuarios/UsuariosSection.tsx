"use client";

import {
  criarUsuarioAction,
  atribuirPapelAction,
  revogarPapelAction,
  desativarUsuarioAction,
  reativarUsuarioAction,
  resetarSenhaAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type Profile = {
  id: string;
  login_identifier: string;
  display_name: string;
  contact_email: string | null;
  active: boolean;
  must_change_password: boolean;
};
export type Role = { id: string; key: string; name: string; company_id: string | null };
export type UserRoleRow = { id: string; profile_id: string; role_id: string; valid_until: string | null };

export default function UsuariosSection({
  profiles,
  roles,
  userRolesPorProfile,
  canManage,
}: {
  profiles: Profile[];
  roles: Role[];
  userRolesPorProfile: Map<string, UserRoleRow[]>;
  canManage: boolean;
}) {
  const roleNome = (id: string) => roles.find((r) => r.id === id)?.name ?? "(papel removido)";

  return (
    <section>
      <h2 style={sectionTitleStyle}>Usuários (TÓPICO 14)</h2>
      <p style={hintStyle}>
        Convite administrativo — sem cadastro público. O usuário nasce com senha temporária e é
        obrigado a trocá-la no primeiro acesso. Login continua sendo empresa + matrícula.
      </p>

      {canManage && (
        <form
          action={criarUsuarioAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <input name="login_identifier" placeholder="matrícula" required style={{ ...inputStyle, width: "100px" }} />
          <input name="display_name" placeholder="nome completo" required style={{ ...inputStyle, width: "160px" }} />
          <input name="contact_email" type="email" placeholder="e-mail (opcional)" style={{ ...inputStyle, width: "170px" }} />
          <input name="password" type="password" placeholder="senha inicial" required minLength={8} style={{ ...inputStyle, width: "120px" }} />
          <select name="role_id" style={{ ...inputStyle, width: "160px" }} defaultValue="">
            <option value="">papel inicial (opcional)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Criar usuário
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Matrícula</th>
            <th style={thStyle}>Nome</th>
            <th style={thStyle}>Situação</th>
            <th style={thStyle}>Papéis</th>
            {canManage && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const userRoles = userRolesPorProfile.get(p.id) ?? [];
            return (
              <tr key={p.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                <td style={tdStyle}>
                  <span style={{ fontFamily: "monospace" }}>{p.login_identifier}</span>
                </td>
                <td style={tdStyle}>
                  {p.display_name}
                  {p.must_change_password && (
                    <span style={{ color: "#b7791f", fontSize: "11px", marginLeft: "6px" }}>(troca de senha pendente)</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ color: p.active ? "#1f5d57" : "#9b2c2c" }}>{p.active ? "Ativo" : "Inativo"}</span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {userRoles.map((ur) => (
                      <div key={ur.id} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span>{roleNome(ur.role_id)}</span>
                        {canManage && (
                          <form action={revogarPapelAction}>
                            <input type="hidden" name="user_role_id" value={ur.id} />
                            <button type="submit" style={{ ...buttonStyle, fontSize: "10px", padding: "1px 5px", background: "#6b7a75" }}>
                              revogar
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                    {canManage && (
                      <form action={atribuirPapelAction} style={{ display: "flex", gap: "4px" }}>
                        <input type="hidden" name="profile_id" value={p.id} />
                        <select name="role_id" required style={{ ...inputStyle, width: "120px", fontSize: "11px" }} defaultValue="">
                          <option value="" disabled>
                            + atribuir papel
                          </option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" style={{ ...buttonStyle, fontSize: "10px", padding: "1px 5px" }}>
                          ok
                        </button>
                      </form>
                    )}
                  </div>
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <form action={p.active ? desativarUsuarioAction : reativarUsuarioAction}>
                        <input type="hidden" name="profile_id" value={p.id} />
                        {p.active && <input type="hidden" name="motivo" value="Desativado via /usuarios" />}
                        <button
                          type="submit"
                          style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: p.active ? "#9b2c2c" : "#1f5d57" }}
                        >
                          {p.active ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                      <form action={resetarSenhaAction} style={{ display: "flex", gap: "4px" }}>
                        <input type="hidden" name="profile_id" value={p.id} />
                        <input name="nova_senha" type="password" placeholder="nova senha" minLength={8} required style={{ ...inputStyle, width: "90px", fontSize: "11px" }} />
                        <button type="submit" style={{ ...buttonStyle, fontSize: "10px", padding: "2px 5px", background: "#6b7a75" }}>
                          resetar
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {profiles.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                <span style={{ color: "#6b7a75" }}>Nenhum usuário cadastrado ainda.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
