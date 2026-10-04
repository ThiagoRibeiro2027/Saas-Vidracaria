"use client";

import { useState } from "react";
import { upsertItemAction, definirPropriedadesDimensionaisItemAction } from "./actions";
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
  // Fase 2 da ADR-011. null = item escalar, que é o padrão de todo o
  // catálogo — só quem opta por controle por peça física preenche.
  dimensao_tipo: "linear" | "area" | null;
  peso_por_unidade_dimensao: number | null;
};

export default function ItensSection({ rows, canManage }: { rows: Item[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Cadastro de itens</h2>
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

        {row && canManage && <ControleDimensional row={row} />}
      </Td>
    </tr>
  );
}

// Fase 2 da ADR-011 (TÓPICO 7 §5-6): item medido por peça física —
// barra em metro, chapa/bobina em m². Formulário à parte porque é outra
// função no banco, com regra própria: desligar o controle é recusado
// quando já existe peça registrada. Só aparece em item já cadastrado,
// já que a função exige o id.
function ControleDimensional({ row }: { row: Item }) {
  const [tipo, setTipo] = useState<string>(row.dimensao_tipo ?? "");

  return (
    <form
      action={definirPropriedadesDimensionaisItemAction}
      className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-1.5"
    >
      <input type="hidden" name="item_id" value={row.id} />
      <span className="text-xs text-text-muted">Controle dimensional:</span>
      <Select name="dimensao_tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="">não (item escalar)</option>
        <option value="linear">linear — barra/perfil, medido em metro</option>
        <option value="area">área — chapa/bobina/vidro, medido em m²</option>
      </Select>
      {tipo !== "" && (
        <>
          <Input
            name="peso_por_unidade_dimensao"
            type="number"
            min="0"
            step="0.0001"
            defaultValue={row.peso_por_unidade_dimensao ?? ""}
            placeholder={tipo === "linear" ? "kg por metro" : "kg por m²"}
            className="w-32"
          />
          <span className="text-xs text-text-muted">
            {tipo === "linear" ? "kg/m" : "kg/m²"} — base da conversão de unidade
          </span>
        </>
      )}
      <Button type="submit" variant="secondary">
        Salvar dimensional
      </Button>
    </form>
  );
}
