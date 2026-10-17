"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";

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
  // Melhorias 12/10/2026, item 4 — substitui a configuração por tipo de
  // material + processo que existia em Configurações (cutting_margin_settings).
  percentual_quebra: number | null;
  situacao: "ativo" | "inativo";
  // Fase 2 da ADR-011. null = item escalar, que é o padrão de todo o
  // catálogo — só quem opta por controle por peça física preenche.
  dimensao_tipo: "linear" | "area" | null;
  peso_por_unidade_dimensao: number | null;
  // Melhorias 17/10/2026, item 5 — variante de cor de um item-base.
  cor: string | null;
  item_pai_id: string | null;
};

function sugerirCodigoVariante(codigoPai: string, cor: string) {
  const corSlug = cor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return corSlug ? `${codigoPai}-${corSlug}` : "";
}

// Mesmo padrão de Orçamentos (OrcamentosSection.tsx, 2026-10-03): lista
// compacta e paginada no servidor; o formulário completo (e o controle
// dimensional) só aparece no modal, ao clicar numa linha ou em "+ Novo
// item" — reduz o espaço que a tela antiga gastava com todo item sempre
// editável inline.
export default function ItensSection({
  rows,
  paginacao,
  canManage,
  unidadesDisponiveis,
  paiCodigoPorId,
}: {
  rows: Item[];
  paginacao: PaginacaoInfo;
  canManage: boolean;
  // Melhorias 12/10/2026, item 8 — unidades ativas em Configurações Gerais.
  unidadesDisponiveis: string[];
  paiCodigoPorId: Record<string, string>;
}) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [varianteDe, setVarianteDe] = useState<Item | null>(null);
  const criando = viewId === "novo";
  const viewing = !criando ? (rows.find((r) => r.id === viewId) ?? null) : null;

  function aoSalvar() {
    setViewId(null);
    setVarianteDe(null);
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

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch placeholder="Buscar por código ou descrição..." />
        <FiltroTipo />
        <FiltroSituacao />
      </div>

      {canManage && (
        <div className="mb-3">
          <Button type="button" variant="primary" onClick={() => setViewId("novo")}>
            + Novo item
          </Button>
        </div>
      )}

      <Paginacao {...paginacao} posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <SortableTh field="codigo">Código</SortableTh>
            <SortableTh field="descricao">Descrição</SortableTh>
            <SortableTh field="tipo">Tipo</SortableTh>
            <Th>Cor</Th>
            <Th>Unidade</Th>
            <Th>% Quebra</Th>
            <Th>Situação</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => setViewId(row.id)} className="cursor-pointer hover:bg-page-bg">
              <Td className="font-medium text-text">{row.codigo}</Td>
              <Td>{row.descricao}</Td>
              <Td className="text-text-muted">{TIPO_LABEL[row.tipo] ?? row.tipo}</Td>
              <Td className="text-text-muted">{row.cor ?? "—"}</Td>
              <Td className="text-text-muted">{row.unidade_principal}</Td>
              <Td className="text-text-muted">{row.percentual_quebra === null ? "—" : `${row.percentual_quebra}%`}</Td>
              <Td>
                <StatusPill tone={row.situacao === "ativo" ? "success" : "neutral"}>
                  {row.situacao === "ativo" ? "Ativo" : "Inativo"}
                </StatusPill>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={7} className="text-text-muted">
                Nenhum item cadastrado ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>

      <Modal
        open={criando || viewing !== null || varianteDe !== null}
        onClose={() => {
          setViewId(null);
          setVarianteDe(null);
        }}
        title={
          varianteDe
            ? `Nova variante de cor — ${varianteDe.codigo}`
            : criando
              ? "Novo item"
              : (viewing?.codigo ?? "Item")
        }
        size="md"
      >
        {varianteDe ? (
          <ItemForm row={null} pai={varianteDe} canManage={canManage} onSaved={aoSalvar} unidadesDisponiveis={unidadesDisponiveis} />
        ) : (
          (criando || viewing) && (
            <>
              {viewing?.item_pai_id && (
                <p className="mb-2 text-xs text-text-muted">
                  Variante de cor {viewing.cor ? `"${viewing.cor}" ` : ""}do item-base{" "}
                  <strong>{paiCodigoPorId[viewing.item_pai_id] ?? "—"}</strong>.
                </p>
              )}
              <ItemForm row={viewing} canManage={canManage} onSaved={aoSalvar} unidadesDisponiveis={unidadesDisponiveis} />
              {viewing && !viewing.item_pai_id && canManage && (
                <div className="mt-3 border-t border-border pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setVarianteDe(viewing);
                      setViewId(null);
                    }}
                  >
                    + Variante de cor
                  </Button>
                </div>
              )}
            </>
          )
        )}
      </Modal>
    </section>
  );
}

function ItemForm({
  row,
  pai,
  canManage,
  onSaved,
  unidadesDisponiveis,
}: {
  row: Item | null;
  // Presente só ao criar uma variante de cor: pré-preenche a partir do item-base.
  pai?: Item;
  canManage: boolean;
  onSaved: () => void;
  unidadesDisponiveis: string[];
}) {
  // Item já cadastrado com uma unidade fora do catálogo atual (texto livre de
  // antes desta tela existir, ou unidade desativada depois) — mantém o valor
  // visível e selecionado, em vez de forçar a trocar pra outra unidade sem o
  // usuário pedir.
  const opcoesUnidade =
    row?.unidade_principal && !unidadesDisponiveis.includes(row.unidade_principal)
      ? [row.unidade_principal, ...unidadesDisponiveis]
      : unidadesDisponiveis;
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState(row?.codigo ?? "");
  const [codigoEditado, setCodigoEditado] = useState(false);
  const base = row ?? pai ?? null;

  function aoMudarCor(valor: string) {
    if (pai && !codigoEditado) setCodigo(sugerirCodigoVariante(pai.codigo, valor));
  }

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
        {pai && <input type="hidden" name="item_pai_id" value={pai.id} />}
        {row?.item_pai_id && <input type="hidden" name="item_pai_id" value={row.item_pai_id} />}
        {(pai || row?.item_pai_id) && (
          <Input
            name="cor"
            placeholder="cor (ex.: Branco, Preto fosco)"
            defaultValue={row?.cor ?? ""}
            onChange={(e) => aoMudarCor(e.target.value)}
            required
            disabled={!canManage}
            className="w-56"
          />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            name="codigo"
            placeholder="código"
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              setCodigoEditado(true);
            }}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-28"
          />
          <Input
            name="descricao"
            placeholder="descrição"
            defaultValue={base?.descricao ?? ""}
            required
            disabled={!canManage}
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select name="tipo" defaultValue={base?.tipo ?? "materia_prima"} disabled={!canManage}>
            {TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            name="classificacao"
            placeholder="classificação (opcional)"
            defaultValue={base?.classificacao ?? ""}
            disabled={!canManage}
            className="w-40"
          />
          <Select
            name="unidade_principal"
            defaultValue={base?.unidade_principal ?? ""}
            required
            disabled={!canManage}
            className="w-24"
          >
            <option value="" disabled>
              unidade
            </option>
            {opcoesUnidade.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <Input
            name="percentual_quebra"
            type="number"
            step="0.001"
            min="0"
            placeholder="% quebra"
            title="Percentual de quebra deste item (substitui a configuração por tipo de material)"
            defaultValue={base?.percentual_quebra ?? ""}
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

function FiltroTipo() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("tipo") ?? "";

  function onChange(novoTipo: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoTipo) p.set("tipo", novoTipo);
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
      {TIPOS.map(([valorOpcao, rotulo]) => (
        <option key={valorOpcao} value={valorOpcao}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}

function FiltroSituacao() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("situacao") ?? "";

  function onChange(novaSituacao: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novaSituacao) p.set("situacao", novaSituacao);
    else p.delete("situacao");
    p.delete("pagina");
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
      <option value="">Ativos e inativos</option>
      <option value="ativo">Ativo</option>
      <option value="inativo">Inativo</option>
    </select>
  );
}
