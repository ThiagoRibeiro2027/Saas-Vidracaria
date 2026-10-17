import { FieldBox } from "@/components/ui/FieldBox";
import { MOTIVOS_NAO_FECHAMENTO } from "./motivos";

export type IndicadoresOrcamentos = {
  valor_orcado: number;
  valor_em_aberto: number;
  aprovados: number;
  rejeitados: number;
  taxa_conversao: number | null;
  motivos: { motivo: string; quantidade: number }[];
};

type Indicadores = {
  orcamentosRascunho: number;
  orcamentosAprovados: number;
  oportunidadesAbertas: number;
  clientesAtivos: number;
  // null quando o usuário não pode ver orçamentos.
  orcamentos: IndicadoresOrcamentos | null;
};

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const motivoLabel = (motivo: string) =>
  motivo === "nao_informado"
    ? "Não informado"
    : (MOTIVOS_NAO_FECHAMENTO.find((m) => m.value === motivo)?.label ?? motivo);

// 2026-10-04: mesmo padrão de Financeiro/RH — "Visão geral" é a primeira
// aba, com indicadores somados no servidor (contagens leves, sem
// consultas pesadas novas).
// 2026-10-07 (ADR-013, Fase 2): cartões migrados para FieldBox
// (Identidade D) — mesmo dado, nova composição visual.
// 2026-10-17 (Melhorias, item 6): valores, taxa de conversão e motivos.
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  const o = indicadores.orcamentos;
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Comercial — orçamentos por status e valor, taxa de conversão,
        oportunidades ainda em aberto no funil e clientes com papel ativo.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <FieldBox label="Orçamentos em rascunho" value={String(indicadores.orcamentosRascunho)} tone="teal" />
        <FieldBox label="Orçamentos aprovados" value={String(indicadores.orcamentosAprovados)} tone="teal" />
        <FieldBox label="Oportunidades abertas" value={String(indicadores.oportunidadesAbertas)} tone="teal" />
        <FieldBox label="Clientes ativos" value={String(indicadores.clientesAtivos)} tone="teal" />
      </div>

      {o && (
        <>
          <div className="mt-3 flex flex-wrap gap-3">
            <FieldBox label="Valor orçado (exceto cancelados)" value={currency(o.valor_orcado)} tone="teal" />
            <FieldBox label="Valor em aberto (rascunhos)" value={currency(o.valor_em_aberto)} tone="teal" />
            <FieldBox
              label="Taxa de conversão (aprovados ÷ decididos)"
              value={o.taxa_conversao === null ? "—" : `${o.taxa_conversao.toLocaleString("pt-BR")}%`}
              tone="teal"
            />
          </div>

          <h3 className="mt-5 text-xs font-semibold text-text">Motivos de não aprovação</h3>
          {o.motivos.length === 0 ? (
            <p className="mt-1 text-xs text-text-muted">Nenhum orçamento rejeitado até agora.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text">
              {o.motivos.map((m) => (
                <li key={m.motivo}>
                  {motivoLabel(m.motivo)}: <strong>{m.quantidade}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
