-- TÓPICO 13 — Integrações, recorte mínimo do MVP (Fase 1). ADR-002 v2.5
-- §4.17 — decisão do responsável do produto em 23/09/2026, via chat.
--
-- O doc (docs/Prompt TÓPICO 13, 40 seções) não tem um "Escopo do MVP"
-- fechado como o TÓPICO 18 (§12) tem — o próprio §37 do doc ainda é amplo
-- demais pra virar código direto sem recorte. Esta é a primeira fase
-- aprovada: só a espinha dorsal técnica da Central de Integrações, sem
-- nenhum conector externo real ligado. Nada aqui fala com ERP, banco,
-- fiscal ou qualquer serviço de terceiro de verdade.
--
-- O QUE ENTRA NESTA FASE:
--   - Central de Integrações (§2): registro por empresa, ativar/desativar
--     sem apagar histórico.
--   - Catálogo de integrações (§3): tabela global de referência. Semeada
--     (seed.sql) só com os dois "ganchos vazios" aprovados nesta fase —
--     ERP genérico e provedor de NF-e — ambos com disponivel=false: só
--     documentam a existência futura do conector, nenhum é acionável.
--   - Eventos internos entre módulos (§4), nível Informativo (§15) —
--     "detectar → registrar → informar", sem nenhuma execução automática
--     de efeito operacional/financeiro. Implementado como função que grava
--     em activity_logs (não uma tabela nova) — mesmo padrão de todo outro
--     módulo do sistema, que não tem tabela de log própria.
--   - Infraestrutura técnica genérica (§16-18): fila assíncrona simples,
--     idempotência (chave única por empresa) e retry com backoff
--     exponencial; "erro permanente → intervenção necessária" fica
--     registrado, nunca escondido.
--   - Fonte oficial por tipo de informação (§9): só o registro da
--     configuração por empresa — reconciliação automática (§11) fica de
--     fora.
--
-- O QUE FICA DE FORA DESTA FASE (entra depois, dentro do próprio TÓPICO
-- 13, mediante nova aprovação): processamento real de NF-e/fiscal (§5.1-
-- 5.7 — a estrutura de REGISTRO do documento em si já existe desde
-- ADR-004 §9.2, tabela documentos_fiscais, com campo `provedor` reservado
-- exatamente pra isso — não duplicamos aqui), bancos/PIX/boletos (§6),
-- cartões (§7), sincronização real de ERP (§8), APIs de terceiros com
-- autenticação real (§13), Webhooks recebidos/enviados (§14),
-- certificados digitais (§22), reconciliação automática (§11),
-- importação/exportação genérica (§29-30, além do que já existe em
-- §4.2.1) e o gancho do otimizador de corte externo (§40).
--
-- DECISÕES DE RECORTE:
--   - "Testar conexão" e "sincronizar manualmente" (§2) não têm função
--     dedicada nesta fase — não existe nenhum conector real pra testar
--     ou sincronizar; fingir uma função que "testa" algo que não existe
--     seria simular uma capacidade que o sistema não tem. Ambos entram
--     junto com o primeiro conector real, em fase futura.
--   - enfileirar_operacao()/iniciar_processamento_operacao() exigem a
--     integração com status='ativo' — é a forma concreta de cumprir a
--     regra do §2 ("a desativação... deverá interromper novos
--     processamentos automáticos sem apagar dados ou histórico
--     existentes"). concluir/falhar/reprocessar/cancelar não checam
--     status: encerrar ou cancelar trabalho já em curso deve sempre ser
--     possível, mesmo com a integração desativada no meio do caminho.
--   - falhar_operacao() com erro permanente também grava em
--     public.system_events (ADR-009 §5.1, categoria 'integration_failure'
--     já prevista naquele enum) — observabilidade técnica pro
--     platform_admin, além da auditoria de negócio em activity_logs.
--   - Catálogo (integracoes_catalogo) é tabela global, sem company_id,
--     mesmo padrão de public.permissions — SELECT aberto a qualquer
--     autenticado (using (true)), porque não carrega dado de tenant.
--
-- Checklist de segurança (auditoria 14/09/2026, incorporada ao CLAUDE.md):
-- toda mutação valida current_company_id() via assert_tenant_write(),
-- nunca aceita company_id do cliente; toda mutação checa empresa
-- suspensa; todo gate é has_permission('integracoes', ...), explícito,
-- nunca só RLS; toda função SECURITY DEFINER fixa search_path=public;
-- nenhuma função recebe EXECUTE de PUBLIC/anon (default privileges já
-- revogam — phase8_security_gate_p0.sql — grant é explícito por função
-- aqui); RLS habilitada em toda tabela nova com teste de isolamento
-- cross-tenant e teste negativo (deny) no scripts/test-integracoes.mjs.

-- =========================================================================
-- 1. CATÁLOGO DE INTEGRAÇÕES (§3) — global, sem company_id.
-- =========================================================================

create table public.integracoes_catalogo (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  nome text not null,
  categoria text not null check (categoria in (
    'erp', 'bancos', 'fiscal', 'pagamentos', 'transportadoras', 'logistica',
    'bi', 'ecommerce', 'marketplaces', 'apis', 'outros'
  )),
  finalidade text,
  disponivel boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.integracoes_catalogo is
  'TÓPICO 13 §3 — catálogo global de conectores. Constar aqui não ativa nada pra nenhuma empresa (§3, último parágrafo). Nesta fase só existem "ganchos vazios" (disponivel=false) semeados via seed.sql — nenhum conector real.';

alter table public.integracoes_catalogo enable row level security;
create policy integracoes_catalogo_select on public.integracoes_catalogo for select
  using (true); -- catálogo global, não contém dado de tenant (mesmo padrão de public.permissions)

grant select on public.integracoes_catalogo to authenticated;

-- =========================================================================
-- 2. CENTRAL DE INTEGRAÇÕES (§2) — instância por empresa de um item do
--    catálogo.
-- =========================================================================

create table public.integracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  catalogo_id uuid not null references public.integracoes_catalogo(id),
  apelido text,
  ambiente text not null default 'producao' check (ambiente in ('producao', 'homologacao', 'sandbox')),
  status text not null default 'inativo' check (status in ('ativo', 'inativo')),
  config jsonb,
  ativada_em timestamptz,
  desativada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integracoes_company_catalogo_unique unique (company_id, catalogo_id)
);
comment on table public.integracoes is
  'TÓPICO 13 §2 — Central de Integrações, uma linha por conector configurado pela empresa. Nesta fase, config/ambiente são só registro administrativo: nenhuma função aqui fala de fato com um sistema externo.';
create index integracoes_company_id_idx on public.integracoes (company_id);

create trigger set_updated_at before update on public.integracoes
  for each row execute function public.set_updated_at();

alter table public.integracoes enable row level security;
create policy integracoes_select on public.integracoes for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('integracoes', 'view')));

grant select on public.integracoes to authenticated;

create or replace function public.configurar_integracao(
  p_id uuid,
  p_catalogo_key text,
  p_apelido text default null,
  p_ambiente text default 'producao',
  p_config jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_catalogo_id uuid;
  v_before public.integracoes;
  v_id uuid;
begin
  if p_ambiente not in ('producao', 'homologacao', 'sandbox') then
    raise exception 'Ambiente inválido: "%".', p_ambiente;
  end if;

  if p_id is not null then
    select * into v_before from public.integracoes
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Integração não encontrada nesta empresa.';
    end if;

    update public.integracoes
    set apelido = p_apelido, ambiente = p_ambiente, config = p_config
    where id = p_id
    returning id into v_id;
  else
    select id into v_catalogo_id from public.integracoes_catalogo where key = p_catalogo_key;
    if v_catalogo_id is null then
      raise exception 'Integração "%" não existe no catálogo.', p_catalogo_key;
    end if;
    if exists (select 1 from public.integracoes where company_id = v_company_id and catalogo_id = v_catalogo_id) then
      raise exception 'Esta empresa já tem uma configuração para "%". Edite a existente.', p_catalogo_key;
    end if;

    insert into public.integracoes (company_id, catalogo_id, apelido, ambiente, config)
    values (v_company_id, v_catalogo_id, p_apelido, p_ambiente, p_config)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'integracoes.configurada' else 'integracoes.reconfigurada' end,
    'integracao', v_id, coalesce(p_apelido, p_catalogo_key),
    jsonb_build_object('ambiente', p_ambiente, 'before', to_jsonb(v_before))
  );

  return v_id;
end;
$$;

grant execute on function public.configurar_integracao(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.ativar_integracao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_row public.integracoes;
begin
  select * into v_row from public.integracoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_row.status = 'ativo' then
    raise exception 'Integração já está ativa.';
  end if;

  update public.integracoes set status = 'ativo', ativada_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.ativada', 'integracao', p_id, v_row.apelido);

  return p_id;
end;
$$;

grant execute on function public.ativar_integracao(uuid) to authenticated;

create or replace function public.desativar_integracao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_row public.integracoes;
begin
  select * into v_row from public.integracoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_row.status = 'inativo' then
    raise exception 'Integração já está inativa.';
  end if;

  -- Só muda o status — dados e histórico (activity_logs, operações em
  -- fila) permanecem intactos (§2: "sem apagar dados ou históricos
  -- existentes"). O bloqueio de novos processamentos automáticos é
  -- aplicado em enfileirar_operacao()/iniciar_processamento_operacao().
  update public.integracoes set status = 'inativo', desativada_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.desativada', 'integracao', p_id, v_row.apelido);

  return p_id;
end;
$$;

grant execute on function public.desativar_integracao(uuid) to authenticated;

-- =========================================================================
-- 3. FILA ASSÍNCRONA GENÉRICA — idempotência e retry (§16-18).
--    Infraestrutura pronta pra módulos futuros enfileirarem operações;
--    nesta fase nada a chama automaticamente (nenhum conector real).
-- =========================================================================

create table public.integracao_operacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  integracao_id uuid not null references public.integracoes(id),
  origem text not null default 'manual',
  tipo text not null,
  prioridade integer not null default 0,
  chave_idempotencia text,
  payload jsonb,
  status text not null default 'pendente' check (status in (
    'pendente', 'processando', 'concluido', 'erro_temporario', 'erro_permanente', 'cancelado'
  )),
  tentativas integer not null default 0,
  max_tentativas integer not null default 5,
  ultima_tentativa_em timestamptz,
  proxima_tentativa_em timestamptz,
  resultado jsonb,
  erro text,
  reprocessamentos_manuais integer not null default 0,
  correlacao_id uuid not null default gen_random_uuid(),
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.integracao_operacoes is
  'TÓPICO 13 §16-18 — fila assíncrona genérica com idempotência e retry. "Nunca apagar o processamento original ao reprocessar" (§17): reprocessar_operacao() só reabre o status, nunca deleta a linha.';
create index integracao_operacoes_company_id_idx on public.integracao_operacoes (company_id);
create index integracao_operacoes_integracao_id_idx on public.integracao_operacoes (integracao_id);
create index integracao_operacoes_status_idx on public.integracao_operacoes (company_id, status);
-- Idempotência (§18): mesma chave não duplica dentro da mesma empresa.
create unique index integracao_operacoes_idempotencia_unique
  on public.integracao_operacoes (company_id, chave_idempotencia) where chave_idempotencia is not null;

create trigger set_updated_at before update on public.integracao_operacoes
  for each row execute function public.set_updated_at();

alter table public.integracao_operacoes enable row level security;
create policy integracao_operacoes_select on public.integracao_operacoes for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('integracoes', 'view')));

grant select on public.integracao_operacoes to authenticated;

create or replace function public.enfileirar_operacao(
  p_integracao_id uuid,
  p_tipo text,
  p_payload jsonb default null,
  p_chave_idempotencia text default null,
  p_prioridade integer default 0,
  p_origem text default 'manual'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_integracao public.integracoes;
  v_existing_id uuid;
  v_id uuid;
begin
  if p_tipo is null or btrim(p_tipo) = '' then
    raise exception 'Tipo da operação é obrigatório.';
  end if;

  select * into v_integracao from public.integracoes
  where id = p_integracao_id and company_id = v_company_id;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: não é possível enfileirar novas operações (§2).';
  end if;

  if p_chave_idempotencia is not null then
    select id into v_existing_id from public.integracao_operacoes
    where company_id = v_company_id and chave_idempotencia = p_chave_idempotencia;
    if v_existing_id is not null then
      return v_existing_id; -- §18: não duplica — devolve a operação já existente.
    end if;
  end if;

  insert into public.integracao_operacoes (
    company_id, integracao_id, origem, tipo, prioridade, chave_idempotencia, payload, criado_por
  ) values (
    v_company_id, p_integracao_id, p_origem, p_tipo, p_prioridade, p_chave_idempotencia, p_payload, auth.uid()
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'integracoes.operacao_enfileirada', 'integracao_operacao', v_id, p_tipo,
    jsonb_build_object('integracao_id', p_integracao_id, 'origem', p_origem)
  );

  return v_id;
end;
$$;

grant execute on function public.enfileirar_operacao(uuid, text, jsonb, text, integer, text) to authenticated;

create or replace function public.iniciar_processamento_operacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_op public.integracao_operacoes;
  v_integracao public.integracoes;
begin
  select * into v_op from public.integracao_operacoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação não encontrada nesta empresa.';
  end if;
  if v_op.status <> 'pendente' then
    raise exception 'Só é possível iniciar processamento de operação pendente (status atual: %).', v_op.status;
  end if;

  select * into v_integracao from public.integracoes where id = v_op.integracao_id;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: não é possível iniciar processamento (§2).';
  end if;

  update public.integracao_operacoes
  set status = 'processando', ultima_tentativa_em = now()
  where id = p_id;

  return p_id;
end;
$$;

grant execute on function public.iniciar_processamento_operacao(uuid) to authenticated;

create or replace function public.concluir_operacao(p_id uuid, p_resultado jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_op public.integracao_operacoes;
begin
  select * into v_op from public.integracao_operacoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação não encontrada nesta empresa.';
  end if;
  if v_op.status <> 'processando' then
    raise exception 'Só é possível concluir operação em processamento (status atual: %).', v_op.status;
  end if;

  update public.integracao_operacoes set status = 'concluido', resultado = p_resultado where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'integracoes.operacao_concluida', 'integracao_operacao', p_id, v_op.tipo, p_resultado);

  return p_id;
end;
$$;

grant execute on function public.concluir_operacao(uuid, jsonb) to authenticated;

create or replace function public.falhar_operacao(p_id uuid, p_erro text, p_permanente boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_op public.integracao_operacoes;
  v_tentativas integer;
  v_status text;
  v_proxima timestamptz;
begin
  select * into v_op from public.integracao_operacoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação não encontrada nesta empresa.';
  end if;
  if v_op.status <> 'processando' then
    raise exception 'Só é possível marcar falha de operação em processamento (status atual: %).', v_op.status;
  end if;

  v_tentativas := v_op.tentativas + 1;
  if p_permanente or v_tentativas >= v_op.max_tentativas then
    v_status := 'erro_permanente';
    v_proxima := null;
  else
    v_status := 'erro_temporario';
    -- backoff exponencial simples (§17): 2^tentativas minutos. make_interval()
    -- em vez de "numeric * interval" — evita depender de resolução de
    -- overload de operador entre numeric/double precision e interval.
    v_proxima := now() + make_interval(mins => power(2, v_tentativas)::int);
  end if;

  update public.integracao_operacoes
  set status = v_status, tentativas = v_tentativas, erro = p_erro, proxima_tentativa_em = v_proxima
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'integracoes.operacao_falhou', 'integracao_operacao', p_id, p_erro,
    jsonb_build_object('tentativas', v_tentativas, 'status', v_status)
  );

  if v_status = 'erro_permanente' then
    perform public.log_system_event(
      'integration_failure', p_erro, 'error', v_company_id, v_op.correlacao_id,
      jsonb_build_object('integracao_id', v_op.integracao_id, 'operacao_id', p_id, 'tipo', v_op.tipo, 'tentativas', v_tentativas)
    );
  end if;

  return p_id;
end;
$$;

grant execute on function public.falhar_operacao(uuid, text, boolean) to authenticated;

create or replace function public.reprocessar_operacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_op public.integracao_operacoes;
  v_integracao public.integracoes;
begin
  select * into v_op from public.integracao_operacoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('erro_temporario', 'erro_permanente') then
    raise exception 'Só é possível reprocessar operação com erro (status atual: %).', v_op.status;
  end if;

  select * into v_integracao from public.integracoes where id = v_op.integracao_id;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: não é possível reprocessar (§2).';
  end if;

  update public.integracao_operacoes
  set status = 'pendente', proxima_tentativa_em = null, reprocessamentos_manuais = reprocessamentos_manuais + 1
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.operacao_reprocessada', 'integracao_operacao', p_id, v_op.tipo);

  return p_id;
end;
$$;

grant execute on function public.reprocessar_operacao(uuid) to authenticated;

create or replace function public.cancelar_operacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_op public.integracao_operacoes;
begin
  select * into v_op from public.integracao_operacoes
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('pendente', 'erro_temporario', 'erro_permanente') then
    raise exception 'Não é possível cancelar operação com status "%".', v_op.status;
  end if;

  update public.integracao_operacoes set status = 'cancelado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.operacao_cancelada', 'integracao_operacao', p_id, v_op.tipo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_operacao(uuid) to authenticated;

-- =========================================================================
-- 4. FONTE OFICIAL POR TIPO DE INFORMAÇÃO (§9) — só o registro da
--    configuração; reconciliação automática (§11) fica de fora.
-- =========================================================================

create table public.integracao_fonte_oficial (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tipo_informacao text not null,
  sistema_fonte text not null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integracao_fonte_oficial_unique unique (company_id, tipo_informacao)
);
comment on table public.integracao_fonte_oficial is
  'TÓPICO 13 §9 — qual sistema é a fonte oficial de cada tipo de informação/processo, por empresa. Só registro; reconciliação automática entre sistemas (§11) fica fora desta fase.';

create trigger set_updated_at before update on public.integracao_fonte_oficial
  for each row execute function public.set_updated_at();

alter table public.integracao_fonte_oficial enable row level security;
create policy integracao_fonte_oficial_select on public.integracao_fonte_oficial for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('integracoes', 'view')));

grant select on public.integracao_fonte_oficial to authenticated;

create or replace function public.definir_fonte_oficial(
  p_tipo_informacao text,
  p_sistema_fonte text,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_id uuid;
begin
  if p_tipo_informacao is null or btrim(p_tipo_informacao) = '' then
    raise exception 'Tipo de informação é obrigatório.';
  end if;
  if p_sistema_fonte is null or btrim(p_sistema_fonte) = '' then
    raise exception 'Sistema fonte é obrigatório.';
  end if;

  insert into public.integracao_fonte_oficial (company_id, tipo_informacao, sistema_fonte, observacoes)
  values (v_company_id, p_tipo_informacao, p_sistema_fonte, p_observacoes)
  on conflict (company_id, tipo_informacao)
  do update set sistema_fonte = excluded.sistema_fonte, observacoes = excluded.observacoes
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'integracoes.fonte_oficial_definida', 'integracao_fonte_oficial', v_id, p_tipo_informacao,
    jsonb_build_object('sistema_fonte', p_sistema_fonte)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_fonte_oficial(text, text, text) to authenticated;

-- =========================================================================
-- 5. EVENTOS INTERNOS ENTRE MÓDULOS (§4), nível Informativo (§15) —
--    "detectar → registrar → informar". Sem tabela própria: grava em
--    activity_logs, mesmo padrão de todo outro módulo. Pronta pra módulos
--    futuros chamarem; nesta fase nenhum módulo chama automaticamente.
-- =========================================================================

create or replace function public.registrar_evento_integracao(
  p_modulo_origem text,
  p_modulo_destino text,
  p_tipo_evento text,
  p_entidade_tipo text default null,
  p_entidade_id uuid default null,
  p_descricao text default null,
  p_metadata jsonb default null,
  p_correlacao_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_id uuid;
begin
  if p_modulo_origem is null or btrim(p_modulo_origem) = '' then
    raise exception 'Módulo de origem é obrigatório.';
  end if;
  if p_tipo_evento is null or btrim(p_tipo_evento) = '' then
    raise exception 'Tipo de evento é obrigatório.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'integracoes.evento_modulo', coalesce(p_entidade_tipo, 'evento_integracao'), p_entidade_id,
    p_descricao,
    jsonb_build_object(
      'modulo_origem', p_modulo_origem,
      'modulo_destino', p_modulo_destino,
      'tipo_evento', p_tipo_evento,
      'nivel_automacao', 'informativo',
      'correlacao_id', coalesce(p_correlacao_id, gen_random_uuid())
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.registrar_evento_integracao(text, text, text, text, uuid, text, jsonb, uuid) to authenticated;
