"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  aprovarContratoAction,
  cancelarContratoAction,
  deleteContratoAnexoAction,
  encerrarContratoAction,
  enviarContratoParaAprovacaoAction,
  gerarTitulosContratoAction,
  getContratoAnexoSignedUrlAction,
  reprovarContratoAction,
  retomarContratoAction,
  suspenderContratoAction,
  upsertContratoAction,
  uploadContratoAnexoAction,
} from "./actions";
import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_UPLOAD } from "@/lib/storage/constants";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const TIPO_LABEL: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  funcionario: "Funcionário/prestador",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_aprovacao: "Em aprovação",
  vigente: "Vigente",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
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
  status: "rascunho" | "em_aprovacao" | "vigente" | "suspenso" | "encerrado" | "cancelado";
  motivo_encerramento: string | null;
  motivo_suspensao: string | null;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  garantia_inicio: string | null;
  garantia_fim: string | null;
  parcelas: number | null;
  reajuste_previsto: string | null;
  assinatura_referencia_externa: string | null;
};

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string; pessoa_id: string };
type Pedido = { id: string; numero: string; pessoa_id: string };
type Funcionario = { id: string; nome: string };
type Anexo = {
  id: string;
  entity_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export default function ContratosSection({
  rows,
  pessoas,
  clientes,
  fornecedores,
  obras,
  pedidos,
  funcionarios,
  contratoIdsComTitulo,
  anexos,
  canManage,
  canAprovar,
  canGerarTitulos,
}: {
  rows: Contrato[];
  pessoas: Pessoa[];
  clientes: Pessoa[];
  fornecedores: Pessoa[];
  obras: Obra[];
  pedidos: Pedido[];
  funcionarios: Funcionario[];
  contratoIdsComTitulo: Set<string>;
  anexos: Anexo[];
  canManage: boolean;
  canAprovar: boolean;
  canGerarTitulos: boolean;
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

  function motivoAtual(row: Contrato): string | null {
    if (row.status === "encerrado") return row.motivo_encerramento;
    if (row.status === "suspenso") return row.motivo_suspensao;
    if (row.status === "cancelado") return row.motivo_cancelamento;
    return null;
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>Contratos</h2>
      <p style={hintStyle}>
        Cliente, fornecedor ou funcionário/prestador — uma estrutura genérica só. Ciclo de vida
        completo: rascunho → em aprovação → vigente → suspenso → encerrado, com cancelamento
        possível antes de vigorar. Editar é possível só enquanto o contrato está em rascunho.
      </p>

      {canManage && (
        <ContratoForm row={null} clientes={clientes} fornecedores={fornecedores} obras={obras} pedidos={pedidos} funcionarios={funcionarios} />
      )}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Vínculo</th>
              <th style={thStyle}>Objeto</th>
              <th style={thStyle}>Vigência</th>
              <th style={thStyle}>Garantia</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Anexos</th>
              {(canManage || canAprovar) && <th style={thStyle}></th>}
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
                  {row.garantia_inicio || row.garantia_fim ? `${row.garantia_inicio ?? "—"} a ${row.garantia_fim ?? "—"}` : "—"}
                </td>
                <td style={tdStyle}>
                  {STATUS_LABEL[row.status]}
                  {motivoAtual(row) && ` — ${motivoAtual(row)}`}
                </td>
                <td style={tdStyle}>
                  <ContratoAnexos
                    contratoId={row.id}
                    anexos={anexos.filter((a) => a.entity_id === row.id)}
                    canManage={canManage}
                  />
                </td>
                {(canManage || canAprovar) && (
                  <td style={tdStyle}>
                    <AcoesContrato
                      row={row}
                      clientes={clientes}
                      fornecedores={fornecedores}
                      obras={obras}
                      pedidos={pedidos}
                      funcionarios={funcionarios}
                      canManage={canManage}
                      canAprovar={canAprovar}
                      canGerarTitulos={canGerarTitulos}
                      jaTemTitulo={contratoIdsComTitulo.has(row.id)}
                    />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage || canAprovar ? 9 : 8}>
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
      <input name="data_inicio" type="date" defaultValue={row?.data_inicio ?? ""} style={inputStyle} title="data de início" />
      <input name="data_fim" type="date" defaultValue={row?.data_fim ?? ""} style={inputStyle} title="data de fim (vigência)" />
      <select name="renovacao" defaultValue={row?.renovacao ?? "manual"} style={inputStyle}>
        <option value="manual">Renovação manual</option>
        <option value="automatica">Renovação automática</option>
      </select>
      <input name="valor" type="number" step="0.01" placeholder="valor" defaultValue={row?.valor ?? ""} style={{ ...inputStyle, width: "100px" }} />
      <input name="forma_pagamento" placeholder="forma de pagamento" defaultValue={row?.forma_pagamento ?? ""} style={{ ...inputStyle, width: "140px" }} />
      <input name="parcelas" type="number" min="1" placeholder="nº parcelas" defaultValue={row?.parcelas ?? ""} style={{ ...inputStyle, width: "90px" }} />
      <input name="reajuste_previsto" placeholder="reajuste previsto (opcional)" defaultValue={row?.reajuste_previsto ?? ""} style={{ ...inputStyle, width: "150px" }} />
      {tipo === "cliente" && (
        <>
          <input name="garantia_inicio" type="date" defaultValue={row?.garantia_inicio ?? ""} style={inputStyle} title="início da garantia" />
          <input name="garantia_fim" type="date" defaultValue={row?.garantia_fim ?? ""} style={inputStyle} title="fim da garantia" />
        </>
      )}
      <input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} style={{ ...inputStyle, width: "160px" }} />
      <input
        name="assinatura_referencia_externa"
        placeholder="referência de assinatura eletrônica (opcional)"
        defaultValue={row?.assinatura_referencia_externa ?? ""}
        title="Gancho pra assinatura eletrônica futura (§10) — ex.: id de envelope do DocuSign/Clicksign. Nenhum provedor é integrado nesta fase."
        style={{ ...inputStyle, width: "200px" }}
      />
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
  canManage,
  canAprovar,
  canGerarTitulos,
  jaTemTitulo,
}: {
  row: Contrato;
  clientes: Pessoa[];
  fornecedores: Pessoa[];
  obras: Obra[];
  pedidos: Pedido[];
  funcionarios: Funcionario[];
  canManage: boolean;
  canAprovar: boolean;
  canGerarTitulos: boolean;
  jaTemTitulo: boolean;
}) {
  const [modo, setModo] = useState<"nenhum" | "editar" | "encerrar" | "suspender" | "reprovar" | "cancelar" | "gerar_titulos">("nenhum");

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

  if (modo === "encerrar" || modo === "suspender" || modo === "reprovar" || modo === "cancelar") {
    const action = { encerrar: encerrarContratoAction, suspender: suspenderContratoAction, reprovar: reprovarContratoAction, cancelar: cancelarContratoAction }[modo];
    return (
      <form action={action} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
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

  if (modo === "gerar_titulos") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <GerarTitulosContratoForm contratoId={row.id} onSubmit={() => setModo("nenhum")} />
        <button onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de", width: "fit-content" }}>
          Fechar
        </button>
      </div>
    );
  }

  const botoes: ReactNode[] = [];

  if (row.status === "rascunho" && canManage) {
    botoes.push(
      <button key="editar" onClick={() => setModo("editar")} style={buttonStyle}>
        Editar
      </button>,
    );
    botoes.push(
      <form key="enviar" action={enviarContratoParaAprovacaoAction} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" style={buttonStyle}>
          Enviar p/ aprovação
        </button>
      </form>,
    );
    botoes.push(
      <button key="cancelar" onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Cancelar
      </button>,
    );
  }

  if (row.status === "em_aprovacao") {
    if (canAprovar) {
      botoes.push(
        <form key="aprovar" action={aprovarContratoAction} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" style={buttonStyle}>
            Aprovar
          </button>
        </form>,
      );
      botoes.push(
        <button key="reprovar" onClick={() => setModo("reprovar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Reprovar
        </button>,
      );
    }
    if (canManage) {
      botoes.push(
        <button key="cancelar" onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Cancelar
        </button>,
      );
    }
  }

  if (row.status === "vigente" && canManage) {
    botoes.push(
      <button key="suspender" onClick={() => setModo("suspender")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
        Suspender
      </button>,
    );
    botoes.push(
      <button key="encerrar" onClick={() => setModo("encerrar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Encerrar
      </button>,
    );
    if (row.tipo === "cliente" && canGerarTitulos && !jaTemTitulo) {
      botoes.push(
        <button key="gerar_titulos" onClick={() => setModo("gerar_titulos")} style={buttonStyle}>
          Gerar título(s)
        </button>,
      );
    }
  }

  if (row.status === "suspenso" && canManage) {
    botoes.push(
      <form key="retomar" action={retomarContratoAction} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" style={buttonStyle}>
          Retomar
        </button>
      </form>,
    );
    botoes.push(
      <button key="encerrar" onClick={() => setModo("encerrar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Encerrar
      </button>,
    );
  }

  if (botoes.length === 0) return null;

  return <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>{botoes}</div>;
}

function GerarTitulosContratoForm({ contratoId, onSubmit }: { contratoId: string; onSubmit?: () => void }) {
  const [parcelas, setParcelas] = useState([{ key: 0 }]);
  const nextKeyRef = useRef(1);

  return (
    <form action={gerarTitulosContratoAction} onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <button type="button" onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #1f5d57" }}>
          + parcela
        </button>
      </div>
      {parcelas.map((row, i) => (
        <div key={row.key} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "100px" }} />
          <input name="parcela_vencimento" type="date" required style={inputStyle} />
          <input name="parcela_condicao" placeholder="condição (opcional)" style={{ ...inputStyle, width: "120px" }} />
          {parcelas.length > 1 && (
            <button type="button" onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              remover
            </button>
          )}
        </div>
      ))}
      <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>
        Gerar título(s)
      </button>
    </form>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// §8 — anexo de documento do contrato. Upload exige contratos.manage (RPC
// register_file() checa isso — este componente só aparece pra quem já tem
// canManage, mas a checagem real é sempre no banco, nunca só a UI).
function ContratoAnexos({ contratoId, anexos, canManage }: { contratoId: string; anexos: Anexo[]; canManage: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const url = await getContratoAnexoSignedUrlAction(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteContratoAnexoAction(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover arquivo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;
    if (files.length > MAX_FILES_PER_UPLOAD) {
      setError(`Selecione no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez.`);
      return;
    }

    setUploading(true);
    setError(null);
    const failed: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        failed.push(`${file.name}: excede ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MiB.`);
        continue;
      }
      const fd = new FormData();
      fd.set("contrato_id", contratoId);
      fd.set("file", file);
      try {
        const result = await uploadContratoAnexoAction(fd);
        if (!result.ok) failed.push(`${result.name}: ${result.error}`);
      } catch {
        failed.push(`${file.name}: falha ao enviar (arquivo grande demais ou conexão interrompida).`);
      }
    }
    setUploading(false);
    setError(failed.length > 0 ? failed.join(" | ") : null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "150px" }}>
      {anexos.length === 0 && <span style={{ fontSize: "11px", color: "#7c8f89" }}>Sem anexos.</span>}
      {anexos.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px" }}>
          <button
            type="button"
            onClick={() => handleDownload(a.id)}
            disabled={busyId === a.id}
            title={formatSize(a.size_bytes)}
            style={{ background: "none", border: "none", padding: 0, color: "#1f5d57", cursor: "pointer", textDecoration: "underline" }}
          >
            {a.original_name}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => handleDelete(a.id)}
              disabled={busyId === a.id}
              style={{ background: "none", border: "none", padding: 0, color: "#9b2c2c", cursor: "pointer", fontSize: "11px" }}
            >
              remover
            </button>
          )}
        </div>
      ))}
      {canManage && (
        <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            style={{ fontSize: "10px", maxWidth: "150px" }}
          />
          <button type="submit" disabled={uploading} style={{ ...buttonStyle, fontSize: "10px", padding: "2px 6px", width: "fit-content" }}>
            {uploading ? "Enviando..." : "Anexar"}
          </button>
        </form>
      )}
      {error && <span style={{ fontSize: "10px", color: "#9b2c2c" }}>{error}</span>}
    </div>
  );
}
