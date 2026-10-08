import { FieldBox } from "@/components/ui/FieldBox";

type Indicadores = {
  orcamentosRascunho: number;
  orcamentosAprovados: number;
  oportunidadesAbertas: number;
  clientesAtivos: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH — "Visão geral" é a primeira
// aba, com indicadores somados no servidor (contagens leves, sem
// consultas pesadas novas).
// 2026-10-07 (ADR-013, Fase 2): cartões migrados para FieldBox
// (Identidade D) — mesmo dado, nova composição visual.
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Comercial — orçamentos por status, oportunidades ainda em aberto no
        funil e clientes com papel ativo.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <FieldBox label="Orçamentos em rascunho" value={String(indicadores.orcamentosRascunho)} tone="teal" />
        <FieldBox label="Orçamentos aprovados" value={String(indicadores.orcamentosAprovados)} tone="teal" />
        <FieldBox label="Oportunidades abertas" value={String(indicadores.oportunidadesAbertas)} tone="teal" />
        <FieldBox label="Clientes ativos" value={String(indicadores.clientesAtivos)} tone="teal" />
      </div>
    </section>
  );
}
