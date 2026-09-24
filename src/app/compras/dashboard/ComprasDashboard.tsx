import { sectionTitleStyle, hintStyle } from "../../configuracoes/styles";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PorStatus = Record<string, number>;

type Dashboard = {
  periodo: { data_inicio: string | null; data_fim: string | null };
  necessidades: { por_status: PorStatus; abertas_total: number };
  solicitacoes: { por_status: PorStatus; emergenciais: number };
  cotacoes: { por_status: PorStatus; economia_negociacao: number };
  aprovacoes: { por_status: PorStatus };
  pedidos: { por_status: PorStatus; emergenciais: number; valor_total: number };
  recebimentos: { por_status: PorStatus; total: number; no_prazo: number };
  financeiro: { comprometido: number; realizado: number };
  fornecedores: { ativos: number; avaliados_no_periodo: number; score_medio_no_periodo: number | null };
  lead_time_medio_dias: number | null;
};

export default function ComprasDashboard({ data }: { data: Dashboard }) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Indicadores de Compras</h2>
      <p style={hintStyle}>
        {data.periodo.data_inicio || data.periodo.data_fim
          ? `Período: ${data.periodo.data_inicio ?? "início"} a ${data.periodo.data_fim ?? "hoje"}.`
          : "Sem filtro de período (todo o histórico)."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" }}>
        <Bloco titulo="Necessidades">
          <PorStatusList porStatus={data.necessidades.por_status} />
          <Metrica label="Abertas (necessidades futuras)" valor={data.necessidades.abertas_total} destaque={data.necessidades.abertas_total > 0} />
        </Bloco>

        <Bloco titulo="Solicitações de compra">
          <PorStatusList porStatus={data.solicitacoes.por_status} />
          <Metrica label="Emergenciais" valor={data.solicitacoes.emergenciais} destaque={data.solicitacoes.emergenciais > 0} />
        </Bloco>

        <Bloco titulo="Cotações">
          <PorStatusList porStatus={data.cotacoes.por_status} />
          <Metrica label="Economia de negociação" valor={currency(data.cotacoes.economia_negociacao)} />
        </Bloco>

        <Bloco titulo="Aprovações">
          <PorStatusList porStatus={data.aprovacoes.por_status} />
        </Bloco>

        <Bloco titulo="Pedidos de compra">
          <PorStatusList porStatus={data.pedidos.por_status} />
          <Metrica label="Valor total" valor={currency(data.pedidos.valor_total)} />
          <Metrica label="Emergenciais" valor={data.pedidos.emergenciais} destaque={data.pedidos.emergenciais > 0} />
        </Bloco>

        <Bloco titulo="Recebimentos">
          <PorStatusList porStatus={data.recebimentos.por_status} />
          <Metrica
            label="No prazo"
            valor={data.recebimentos.total > 0 ? `${data.recebimentos.no_prazo} / ${data.recebimentos.total}` : "sem recebimentos"}
          />
        </Bloco>

        <Bloco titulo="Financeiro">
          <Metrica label="Comprometido" valor={currency(data.financeiro.comprometido)} />
          <Metrica label="Realizado" valor={currency(data.financeiro.realizado)} />
        </Bloco>

        <Bloco titulo="Fornecedores">
          <Metrica label="Ativos" valor={data.fornecedores.ativos} />
          <Metrica label="Avaliados no período" valor={data.fornecedores.avaliados_no_periodo} />
          <Metrica
            label="Score médio no período"
            valor={data.fornecedores.score_medio_no_periodo === null ? "sem avaliação" : Number(data.fornecedores.score_medio_no_periodo).toFixed(1)}
          />
          <Metrica
            label="Lead time médio"
            valor={data.lead_time_medio_dias === null ? "sem dado" : `${Number(data.lead_time_medio_dias).toFixed(1)} dias`}
          />
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
