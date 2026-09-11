"use client";

import { transitionSubscriptionAction } from "./actions";

const STATUSES = ["trial", "active", "past_due", "suspended", "canceled", "expired"] as const;

type Row = {
  companyId: string;
  companyName: string;
  status: string;
  planName: string | null;
  userCount: number;
  storageBytesUsed: number;
  maxUsers: number | null;
  maxStorageBytes: number | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSubscriptionsTable({ rows }: { rows: Row[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
            <th style={thStyle}>Empresa</th>
            <th style={thStyle}>Plano</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Usuários</th>
            <th style={thStyle}>Storage</th>
            <th style={thStyle}>Alterar status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId} style={{ borderBottom: "1px solid #eef1ef" }}>
              <td style={tdStyle}>{row.companyName}</td>
              <td style={tdStyle}>{row.planName ?? "— sem plano —"}</td>
              <td style={{ ...tdStyle, fontFamily: "monospace" }}>{row.status}</td>
              <td style={tdStyle}>
                {row.userCount}
                {row.maxUsers ? ` / ${row.maxUsers}` : ""}
              </td>
              <td style={tdStyle}>
                {formatBytes(row.storageBytesUsed)}
                {row.maxStorageBytes ? ` / ${formatBytes(row.maxStorageBytes)}` : ""}
              </td>
              <td style={tdStyle}>
                <form action={transitionSubscriptionAction} style={{ display: "flex", gap: "6px" }}>
                  <input type="hidden" name="company_id" value={row.companyId} />
                  <select name="status" defaultValue={row.status} style={{ fontSize: "12px" }}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={buttonStyle}>
                    Aplicar
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { padding: "6px 8px" } as const;
const tdStyle = { padding: "6px 8px" } as const;
const buttonStyle = {
  background: "#1f5d57",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "3px 8px",
  fontSize: "12px",
  cursor: "pointer",
} as const;
