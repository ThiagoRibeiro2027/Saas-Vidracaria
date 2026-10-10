"use client";

import { Fragment, useActionState, useState } from "react";
import { criarClienteAction, upsertPessoaAction, setPessoaPapelAction, upsertObraAction } from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

// 2026-10-04: cadastro de cliente saiu de /cadastros e mora aqui, perto de
// Orçamento. Mesmo padrão linha-compacta-expande de RH/Fiscal/Usuários —
// Obra deixou de ter tela própria e virou sub-lista dentro da linha
// expandida do cliente (pessoa_id já é o contexto, sem precisar de <select>
// de cliente no formulário de obra).
export default function ClientesSection({
  rows,
  paginacao,
  papeis,
  obras,
  canManage,
  canManageObras,
}: {
  rows: Pessoa[];
  paginacao: PaginacaoInfo;
  papeis: Papel[];
  obras: Obra[];
  canManage: boolean;
  canManageObras: boolean;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Clientes</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cadastro de cliente. Documento (CPF/CNPJ) não pode se repetir na empresa. Uma pessoa que
        também vende para a empresa pode ganhar o papel Fornecedor na edição — o cadastro de
        fornecedor novo fica em Compras. Clique num cliente para consultar os dados e as obras;
        &quot;Editar cadastro&quot; abre a edição.
      </p>

      {canManage && (
        <div className="mt-3">
          {criando ? (
            <ClienteForm row={null} onSubmit={() => setCriando(false)} onCancel={() => setCriando(false)} />
          ) : (
            <Button type="button" variant="primary" onClick={() => setCriando(true)}>
              + Novo cliente
            </Button>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <TableSearch paramBusca="cli_q" paramPagina="cli_pagina" placeholder="Buscar por nome..." />
        <FiltroSituacaoCliente />
      </div>

      <Paginacao {...paginacao} paramPagina="cli_pagina" paramPorPagina="cli_por_pagina" posicao="topo" />

      <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <SortableTh field="nome" paramOrdenar="cli_ordenar" paramPagina="cli_pagina">Nome</SortableTh>
              <Th>Documento</Th>
              <Th>Contato</Th>
              <Th>Situação</Th>
              <Th className="w-6" />
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {rows.map((row) => {
              const aberto = expandido === row.id;
              const obrasDoCliente = obras.filter((o) => o.pessoa_id === row.id);
              const ehFornecedor = papeis.some((p) => p.pessoa_id === row.id && p.papel === "FORNECEDOR" && p.ativo);
              return (
                <Fragment key={row.id}>
                  <tr onClick={() => setExpandido((atual) => (atual === row.id ? null : row.id))} className="cursor-pointer hover:bg-page-bg">
                    <Td className="font-medium text-text">
                      {row.nome}
                      {ehFornecedor && <span className="ml-1.5 text-[11px] text-text-muted">(também fornecedor)</span>}
                    </Td>
                    <Td className="font-mono text-xs text-text-muted">{row.documento ?? "—"}</Td>
                    <Td className="text-text-muted">{row.telefone ?? row.email ?? "—"}</Td>
                    <Td>
                      <StatusPill tone={row.situacao === "ativo" ? "success" : row.situacao === "bloqueado" ? "danger" : "neutral"}>
                        {row.situacao === "ativo" ? "Ativo" : row.situacao === "bloqueado" ? "Bloqueado" : "Inativo"}
                      </StatusPill>
                    </Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={5} className="bg-page-bg">
                        <ClienteDetalhe row={row} canManage={canManage} ehFornecedor={ehFornecedor} />

                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-medium text-text">Obras deste cliente</p>
                          <ObrasDoCliente pessoaId={row.id} obras={obrasDoCliente} canManage={canManageObras} />
                        </div>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-text-muted">
                  Nenhum cliente cadastrado ainda.
                </Td>
              </tr>
            )}
          </tbody>
      </DenseTable>
    </section>
  );
}

// 2026-10-04: expandir o cliente abre em consulta (somente leitura),
// não direto no formulário — evita que um clique acidental na linha deixe
// os campos abertos pra edição sem o usuário ter pedido isso. "Editar
// cadastro" é a única porta pro formulário, igual ao padrão já usado em
// Pedidos/Engenharia pra abrir ações só quando necessário.
function ClienteDetalhe({
  row,
  canManage,
  ehFornecedor,
}: {
  row: Pessoa;
  canManage: boolean;
  ehFornecedor: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return <ClienteForm row={row} canManage={canManage} ehFornecedor={ehFornecedor} onSubmit={() => setEditando(false)} onCancel={() => setEditando(false)} />;
  }

  return (
    <div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="text-text-muted">Documento</dt>
          <dd className="text-text">{row.documento ? `${row.tipo_documento ? `${row.tipo_documento} ` : ""}${row.documento}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Nome fantasia</dt>
          <dd className="text-text">{row.nome_fantasia ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Telefone</dt>
          <dd className="text-text">{row.telefone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">E-mail</dt>
          <dd className="text-text">{row.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Endereço</dt>
          <dd className="text-text">{[row.logradouro, row.cidade, row.uf, row.cep].filter(Boolean).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Situação</dt>
          <dd className="text-text">
            {row.situacao === "ativo" ? "Ativo" : row.situacao === "bloqueado" ? "Bloqueado" : "Inativo"}
            {ehFornecedor && " · também fornecedor"}
          </dd>
        </div>
      </dl>
      {canManage && (
        <div className="mt-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Editar cadastro
          </Button>
        </div>
      )}
    </div>
  );
}

function ClienteForm({
  row,
  canManage = true,
  ehFornecedor,
  onSubmit,
  onCancel,
}: {
  row: Pessoa | null;
  canManage?: boolean;
  ehFornecedor?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
}) {
  const action = row ? upsertPessoaAction : criarClienteAction;
  const [state, formAction] = useActionState(action, undefined);

  return (
    <div>
      <form action={formAction} onSubmit={onSubmit} className="flex flex-wrap items-center gap-1.5">
        {row && <input type="hidden" name="id" value={row.id} />}
        <Select name="tipo_documento" defaultValue={row?.tipo_documento ?? ""} disabled={!canManage}>
          <option value="">—</option>
          <option value="CPF">CPF</option>
          <option value="CNPJ">CNPJ</option>
        </Select>
        <Input name="documento" placeholder="documento" defaultValue={row?.documento ?? ""} disabled={!canManage} className="w-32" />
        <Input name="nome" placeholder="nome / razão social" defaultValue={row?.nome ?? ""} required disabled={!canManage} className="w-44" />
        <Input name="nome_fantasia" placeholder="nome fantasia" defaultValue={row?.nome_fantasia ?? ""} disabled={!canManage} className="w-32" />
        <Input name="telefone" placeholder="telefone" defaultValue={row?.telefone ?? ""} disabled={!canManage} className="w-28" />
        <Input name="email" placeholder="e-mail" defaultValue={row?.email ?? ""} disabled={!canManage} className="w-36" />
        <Input name="logradouro" placeholder="endereço" defaultValue={row?.logradouro ?? ""} disabled={!canManage} className="w-40" />
        <Input name="cidade" placeholder="cidade" defaultValue={row?.cidade ?? ""} disabled={!canManage} className="w-28" />
        <Input name="uf" placeholder="UF" defaultValue={row?.uf ?? ""} disabled={!canManage} className="w-12" />
        <Input name="cep" placeholder="CEP" defaultValue={row?.cep ?? ""} disabled={!canManage} className="w-24" />
        {row && (
          <Select name="situacao" defaultValue={row?.situacao ?? "ativo"} disabled={!canManage}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </Select>
        )}
        {canManage && (
          <Button type="submit" variant="primary">
            {row ? "Salvar" : "Criar cliente"}
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}

      {row && canManage && (
        <div className="mt-1.5">
          <PapelFornecedorToggle pessoaId={row.id} ativo={!!ehFornecedor} />
        </div>
      )}
    </div>
  );
}

function PapelFornecedorToggle({ pessoaId, ativo }: { pessoaId: string; ativo: boolean }) {
  return (
    <form action={setPessoaPapelAction} className="flex items-center gap-1">
      <input type="hidden" name="pessoa_id" value={pessoaId} />
      <input type="hidden" name="papel" value="FORNECEDOR" />
      <input type="hidden" name="ativo" value={ativo ? "" : "on"} />
      <label className="flex items-center gap-1 text-xs text-text">
        <input type="checkbox" checked={ativo} readOnly className="accent-primary" />
        Também é fornecedor
      </label>
      <Button type="submit" variant="secondary" size="sm">
        {ativo ? "Desligar" : "Ligar"}
      </Button>
    </form>
  );
}

function ObrasDoCliente({ pessoaId, obras, canManage }: { pessoaId: string; obras: Obra[]; canManage: boolean }) {
  const [criando, setCriando] = useState(false);

  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Obra</Th>
            <Th>Endereço</Th>
            <Th>Situação</Th>
          </tr>
        </thead>
        <tbody>
          {obras.map((obra) => (
            <ObraRow key={obra.id} obra={obra} canManage={canManage} />
          ))}
          {obras.length === 0 && (
            <tr>
              <Td colSpan={3} className="text-text-muted">
                Nenhuma obra cadastrada ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
      {canManage && (
        criando ? (
          <div className="mt-1.5">
            <ObraForm pessoaId={pessoaId} row={null} onSubmit={() => setCriando(false)} onCancel={() => setCriando(false)} />
          </div>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="mt-1.5" onClick={() => setCriando(true)}>
            + Nova obra
          </Button>
        )
      )}
    </div>
  );
}

function ObraRow({ obra, canManage }: { obra: Obra; canManage: boolean }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <tr>
        <Td colSpan={3}>
          <ObraForm pessoaId={obra.pessoa_id} row={obra} onSubmit={() => setEditando(false)} onCancel={() => setEditando(false)} />
        </Td>
      </tr>
    );
  }

  return (
    <tr onClick={() => canManage && setEditando(true)} className={canManage ? "cursor-pointer hover:bg-surface" : ""}>
      <Td>{obra.nome}</Td>
      <Td>{[obra.logradouro, obra.cidade, obra.uf].filter(Boolean).join(", ") || "—"}</Td>
      <Td>
        <Badge variant={obra.situacao === "ativo" ? "success" : "neutral"}>{obra.situacao === "ativo" ? "Ativo" : "Inativo"}</Badge>
      </Td>
    </tr>
  );
}

function ObraForm({
  pessoaId,
  row,
  onSubmit,
  onCancel,
}: {
  pessoaId: string;
  row: Obra | null;
  onSubmit?: () => void;
  onCancel?: () => void;
}) {
  return (
    <form
      action={upsertObraAction}
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-1.5 rounded border border-border p-2"
    >
      <input type="hidden" name="pessoa_id" value={pessoaId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <Input name="nome" placeholder="nome da obra" defaultValue={row?.nome ?? ""} required className="w-40" />
      <Input name="logradouro" placeholder="endereço" defaultValue={row?.logradouro ?? ""} className="w-40" />
      <Input name="cidade" placeholder="cidade" defaultValue={row?.cidade ?? ""} className="w-28" />
      <Input name="uf" placeholder="UF" defaultValue={row?.uf ?? ""} className="w-12" />
      <Input name="cep" placeholder="CEP" defaultValue={row?.cep ?? ""} className="w-24" />
      <Select name="situacao" defaultValue={row?.situacao ?? "ativo"}>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </Select>
      <Button type="submit" variant="primary" size="sm">
        {row ? "Salvar" : "Adicionar"}
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </form>
  );
}

function FiltroSituacaoCliente() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("cli_situacao") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("cli_situacao", novoValor);
    else p.delete("cli_situacao");
    p.delete("cli_pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por situação"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Ativos, inativos e bloqueados</option>
      <option value="ativo">Ativo</option>
      <option value="inativo">Inativo</option>
      <option value="bloqueado">Bloqueado</option>
    </select>
  );
}
