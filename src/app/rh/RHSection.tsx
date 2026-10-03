"use client";

import { useRef, useState } from "react";
import {
  cancelarAfastamentoAction,
  cancelarDocumentoFuncionarioAction,
  deleteDocumentoFuncionarioAnexoAction,
  getDocumentoFuncionarioAnexoSignedUrlAction,
  desligarFuncionarioAction,
  encerrarAfastamentoAction,
  registrarAfastamentoAction,
  registrarDocumentoFuncionarioAction,
  uploadDocumentoFuncionarioAnexoAction,
  upsertFuncionarioAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_UPLOAD } from "@/lib/storage/constants";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning"> = {
  ativo: "success",
  afastado: "warning",
  desligado: "neutral",
};

const TIPO_DOCUMENTO_LABEL: Record<string, string> = {
  admissao: "Documento de admissão",
  certificacao: "Certificação/treinamento",
  epi: "EPI",
  habilitacao: "Habilitação de equipamento",
};

const TIPO_AFASTAMENTO_LABEL: Record<string, string> = {
  afastamento: "Afastamento",
  ferias: "Férias",
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

type Anexo = {
  id: string;
  entity_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type Recurso = { id: string; codigo: string; nome: string; tipo: string };

type Documento = {
  id: string;
  funcionario_id: string;
  tipo: "admissao" | "certificacao" | "epi" | "habilitacao";
  nome: string;
  data_referencia: string | null;
  validade: string | null;
  observacoes: string | null;
  status: "ativo" | "cancelado";
  motivo_cancelamento: string | null;
  recurso_produtivo_id: string | null;
};

type Afastamento = {
  id: string;
  funcionario_id: string;
  tipo: "afastamento" | "ferias";
  data_inicio: string;
  data_fim: string | null;
  motivo: string | null;
  observacoes: string | null;
  status: "ativo" | "cancelado";
  motivo_cancelamento: string | null;
};

type Unidade = { id: string; name: string };
type Profile = { id: string; display_name: string; login_identifier: string };

export default function RHSection({
  rows,
  unidades,
  profiles,
  documentos,
  afastamentos,
  recursos,
  anexos,
  canManage,
}: {
  rows: Funcionario[];
  unidades: Unidade[];
  profiles: Profile[];
  documentos: Documento[];
  afastamentos: Afastamento[];
  recursos: Recurso[];
  anexos: Anexo[];
  canManage: boolean;
}) {
  const unidadePorId = new Map(unidades.map((u) => [u.id, u.name]));
  const profilePorId = new Map(profiles.map((p) => [p.id, `${p.display_name} (${p.login_identifier})`]));
  const funcionarioPorId = new Map(rows.map((r) => [r.id, r.nome]));
  const profileIdsEmUso = new Set(rows.filter((r) => r.status !== "desligado" && r.profile_id).map((r) => r.profile_id));
  const funcionariosAtivos = rows.filter((r) => r.status !== "desligado");

  const recursoPorId = new Map(recursos.map((r) => [r.id, r.nome]));
  const anexosPorDocumento = new Map<string, Anexo[]>();
  for (const a of anexos) anexosPorDocumento.set(a.entity_id, [...(anexosPorDocumento.get(a.entity_id) ?? []), a]);

  return (
    <>
      <section>
        <h2 className="text-sm font-semibold text-text">Funcionários</h2>
        <p className="mt-1 text-xs text-text-muted">
          Cadastro de funcionários, vínculo com usuário do sistema e desligamento (que revoga o
          acesso do usuário vinculado). Sem folha de pagamento, encargos, rescisão, escala ou ponto.
        </p>

        {canManage && (
          <div className="mt-3">
            <FuncionarioForm row={null} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id))} />
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cargo/Função</Th>
                <Th>Unidade</Th>
                <Th>Usuário vinculado</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>{row.nome}</Td>
                  <Td>{[row.cargo, row.funcao].filter(Boolean).join(" — ") || "—"}</Td>
                  <Td>{row.unidade_id ? unidadePorId.get(row.unidade_id) ?? "—" : "—"}</Td>
                  <Td>{row.profile_id ? profilePorId.get(row.profile_id) ?? "—" : "—"}</Td>
                  <Td>
                    <Badge variant={STATUS_TONE[row.status]}>
                      {STATUS_LABEL[row.status]}
                      {row.status === "desligado" && row.motivo_desligamento && ` — ${row.motivo_desligamento}`}
                    </Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      {row.status !== "desligado" && (
                        <AcoesFuncionario row={row} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id) || p.id === row.profile_id)} />
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Documentos, EPI e habilitações</h2>
        <p className="mt-1 text-xs text-text-muted">
          Documento de admissão, certificação/treinamento, entrega de EPI e habilitação para operar
          equipamento — uma estrutura só, com vínculo opcional a um recurso produtivo cadastrado
          quando o tipo for habilitação. O arquivo do comprovante (PDF ou imagem) é anexado na própria linha do documento.
          Cancelar corrige um registro errado, sem apagar o histórico.
        </p>

        {canManage && (
          <div className="mt-3">
            <DocumentoForm funcionarios={funcionariosAtivos} recursos={recursos} />
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Funcionário</Th>
                <Th>Tipo</Th>
                <Th>Nome</Th>
                <Th>Referência</Th>
                <Th>Validade</Th>
                <Th>Anexos</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc) => (
                <tr key={doc.id}>
                  <Td>{funcionarioPorId.get(doc.funcionario_id) ?? "—"}</Td>
                  <Td>
                    {TIPO_DOCUMENTO_LABEL[doc.tipo]}
                    {doc.recurso_produtivo_id && ` (${recursoPorId.get(doc.recurso_produtivo_id) ?? "recurso removido"})`}
                  </Td>
                  <Td>{doc.nome}</Td>
                  <Td>{doc.data_referencia ?? "—"}</Td>
                  <Td>{doc.validade ?? "—"}</Td>
                  <Td>
                    <DocumentoAnexos
                      documentoId={doc.id}
                      anexos={anexosPorDocumento.get(doc.id) ?? []}
                      canManage={canManage && doc.status === "ativo"}
                    />
                  </Td>
                  <Td>
                    <Badge variant={doc.status === "ativo" ? "success" : "danger"}>
                      {doc.status === "ativo" ? "Ativo" : `Cancelado${doc.motivo_cancelamento ? ` — ${doc.motivo_cancelamento}` : ""}`}
                    </Badge>
                  </Td>
                  {canManage && <Td>{doc.status === "ativo" && <CancelarDocumentoBotao id={doc.id} />}</Td>}
                </tr>
              ))}
              {documentos.length === 0 && (
                <tr>
                  <Td colSpan={canManage ? 8 : 7}>Nenhum documento registrado ainda.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Afastamentos e férias</h2>
        <p className="mt-1 text-xs text-text-muted">
          Registro simples de período (datas e motivo), sem cálculo de valores ou encargos —
          desacoplado do status do funcionário.
        </p>

        {canManage && (
          <div className="mt-3">
            <AfastamentoForm funcionarios={funcionariosAtivos} />
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Funcionário</Th>
                <Th>Tipo</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Motivo</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {afastamentos.map((af) => (
                <tr key={af.id}>
                  <Td>{funcionarioPorId.get(af.funcionario_id) ?? "—"}</Td>
                  <Td>{TIPO_AFASTAMENTO_LABEL[af.tipo]}</Td>
                  <Td>{af.data_inicio}</Td>
                  <Td>{af.data_fim ?? "em aberto"}</Td>
                  <Td>{af.motivo ?? "—"}</Td>
                  <Td>
                    <Badge variant={af.status === "ativo" ? "success" : "danger"}>
                      {af.status === "ativo" ? "Ativo" : `Cancelado${af.motivo_cancelamento ? ` — ${af.motivo_cancelamento}` : ""}`}
                    </Badge>
                  </Td>
                  {canManage && <Td>{af.status === "ativo" && <AcoesAfastamento row={af} />}</Td>}
                </tr>
              ))}
              {afastamentos.length === 0 && (
                <tr>
                  <Td colSpan={canManage ? 7 : 6}>Nenhum período registrado ainda.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </section>
    </>
  );
}

function FuncionarioForm({ row, unidades, profiles, onSubmit }: { row: Funcionario | null; unidades: Unidade[]; profiles: Profile[]; onSubmit?: () => void }) {
  return (
    <form
      action={upsertFuncionarioAction}
      onSubmit={onSubmit}
      className={`flex flex-wrap items-center gap-1.5 ${row ? "" : "rounded-md bg-page-bg p-3"}`}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <Input name="nome" placeholder="nome" defaultValue={row?.nome ?? ""} required className="w-40" />
      <Input name="cargo" placeholder="cargo" defaultValue={row?.cargo ?? ""} className="w-28" />
      <Input name="funcao" placeholder="função" defaultValue={row?.funcao ?? ""} className="w-28" />
      <Select name="unidade_id" defaultValue={row?.unidade_id ?? ""}>
        <option value="">unidade…</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </Select>
      <Input name="data_admissao" type="date" defaultValue={row?.data_admissao ?? ""} />
      <Input name="telefone" placeholder="telefone" defaultValue={row?.telefone ?? ""} className="w-28" />
      <Select name="profile_id" defaultValue={row?.profile_id ?? ""}>
        <option value="">sem usuário vinculado</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name} ({p.login_identifier})</option>
        ))}
      </Select>
      <Select name="status" defaultValue={row?.status ?? "ativo"}>
        <option value="ativo">Ativo</option>
        <option value="afastado">Afastado</option>
      </Select>
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Admitir"}
      </Button>
    </form>
  );
}

function AcoesFuncionario({ row, unidades, profiles }: { row: Funcionario; unidades: Unidade[]; profiles: Profile[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar" | "desligar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <FuncionarioForm row={row} unidades={unidades} profiles={profiles} onSubmit={() => setModo("nenhum")} />
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setModo("nenhum")}>
          Fechar
        </Button>
      </div>
    );
  }

  if (modo === "desligar") {
    return (
      <form action={desligarFuncionarioAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="data_desligamento" type="date" />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="primary" onClick={() => setModo("editar")}>
        Editar
      </Button>
      <Button type="button" variant="outlineDanger" onClick={() => setModo("desligar")}>
        Desligar
      </Button>
    </div>
  );
}

function DocumentoForm({ funcionarios, recursos }: { funcionarios: Funcionario[]; recursos: Recurso[] }) {
  const [tipo, setTipo] = useState("");

  return (
    <form action={registrarDocumentoFuncionarioAction} className="flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Select name="funcionario_id" required>
        <option value="">funcionário…</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </Select>
      <Select name="tipo" required value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="">tipo…</option>
        <option value="admissao">Documento de admissão</option>
        <option value="certificacao">Certificação/treinamento</option>
        <option value="epi">EPI</option>
        <option value="habilitacao">Habilitação de equipamento</option>
      </Select>
      <Input name="nome" placeholder="nome do documento/EPI/equipamento" required className="w-44" />
      {tipo === "habilitacao" && (
        <Select name="recurso_produtivo_id" className="w-44">
          <option value="">recurso cadastrado (opcional)…</option>
          {recursos.map((r) => (
            <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>
          ))}
        </Select>
      )}
      <Input name="data_referencia" type="date" />
      <Input name="validade" type="date" />
      <Input name="observacoes" placeholder="observações (opcional)" className="w-36" />
      <Button type="submit" variant="primary">
        Registrar
      </Button>
    </form>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// §6 — anexo do documento do colaborador. Upload e remoção exigem rh.manage
// (register_file()/delete_file() checam isso no banco — este componente só
// mostra os controles pra quem já tem canManage, mas a checagem real nunca é
// só a UI). Baixar exige só rh.view.
function DocumentoAnexos({ documentoId, anexos, canManage }: { documentoId: string; anexos: Anexo[]; canManage: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const url = await getDocumentoFuncionarioAnexoSignedUrlAction(id);
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
      await deleteDocumentoFuncionarioAnexoAction(id);
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
    // Um arquivo por chamada, mesmo motivo de /files (limite de corpo da
    // Server Action é dimensionado para 1 arquivo).
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        failed.push(`${file.name}: excede ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MiB.`);
        continue;
      }
      const fd = new FormData();
      fd.set("documento_id", documentoId);
      fd.set("file", file);
      try {
        const result = await uploadDocumentoFuncionarioAnexoAction(fd);
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
    <div className="flex min-w-[160px] flex-col gap-1">
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
            className="max-w-[160px] text-xs text-text"
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

function CancelarDocumentoBotao({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);

  if (aberto) {
    return (
      <form action={cancelarDocumentoFuncionarioAction} className="flex items-center gap-1" onSubmit={() => setAberto(false)}>
        <input type="hidden" name="id" value={id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <Button type="button" variant="outlineDanger" onClick={() => setAberto(true)}>
      Cancelar
    </Button>
  );
}

function AfastamentoForm({ funcionarios }: { funcionarios: Funcionario[] }) {
  return (
    <form action={registrarAfastamentoAction} className="flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Select name="funcionario_id" required>
        <option value="">funcionário…</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </Select>
      <Select name="tipo" required>
        <option value="">tipo…</option>
        <option value="afastamento">Afastamento</option>
        <option value="ferias">Férias</option>
      </Select>
      <Input name="data_inicio" type="date" required />
      <Input name="data_fim" type="date" title="deixe em branco se o período ainda está em aberto" />
      <Input name="motivo" placeholder="motivo (opcional)" className="w-32" />
      <Input name="observacoes" placeholder="observações (opcional)" className="w-36" />
      <Button type="submit" variant="primary">
        Registrar
      </Button>
    </form>
  );
}

function AcoesAfastamento({ row }: { row: Afastamento }) {
  const [modo, setModo] = useState<"nenhum" | "encerrar" | "cancelar">("nenhum");

  if (modo === "encerrar") {
    return (
      <form action={encerrarAfastamentoAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="data_fim" type="date" required />
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarAfastamentoAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {!row.data_fim && (
        <Button type="button" variant="primary" onClick={() => setModo("encerrar")}>
          Encerrar
        </Button>
      )}
      <Button type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
        Cancelar
      </Button>
    </div>
  );
}
