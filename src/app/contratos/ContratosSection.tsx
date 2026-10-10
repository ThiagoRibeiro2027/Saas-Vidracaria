"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
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
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  rascunho: "neutral",
  em_aprovacao: "warning",
  vigente: "success",
  suspenso: "warning",
  encerrado: "neutral",
  cancelado: "danger",
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

// 2026-10-04: migrada do estilo próprio (inline style) pros componentes
// padrão do resto do app, e pro mesmo tratamento de layout já aplicado
// nos demais módulos — lista compacta e paginada no servidor; clicar
// expande, na própria tabela, objeto/vigência/garantia/anexos/ações.
export default function ContratosSection({
  rows,
  paginacao,
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
  paginacao: PaginacaoInfo;
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

  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [criandoAberto, setCriandoAberto] = useState(false);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Contratos</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cliente, fornecedor ou funcionário/prestador — uma estrutura genérica só. Ciclo de vida
        completo: rascunho → em aprovação → vigente → suspenso → encerrado, com cancelamento
        possível antes de vigorar. Editar é possível só enquanto o contrato está em rascunho.
        Clique num contrato para ver detalhes, anexos e ações.
      </p>

      {canManage && (
        <div className="mt-3">
          {!criandoAberto ? (
            <Button type="button" variant="primary" onClick={() => setCriandoAberto(true)}>
              + Novo contrato
            </Button>
          ) : (
            <ContratoForm
              row={null}
              clientes={clientes}
              fornecedores={fornecedores}
              obras={obras}
              pedidos={pedidos}
              funcionarios={funcionarios}
              onSubmit={() => setCriandoAberto(false)}
            />
          )}
        </div>
      )}

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch placeholder="Buscar por número..." />
        <FiltroTipoContrato />
        <FiltroStatusContrato />
      </div>

      <Paginacao {...paginacao} posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <SortableTh field="numero">Número</SortableTh>
            <SortableTh field="tipo">Tipo</SortableTh>
            <Th>Vínculo</Th>
            <SortableTh field="status">Status</SortableTh>
            <Th className="w-6" />
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => {
              const expandido = expandidoId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setExpandidoId((atual) => (atual === row.id ? null : row.id))}
                    className="cursor-pointer hover:bg-page-bg"
                  >
                    <Td className="font-medium text-text">{row.numero}</Td>
                    <Td>{TIPO_LABEL[row.tipo]}</Td>
                    <Td className="text-text-muted">{vinculo(row)}</Td>
                    <Td>
                      <StatusPill tone={STATUS_TONE[row.status]}>
                        {STATUS_LABEL[row.status]}
                        {motivoAtual(row) && ` — ${motivoAtual(row)}`}
                      </StatusPill>
                    </Td>
                    <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {expandido && (
                    <tr>
                      <Td colSpan={5} className="bg-page-bg">
                        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                          <div className="w-full">
                            <dt className="text-text-muted">Objeto</dt>
                            <dd className="text-text">{row.objeto}</dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Vigência</dt>
                            <dd className="text-text">{row.data_inicio ?? "—"} a {row.data_fim ?? "—"}</dd>
                          </div>
                          {row.tipo === "cliente" && (row.garantia_inicio || row.garantia_fim) && (
                            <div>
                              <dt className="text-text-muted">Garantia</dt>
                              <dd className="text-text">{row.garantia_inicio ?? "—"} a {row.garantia_fim ?? "—"}</dd>
                            </div>
                          )}
                          {row.valor !== null && (
                            <div>
                              <dt className="text-text-muted">Valor</dt>
                              <dd className="text-text">
                                {row.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                {row.parcelas ? ` em ${row.parcelas}x` : ""}
                              </dd>
                            </div>
                          )}
                          {row.forma_pagamento && (
                            <div>
                              <dt className="text-text-muted">Forma de pagamento</dt>
                              <dd className="text-text">{row.forma_pagamento}</dd>
                            </div>
                          )}
                          {row.observacoes && (
                            <div className="w-full">
                              <dt className="text-text-muted">Observações</dt>
                              <dd className="text-text">{row.observacoes}</dd>
                            </div>
                          )}
                        </dl>

                        <div className="mt-2">
                          <p className="mb-1 text-xs font-medium text-text">Anexos</p>
                          <ContratoAnexos
                            contratoId={row.id}
                            anexos={anexos.filter((a) => a.entity_id === row.id)}
                            canManage={canManage}
                          />
                        </div>

                        {(canManage || canAprovar) && (
                          <div className="mt-2">
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
                          </div>
                        )}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-text-muted">
                  Nenhum contrato registrado ainda.
                </Td>
              </tr>
            )}
          </tbody>
      </DenseTable>
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
      className={`flex flex-wrap items-center gap-1.5 ${row ? "" : "rounded-md bg-page-bg p-3"}`}
    >
      {row && <input type="hidden" name="id" value={row.id} />}

      <Select
        name="tipo"
        value={tipo}
        disabled={!!row}
        onChange={(e) => {
          setTipo(e.target.value as Contrato["tipo"]);
          setPessoaId("");
        }}
      >
        <option value="cliente">Cliente</option>
        <option value="fornecedor">Fornecedor</option>
        <option value="funcionario">Funcionário/prestador</option>
      </Select>

      {tipo === "funcionario" ? (
        <Select name="funcionario_id" defaultValue={row?.funcionario_id ?? ""} required>
          <option value="">funcionário…</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </Select>
      ) : (
        <>
          <Select name="pessoa_id" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} required>
            <option value="">{tipo === "cliente" ? "cliente…" : "fornecedor…"}</option>
            {(tipo === "cliente" ? clientes : fornecedores).map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </Select>
          {tipo === "cliente" && (
            <>
              <Select name="obra_id" defaultValue={row?.obra_id ?? ""}>
                <option value="">obra (opcional)…</option>
                {obrasDaPessoa.map((o) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </Select>
              <Select name="pedido_id" defaultValue={row?.pedido_id ?? ""}>
                <option value="">pedido (opcional)…</option>
                {pedidosDaPessoa.map((p) => (
                  <option key={p.id} value={p.id}>{p.numero}</option>
                ))}
              </Select>
            </>
          )}
        </>
      )}

      <Input name="objeto" placeholder="objeto do contrato" defaultValue={row?.objeto ?? ""} required className="w-44" />
      <Input name="data_inicio" type="date" defaultValue={row?.data_inicio ?? ""} title="data de início" />
      <Input name="data_fim" type="date" defaultValue={row?.data_fim ?? ""} title="data de fim (vigência)" />
      <Select name="renovacao" defaultValue={row?.renovacao ?? "manual"}>
        <option value="manual">Renovação manual</option>
        <option value="automatica">Renovação automática</option>
      </Select>
      <Input name="valor" type="number" step="0.01" placeholder="valor" defaultValue={row?.valor ?? ""} className="w-24" />
      <Input name="forma_pagamento" placeholder="forma de pagamento" defaultValue={row?.forma_pagamento ?? ""} className="w-36" />
      <Input name="parcelas" type="number" min="1" placeholder="nº parcelas" defaultValue={row?.parcelas ?? ""} className="w-24" />
      <Input name="reajuste_previsto" placeholder="reajuste previsto (opcional)" defaultValue={row?.reajuste_previsto ?? ""} className="w-40" />
      {tipo === "cliente" && (
        <>
          <Input name="garantia_inicio" type="date" defaultValue={row?.garantia_inicio ?? ""} title="início da garantia" />
          <Input name="garantia_fim" type="date" defaultValue={row?.garantia_fim ?? ""} title="fim da garantia" />
        </>
      )}
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-40" />
      <Input
        name="assinatura_referencia_externa"
        placeholder="referência de assinatura eletrônica (opcional)"
        defaultValue={row?.assinatura_referencia_externa ?? ""}
        title="Gancho pra assinatura eletrônica futura (§10) — ex.: id de envelope do DocuSign/Clicksign. Nenhum provedor é integrado nesta fase."
        className="w-56"
      />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Criar rascunho"}
      </Button>
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
      <div className="flex flex-col gap-1">
        <ContratoForm row={row} clientes={clientes} fornecedores={fornecedores} obras={obras} pedidos={pedidos} funcionarios={funcionarios} onSubmit={() => setModo("nenhum")} />
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setModo("nenhum")}>
          Fechar
        </Button>
      </div>
    );
  }

  if (modo === "encerrar" || modo === "suspender" || modo === "reprovar" || modo === "cancelar") {
    const action = { encerrar: encerrarContratoAction, suspender: suspenderContratoAction, reprovar: reprovarContratoAction, cancelar: cancelarContratoAction }[modo];
    return (
      <form action={action} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-32" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "gerar_titulos") {
    return (
      <div className="flex flex-col gap-1">
        <GerarTitulosContratoForm contratoId={row.id} onSubmit={() => setModo("nenhum")} />
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setModo("nenhum")}>
          Fechar
        </Button>
      </div>
    );
  }

  const botoes: ReactNode[] = [];

  if (row.status === "rascunho" && canManage) {
    botoes.push(
      <Button key="editar" type="button" variant="primary" onClick={() => setModo("editar")}>
        Editar
      </Button>,
    );
    botoes.push(
      <form key="enviar" action={enviarContratoParaAprovacaoAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="secondary">
          Enviar p/ aprovação
        </Button>
      </form>,
    );
    botoes.push(
      <Button key="cancelar" type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
        Cancelar
      </Button>,
    );
  }

  if (row.status === "em_aprovacao") {
    if (canAprovar) {
      botoes.push(
        <form key="aprovar" action={aprovarContratoAction}>
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" variant="primary">
            Aprovar
          </Button>
        </form>,
      );
      botoes.push(
        <Button key="reprovar" type="button" variant="outlineDanger" onClick={() => setModo("reprovar")}>
          Reprovar
        </Button>,
      );
    }
    if (canManage) {
      botoes.push(
        <Button key="cancelar" type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
          Cancelar
        </Button>,
      );
    }
  }

  if (row.status === "vigente" && canManage) {
    botoes.push(
      <Button key="suspender" type="button" variant="secondary" onClick={() => setModo("suspender")}>
        Suspender
      </Button>,
    );
    botoes.push(
      <Button key="encerrar" type="button" variant="outlineDanger" onClick={() => setModo("encerrar")}>
        Encerrar
      </Button>,
    );
    if (row.tipo === "cliente" && canGerarTitulos && !jaTemTitulo) {
      botoes.push(
        <Button key="gerar_titulos" type="button" variant="primary" onClick={() => setModo("gerar_titulos")}>
          Gerar título(s)
        </Button>,
      );
    }
  }

  if (row.status === "suspenso" && canManage) {
    botoes.push(
      <form key="retomar" action={retomarContratoAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="primary">
          Retomar
        </Button>
      </form>,
    );
    botoes.push(
      <Button key="encerrar" type="button" variant="outlineDanger" onClick={() => setModo("encerrar")}>
        Encerrar
      </Button>,
    );
  }

  if (botoes.length === 0) return null;

  return <div className="flex flex-wrap items-center gap-1.5">{botoes}</div>;
}

function GerarTitulosContratoForm({ contratoId, onSubmit }: { contratoId: string; onSubmit?: () => void }) {
  const [parcelas, setParcelas] = useState([{ key: 0 }]);
  const nextKeyRef = useRef(1);

  return (
    <form action={gerarTitulosContratoAction} onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md bg-page-bg p-3">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])}>
          + parcela
        </Button>
      </div>
      {parcelas.map((row, i) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <Input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-24" />
          <Input name="parcela_vencimento" type="date" required />
          <Input name="parcela_condicao" placeholder="condição (opcional)" className="w-28" />
          {parcelas.length > 1 && (
            <Button type="button" variant="outlineDanger" onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))}>
              remover
            </Button>
          )}
        </div>
      ))}
      <Button type="submit" variant="primary" className="w-fit">
        Gerar título(s)
      </Button>
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
    <div className="flex flex-col gap-1">
      {anexos.length === 0 && <span className="text-xs text-text-muted">Sem anexos.</span>}
      {anexos.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleDownload(a.id)}
            disabled={busyId === a.id}
            title={formatSize(a.size_bytes)}
            className="cursor-pointer text-primary underline disabled:opacity-50"
          >
            {a.original_name}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => handleDelete(a.id)}
              disabled={busyId === a.id}
              className="cursor-pointer text-danger disabled:opacity-50"
            >
              remover
            </button>
          )}
        </div>
      ))}
      {canManage && (
        <form onSubmit={handleUpload} className="mt-1 flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="max-w-[220px] text-xs text-text"
          />
          <Button type="submit" size="sm" disabled={uploading} className="w-fit">
            {uploading ? "Enviando..." : "Anexar"}
          </Button>
        </form>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function FiltroTipoContrato() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("tipo") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("tipo", novoValor);
    else p.delete("tipo");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por tipo"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todos os tipos</option>
      {(Object.entries(TIPO_LABEL) as [string, string][]).map(([valorOpcao, rotulo]) => (
        <option key={valorOpcao} value={valorOpcao}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}

function FiltroStatusContrato() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("status") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("status", novoValor);
    else p.delete("status");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por status"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todos os status</option>
      {(Object.entries(STATUS_LABEL) as [string, string][]).map(([valorOpcao, rotulo]) => (
        <option key={valorOpcao} value={valorOpcao}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}
