import { Card, CardTitle } from "@/components/ui/Card";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => (v === null ? "sem dados suficientes" : `${v.toFixed(1)}%`);

type PorStatus = Record<string, number>;

type Dashboard = {
  periodo: { data_inicio: string | null; data_fim: string | null };
  pedidos: { por_status: PorStatus; valor_liberado: number };
  comercial: {
    faturamento_liberado: number;
    top_clientes: { cliente: string; faturamento: number }[];
    top_produtos: { produto: string; classificacao: string | null; quantidade_vendida: number; valor_vendido: number }[];
    concentracao_top_cliente_pct: number | null;
  };
  producao: { por_status: PorStatus; quantidade_planejada: number; quantidade_produzida: number; quantidade_perdida: number; taxa_perda_pct: number | null };
  estoque: {
    totais: { quantidade_fisica: number; quantidade_reservada: number; quantidade_disponivel: number };
    ruptura: { quantidade_itens: number; itens: { codigo: string; descricao: string; quantidade_fisica: number; estoque_minimo: number }[] };
    parados: { dias: number; quantidade_itens: number; itens: { codigo: string; descricao: string; ultima_movimentacao: string | null }[] };
  };
  qualidade: {
    inspecoes_por_resultado: PorStatus;
    nao_conformidades_por_status: PorStatus;
    nao_conformidades_por_disposicao: PorStatus;
    retrabalho_executado: number;
  };
  expedicao: { por_status: PorStatus; itens_com_pendencia: number; entregas_parciais: number };
  instalacao: { por_status: PorStatus; danos_por_causa: PorStatus };
  suprimentos: {
    necessidades_por_status: PorStatus;
    pedidos_compra_por_status: PorStatus;
    top_fornecedores_avaliacao: { fornecedor: string; score: number; periodo_fim: string }[];
    lead_time_medio_dias: number | null;
    compras_emergenciais: number;
    concentracao_top_fornecedor_pct: number | null;
  };
  financeiro: {
    titulos_por_status: PorStatus;
    valor_total: number;
    valor_recebido: number;
    titulos_vencidos: number;
    taxa_inadimplencia_receber_pct: number | null;
    titulos_pagar: { por_status: PorStatus; valor_total: number; valor_pago: number; vencidos: number; taxa_inadimplencia_pct: number | null };
  };
  indicadores: {
    ticket_medio: number | null;
    pedidos_liberados_amostra: number;
    taxa_conversao_orcamento_pedido: number | null;
    orcamentos_amostra: number;
    taxa_nao_conformidade: number | null;
    inspecoes_amostra: number;
    otif: {
      no_prazo_pct: number | null;
      integral_pct: number | null;
      no_prazo_e_integral_pct: number | null;
      amostra: number;
      amostra_com_previsao: number;
    };
  };
};

export default function BIDashboard({ data }: { data: Dashboard }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Indicadores operacionais</h2>
      <p className="mt-1 text-xs text-text-muted">
        {data.periodo.data_inicio || data.periodo.data_fim
          ? `Período: ${data.periodo.data_inicio ?? "início"} a ${data.periodo.data_fim ?? "hoje"}. `
          : "Sem filtro de período (todo o histórico). "}
        Sem KPI versionado, drill-down, análise preditiva ou DRE.
      </p>

      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <Bloco titulo="Indicadores">
          <Metrica
            label="Ticket médio"
            valor={data.indicadores.ticket_medio === null ? "sem pedidos liberados" : currency(data.indicadores.ticket_medio)}
          />
          <Metrica
            label="Conversão orçamento → pedido"
            valor={`${pct(data.indicadores.taxa_conversao_orcamento_pedido)} (${data.indicadores.orcamentos_amostra} orçamentos)`}
          />
          <Metrica
            label="Taxa de não conformidade"
            valor={`${pct(data.indicadores.taxa_nao_conformidade)} (${data.indicadores.inspecoes_amostra} inspeções)`}
            destaque={(data.indicadores.taxa_nao_conformidade ?? 0) > 5}
          />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">OTIF básico</p>
          <Metrica label="No prazo" valor={`${pct(data.indicadores.otif.no_prazo_pct)} (${data.indicadores.otif.amostra_com_previsao} com previsão)`} />
          <Metrica label="Integral" valor={`${pct(data.indicadores.otif.integral_pct)} (${data.indicadores.otif.amostra} expedidas)`} />
          <Metrica label="No prazo e integral" valor={pct(data.indicadores.otif.no_prazo_e_integral_pct)} />
        </Bloco>

        <Bloco titulo="Pedidos">
          <PorStatusList porStatus={data.pedidos.por_status} />
          <Metrica label="Valor liberado" valor={currency(data.pedidos.valor_liberado)} />
        </Bloco>

        <Bloco titulo="Comercial">
          <Metrica label="Faturamento (liberado)" valor={currency(data.comercial.faturamento_liberado)} />
          <Metrica label="Concentração do maior cliente" valor={pct(data.comercial.concentracao_top_cliente_pct)} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Top clientes</p>
          {data.comercial.top_clientes.length === 0 ? (
            <p className="text-xs text-text-muted">sem faturamento no período</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.comercial.top_clientes.map((c) => (
                <div key={c.cliente} className="flex justify-between text-xs">
                  <span className="text-text">{c.cliente}</span>
                  <strong>{currency(c.faturamento)}</strong>
                </div>
              ))}
            </div>
          )}
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Top produtos</p>
          {data.comercial.top_produtos.length === 0 ? (
            <p className="text-xs text-text-muted">sem venda no período</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.comercial.top_produtos.map((p) => (
                <div key={p.produto} className="flex justify-between text-xs">
                  <span className="text-text">{p.produto} ({p.quantidade_vendida})</span>
                  <strong>{currency(p.valor_vendido)}</strong>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Produção">
          <PorStatusList porStatus={data.producao.por_status} />
          <Metrica label="Planejado" valor={data.producao.quantidade_planejada} />
          <Metrica label="Produzido" valor={data.producao.quantidade_produzida} />
          <Metrica
            label="Perdido"
            valor={`${data.producao.quantidade_perdida} (${pct(data.producao.taxa_perda_pct)})`}
            destaque={(data.producao.taxa_perda_pct ?? 0) > 5}
          />
        </Bloco>

        <Bloco titulo="Estoque">
          <Metrica label="Físico" valor={data.estoque.totais.quantidade_fisica} />
          <Metrica label="Reservado" valor={data.estoque.totais.quantidade_reservada} />
          <Metrica label="Disponível" valor={data.estoque.totais.quantidade_disponivel} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Em ruptura (≤ mínimo)</p>
          {data.estoque.ruptura.itens.length === 0 ? (
            <p className="text-xs text-text-muted">nenhum item em ruptura</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.estoque.ruptura.itens.map((i) => (
                <div key={i.codigo} className="flex justify-between text-xs text-danger">
                  <span>{i.codigo}</span>
                  <strong>{i.quantidade_fisica} / mín. {i.estoque_minimo}</strong>
                </div>
              ))}
            </div>
          )}
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">
            Parados há mais de {data.estoque.parados.dias} dias ({data.estoque.parados.quantidade_itens})
          </p>
          {data.estoque.parados.itens.length === 0 ? (
            <p className="text-xs text-text-muted">nenhum item parado</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.estoque.parados.itens.map((i) => (
                <div key={i.codigo} className="flex justify-between text-xs">
                  <span className="text-text">{i.codigo}</span>
                  <span className="text-text-muted">{i.ultima_movimentacao ? new Date(i.ultima_movimentacao).toLocaleDateString("pt-BR") : "nunca movimentado"}</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Qualidade">
          <p className="mb-0.5 text-[11px] text-text-muted">Inspeções por resultado</p>
          <PorStatusList porStatus={data.qualidade.inspecoes_por_resultado} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Não conformidades por status</p>
          <PorStatusList porStatus={data.qualidade.nao_conformidades_por_status} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Não conformidades por disposição</p>
          <PorStatusList porStatus={data.qualidade.nao_conformidades_por_disposicao} />
          <Metrica label="Retrabalho executado" valor={data.qualidade.retrabalho_executado} />
        </Bloco>

        <Bloco titulo="Expedição">
          <PorStatusList porStatus={data.expedicao.por_status} />
          <Metrica label="Itens com pendência" valor={data.expedicao.itens_com_pendencia} />
          <Metrica label="Entregas parciais" valor={data.expedicao.entregas_parciais} destaque={data.expedicao.entregas_parciais > 0} />
        </Bloco>

        <Bloco titulo="Instalação">
          <PorStatusList porStatus={data.instalacao.por_status} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Danos por causa</p>
          <PorStatusList porStatus={data.instalacao.danos_por_causa} vazio="sem danos registrados" />
        </Bloco>

        <Bloco titulo="Suprimentos">
          <p className="mb-0.5 text-[11px] text-text-muted">Necessidades por status</p>
          <PorStatusList porStatus={data.suprimentos.necessidades_por_status} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Pedidos de compra por status</p>
          <PorStatusList porStatus={data.suprimentos.pedidos_compra_por_status} />
          <Metrica label="Lead time médio" valor={data.suprimentos.lead_time_medio_dias === null ? "sem dados suficientes" : `${data.suprimentos.lead_time_medio_dias} dias`} />
          <Metrica label="Compras emergenciais" valor={data.suprimentos.compras_emergenciais} />
          <Metrica label="Concentração do maior fornecedor" valor={pct(data.suprimentos.concentracao_top_fornecedor_pct)} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Top fornecedores (avaliação)</p>
          {data.suprimentos.top_fornecedores_avaliacao.length === 0 ? (
            <p className="text-xs text-text-muted">sem avaliação registrada</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.suprimentos.top_fornecedores_avaliacao.map((f) => (
                <div key={f.fornecedor} className="flex justify-between text-xs">
                  <span className="text-text">{f.fornecedor}</span>
                  <strong>{f.score}</strong>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Financeiro">
          <p className="mb-0.5 text-[11px] text-text-muted">Contas a receber</p>
          <PorStatusList porStatus={data.financeiro.titulos_por_status} />
          <Metrica label="Valor total" valor={currency(data.financeiro.valor_total)} />
          <Metrica label="Valor recebido" valor={currency(data.financeiro.valor_recebido)} />
          <Metrica label="Títulos vencidos" valor={data.financeiro.titulos_vencidos} destaque={data.financeiro.titulos_vencidos > 0} />
          <Metrica label="Taxa de inadimplência" valor={pct(data.financeiro.taxa_inadimplencia_receber_pct)} />
          <p className="mb-0.5 mt-2 text-[11px] text-text-muted">Contas a pagar</p>
          <PorStatusList porStatus={data.financeiro.titulos_pagar.por_status} />
          <Metrica label="Valor total" valor={currency(data.financeiro.titulos_pagar.valor_total)} />
          <Metrica label="Valor pago" valor={currency(data.financeiro.titulos_pagar.valor_pago)} />
          <Metrica label="Vencidos" valor={data.financeiro.titulos_pagar.vencidos} destaque={data.financeiro.titulos_pagar.vencidos > 0} />
          <Metrica label="Taxa de inadimplência" valor={pct(data.financeiro.titulos_pagar.taxa_inadimplencia_pct)} />
        </Bloco>
      </div>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card padding="sm">
      <CardTitle className="mb-2 text-primary">{titulo}</CardTitle>
      {children}
    </Card>
  );
}

function PorStatusList({ porStatus, vazio = "sem registros" }: { porStatus: PorStatus; vazio?: string }) {
  const entradas = Object.entries(porStatus);
  if (entradas.length === 0) {
    return <p className="text-xs text-text-muted">{vazio}</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {entradas.map(([status, total]) => (
        <div key={status} className="flex justify-between text-xs">
          <span className="text-text">{status}</span>
          <strong>{total}</strong>
        </div>
      ))}
    </div>
  );
}

function Metrica({ label, valor, destaque }: { label: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className="mt-1.5 flex justify-between border-t border-border-subtle pt-1.5 text-xs">
      <span className="text-text">{label}</span>
      <strong className={destaque ? "text-danger" : undefined}>{valor}</strong>
    </div>
  );
}
