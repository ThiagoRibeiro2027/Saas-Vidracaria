"use client";

import { upsertNumberingSequenceAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

// FIX (achado em teste manual, 27/09/2026): esta lista já ficou pra trás
// TRÊS vezes antes (expedição/instalação, depois titulo_financeiro,
// depois proposta — ver histórico do arquivo) porque era fixa no código,
// nunca acompanhando novo tipo de documento — e aconteceu de novo,
// desta vez faltando o módulo de Compras inteiro (solicitação, cotação,
// pedido de compra, recebimento, título) e Contratos. A lista agora vem
// do catálogo real (`numbering_document_types`, a mesma tabela que
// next_document_number() consulta) via prop `documentTypeKeys` — só o
// RÓTULO amigável continua aqui, com fallback automático pra qualquer
// tipo novo que apareça sem label mapeado.
const LABELS: Record<string, string> = {
  orcamento: "Orçamento",
  proposta: "Proposta comercial",
  pedido: "Pedido",
  ordem_producao: "Ordem de produção",
  expedicao: "Expedição",
  instalacao: "Instalação",
  titulo_financeiro: "Título financeiro (a receber)",
  contrato: "Contrato",
  solicitacao_compra: "Solicitação de compra",
  cotacao: "Cotação",
  pedido_compra: "Pedido de compra",
  recebimento_compra: "Recebimento de compra",
  titulo_compra: "Título a pagar (compra)",
  cobranca: "Cobrança (boleto/PIX)",
};

function labelFor(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

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
  documentTypeKeys,
  canManage,
}: {
  rows: Row[];
  documentTypeKeys: string[];
  canManage: boolean;
}) {
  const byType = new Map(rows.map((r) => [r.document_type, r]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Numeração</h2>
      <div className="mt-2 flex flex-col gap-2.5">
        {documentTypeKeys.map((key) => {
          const label = labelFor(key);
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
