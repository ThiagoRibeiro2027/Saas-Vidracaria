"use client";

import { useState } from "react";
import { cancelarDocumentoFiscalAction, registrarDocumentoFiscalAction, vincularDocumentoFiscalAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const TIPOS = [
  ["nfe", "NF-e"],
  ["nfse", "NFS-e"],
  ["outro", "Outro"],
] as const;

type Documento = {
  id: string;
  tipo: "nfe" | "nfse" | "outro";
  numero: string | null;
  chave_acesso: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "recebido" | "cancelado";
  motivo_cancelamento: string | null;
  observacoes: string | null;
};

export default function FiscalSection({ rows, canManage }: { rows: Documento[]; canManage: boolean }) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Documentos fiscais</h2>
      <p style={hintStyle}>
        Recorte mínimo do MVP (ADR-004 §9.2): registro e rastreabilidade de documentos fiscais
        recebidos, com vínculo operacional opcional (independente de Pedido de Compra). Sem
        emissão, cancelamento fiscal real, inutilização ou transmissão — durante o piloto, o
        faturamento permanece no sistema atual da empresa (§9.1).
      </p>

      {canManage && <NovoDocumentoForm />}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Chave de acesso</th>
              <th style={thStyle}>Vínculo</th>
              <th style={thStyle}>Status</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{TIPOS.find(([v]) => v === row.tipo)?.[1] ?? row.tipo}</td>
                <td style={tdStyle}>{row.numero ?? "—"}</td>
                <td style={tdStyle}>{row.chave_acesso ?? "—"}</td>
                <td style={tdStyle}>{row.entity_type ? `${row.entity_type} (${row.entity_id?.slice(0, 8)}…)` : "sem vínculo"}</td>
                <td style={tdStyle}>
                  {row.status === "cancelado" ? `Cancelado — ${row.motivo_cancelamento ?? ""}` : "Recebido"}
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    {row.status === "recebido" && <AcoesDocumento row={row} />}
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

function NovoDocumentoForm() {
  return (
    <form action={registrarDocumentoFiscalAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <select name="tipo" defaultValue="nfe" required style={inputStyle}>
        {TIPOS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <input name="numero" placeholder="número" style={{ ...inputStyle, width: "110px" }} />
      <input name="chave_acesso" placeholder="chave de acesso (opcional)" style={{ ...inputStyle, width: "220px" }} />
      <input name="entity_type" placeholder="vínculo: tipo (opcional)" style={{ ...inputStyle, width: "140px" }} />
      <input name="entity_id" placeholder="vínculo: id (opcional)" style={{ ...inputStyle, width: "140px" }} />
      <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "160px" }} />
      <button type="submit" style={buttonStyle}>
        Registrar
      </button>
    </form>
  );
}

function AcoesDocumento({ row }: { row: Documento }) {
  const [modo, setModo] = useState<"nenhum" | "vincular" | "cancelar">("nenhum");

  if (modo === "vincular") {
    return (
      <form action={vincularDocumentoFiscalAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <input name="entity_type" placeholder="tipo" required style={{ ...inputStyle, width: "90px" }} />
        <input name="entity_id" placeholder="id" required style={{ ...inputStyle, width: "90px" }} />
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
      <form action={cancelarDocumentoFiscalAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
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
      <button onClick={() => setModo("vincular")} style={buttonStyle}>
        Vincular
      </button>
      <button onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Cancelar
      </button>
    </div>
  );
}
