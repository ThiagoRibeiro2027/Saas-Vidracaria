"use client";

import { useState } from "react";
import { ativarContratoAction, encerrarContratoAction, upsertContratoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const TIPO_LABEL: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  funcionario: "Funcionário/prestador",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  vigente: "Vigente",
  encerrado: "Encerrado",
};

type Contrato = {
  id: string;
  numero: string;
  tipo: "cliente" | "fornecedor" | "funcionario";
  pessoa_id: string | null;
  obra_id: string | null;
  pedido_id: string | null;
  funcionario_id: string | null;
  objeto: string;
  data_inicio: string | null;
  data_fim: string | null;
  renovacao: "manual" | "automatica";
  valor: number | null;
  forma_pagamento: string | null;
  status: "rascunho" | "vigente" | "encerrado";
  motivo_encerramento: string | null;
  observacoes: string | null;
};

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string; pessoa_id: string };
type Pedido = { id: string; numero: string; pessoa_id: string };
type Funcionario = { id: string; nome: string };

export default function ContratosSection({
  rows,
  pessoas,
  clientes,
  fornecedores,
  obras,
  pedidos,
  funcionarios,
  canManage,
}: {
  rows: Contrato[];
  pessoas: Pessoa[];
  clientes: Pessoa[];
  fornecedores: Pessoa[];
  obras: Obra[];
  pedidos: Pedido[];
  funcionarios: Funcionario[];
  canManage: boolean;
}) {
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p.nome]));
  const obraPorId = new Map(obras.map((o) => [o.id, o.nome]));
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p.numero]));
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));

  function vinculo(row: Contrato): string {
    if (row.tipo === "funcionario") return row.funcionario_id ? funcionarioPorId.get(row.funcionario_id) ?? "—" : "—";
    const partes = [row.pessoa_id ? pessoaPorId.get(row.pessoa_id) ?? "—" : "—"];
    if (row.obra_id) partes.push(`obra ${obraPorId.get(row.obra_id) ?? "—"}`);
    if (row.pedido_id) partes.push(`pedido ${pedidoPorId.get(row.pedido_id) ?? "—"}`);
    return partes.join(" — ");
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>Contratos</h2>
      <p style={hintStyle}>
        Cliente, fornecedor ou funcionário/prestador — uma estrutura genérica só. Editar é possível
        só enquanto o contrato está em rascunho.
      </p>

      {canManage && <ContratoForm row={null} clientes={clientes} fornecedores={fornecedores} obras={obras} pedidos={pedidos} funcionarios={funcionarios} />}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Vínculo</th>
              <th style={thStyle}>Objeto</th>
              <th style={thStyle}>Vigência</th>
              <th style={thStyle}>Status</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{row.numero}</td>
                <td style={tdStyle}>{TIPO_LABEL[row.tipo]}</td>
                <td style={tdStyle}>{vinculo(row)}</td>
                <td style={tdStyle}>{row.objeto}</td>
                <td style={tdStyle}>
                  {row.data_inicio ?? "—"} a {row.data_fim ?? "—"}
                </td>
                <td style={tdStyle}>
                  {STATUS_LABEL[row.status]}
                  {row.status === "encerrado" && row.motivo_encerramento && ` — ${row.motivo_encerramento}`}
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    <AcoesContrato row={row} clientes={clientes} fornecedores={fornecedores} obras={obras} pedidos={pedidos} funcionarios={funcionarios} />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage ? 7 : 6}>
                  Nenhum contrato registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContratoForm({
  row,
  clientes,
  fornecedores,
  obras,
  pedidos,
  funcionarios,
  onSubmit,
}: {
  row: Contrato | null;
  clientes: Pessoa[];
  fornecedores: Pessoa[];
  obras: Obra[];
  pedidos: Pedido[];
  funcionarios: Funcionario[];
  onSubmit?: () => void;
}) {
  const [tipo, setTipo] = useState<Contrato["tipo"]>(row?.tipo ?? "cliente");
  const [pessoaId, setPessoaId] = useState(row?.pessoa_id ?? "");

  const obrasDaPessoa = obras.filter((o) => o.pessoa_id === pessoaId);
  const pedidosDaPessoa = pedidos.filter((p) => p.pessoa_id === pessoaId);

  return (
    <form
      action={upsertContratoAction}
      onSubmit={onSubmit}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: row ? undefined : "#f5f7f5", padding: row ? undefined : "12px", borderRadius: row ? undefined : "6px" }}
    >
      {row && <input type="hidden" name="id" value={row.id} />}

      <select
        name="tipo"
        value={tipo}
        disabled={!!row}
        onChange={(e) => {
          setTipo(e.target.value as Contrato["tipo"]);
          setPessoaId("");
        }}
        style={inputStyle}
      >
        <option value="cliente">Cliente</option>
        <option value="fornecedor">Fornecedor</option>
        <option value="funcionario">Funcionário/prestador</option>
      </select>

      {tipo === "funcionario" ? (
        <select name="funcionario_id" defaultValue={row?.funcionario_id ?? ""} required style={inputStyle}>
          <option value="">funcionário…</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
      ) : (
        <>
          <select name="pessoa_id" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} required style={inputStyle}>
            <option value="">{tipo === "cliente" ? "cliente…" : "fornecedor…"}</option>
            {(tipo === "cliente" ? clientes : fornecedores).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          {tipo === "cliente" && (
            <>
              <select name="obra_id" defaultValue={row?.obra_id ?? ""} style={inputStyle}>
                <option value="">obra (opcional)…</option>
                {obrasDaPessoa.map((o) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>
              <select name="pedido_id" defaultValue={row?.pedido_id ?? ""} style={inputStyle}>
                <option value="">pedido (opcional)…</option>
                {pedidosDaPessoa.map((p) => (
                  <option key={p.id} value={p.id}>{p.numero}</option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      <input name="objeto" placeholder="objeto do contrato" defaultValue={row?.objeto ?? ""} required style={{ ...inputStyle, width: "180px" }} />
      <input name="data_inicio" type="date" defaultValue={row?.data_inicio ?? ""} style={inputStyle} />
      <input name="data_fim" type="date" defaultValue={row?.data_fim ?? ""} style={inputStyle} />
      <select name="renovacao" defaultValue={row?.renovacao ?? "manual"} style={inputStyle}>
        <option value="manual">Renovação manual</option>
        <option value="automatica">Renovação automática</option>
      </select>
      <input name="valor" type="number" step="0.01" placeholder="valor" defaultValue={row?.valor ?? ""} style={{ ...inputStyle, width: "100px" }} />
      <input name="forma_pagamento" placeholder="forma de pagamento" defaultValue={row?.forma_pagamento ?? ""} style={{ ...inputStyle, width: "140px" }} />
      <input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} style={{ ...inputStyle, width: "160px" }} />
      <button type="submit" style={buttonStyle}>
        {row ? "Salvar" : "Criar rascunho"}
      </button>
    </form>
  );
}

function AcoesContrato({
  row,
  clientes,
  fornecedores,
  obras,
  pedidos,
  funcionarios,
}: {
  row: Contrato;
  clientes: Pessoa[];
  fornecedores: Pessoa[];
  obras: Obra[];
  pedidos: Pedido[];
  funcionarios: Funcionario[];
}) {
  const [modo, setModo] = useState<"nenhum" | "editar" | "encerrar">("nenhum");

  if (modo === "editar") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <ContratoForm row={row} clientes={clientes} fornecedores={fornecedores} obras={obras} pedidos={pedidos} funcionarios={funcionarios} onSubmit={() => setModo("nenhum")} />
        <button onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de", width: "fit-content" }}>
          Fechar
        </button>
      </div>
    );
  }

  if (modo === "encerrar") {
    return (
      <form action={encerrarContratoAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
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

  if (row.status === "rascunho") {
    return (
      <div style={{ display: "flex", gap: "4px" }}>
        <button onClick={() => setModo("editar")} style={buttonStyle}>
          Editar
        </button>
        <form action={ativarContratoAction}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" style={buttonStyle}>
            Ativar
          </button>
        </form>
      </div>
    );
  }

  if (row.status === "vigente") {
    return (
      <button onClick={() => setModo("encerrar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Encerrar
      </button>
    );
  }

  return null;
}
