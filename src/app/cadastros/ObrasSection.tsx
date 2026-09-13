"use client";

import { upsertObraAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Obra = {
  id: string;
  pessoa_id: string;
  nome: string;
  logradouro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  situacao: "ativo" | "inativo";
};

type Pessoa = { id: string; nome: string };

export default function ObrasSection({
  rows,
  todasPessoas,
  clienteIds,
  canManage,
}: {
  rows: Obra[];
  todasPessoas: Pessoa[];
  clienteIds: Set<string>;
  canManage: boolean;
}) {
  const clientesElegiveis = todasPessoas.filter((p) => clienteIds.has(p.id));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Obras</h2>
      <p style={hintStyle}>
        Registro mínimo — só o suficiente para Pedidos referenciar uma obra. Agenda, equipe e
        liberação de instalação entram com o módulo de Instalação (TÓPICO 16), mais adiante.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Obra</th>
              <th style={thStyle}>Endereço</th>
              <th style={thStyle}>Situação</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm
                key={row.id}
                row={row}
                todasPessoas={todasPessoas}
                clientesElegiveis={clientesElegiveis}
                canManage={canManage}
              />
            ))}
            {canManage && clientesElegiveis.length > 0 && (
              <RowForm row={null} todasPessoas={todasPessoas} clientesElegiveis={clientesElegiveis} canManage={canManage} />
            )}
          </tbody>
        </table>
      </div>
      {canManage && clientesElegiveis.length === 0 && (
        <p style={hintStyle}>
          Nenhuma pessoa com papel Cliente ativo ainda — cadastre um cliente acima antes de criar
          uma obra.
        </p>
      )}
    </section>
  );
}

function RowForm({
  row,
  todasPessoas,
  clientesElegiveis,
  canManage,
}: {
  row: Obra | null;
  todasPessoas: Pessoa[];
  clientesElegiveis: Pessoa[];
  canManage: boolean;
}) {
  // Uma obra já existente pode ter sido vinculada a um cliente cujo papel
  // CLIENTE foi desligado depois — sem isso, o <select> não acha
  // row.pessoa_id entre as opções, o navegador cai pra outra opção
  // qualquer, e salvar qualquer outro campo reatribuiria a obra pro
  // cliente errado silenciosamente. Sempre incluir o dono atual resolve.
  const donoAtual = row ? todasPessoas.find((p) => p.id === row.pessoa_id) : undefined;
  const opcoes =
    donoAtual && !clientesElegiveis.some((p) => p.id === donoAtual.id)
      ? [donoAtual, ...clientesElegiveis]
      : clientesElegiveis;

  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle} colSpan={canManage ? 5 : 4}>
        <form
          action={upsertObraAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          {row && <input type="hidden" name="id" value={row.id} />}
          <select name="pessoa_id" defaultValue={row?.pessoa_id ?? ""} required disabled={!canManage} style={inputStyle}>
            <option value="" disabled>
              Cliente
            </option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {donoAtual?.id === p.id && !clientesElegiveis.some((c) => c.id === p.id) ? " (papel desligado)" : ""}
              </option>
            ))}
          </select>
          <input
            name="nome"
            placeholder="nome da obra"
            defaultValue={row?.nome ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "180px" }}
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
          </select>
          {canManage && (
            <button type="submit" style={buttonStyle}>
              {row ? "Salvar" : "Adicionar"}
            </button>
          )}
        </form>
      </td>
    </tr>
  );
}
