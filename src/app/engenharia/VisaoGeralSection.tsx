import { FieldBox } from "@/components/ui/FieldBox";

type Indicadores = {
  pedidosAguardandoFabricacao: number;
  itensAtivos: number;
  pecasConfiguraveis: number;
  itensComControleDimensional: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial — "Visão geral" é a
// primeira aba, com indicadores somados no servidor (contagens leves, sem
// consultas pesadas novas).
// 2026-10-07 (ADR-013, Fase 4): cartões migrados para FieldBox (Identidade
// D) — mesmo dado, nova composição visual.
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Engenharia — pedidos liberados ainda não fabricados, catálogo de
        itens e peças configuráveis cadastradas.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <FieldBox label="Pedidos aguardando fabricação" value={String(indicadores.pedidosAguardandoFabricacao)} tone="teal" />
        <FieldBox label="Itens ativos" value={String(indicadores.itensAtivos)} tone="teal" />
        <FieldBox label="Peças configuráveis" value={String(indicadores.pecasConfiguraveis)} tone="teal" />
        <FieldBox label="Itens com controle dimensional" value={String(indicadores.itensComControleDimensional)} tone="teal" />
      </div>
    </section>
  );
}
