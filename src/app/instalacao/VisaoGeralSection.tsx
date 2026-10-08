import { FieldBox } from "@/components/ui/FieldBox";

type Indicadores = {
  equipesAtivas: number;
  instalacoesAgendadas: number;
  instalacoesEmExecucao: number;
  danosPendentes: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial/Engenharia — "Visão
// geral" é a primeira aba, com indicadores somados no servidor (contagens
// leves, sem consultas pesadas novas).
// 2026-10-07 (ADR-013, Fase 4): cartões migrados para FieldBox (Identidade
// D) — mesmo dado, nova composição visual.
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Instalação — equipes ativas, instalações agendadas ou em execução e
        danos em obra aguardando decisão sobre nova fabricação.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <FieldBox label="Equipes ativas" value={String(indicadores.equipesAtivas)} tone="teal" />
        <FieldBox label="Instalações agendadas" value={String(indicadores.instalacoesAgendadas)} tone="teal" />
        <FieldBox label="Instalações em execução" value={String(indicadores.instalacoesEmExecucao)} tone="teal" />
        <FieldBox label="Danos pendentes de decisão" value={String(indicadores.danosPendentes)} tone="teal" />
      </div>
    </section>
  );
}
