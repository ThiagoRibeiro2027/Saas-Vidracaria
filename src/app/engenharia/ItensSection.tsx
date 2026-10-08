"use client";

import { useState, type FormEvent } from "react";
import { upsertItemAction, definirPropriedadesDimensionaisItemAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Modal } from "@/components/ui/Modal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";

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

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS);

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

// Mesmo padrão de Orçamentos (OrcamentosSection.tsx, 2026-10-03): lista
// compacta e paginada no servidor; o formulário completo (e o controle
// dimensional) só aparece no modal, ao clicar numa linha ou em "+ Novo
// item" — reduz o espaço que a tela antiga gastava com todo item sempre
// editável inline.
export default function ItensSection({
  rows,
  paginacao,
  canManage,
}: {
  rows: Item[];
  paginacao: PaginacaoInfo;
  canManage: boolean;
}) {
  const [viewId, setViewId] = useState<string | null>(null);
  const criando = viewId === "novo";
  const viewing = !criando ? (rows.find((r) => r.id === viewId) ?? null) : null;

  function aoSalvar() {
    setViewId(null);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Cadastro de itens</h2>
      <p className="mt-1 text-xs text-text-muted">
        Produto e material são o mesmo cadastro (TÓPICO 2 §7-10), diferenciados pelo tipo.
        Classificação é texto livre — é o mesmo valor usado em Configurações → Margem de quebra e
        Regra de medição (ex.: <code>vidro_temperado</code>). Clique numa linha para abrir, revisar
        e editar.
      </p>

      {canManage && (
        <div className="my-3">
          <Button type="button" variant="primary" onClick={() => setViewId("novo")}>
            + Novo item
          </Button>
        </div>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Código</Th>
            <Th>Descrição</Th>
            <Th>Tipo</Th>
            <Th>Unidade</Th>
            <Th>Situação</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => setViewId(row.id)} className="cursor-pointer hover:bg-page-bg">
              <Td className="font-medium text-text">{row.codigo}</Td>
              <Td>{row.descricao}</Td>
              <Td className="text-text-muted">{TIPO_LABEL[row.tipo] ?? row.tipo}</Td>
              <Td className="text-text-muted">{row.unidade_principal}</Td>
              <Td>
                <StatusPill tone={row.situacao === "ativo" ? "success" : "neutral"}>
                  {row.situacao === "ativo" ? "Ativo" : "Inativo"}
                </StatusPill>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-text-muted">
                Nenhum item cadastrado ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
      <Paginacao {...paginacao} />

      <Modal
        open={criando || viewing !== null}
        onClose={() => setViewId(null)}
        title={criando ? "Novo item" : (viewing?.codigo ?? "Item")}
        size="md"
      >
        {(criando || viewing) && <ItemForm row={viewing} canManage={canManage} onSaved={aoSalvar} />}
      </Modal>
    </section>
  );
}

function ItemForm({ row, canManage, onSaved }: { row: Item | null; canManage: boolean; onSaved: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await upsertItemAction(new FormData(e.currentTarget));
      onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o item.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={enviar} className="flex flex-col gap-2">
        {row && <input type="hidden" name="id" value={row.id} />}
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="w-40"
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
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={enviando}>
              {enviando ? "Salvando..." : row ? "Salvar" : "Adicionar"}
            </Button>
            {erro && <span className="text-xs text-danger">{erro}</span>}
          </div>
        )}
      </form>

      {row && canManage && <ControleDimensional row={row} />}
    </div>
  );
}

// Fase 2 da ADR-011 (TÓPICO 7 §5-6): item medido por peça física —
// barra em metro, chapa/bobina em m². Formulário à parte porque é outra
// função no banco, com regra própria: desligar o controle é recusado
// quando já existe peça registrada. Só aparece em item já cadastrado,
// já que a função exige o id. Fica como Server Action direta (sem
// fechar o modal) — ajustar o controle dimensional não precisa voltar
// pra lista.
function ControleDimensional({ row }: { row: Item }) {
  const [tipo, setTipo] = useState<string>(row.dimensao_tipo ?? "");

  return (
    <form
      action={definirPropriedadesDimensionaisItemAction}
      className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2"
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
