"use client";

import { upsertPessoaAction, setPessoaPapelAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = {
  id: string;
  tipo_documento: string | null;
  documento: string | null;
  nome: string;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  situacao: "ativo" | "inativo" | "bloqueado";
};

type Papel = { pessoa_id: string; papel: "CLIENTE" | "FORNECEDOR"; ativo: boolean };

export default function PessoasSection({
  rows,
  papeis,
  canManage,
}: {
  rows: Pessoa[];
  papeis: Papel[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Pessoas</h2>
      <p style={hintStyle}>
        Cliente e fornecedor são papéis da mesma pessoa (TÓPICO 2 §4-6) — uma pessoa pode ter
        os dois ao mesmo tempo. Documento (CPF/CNPJ) não pode se repetir na empresa.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Documento</th>
              <th style={thStyle}>Contato</th>
              <th style={thStyle}>Papéis</th>
              <th style={thStyle}>Situação</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PessoaRow key={row.id} row={row} papeis={papeis} canManage={canManage} />
            ))}
            {canManage && <PessoaRow row={null} papeis={[]} canManage={canManage} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PessoaRow({ row, papeis, canManage }: { row: Pessoa | null; papeis: Papel[]; canManage: boolean }) {
  const temPapel = (papel: "CLIENTE" | "FORNECEDOR") =>
    row ? papeis.some((p) => p.pessoa_id === row.id && p.papel === papel && p.ativo) : false;

  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle} colSpan={canManage ? 6 : 5}>
        <form
          action={upsertPessoaAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          {row && <input type="hidden" name="id" value={row.id} />}
          <select name="tipo_documento" defaultValue={row?.tipo_documento ?? ""} disabled={!canManage} style={inputStyle}>
            <option value="">—</option>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
          </select>
          <input
            name="documento"
            placeholder="documento"
            defaultValue={row?.documento ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "130px" }}
          />
          <input
            name="nome"
            placeholder="nome / razão social"
            defaultValue={row?.nome ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "180px" }}
          />
          <input
            name="nome_fantasia"
            placeholder="nome fantasia"
            defaultValue={row?.nome_fantasia ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "130px" }}
          />
          <input
            name="telefone"
            placeholder="telefone"
            defaultValue={row?.telefone ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "110px" }}
          />
          <input
            name="email"
            placeholder="e-mail"
            defaultValue={row?.email ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "150px" }}
          />
          <input
            name="logradouro"
            placeholder="endereço"
            defaultValue={row?.logradouro ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "160px" }}
          />
          <input
            name="cidade"
            placeholder="cidade"
            defaultValue={row?.cidade ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "110px" }}
          />
          <input
            name="uf"
            placeholder="UF"
            defaultValue={row?.uf ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "44px" }}
          />
          <input
            name="cep"
            placeholder="CEP"
            defaultValue={row?.cep ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "90px" }}
          />
          <select name="situacao" defaultValue={row?.situacao ?? "ativo"} disabled={!canManage} style={inputStyle}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
          {canManage && (
            <button type="submit" style={buttonStyle}>
              {row ? "Salvar" : "Adicionar"}
            </button>
          )}
        </form>

        {row && (
          <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
            <PapelToggle pessoaId={row.id} papel="CLIENTE" ativo={temPapel("CLIENTE")} canManage={canManage} />
            <PapelToggle pessoaId={row.id} papel="FORNECEDOR" ativo={temPapel("FORNECEDOR")} canManage={canManage} />
          </div>
        )}
      </td>
    </tr>
  );
}

function PapelToggle({
  pessoaId,
  papel,
  ativo,
  canManage,
}: {
  pessoaId: string;
  papel: "CLIENTE" | "FORNECEDOR";
  ativo: boolean;
  canManage: boolean;
}) {
  return (
    <form action={setPessoaPapelAction} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input type="hidden" name="pessoa_id" value={pessoaId} />
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="ativo" value={ativo ? "" : "on"} />
      <label style={labelStyle}>
        <input type="checkbox" checked={ativo} disabled={!canManage} readOnly />
        {papel === "CLIENTE" ? "Cliente" : "Fornecedor"}
      </label>
      {canManage && (
        <button type="submit" style={{ ...buttonStyle, padding: "2px 6px", fontSize: "11px" }}>
          {ativo ? "Desligar" : "Ligar"}
        </button>
      )}
    </form>
  );
}
