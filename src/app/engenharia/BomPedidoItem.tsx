"use client";

import { useState } from "react";
import { gerarBomSugeridaAction, ajustarItemBomAction, removerItemBomAction, aprovarBomDefinitivaAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Item = { id: string; codigo: string; descricao: string; tipo: string };
type BomLinha = {
  pedido_item_bom_id: string;
  status: string;
  aprovado_por: string | null;
  aprovado_em: string | null;
  pedido_item_bom_item_id: string | null;
  material_item_id: string | null;
  material_codigo: string | null;
  material_descricao: string | null;
  quantidade_por_unidade: number | null;
  origem: string | null;
};

const MATERIAL_TIPOS = ["materia_prima", "insumo", "material_auxiliar"];

export default function BomPedidoItem({
  pedidoItemId,
  ehPecaConfiguravel,
  linhas,
  itens,
  canManage,
}: {
  pedidoItemId: string;
  ehPecaConfiguravel: boolean;
  linhas: BomLinha[];
  itens: Item[];
  canManage: boolean;
}) {
  const [mostrarAjuste, setMostrarAjuste] = useState(false);

  if (!ehPecaConfiguravel) return null;

  const header = linhas[0];
  const materiais = linhas.filter((l) => l.pedido_item_bom_item_id);
  const materiaisDisponiveis = itens.filter((i) => MATERIAL_TIPOS.includes(i.tipo));

  return (
    <tr>
      <td colSpan={canManage ? 7 : 6} className="px-2 py-2">
        <div className="text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text">BOM sugerida/definitiva (motor de regras):</span>
            {header ? (
              <Badge variant={header.status === "definitiva" ? "success" : "warning"}>
                {header.status === "definitiva" ? "Definitiva" : "Sugerida"}
              </Badge>
            ) : (
              <span className="text-text-muted">nenhuma gerada ainda</span>
            )}
            {canManage && (!header || header.status === "sugerida") && (
              <form action={gerarBomSugeridaAction}>
                <input type="hidden" name="pedido_item_id" value={pedidoItemId} />
                <Button type="submit" variant="primary">
                  {header ? "Regerar sugestão" : "Gerar BOM sugerida"}
                </Button>
              </form>
            )}
            {canManage && header && header.status === "sugerida" && materiais.length > 0 && (
              <form action={aprovarBomDefinitivaAction}>
                <input type="hidden" name="id" value={header.pedido_item_bom_id} />
                <Button type="submit" variant="primary">
                  Aprovar como definitiva
                </Button>
              </form>
            )}
          </div>

          {materiais.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {materiais.map((l) => (
                <li key={l.pedido_item_bom_item_id} className="flex items-center gap-1">
                  <span className={l.origem === "base" ? "text-text-muted" : "text-primary"}>
                    {l.material_codigo}: {l.quantidade_por_unidade}
                  </span>
                  <Badge variant={l.origem === "manual" ? "danger" : l.origem === "regra" ? "warning" : "neutral"}>{l.origem}</Badge>
                  {canManage && header?.status === "sugerida" && (
                    <form action={removerItemBomAction}>
                      <input type="hidden" name="id" value={l.pedido_item_bom_item_id ?? ""} />
                      <button type="submit" className="text-[10px] text-danger underline">
                        remover
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && header && header.status === "sugerida" && (
            <div className="mt-1">
              {!mostrarAjuste ? (
                <button type="button" onClick={() => setMostrarAjuste(true)} className="text-[11px] text-primary underline">
                  Ajustar/adicionar material manualmente
                </button>
              ) : (
                <form
                  action={ajustarItemBomAction}
                  onSubmit={() => setMostrarAjuste(false)}
                  className="mt-1 flex flex-wrap items-center gap-1.5"
                >
                  <input type="hidden" name="pedido_item_bom_id" value={header.pedido_item_bom_id} />
                  <select name="material_item_id" required className="h-7 rounded border border-border px-1 text-xs">
                    <option value="">material...</option>
                    {materiaisDisponiveis.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo} — {m.descricao}
                      </option>
                    ))}
                  </select>
                  <Input name="quantidade_por_unidade" type="number" step="0.0001" min="0.0001" placeholder="qtd." required className="w-20" />
                  <Button type="submit" variant="primary">
                    Salvar
                  </Button>
                  <button type="button" onClick={() => setMostrarAjuste(false)} className="text-[11px] text-text-muted underline">
                    cancelar
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
