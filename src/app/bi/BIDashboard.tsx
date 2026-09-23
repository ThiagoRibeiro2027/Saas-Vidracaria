import { sectionTitleStyle, hintStyle } from "../configuracoes/styles";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => (v === null ? "sem dados suficientes" : `${v.toFixed(1)}%`);

type PorStatus = Record<string, number>;

type Dashboard = {
  periodo: { data_inicio: string | null; data_fim: string | null };
  pedidos: { por_status: PorStatus; valor_liberado: number };
  producao: { por_status: PorStatus; quantidade_planejada: number; quantidade_produzida: number; quantidade_perdida: number };
  qualidade: { inspecoes_por_resultado: PorStatus; nao_conformidades_por_status: PorStatus };
  expedicao: { por_status: PorStatus; itens_com_pendencia: number };
  instalacao: { por_status: PorStatus; danos_por_causa: PorStatus };
  suprimentos: { necessidades_por_status: PorStatus };
  financeiro: { titulos_por_status: PorStatus; valor_total: number; valor_recebido: number; titulos_vencidos: number };
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
  const percentPerda = data.producao.quantidade_produzida > 0
    ? (data.producao.quantidade_perdida / data.producao.quantidade_produzida) * 100
    : 0;

  return (
    <section>
      <h2 style={sectionTitleStyle}>Indicadores operacionais</h2>
      <p style={hintStyle}>
        {data.periodo.data_inicio || data.periodo.data_fim
          ? `Período: ${data.periodo.data_inicio ?? "início"} a ${data.periodo.data_fim ?? "hoje"}. `
          : "Sem filtro de período (todo o histórico). "}
        Sem KPI versionado, drill-down, análise preditiva ou DRE.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" }}>
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
          <p style={{ fontSize: "11px", color: "#6b7a75", margin: "8px 0 2px" }}>OTIF básico</p>
          <Metrica label="No prazo" valor={`${pct(data.indicadores.otif.no_prazo_pct)} (${data.indicadores.otif.amostra_com_previsao} com previsão)`} />
          <Metrica label="Integral" valor={`${pct(data.indicadores.otif.integral_pct)} (${data.indicadores.otif.amostra} expedidas)`} />
          <Metrica label="No prazo e integral" valor={pct(data.indicadores.otif.no_prazo_e_integral_pct)} />
        </Bloco>

        <Bloco titulo="Pedidos">
          <PorStatusList porStatus={data.pedidos.por_status} />
          <Metrica label="Valor liberado" valor={currency(data.pedidos.valor_liberado)} />
        </Bloco>

        <Bloco titulo="Produção">
          <PorStatusList porStatus={data.producao.por_status} />
          <Metrica label="Planejado" valor={data.producao.quantidade_planejada} />
          <Metrica label="Produzido" valor={data.producao.quantidade_produzida} />
          <Metrica label="Perdido" valor={`${data.producao.quantidade_perdida} (${percentPerda.toFixed(1)}%)`} />
        </Bloco>

        <Bloco titulo="Qualidade">
          <p style={{ fontSize: "11px", color: "#6b7a75", margin: "0 0 2px" }}>Inspeções por resultado</p>
          <PorStatusList porStatus={data.qualidade.inspecoes_por_resultado} />
          <p style={{ fontSize: "11px", color: "#6b7a75", margin: "8px 0 2px" }}>Não conformidades</p>
          <PorStatusList porStatus={data.qualidade.nao_conformidades_por_status} />
        </Bloco>

        <Bloco titulo="Expedição">
          <PorStatusList porStatus={data.expedicao.por_status} />
          <Metrica label="Itens com pendência" valor={data.expedicao.itens_com_pendencia} />
        </Bloco>

        <Bloco titulo="Instalação">
          <PorStatusList porStatus={data.instalacao.por_status} />
          <p style={{ fontSize: "11px", color: "#6b7a75", margin: "8px 0 2px" }}>Danos por causa</p>
          <PorStatusList porStatus={data.instalacao.danos_por_causa} vazio="sem danos registrados" />
        </Bloco>

        <Bloco titulo="Suprimentos">
          <PorStatusList porStatus={data.suprimentos.necessidades_por_status} />
        </Bloco>

        <Bloco titulo="Financeiro">
          <PorStatusList porStatus={data.financeiro.titulos_por_status} />
          <Metrica label="Valor total" valor={currency(data.financeiro.valor_total)} />
          <Metrica label="Valor recebido" valor={currency(data.financeiro.valor_recebido)} />
          <Metrica label="Títulos vencidos" valor={data.financeiro.titulos_vencidos} destaque={data.financeiro.titulos_vencidos > 0} />
        </Bloco>
      </div>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eef1ef", borderRadius: "8px", padding: "14px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 8px", color: "#1f5d57" }}>{titulo}</h3>
      {children}
    </div>
  );
}

function PorStatusList({ porStatus, vazio = "sem registros" }: { porStatus: PorStatus; vazio?: string }) {
  const entradas = Object.entries(porStatus);
  if (entradas.length === 0) {
    return <p style={{ fontSize: "12px", color: "#6b7a75", margin: 0 }}>{vazio}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {entradas.map(([status, total]) => (
        <div key={status} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
          <span style={{ color: "#3e4d49" }}>{status}</span>
          <strong>{total}</strong>
        </div>
      ))}
    </div>
  );
}

function Metrica({ label, valor, destaque }: { label: string; valor: string | number; destaque?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #eef1ef" }}>
      <span style={{ color: "#3e4d49" }}>{label}</span>
      <strong style={{ color: destaque ? "#9b2c2c" : undefined }}>{valor}</strong>
    </div>
  );
}
