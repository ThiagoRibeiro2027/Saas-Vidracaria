"use client";

import { upsertNumberingSequenceAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

// Lista fixa — sem UI de criar tipo de documento arbitrário. Achado do
// code-review (16/09/2026): 'expedicao' (T9) e 'instalacao' (T16) já
// tinham ficado de fora dessa lista desde que esses módulos entraram —
// sem esta tela, next_document_number() nunca tem sequência configurada
// pra eles, e criar_expedicao()/criar_instalacao()/gerar_titulos_pedido()
// falham sempre com "Sequência de numeração não configurada". Adicionado
// 'titulo_financeiro' (T11) junto, mesmo problema recém-introduzido.
// Mesmo problema encontrado de novo em teste manual (22/09/2026): 'proposta'
// (ADR-002 v2.4) ficou fora quando Propostas foi adicionado depois — sem
// isso, gerarPropostaAction() sempre falhava com o mesmo erro de sequência
// não configurada.
const DOCUMENT_TYPES = [
  { key: "orcamento", label: "Orçamento" },
  { key: "proposta", label: "Proposta comercial" },
  { key: "pedido", label: "Pedido" },
  { key: "ordem_producao", label: "Ordem de produção" },
  { key: "expedicao", label: "Expedição" },
  { key: "instalacao", label: "Instalação" },
  { key: "titulo_financeiro", label: "Título financeiro" },
] as const;

type Row = {
  document_type: string;
  prefixo: string;
  sufixo: string;
  digitos: number;
  incluir_ano: boolean;
  incluir_mes: boolean;
  reinicio: "nunca" | "anual" | "mensal";
  current_value: number;
};

export default function NumberingSequencesSection({
  rows,
  canManage,
}: {
  rows: Row[];
  canManage: boolean;
}) {
  const byType = new Map(rows.map((r) => [r.document_type, r]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Numeração</h2>
      <div className="mt-2 flex flex-col gap-2.5">
        {DOCUMENT_TYPES.map(({ key, label }) => {
          const row = byType.get(key);
          return (
            <form key={key} action={upsertNumberingSequenceAction} className="flex flex-wrap items-center gap-2 text-xs">
              <input type="hidden" name="document_type" value={key} />
              <span className="w-36">{label}</span>
              <Input name="prefixo" placeholder="Prefixo" defaultValue={row?.prefixo ?? ""} disabled={!canManage} className="w-16" />
              <Input name="sufixo" placeholder="Sufixo" defaultValue={row?.sufixo ?? ""} disabled={!canManage} className="w-16" />
              <label className="flex items-center gap-1 text-text">
                Dígitos
                <Input
                  name="digitos"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={row?.digitos ?? 6}
                  disabled={!canManage}
                  className="w-12"
                />
              </label>
              <label className="flex items-center gap-1 text-text">
                <input type="checkbox" name="incluir_ano" defaultChecked={row?.incluir_ano ?? false} disabled={!canManage} className="accent-primary" />
                Ano
              </label>
              <label className="flex items-center gap-1 text-text">
                <input type="checkbox" name="incluir_mes" defaultChecked={row?.incluir_mes ?? false} disabled={!canManage} className="accent-primary" />
                Mês
              </label>
              <Select name="reinicio" defaultValue={row?.reinicio ?? "nunca"} disabled={!canManage}>
                <option value="nunca">Sem reinício</option>
                <option value="anual">Reinício anual</option>
                <option value="mensal">Reinício mensal</option>
              </Select>
              <span className="text-text-muted">Atual: {row?.current_value ?? 0}</span>
              {canManage && (
                <Button type="submit" variant="primary" size="sm">
                  Salvar
                </Button>
              )}
            </form>
          );
        })}
      </div>
    </section>
  );
}
