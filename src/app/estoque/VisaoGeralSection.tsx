type Indicadores = {
  itens: number;
  pecasDimensionaisDisponiveis: number;
  pedidosLiberados: number;
  reservasAtivas: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial/Engenharia/
// Instalação — "Visão geral" é a primeira aba, com indicadores somados no
// servidor (contagens leves, sem consultas pesadas novas).
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  const cartoes = [
    { label: "Itens cadastrados", valor: indicadores.itens },
    { label: "Peças dimensionais disponíveis", valor: indicadores.pecasDimensionaisDisponiveis },
    { label: "Pedidos liberados", valor: indicadores.pedidosLiberados },
    { label: "Reservas ativas", valor: indicadores.reservasAtivas },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Estoque — catálogo de itens, peças dimensionais disponíveis, pedidos
        liberados e reservas ativas.
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
