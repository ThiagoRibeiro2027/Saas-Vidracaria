"use client";

import { upsertPessoaAction, setPessoaPapelAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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
      <h2 className="text-sm font-semibold text-text">Pessoas</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cliente e fornecedor são papéis da mesma pessoa (TÓPICO 2 §4-6) — uma pessoa pode ter
        os dois ao mesmo tempo. Documento (CPF/CNPJ) não pode se repetir na empresa.
      </p>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Documento</Th>
              <Th>Contato</Th>
              <Th>Papéis</Th>
              <Th>Situação</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PessoaRow key={row.id} row={row} papeis={papeis} canManage={canManage} />
            ))}
            {canManage && <PessoaRow row={null} papeis={[]} canManage={canManage} />}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function PessoaRow({ row, papeis, canManage }: { row: Pessoa | null; papeis: Papel[]; canManage: boolean }) {
  const temPapel = (papel: "CLIENTE" | "FORNECEDOR") =>
    row ? papeis.some((p) => p.pessoa_id === row.id && p.papel === papel && p.ativo) : false;

  return (
    <tr>
      <Td colSpan={canManage ? 6 : 5}>
        <form action={upsertPessoaAction} className="flex flex-wrap items-center gap-1.5">
          {row && <input type="hidden" name="id" value={row.id} />}
          <Select name="tipo_documento" defaultValue={row?.tipo_documento ?? ""} disabled={!canManage}>
            <option value="">—</option>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
          </Select>
          <Input
            name="documento"
            placeholder="documento"
            defaultValue={row?.documento ?? ""}
            disabled={!canManage}
            className="w-32"
          />
          <Input
            name="nome"
            placeholder="nome / razão social"
            defaultValue={row?.nome ?? ""}
            required
            disabled={!canManage}
            className="w-44"
          />
          <Input
            name="nome_fantasia"
            placeholder="nome fantasia"
            defaultValue={row?.nome_fantasia ?? ""}
            disabled={!canManage}
            className="w-32"
          />
          <Input
            name="telefone"
            placeholder="telefone"
            defaultValue={row?.telefone ?? ""}
            disabled={!canManage}
            className="w-28"
          />
          <Input
            name="email"
            placeholder="e-mail"
            defaultValue={row?.email ?? ""}
            disabled={!canManage}
            className="w-36"
          />
          <Input
            name="logradouro"
            placeholder="endereço"
            defaultValue={row?.logradouro ?? ""}
            disabled={!canManage}
            className="w-40"
          />
          <Input
            name="cidade"
            placeholder="cidade"
            defaultValue={row?.cidade ?? ""}
            disabled={!canManage}
            className="w-28"
          />
          <Input
            name="uf"
            placeholder="UF"
            defaultValue={row?.uf ?? ""}
            disabled={!canManage}
            className="w-12"
          />
          <Input
            name="cep"
            placeholder="CEP"
            defaultValue={row?.cep ?? ""}
            disabled={!canManage}
            className="w-24"
          />
          <Select name="situacao" defaultValue={row?.situacao ?? "ativo"} disabled={!canManage}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </Select>
          {canManage && (
            <Button type="submit" variant="primary">
              {row ? "Salvar" : "Adicionar"}
            </Button>
          )}
        </form>

        {row && (
          <div className="mt-1.5 flex gap-3">
            <PapelToggle pessoaId={row.id} papel="CLIENTE" ativo={temPapel("CLIENTE")} canManage={canManage} />
            <PapelToggle pessoaId={row.id} papel="FORNECEDOR" ativo={temPapel("FORNECEDOR")} canManage={canManage} />
          </div>
        )}
      </Td>
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
    <form action={setPessoaPapelAction} className="flex items-center gap-1">
      <input type="hidden" name="pessoa_id" value={pessoaId} />
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="ativo" value={ativo ? "" : "on"} />
      <label className="flex items-center gap-1 text-xs text-text">
        <input type="checkbox" checked={ativo} disabled={!canManage} readOnly className="accent-primary" />
        {papel === "CLIENTE" ? "Cliente" : "Fornecedor"}
      </label>
      {canManage && (
        <Button type="submit" variant="secondary" size="sm">
          {ativo ? "Desligar" : "Ligar"}
        </Button>
      )}
    </form>
  );
}
