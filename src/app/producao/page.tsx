import { createClient } from "@/lib/supabase/server";
import ProducaoSection, { type ListaCorteRow, type RastreioOrdemProducao, type HistoricoEvento } from "./ProducaoSection";
import RoteirosSection from "./RoteirosSection";
import LotesFabrisSection, { type ListaCorteLoteFabrilRow } from "./LotesFabrisSection";
import RecursosSection, {
  type CapacidadeRecursoRow,
  type ManutencaoPreventivaRow,
  type ManutencaoCorretivaRow,
  type ImpactoManutencaoRow,
  type GargaloRow,
} from "./RecursosSection";
import ProgramacaoSection, { type ProgramacaoRow } from "./ProgramacaoSection";
import SequenciamentoSection, { type RecomendacaoRow } from "./SequenciamentoSection";
import HorizontesSection, { type HorizonteProgramacao } from "./HorizontesSection";
import ReplanejamentoSection, { type EventoReplanejamento } from "./ReplanejamentoSection";

// TÓPICO 4 — Fase 1 (ADR-002 v2.2, 2026-09-16): OP parcial (um pedido_item
// pode ter várias OPs, desde que a soma não ultrapasse a quantidade do
// item), situação clara (liberada/liberada com restrição/bloqueada) e
// engenharia liberada versionada.
// Fase 2 (2026-09-17): roteiro produtivo configurável por item (§15) e
// acompanhamento por operação (§16) — item sem roteiro ativo gera OP com
// uma única operação genérica "Produção".
// Fase 3 (2026-09-17): produção em lotes (§12) — cada OP nasce com 1 lote
// cobrindo a quantidade inteira por padrão ("liberar integralmente"), ou
// sem nenhum lote se desmarcado, liberando aos poucos via "Liberar lote".
// Cada lote tem seu próprio acompanhamento por operação. Produção
// paralela/transferência entre recursos (§13) ainda sem UI (só backend).
// Fase 4 (2026-09-17): lote fabril (§14) — agrupamento operacional e
// temporário de lotes de liberação de diferentes OPs, com lista de corte
// combinada. Não altera pedido/item/OP/lote de liberação.
// Fase 5a (2026-09-17): recursos produtivos e capacidade (§31-32) —
// cadastro formal de recursos (máquina/equipamento/linha/posto/equipe/
// operador/ferramenta/dispositivo), capacidade disponível×necessária.
// "recurso" deixou de ser texto livre em roteiro_operacoes/op_lote_
// operacao_recursos — agora referencia este cadastro.
// Fase 5b (2026-09-17): manutenção preventiva/corretiva e impacto no PCP
// (§33-36) — manutenção preventiva desconta da capacidade futura do
// recurso; corretiva muda a situação do recurso em tempo real; análise
// de impacto lista as operações afetadas e recursos alternativos
// (mesmo tipo, disponível), com troca direta de recurso (recurso único)
// ou transferência (§13, produção dividida entre recursos).
// Fase 5c (2026-09-17): gargalos (§37) — fecha o §31-37 completo.
// listar_gargalos() é um recorte de listar_capacidade_recursos()
// (Fase 5a) só com os recursos em sobrecarga; as operações em risco
// reaproveitam analisar_impacto_manutencao() (Fase 5b). Sinal passivo no
// painel, sem notificação ativa (decisão do responsável do produto).
// Fase 6a (2026-09-18): base de dados de planejamento (§5) — prioridade
// da OP (1-5, 1=mais urgente) e datas planejadas por operação/recurso.
// listar_programacao() é leitura, traz o prazo prometido por join em
// pedidos.previsao_entrega (sem duplicar dado) e filtra por data/recurso/
// setor.
// Fase 6b (2026-09-19): sequenciamento inteligente (§6) — roteiro ganha
// perfil/ferramenta/processo (setup); recomendar_sequenciamento() rankeia
// operações pendentes de um recurso por prazo/prioridade/setup
// compartilhado, pesos configuráveis por empresa, classificação
// risco/oportunidade/recomendado.
// Fase 6c (2026-09-20): decisão humana (§7) — decidir_sequenciamento()
// grava recomendação apresentada → decisão → usuário → motivo, aplicando
// de verdade quando cabível; simulação (§8) — simular_alteracao_
// programacao() compara antes×depois sem nunca escrever na tabela real.
// Fase 6d (2026-09-21): horizonte e congelamento (§9) — producao_
// horizontes/criar_horizonte_programacao() configuram períodos por
// empresa; programar_operacao() exige producao.reprogramar_congelado
// quando a data (atual ou nova) cai num período "congelado" —
// decidir_sequenciamento() herda a proteção.
// Fase 6e (2026-09-22): replanejamento orientado por eventos (§10) —
// fecha o bloco §5-10. listar_eventos_replanejamento() filtra
// activity_logs pra um conjunto curado de ações que já existem
// (cancelamento, engenharia, manutenção, recurso editado/situação,
// prioridade, perda/retrabalho); "recalcular os impactos" já é verdade
// por construção (Sequenciamento/Gargalos nunca cacheiam), sem cálculo
// novo.
// Fase 7a (2026-09-22): primeira das 4 sub-fases combinadas do bloco
// §40-48 — categoria_bloqueio estruturada (§42), rastrear_ordem_
// producao() reconstrói Pedido→Item→OP→Lote→Operação→Recurso→
// Apontamento→Qualidade (§46), historico_ordem_producao() filtra
// activity_logs por OP (§47). §43 (status_qualidade em concluir_ordem_
// producao) foi investigado e descartado — código morto pelo próprio
// desenho de T8 (qualidade inspeciona pós-conclusão). Custos (§45),
// status configurável (§41) e liberação pra estoque (§44) ficam pras
// próximas sub-fases (7b-7d), cada uma com aprovação própria. Só
// pedidos liberados entram aqui (ADR-002 §6: Liberação → Engenharia →
// Produção).
export default async function ProducaoPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Produção desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itens },
    { data: pessoas },
    { data: obras },
    { data: ordens },
    { data: engenhariaVersoes },
    { data: opLotes },
    { data: opOperacoes },
    { data: roteiros },
    { data: roteiroOperacoes },
    { data: lotesFabris },
    { data: loteFabrilItens },
    { data: recursos },
    { data: manutencoesPreventivas },
    { data: manutencoesCorretivasAbertas },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("ordens_producao").select("*").order("created_at", { ascending: true }),
    supabase.from("engenharia_versoes").select("*").eq("situacao", "liberada"),
    supabase.from("op_lotes").select("*").order("numero", { ascending: true }),
    supabase.from("op_lote_operacoes").select("*").order("sequencia", { ascending: true }),
    supabase.from("roteiros_produtivos").select("*").order("created_at", { ascending: true }),
    supabase.from("roteiro_operacoes").select("*").order("sequencia", { ascending: true }),
    supabase.from("lotes_fabris").select("*").order("created_at", { ascending: true }),
    supabase.from("lote_fabril_itens").select("*").order("created_at", { ascending: true }),
    supabase.from("recursos_produtivos").select("*").eq("ativo", true).order("codigo", { ascending: true }),
    supabase.from("manutencoes_preventivas").select("*").eq("ativo", true).order("proxima_data", { ascending: true }),
    supabase.from("manutencoes_corretivas").select("*").eq("status", "aberta"),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  // TÓPICO 4 §11-12: um pedido_item pode ter várias OPs (produção parcial).
  const ordensPorPedidoItem = new Map<string, NonNullable<typeof ordens>>();
  for (const op of ordens ?? []) {
    const list = ordensPorPedidoItem.get(op.pedido_item_id) ?? [];
    list.push(op);
    ordensPorPedidoItem.set(op.pedido_item_id, list);
  }

  const engenhariaVigentePorPedidoItem = new Map(
    (engenhariaVersoes ?? []).map((v) => [v.pedido_item_id, v] as const),
  );

  // TÓPICO 4 §12: lotes de liberação por OP.
  const opLotesPorOrdem = new Map<string, NonNullable<typeof opLotes>>();
  for (const l of opLotes ?? []) {
    const list = opLotesPorOrdem.get(l.ordem_producao_id) ?? [];
    list.push(l);
    opLotesPorOrdem.set(l.ordem_producao_id, list);
  }

  // TÓPICO 4 §16: acompanhamento por operação — snapshot de op_lote_
  // operacoes por LOTE, criado a partir do roteiro ativo do item (ou
  // operação única "Produção" quando não há roteiro).
  const opOperacoesPorLote = new Map<string, NonNullable<typeof opOperacoes>>();
  for (const o of opOperacoes ?? []) {
    const list = opOperacoesPorLote.get(o.op_lote_id) ?? [];
    list.push(o);
    opOperacoesPorLote.set(o.op_lote_id, list);
  }

  // TÓPICO 4 §15: roteiros configurados pela empresa, agrupados por item.
  const operacoesPorRoteiro = new Map<string, NonNullable<typeof roteiroOperacoes>>();
  for (const ro of roteiroOperacoes ?? []) {
    const list = operacoesPorRoteiro.get(ro.roteiro_id) ?? [];
    list.push(ro);
    operacoesPorRoteiro.set(ro.roteiro_id, list);
  }

  // TÓPICO 4 §14: lotes fabris e seus itens (vínculo com op_lotes).
  const itensPorLoteFabril = new Map<string, NonNullable<typeof loteFabrilItens>>();
  for (const it of loteFabrilItens ?? []) {
    const list = itensPorLoteFabril.get(it.lote_fabril_id) ?? [];
    list.push(it);
    itensPorLoteFabril.set(it.lote_fabril_id, list);
  }

  // Label "OP <numero> — Lote <numero> (planejado X)" pra cada op_lote,
  // usado no seletor de "Adicionar item" do lote fabril.
  const ordemNumeroPorId = new Map((ordens ?? []).map((o) => [o.id, o.numero] as const));
  const opLotesOpcoes = (opLotes ?? []).map((l) => ({
    id: l.id,
    label: `${ordemNumeroPorId.get(l.ordem_producao_id) ?? "(OP removida)"} — Lote ${l.numero} (planejado ${Number(l.quantidade_planejada).toLocaleString("pt-BR", { maximumFractionDigits: 3 })})`,
  }));

  // Bloqueio por medida (TÓPICO 16 §7) é por pedido, não por item — resolvido
  // aqui (server) pra decidir se o botão "Criar OP" aparece habilitado.
  const bloqueioPorPedido = new Map<string, boolean>();
  await Promise.all(
    (pedidos ?? []).map(async (p) => {
      const { data } = await supabase.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: p.id });
      bloqueioPorPedido.set(p.id, !!data);
    }),
  );

  // Lista de corte (§54) é função de leitura, não entidade armazenada —
  // resolvida aqui pra cada OP existente e passada pronta, sem round-trip
  // client-side (mesmo padrão zero-JS-extra do resto do módulo).
  const listaCortePorOrdem = new Map<string, ListaCorteRow[]>();
  await Promise.all(
    (ordens ?? []).map(async (o) => {
      const { data } = await supabase.rpc("lista_corte", { p_ordem_producao_id: o.id });
      listaCortePorOrdem.set(o.id, data ?? []);
    }),
  );

  // TÓPICO 4 §46-47 (Fase 7a): rastreabilidade e histórico por OP —
  // mesmo padrão zero-JS-extra da lista de corte acima.
  const rastreioPorOrdem = new Map<string, RastreioOrdemProducao>();
  const historicoPorOrdem = new Map<string, HistoricoEvento[]>();
  await Promise.all(
    (ordens ?? []).map(async (o) => {
      const [{ data: rastreio }, { data: historico }] = await Promise.all([
        supabase.rpc("rastrear_ordem_producao", { p_ordem_producao_id: o.id }),
        supabase.rpc("historico_ordem_producao", { p_ordem_producao_id: o.id }),
      ]);
      if (rastreio) rastreioPorOrdem.set(o.id, rastreio as RastreioOrdemProducao);
      historicoPorOrdem.set(o.id, (historico as HistoricoEvento[]) ?? []);
    }),
  );

  // Lista de corte combinada por lote fabril (§14) — mesma lógica, uma
  // chamada de leitura por lote fabril existente.
  const listaCortePorLoteFabril = new Map<string, ListaCorteLoteFabrilRow[]>();
  await Promise.all(
    (lotesFabris ?? []).map(async (lf) => {
      const { data } = await supabase.rpc("lista_corte_lote_fabril", { p_lote_fabril_id: lf.id });
      listaCortePorLoteFabril.set(lf.id, data ?? []);
    }),
  );

  // Capacidade disponível × necessária por recurso (§31), janela padrão
  // de 7 dias — função de leitura, não entidade armazenada. Desconta
  // manutenção preventiva agendada na janela (§34).
  const capacidadePorRecurso = new Map<string, CapacidadeRecursoRow>();
  await Promise.all(
    (recursos ?? []).map(async (r) => {
      const { data } = await supabase.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: r.id, p_dias: 7 });
      const row = data?.[0];
      if (row) capacidadePorRecurso.set(r.id, row);
    }),
  );

  // TÓPICO 4 §34: manutenções preventivas agendadas, por recurso.
  const preventivasPorRecurso = new Map<string, ManutencaoPreventivaRow[]>();
  for (const p of manutencoesPreventivas ?? []) {
    const list = preventivasPorRecurso.get(p.recurso_produtivo_id) ?? [];
    list.push(p);
    preventivasPorRecurso.set(p.recurso_produtivo_id, list);
  }

  // TÓPICO 4 §35: manutenção corretiva aberta (no máx. 1 por recurso).
  const corretivaAbertaPorRecurso = new Map<string, ManutencaoCorretivaRow>(
    (manutencoesCorretivasAbertas ?? []).map((c) => [c.recurso_produtivo_id, c] as const),
  );

  // TÓPICO 4 §36: análise de impacto (operações afetadas) e recursos
  // alternativos (mesmo tipo, disponível) — funções de leitura.
  const impactoPorRecurso = new Map<string, ImpactoManutencaoRow[]>();
  const alternativosPorRecurso = new Map<string, { id: string; codigo: string; nome: string }[]>();
  await Promise.all(
    (recursos ?? []).map(async (r) => {
      const [{ data: impacto }, { data: alternativos }] = await Promise.all([
        supabase.rpc("analisar_impacto_manutencao", { p_recurso_produtivo_id: r.id }),
        supabase.rpc("listar_recursos_alternativos", { p_recurso_produtivo_id: r.id }),
      ]);
      impactoPorRecurso.set(r.id, impacto ?? []);
      alternativosPorRecurso.set(r.id, alternativos ?? []);
    }),
  );

  // TÓPICO 4 §37: gargalos — recorte de listar_capacidade_recursos()
  // (Fase 5a) só com os recursos em sobrecarga.
  const { data: gargalos } = await supabase.rpc("listar_gargalos", { p_dias: 7 });

  // TÓPICO 4 §5 (Fase 6a): painel de programação — sem filtro de data por
  // padrão (mostra tudo), filtro fica no client (recurso/setor).
  const { data: programacao } = await supabase.rpc("listar_programacao", {
    p_data_inicio: null,
    p_data_fim: null,
    p_recurso_produtivo_id: null,
    p_setor: null,
  });
  const setoresProgramacao = Array.from(
    new Set((recursos ?? []).map((r) => r.setor).filter((s): s is string => !!s)),
  ).sort();

  // TÓPICO 4 §6 (Fase 6b): recomendação de sequenciamento por recurso —
  // mesmo padrão de Promise.all sobre `recursos` já usado pra
  // capacidade/impacto de manutenção.
  const recomendacaoPorRecurso = new Map<string, RecomendacaoRow[]>();
  await Promise.all(
    (recursos ?? []).map(async (r) => {
      const { data } = await supabase.rpc("recomendar_sequenciamento", { p_recurso_produtivo_id: r.id });
      recomendacaoPorRecurso.set(r.id, (data as RecomendacaoRow[]) ?? []);
    }),
  );
  const { data: pesosSequenciamento } = await supabase.from("sequenciamento_pesos").select("criterio, peso");
  const recursosEmGargalo = new Set(
    ((gargalos as GargaloRow[]) ?? []).map((g) => g.recurso_produtivo_id),
  );

  // TÓPICO 4 §9 (Fase 6d): horizontes de planejamento da empresa.
  const { data: horizontes } = await supabase.from("producao_horizontes").select("*").order("data_inicio", { ascending: true });
  const periodosCongelados = ((horizontes as HorizonteProgramacao[]) ?? [])
    .filter((h) => h.tipo === "congelado")
    .map((h) => ({ data_inicio: h.data_inicio, data_fim: h.data_fim }));

  // TÓPICO 4 §10 (Fase 6e): eventos recentes que podem exigir
  // reavaliar a programação — sinal passivo, sem recálculo automático.
  const { data: eventosReplanejamento } = await supabase.rpc("listar_eventos_replanejamento", { p_dias: 7 });
  const recursoLabelPorId = new Map((recursos ?? []).map((r) => [r.id, `${r.codigo} — ${r.nome}`] as const));
  const itemPorId = new Map((itens ?? []).map((i) => [i.id, i] as const));
  const itemLabelPorPedidoItemId = new Map(
    (pedidoItens ?? []).map((pi) => {
      const item = itemPorId.get(pi.item_id);
      return [pi.id, item ? `${item.codigo} — ${item.descricao}` : "(item removido)"] as const;
    }),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 4 — Produção</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Ordens de produção</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Ordens de produção por item de pedido liberado, com produção parcial (uma ou várias OPs
          por item), engenharia liberada versionada, roteiro produtivo configurável com
          acompanhamento por operação, produção em lotes, lote fabril, recursos produtivos,
          capacidade, gargalos, manutenção preventiva/corretiva com análise de impacto, conclusão e
          lista de corte. Divisão por recurso/transferência (§13) já existe no backend, ainda sem
          tela. Sem sequenciamento, priorização, simulação ou replanejamento automáticos (§6-10).
        </p>

        <ProducaoSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          ordensPorPedidoItem={ordensPorPedidoItem}
          engenhariaVigentePorPedidoItem={engenhariaVigentePorPedidoItem}
          bloqueioPorPedido={bloqueioPorPedido}
          listaCortePorOrdem={listaCortePorOrdem}
          rastreioPorOrdem={rastreioPorOrdem}
          historicoPorOrdem={historicoPorOrdem}
          opLotesPorOrdem={opLotesPorOrdem}
          opOperacoesPorLote={opOperacoesPorLote}
          canManage={!!canManage}
        />

        <RoteirosSection
          itens={itens ?? []}
          roteiros={roteiros ?? []}
          operacoesPorRoteiro={operacoesPorRoteiro}
          recursos={recursos ?? []}
          canManage={!!canManage}
        />

        <LotesFabrisSection
          lotesFabris={lotesFabris ?? []}
          itensPorLoteFabril={itensPorLoteFabril}
          opLotesOpcoes={opLotesOpcoes}
          listaCortePorLoteFabril={listaCortePorLoteFabril}
          canManage={!!canManage}
        />

        <RecursosSection
          recursos={recursos ?? []}
          capacidadePorRecurso={capacidadePorRecurso}
          preventivasPorRecurso={preventivasPorRecurso}
          corretivaAbertaPorRecurso={corretivaAbertaPorRecurso}
          impactoPorRecurso={impactoPorRecurso}
          alternativosPorRecurso={alternativosPorRecurso}
          gargalos={(gargalos as GargaloRow[]) ?? []}
          canManage={!!canManage}
        />

        <ProgramacaoSection
          linhas={(programacao as ProgramacaoRow[]) ?? []}
          recursosOpcoes={(recursos ?? []).map((r) => ({ id: r.id, codigo: r.codigo, nome: r.nome }))}
          setoresOpcoes={setoresProgramacao}
          periodosCongelados={periodosCongelados}
          canManage={!!canManage}
        />

        <HorizontesSection horizontes={(horizontes as HorizonteProgramacao[]) ?? []} canManage={!!canManage} />

        <ReplanejamentoSection
          eventos={(eventosReplanejamento as EventoReplanejamento[]) ?? []}
          recursoLabelPorId={recursoLabelPorId}
          ordemNumeroPorId={ordemNumeroPorId}
          itemLabelPorPedidoItemId={itemLabelPorPedidoItemId}
        />

        <SequenciamentoSection
          recursos={(recursos ?? []).map((r) => ({ id: r.id, codigo: r.codigo, nome: r.nome }))}
          recomendacaoPorRecurso={recomendacaoPorRecurso}
          pesos={pesosSequenciamento ?? []}
          recursosEmGargalo={recursosEmGargalo}
          canManage={!!canManage}
        />
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "960px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
