type Indicadores = {
  equipesAtivas: number;
  instalacoesAgendadas: number;
  instalacoesEmExecucao: number;
  danosPendentes: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial/Engenharia — "Visão
// geral" é a primeira aba, com indicadores somados no servidor (contagens
// leves, sem consultas pesadas novas).
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  const cartoes = [
    { label: "Equipes ativas", valor: indicadores.equipesAtivas },
    { label: "Instalações agendadas", valor: indicadores.instalacoesAgendadas },
    { label: "Instalações em execução", valor: indicadores.instalacoesEmExecucao },
    { label: "Danos pendentes de decisão", valor: indicadores.danosPendentes },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Instalação — equipes ativas, instalações agendadas ou em execução e
        danos em obra aguardando decisão sobre nova fabricação.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.label} className="rounded-md bg-page-bg p-4">
            <p className="text-xs text-text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{c.valor}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
