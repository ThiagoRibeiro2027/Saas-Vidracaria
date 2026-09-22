"use client";

import { upsertObraAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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
      <h2 className="text-sm font-semibold text-text">Obras</h2>
      <p className="mt-1 text-xs text-text-muted">
        Registro mínimo — só o suficiente para Pedidos referenciar uma obra. Agenda, equipe e
        liberação de instalação entram com o módulo de Instalação (TÓPICO 16), mais adiante.
      </p>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Endereço</Th>
              <Th>Situação</Th>
              {canManage && <Th />}
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
        </Table>
      </div>
      {canManage && clientesElegiveis.length === 0 && (
        <p className="mt-2 text-xs text-text-muted">
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
    <tr>
      <Td colSpan={canManage ? 5 : 4}>
        <form action={upsertObraAction} className="flex flex-wrap items-center gap-1.5">
          {row && <input type="hidden" name="id" value={row.id} />}
          <Select name="pessoa_id" defaultValue={row?.pessoa_id ?? ""} required disabled={!canManage}>
            <option value="" disabled>
              Cliente
            </option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {donoAtual?.id === p.id && !clientesElegiveis.some((c) => c.id === p.id) ? " (papel desligado)" : ""}
              </option>
            ))}
          </Select>
          <Input
            name="nome"
            placeholder="nome da obra"
            defaultValue={row?.nome ?? ""}
            required
            disabled={!canManage}
            className="w-44"
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
          </Select>
          {canManage && (
            <Button type="submit" variant="primary">
              {row ? "Salvar" : "Adicionar"}
            </Button>
          )}
        </form>
      </Td>
    </tr>
  );
}
