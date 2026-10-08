type Indicadores = {
  pedidosAguardandoFabricacao: number;
  itensAtivos: number;
  pecasConfiguraveis: number;
  itensComControleDimensional: number;
};

// 2026-10-04: mesmo padrão de Financeiro/RH/Comercial — "Visão geral" é a
// primeira aba, com indicadores somados no servidor (contagens leves, sem
// consultas pesadas novas).
export default function VisaoGeralSection({ indicadores }: { indicadores: Indicadores }) {
  const cartoes = [
    { label: "Pedidos aguardando fabricação", valor: indicadores.pedidosAguardandoFabricacao },
    { label: "Itens ativos", valor: indicadores.itensAtivos },
    { label: "Peças configuráveis", valor: indicadores.pecasConfiguraveis },
    { label: "Itens com controle dimensional", valor: indicadores.itensComControleDimensional },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Visão geral</h2>
      <p className="mt-1 text-xs text-text-muted">
        Indicadores do módulo Engenharia — pedidos liberados ainda não fabricados, catálogo de
        itens e peças configuráveis cadastradas.
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
