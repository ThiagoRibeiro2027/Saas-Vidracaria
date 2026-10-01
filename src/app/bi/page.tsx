import { createClient } from "@/lib/supabase/server";
import BIDashboard from "./BIDashboard";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { inputStyle, buttonStyle } from "../configuracoes/styles";

// TÓPICO 12 — BI, Fases 2 e 3 (ADR-002 v2.14 §4.16): indicadores
// operacionais básicos + filtro de período + quatro indicadores
// calculados (ticket médio, conversão orçamento→pedido, taxa de não
// conformidade, OTIF básico), mais os dashboards por área da Fase 3
// (comercial, estoque, suprimentos, qualidade, expedição, financeiro).
// Sem KPI versionado, drill-down, DRE ou assistente analítico.
// Filtro via querystring (GET) — página continua 100% leitura, sem
// Server Action nem Client Component pro filtro em si. Períodos
// pré-definidos (§6) são calculados aqui, na página, e viram o mesmo
// data_inicio/data_fim personalizado que a função já aceita — não é
// lógica nova de banco.
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function periodosPreDefinidos() {
  const hoje = new Date();
  const inicioSemana = new Date(hoje);
  // Semana começa na segunda-feira (getDay(): 0=domingo).
  const diaSemana = (hoje.getDay() + 6) % 7;
  inicioSemana.setDate(hoje.getDate() - diaSemana);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const trimestre = Math.floor(hoje.getMonth() / 3);
  const inicioTrimestre = new Date(hoje.getFullYear(), trimestre * 3, 1);
  const fimTrimestre = new Date(hoje.getFullYear(), trimestre * 3 + 3, 0);

  const inicioAno = new Date(hoje.getFullYear(), 0, 1);
  const fimAno = new Date(hoje.getFullYear(), 11, 31);

  return [
    { label: "Hoje", inicio: fmt(hoje), fim: fmt(hoje) },
    { label: "Semana atual", inicio: fmt(inicioSemana), fim: fmt(fimSemana) },
    { label: "Mês atual", inicio: fmt(inicioMes), fim: fmt(fimMes) },
    { label: "Trimestre atual", inicio: fmt(inicioTrimestre), fim: fmt(fimTrimestre) },
    { label: "Ano atual", inicio: fmt(inicioAno), fim: fmt(fimAno) },
  ];
}

export default async function BIPage({
  searchParams,
}: {
  searchParams: Promise<{ data_inicio?: string | string[]; data_fim?: string | string[]; dias_estoque_parado?: string | string[] }>;
}) {
  const params = await searchParams;
  // Next.js entrega string[] quando a chave se repete na querystring
  // (ex.: ?data_inicio=a&data_inicio=b) — usa o primeiro valor.
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const dataInicio = primeiro(params.data_inicio)?.trim() || null;
  const dataFim = primeiro(params.data_fim)?.trim() || null;
  const diasEstoqueParadoStr = primeiro(params.dias_estoque_parado)?.trim();
  const diasEstoqueParado = diasEstoqueParadoStr ? Number(diasEstoqueParadoStr) : 90;

  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "bi", p_action: "view" });

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar os indicadores desta empresa." />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_operacional", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_dias_estoque_parado: diasEstoqueParado,
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 12 — BI</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Indicadores</h1>
      <p className="mt-1 text-sm text-text">
        Indicadores operacionais e dashboards por área, com filtro de período. Sem KPI versionado,
        drill-down, análise preditiva, rentabilidade, metas, alertas ou assistente analítico.
      </p>

      <form method="get" className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
        <label className="text-xs text-text">
          De{" "}
          <input name="data_inicio" type="date" defaultValue={dataInicio ?? ""} style={inputStyle} />
        </label>
        <label className="text-xs text-text">
          Até{" "}
          <input name="data_fim" type="date" defaultValue={dataFim ?? ""} style={inputStyle} />
        </label>
        <label className="text-xs text-text">
          Estoque parado (dias){" "}
          <input name="dias_estoque_parado" type="number" min={1} defaultValue={diasEstoqueParado} style={{ ...inputStyle, width: "64px" }} />
        </label>
        <button type="submit" style={buttonStyle}>
          Filtrar
        </button>
        {(dataInicio || dataFim) && (
          <a href="/bi" className="text-xs text-text">
            Limpar período
          </a>
        )}
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-text-muted">Períodos rápidos:</span>
        {periodosPreDefinidos().map((p) => (
          <a
            key={p.label}
            href={`/bi?data_inicio=${p.inicio}&data_fim=${p.fim}`}
            className="text-xs text-primary underline"
          >
            {p.label}
          </a>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">Não foi possível carregar os indicadores: {error.message}</p>}
      {!error && data && (
        <div className="mt-6">
          <BIDashboard data={data} />
        </div>
      )}
    </div>
  );
}
