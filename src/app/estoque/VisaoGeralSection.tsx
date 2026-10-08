import { FieldBox } from "@/components/ui/FieldBox";

type Indicadores = {
  itens: number;
  pecasDimensionaisDisponiveis: number;
  pedidosLiberados: number;
  reservasAtivas: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial/Engenharia/
// Instalação — "Visão geral" é a primeira aba, com indicadores somados no
// servidor (contagens leves, sem consultas pesadas novas).
// 2026-10-07 (ADR-013, Fase 3): cartões migrados para FieldBox
// (Identidade D) — mesmo dado, nova composição visual.
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Estoque — catálogo de itens, peças dimensionais disponíveis, pedidos
        liberados e reservas ativas.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <FieldBox label="Itens cadastrados" value={String(indicadores.itens)} tone="teal" />
        <FieldBox label="Peças dimensionais disponíveis" value={String(indicadores.pecasDimensionaisDisponiveis)} tone="teal" />
        <FieldBox label="Pedidos liberados" value={String(indicadores.pedidosLiberados)} tone="teal" />
        <FieldBox label="Reservas ativas" value={String(indicadores.reservasAtivas)} tone="teal" />
      </div>
    </section>
  );
}
