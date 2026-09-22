"use client";

import { upsertItemAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const TIPOS = [
  ["materia_prima", "Matéria-prima"],
  ["insumo", "Insumo"],
  ["componente", "Componente"],
  ["produto_intermediario", "Produto intermediário"],
  ["produto_acabado", "Produto acabado"],
  ["material_auxiliar", "Material auxiliar"],
  ["embalagem", "Embalagem"],
  ["servico", "Serviço"],
  ["outro", "Outro"],
] as const;

type Item = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  classificacao: string | null;
  unidade_principal: string;
  situacao: "ativo" | "inativo";
};

export default function ItensSection({ rows, canManage }: { rows: Item[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Itens</h2>
      <p className="mt-1 text-xs text-text-muted">
        Produto e material são o mesmo cadastro (TÓPICO 2 §7-10), diferenciados pelo tipo.
        Classificação é texto livre — é o mesmo valor usado em Configurações → Margem de quebra e
        Regra de medição (ex.: <code>vidro_temperado</code>).
      </p>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th>Classificação</Th>
              <Th>Unidade</Th>
              <Th>Situação</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm key={row.id} row={row} canManage={canManage} />
            ))}
            {canManage && <RowForm row={null} canManage={canManage} />}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function RowForm({ row, canManage }: { row: Item | null; canManage: boolean }) {
  return (
    <tr>
      <Td colSpan={canManage ? 7 : 6}>
        <form action={upsertItemAction} className="flex flex-wrap items-center gap-1.5">
          {row && <input type="hidden" name="id" value={row.id} />}
          <Input
            name="codigo"
            placeholder="código"
            defaultValue={row?.codigo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-28"
          />
          <Input
            name="descricao"
            placeholder="descrição"
            defaultValue={row?.descricao ?? ""}
            required
            disabled={!canManage}
            className="w-48"
          />
          <Select name="tipo" defaultValue={row?.tipo ?? "materia_prima"} disabled={!canManage}>
            {TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            name="classificacao"
            placeholder="classificação (opcional)"
            defaultValue={row?.classificacao ?? ""}
            disabled={!canManage}
            className="w-36"
          />
          <Input
            name="unidade_principal"
            placeholder="unidade (ex.: M2)"
            defaultValue={row?.unidade_principal ?? ""}
            required
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
