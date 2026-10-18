// Melhorias 18/10/2026: calendário da empresa (feriados nacionais/municipais) na capacidade.
// Uso: set -a; source .env.local; set +a; node scripts/test-calendario-capacidade.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`, extra ?? "");
    failed++;
  }
}

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
  const { data: company } = await admin.from("companies").upsert({ slug, name }, { onConflict: "slug" }).select().single();
  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );
  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", roleKey).single();
  const { data: existing } = await admin
    .from("user_roles").select("id").eq("profile_id", userId).eq("role_id", role.id).is("valid_until", null).maybeSingle();
  if (!existing) await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, company, userId };
}

async function main() {
  const a = await createTenant("calend-a", "Calendário A", "ca01");
  const b = await createTenant("calend-b", "Calendário B", "ca02");
  const semPerm = await createTenant("calend-c", "Calendário SemPerm", "ca03", "COMERCIAL");

  const dias = async (company, inicio, n) =>
    Number((await admin.rpc("_dias_uteis_na_janela", { p_company_id: company.id, p_inicio: inicio, p_dias: n })).data);
  const feriados = async (ano) => (await admin.rpc("feriados_nacionais", { p_ano: ano })).data ?? [];
  const tem = (lista, data) => lista.find((f) => f.data === data);

  console.log("1. Feriados nacionais (calculados)");
  {
    const f26 = await feriados(2026);
    check("2026: Sexta-feira Santa em 03/04", tem(f26, "2026-04-03")?.nome === "Sexta-feira Santa");
    check("2026: Corpus Christi (ponto facultativo) em 04/06", tem(f26, "2026-06-04")?.tipo === "ponto_facultativo");
    check("2026: Carnaval (seg e ter) em 16 e 17/02 como ponto facultativo", tem(f26, "2026-02-16")?.tipo === "ponto_facultativo" && tem(f26, "2026-02-17")?.tipo === "ponto_facultativo");
    const fixos = ["2026-01-01", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"];
    check("2026: as 9 datas fixas obrigatórias presentes", fixos.every((d) => tem(f26, d)?.tipo === "feriado_nacional"), f26);
    const f24 = await feriados(2024);
    check("2024: Páscoa em 31/03 (Sexta-feira Santa em 29/03)", tem(f24, "2024-03-29")?.nome === "Sexta-feira Santa");
    const f23 = await feriados(2023);
    check("antes de 2024 não existe o feriado nacional de 20/11", !tem(f23, "2023-11-20"));
    check("2025: Sexta-feira Santa em 18/04", tem(await feriados(2025), "2025-04-18")?.nome === "Sexta-feira Santa");
  }

  console.log("\n2. Dias úteis na janela");
  {
    // 12/10/2026 é segunda-feira e feriado nacional (N. Sra. Aparecida).
    check("janela seg 12/10 a dom 18/10: feriado na segunda → 4 dias úteis", (await dias(a.company, "2026-10-12", 7)) === 4);
    check("janela seg 19/10 a dom 25/10 sem feriado → 5 dias úteis", (await dias(a.company, "2026-10-19", 7)) === 5);

    const { error: eOpcoes } = await a.client.rpc("upsert_calendar_settings", { p_feriados_nacionais: false, p_pontos_facultativos: false });
    check("empresa pode não considerar feriados nacionais", !eOpcoes, eOpcoes);
    check("com a opção desligada a mesma janela volta a 5 dias úteis", (await dias(a.company, "2026-10-12", 7)) === 5);
    await a.client.rpc("upsert_calendar_settings", { p_feriados_nacionais: true, p_pontos_facultativos: false });

    // Carnaval 16/02/2026 (segunda): ponto facultativo — não bloqueia por padrão.
    check("ponto facultativo não bloqueia por padrão (semana do Carnaval = 5)", (await dias(a.company, "2026-02-16", 7)) === 5);
    await a.client.rpc("upsert_calendar_settings", { p_feriados_nacionais: true, p_pontos_facultativos: true });
    check("com 'pontos facultativos' ligado, segunda e terça de Carnaval bloqueiam (3)", (await dias(a.company, "2026-02-16", 7)) === 3);
    await a.client.rpc("upsert_calendar_settings", { p_feriados_nacionais: true, p_pontos_facultativos: false });

    const { error: eMun } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-10-14", p_tipo: "feriado_municipal", p_descricao: "Aniversário da cidade", p_horas: null });
    check("cadastra feriado municipal (quarta 14/10)", !eMun, eMun);
    check("feriado municipal reduz a janela 12–18/10 de 4 para 3", (await dias(a.company, "2026-10-12", 7)) === 3);

    const { error: eExtra } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-10-17", p_tipo: "dia_extra", p_descricao: "Sábado de produção", p_horas: 6 });
    check("cadastra dia extra num sábado", !eExtra, eExtra);
    check("dia extra no sábado soma 1 dia útil (3 → 4)", (await dias(a.company, "2026-10-12", 7)) === 4);

    await a.client.rpc("upsert_calendar_exception", { p_data: "2026-10-12", p_tipo: "dia_extra", p_descricao: "Produz no feriado", p_horas: null });
    check("dia extra prevalece sobre o feriado nacional (volta a contar a segunda)", (await dias(a.company, "2026-10-12", 7)) === 5);

    await a.client.rpc("upsert_calendar_exception", { p_data: "2026-10-12", p_tipo: "ponte", p_descricao: "Ponte", p_horas: null });
    const { data: u } = await admin.from("company_calendar_exceptions").select("tipo, trabalha").eq("company_id", a.company.id).eq("data", "2026-10-12").single();
    check("upsert na mesma data troca o tipo (dia_extra → ponte, trabalha=false)", u?.tipo === "ponte" && u?.trabalha === false, u);

    const { error: eRem } = await a.client.rpc("remove_calendar_exception", { p_data: "2026-10-14" });
    const { error: eRem2 } = await a.client.rpc("remove_calendar_exception", { p_data: "2026-10-14" });
    check("remove exceção; remover de novo é recusado", !eRem && !!eRem2);
  }

  console.log("\n3. Calendário mensal");
  {
    const { data: mes, error } = await a.client.rpc("calendario_mensal", { p_ano: 2026, p_mes: 10 });
    check("outubro/2026 devolve 31 dias", !error && mes?.length === 31, error);
    const d = (x) => mes?.find((r) => r.data === x);
    check("12/10 é ponte (cadastrada), 17/10 é dia extra com 6 h", d("2026-10-12")?.origem === "ponte" && d("2026-10-17")?.origem === "dia_extra" && Number(d("2026-10-17")?.horas) === 6, [d("2026-10-12"), d("2026-10-17")]);
    check("13/10 (terça) é dia normal de 8 h e 18/10 (domingo) não trabalha", d("2026-10-13")?.trabalha === true && Number(d("2026-10-13")?.horas) === 8 && d("2026-10-18")?.trabalha === false);
    const { data: mesNov } = await a.client.rpc("calendario_mensal", { p_ano: 2026, p_mes: 11 });
    check("novembro/2026: 02, 15 e 20 aparecem como feriado nacional", ["2026-11-02", "2026-11-15", "2026-11-20"].every((x) => mesNov?.find((r) => r.data === x)?.origem === "feriado_nacional"));
    const { error: eMes } = await a.client.rpc("calendario_mensal", { p_ano: 2026, p_mes: 13 });
    check("mês inválido é recusado", !!eMes);
  }

  console.log("\n4. Validações, permissão e isolamento");
  {
    const { error: eSemPerm } = await semPerm.client.rpc("upsert_calendar_exception", { p_data: "2026-12-24", p_tipo: "folga", p_descricao: "x", p_horas: null });
    const { error: eSemPermOp } = await semPerm.client.rpc("upsert_calendar_settings", { p_feriados_nacionais: false, p_pontos_facultativos: false });
    check("sem configuracoes.manage não altera calendário nem opções", !!eSemPerm && !!eSemPermOp);
    const { error: eTipo } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-12-24", p_tipo: "inventado", p_descricao: "x", p_horas: null });
    const { error: eDesc } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-12-24", p_tipo: "folga", p_descricao: "  ", p_horas: null });
    const { error: eHoras } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-12-24", p_tipo: "folga", p_descricao: "x", p_horas: 4 });
    const { error: eHoras2 } = await a.client.rpc("upsert_calendar_exception", { p_data: "2026-12-24", p_tipo: "dia_extra", p_descricao: "x", p_horas: 30 });
    check("tipo inválido, descrição vazia e horas fora de regra são recusados", !!eTipo && !!eDesc && !!eHoras && !!eHoras2);

    const { data: excB } = await b.client.from("company_calendar_exceptions").select("data");
    check("empresa B não enxerga as exceções da A", (excB ?? []).length === 0);
    check("a janela da empresa B não é afetada pelo calendário da A", (await dias(b.company, "2026-10-12", 7)) === 4);
    const { data: setB } = await b.client.from("company_calendar_settings").select("company_id");
    check("empresa B não enxerga as opções da A", (setB ?? []).length === 0);

    const { data: logs } = await admin.from("activity_logs").select("action").eq("company_id", a.company.id)
      .in("action", ["config.calendario_excecao_upserted", "config.calendario_excecao_removida", "config.calendario_opcoes_upserted"]);
    const acoes = new Set((logs ?? []).map((l) => l.action));
    check("alterações do calendário auditadas", acoes.size === 3, [...acoes]);
  }

  console.log("\n5. Capacidade usa o calendário");
  {
    const { data: recId, error: eRec } = await a.client.rpc("criar_recurso_produtivo", { p_codigo: "CAL-01", p_nome: "Recurso calendário", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 10 });
    check("fixture: recurso de 10 h/dia criado", !eRec && !!recId, eRec);
    const hoje = new Date().toISOString().slice(0, 10);
    const esperado = 10 * (await dias(a.company, hoje, 7));
    const { data: cap } = await a.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: recId, p_dias: 7 });
    check("calcular_capacidade_recurso = 10 h × dias úteis da janela de hoje (com calendário)", Number(cap?.[0]?.capacidade_disponivel_horas) === esperado, { esperado, cap });
  }

  console.log("\n6. Capacidade parte das horas do horário de funcionamento (recurso sem horas próprias)");
  {
    // sábado de 4 h, para os dias da janela terem horas diferentes (8 h na semana, 4 h no sábado)
    await a.client.rpc("upsert_company_work_schedule", { p_dias: [{ dia_semana: 6, trabalha: true, inicio: "08:00", fim: "12:00", almoco_minutos: 0 }] });
    const hoje = new Date();
    const horasEmpresaNaJanela = async () => {
      let soma = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(hoje.getTime() + i * 86400000).toISOString().slice(0, 10);
        const { data } = await admin.rpc("_info_dia_empresa", { p_company_id: a.company.id, p_data: d });
        const info = Array.isArray(data) ? data[0] : data;
        if (info?.trabalha) soma += Number(info.horas ?? 0);
      }
      return soma;
    };
    const diasJanela = await dias(a.company, hoje.toISOString().slice(0, 10), 7);
    const horasEmpresa = await horasEmpresaNaJanela();

    const { data: semHorasId, error: eSem } = await a.client.rpc("criar_recurso_produtivo", { p_codigo: "CAL-02", p_nome: "Sem horas próprias", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: null });
    check("fixture: recurso sem horas próprias criado", !eSem && !!semHorasId, eSem);
    const { data: capSem } = await a.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: semHorasId, p_dias: 7 });
    check(
      `recurso sem horas próprias usa o expediente da empresa na janela (${horasEmpresa} h)`,
      Number(capSem?.[0]?.capacidade_disponivel_horas) === horasEmpresa && horasEmpresa > 0,
      { horasEmpresa, capSem },
    );

    const { data: comHorasId } = await a.client.rpc("criar_recurso_produtivo", { p_codigo: "CAL-03", p_nome: "Com horas próprias", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 10 });
    const { data: capCom } = await a.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: comHorasId, p_dias: 7 });
    check(
      `recurso com horas próprias (10 h) usa as dele em cada dia de produção (10 × ${diasJanela})`,
      Number(capCom?.[0]?.capacidade_disponivel_horas) === 10 * diasJanela,
      { diasJanela, capCom },
    );

    const { data: lista } = await a.client.rpc("listar_capacidade_recursos", { p_dias: 7 });
    check(
      "listar_capacidade_recursos() traz os dois com os mesmos valores",
      Number((lista ?? []).find((r) => r.recurso_produtivo_id === semHorasId)?.capacidade_disponivel_horas) === horasEmpresa &&
        Number((lista ?? []).find((r) => r.recurso_produtivo_id === comHorasId)?.capacidade_disponivel_horas) === 10 * diasJanela,
    );

    // empresa sem horário cadastrado: recurso sem horas próprias fica com 0
    await admin.from("company_work_schedule").delete().eq("company_id", b.company.id);
    const { data: semHorarioId } = await b.client.rpc("criar_recurso_produtivo", { p_codigo: "CAL-04", p_nome: "Sem horário", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: null });
    const { data: capB } = await b.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: semHorarioId, p_dias: 7 });
    check("empresa sem horário cadastrado + recurso sem horas próprias = 0 h", Number(capB?.[0]?.capacidade_disponivel_horas) === 0, capB);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
