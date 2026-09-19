"use client";

import { criarPapelAction, concederPermissaoAction, revogarPermissaoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type Permission = { id: string; resource: string; action: string; description: string | null };
type Role = { id: string; key: string; name: string; company_id: string | null };

export default function PapeisSection({
  roles,
  permissions,
  permissoesPorPapel,
  canManage,
}: {
  roles: Role[];
  permissions: Permission[];
  permissoesPorPapel: Map<string, Set<string>>;
  canManage: boolean;
}) {
  const papeisDaEmpresa = roles.filter((r) => r.company_id !== null);
  const papeisModelo = roles.filter((r) => r.company_id === null);

  return (
    <section>
      <h2 style={sectionTitleStyle}>Papéis e permissões (TÓPICO 14 §4-5)</h2>
      <p style={hintStyle}>
        Papéis-modelo do sistema (abaixo) não podem ter permissão alterada aqui — servem só de
        referência de nomenclatura. Crie um papel próprio da empresa para conceder/revogar
        permissão de fato.
      </p>

      {canManage && (
        <form action={criarPapelAction} style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          <input name="key" placeholder="chave (ex.: SUPERVISOR_PRODUCAO)" required style={{ ...inputStyle, width: "220px" }} />
          <input name="name" placeholder="nome de exibição" required style={{ ...inputStyle, width: "180px" }} />
          <button type="submit" style={buttonStyle}>
            Criar papel
          </button>
        </form>
      )}

      <p style={{ ...hintStyle, marginTop: 0 }}>Papéis da empresa:</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "16px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Papel</th>
            <th style={thStyle}>Permissões concedidas</th>
            {canManage && <th style={thStyle}>Conceder</th>}
          </tr>
        </thead>
        <tbody>
          {papeisDaEmpresa.map((r) => {
            const concedidas = permissoesPorPapel.get(r.id) ?? new Set<string>();
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {permissions
                      .filter((p) => concedidas.has(p.id))
                      .map((p) => (
                        <span
                          key={p.id}
                          style={{ display: "flex", alignItems: "center", gap: "3px", background: "#f4f6f5", borderRadius: "3px", padding: "1px 5px" }}
                        >
                          {p.resource}.{p.action}
                          {canManage && (
                            <form action={revogarPermissaoAction}>
                              <input type="hidden" name="role_id" value={r.id} />
                              <input type="hidden" name="permission_id" value={p.id} />
                              <button type="submit" style={{ border: "none", background: "none", color: "#9b2c2c", cursor: "pointer", fontSize: "11px" }}>
                                ×
                              </button>
                            </form>
                          )}
                        </span>
                      ))}
                    {concedidas.size === 0 && <span style={{ color: "#6b7a75" }}>nenhuma</span>}
                  </div>
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    <form action={concederPermissaoAction} style={{ display: "flex", gap: "4px" }}>
                      <input type="hidden" name="role_id" value={r.id} />
                      <select name="permission_id" required style={{ ...inputStyle, width: "180px" }} defaultValue="">
                        <option value="" disabled>
                          selecionar...
                        </option>
                        {permissions
                          .filter((p) => !concedidas.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.resource}.{p.action}
                            </option>
                          ))}
                      </select>
                      <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                        +
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
          {papeisDaEmpresa.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={canManage ? 3 : 2}>
                <span style={{ color: "#6b7a75" }}>Nenhum papel próprio criado ainda.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p style={{ ...hintStyle, marginTop: 0 }}>Papéis-modelo do sistema (referência, sem permissão própria por padrão):</p>
      <ul style={{ fontSize: "12px", color: "#3e4d49" }}>
        {papeisModelo.map((r) => (
          <li key={r.id}>
            {r.name} ({r.key})
          </li>
        ))}
      </ul>
    </section>
  );
}
