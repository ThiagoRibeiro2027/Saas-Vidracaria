-- TÓPICO 13 — Integrações, Fase 5 (ADR-002 §4.14/§4.17, emenda de
-- 25/09/2026): Bancos, Boletos e PIX (§6), com título a pagar + fluxo de
-- aprovação (§6.2). §4.14 (Financeiro) listava "integração bancária,
-- contas a pagar, cobrança, conciliação" como fora do MVP — esta emenda
-- abre exatamente esses itens, sem tocar no restante do que §4.14 mantém
-- fora (plano de contas, DRE, centros de custo, fluxo de caixa completo).
--
-- Decisões de recorte (responsável do produto, via chat):
--   - Título a pagar JÁ EXISTIA (Compras, ADR-011 Fase 6,
--     20261024000000_compras_pedido_orcamento.sql — public.titulos_pagar,
--     registrar_pagamento_titulo_compra()). Esta fase NÃO recria o
--     conceito — adiciona o fluxo de aprovação por cima dele.
--   - §6.2 (Título → Solicitação → Aprovação → Envio ao banco →
--     Processamento → Confirmação): "Envio ao banco → Processamento →
--     Confirmação" vira UM passo manual só (não existe conector bancário
--     real — fingir os 3 estados seria simular capacidade que o sistema
--     não tem, mesmo princípio já usado no catálogo de integrações da
--     Fase 1). registrar_pagamento_titulo_compra() já existente cumpre
--     esse papel; esta migration só a AMPLIA (create or replace,
--     compatível com todo caller/teste já existente) pra exigir alçada
--     aprovada quando ela foi submetida.
--   - Alçada de pagamento é uma engine NOVA e própria do Financeiro
--     (financeiro_alcada_etapas/financeiro_aprovacoes/financeiro_
--     aprovacao_etapas), não um reaproveitamento de compras_alcada_etapas
--     — mesma decisão já tomada em T18 (Contratos não reaproveitou a
--     engine de Compras): o gate de decisão precisa ser
--     financeiro.aprovar, não compras.manage, e misturar o "dono" de uma
--     tabela de aprovação entre dois módulos seria confuso. Estrutura
--     (config por processo/ordem/valor_mínimo/role + instância com
--     etapas) é a mesma, só o dono muda.
--   - Conciliação (§6.1) só manual nesta fase — sem provedor real
--     conectado, não há dado de banco de verdade pra comparar
--     automaticamente; "automática"/"sugerida" ficam pra quando houver
--     extrato real importável.
--   - Cobrança (boleto/PIX) sobre título a RECEBER (T11,
--     titulos_financeiros) nasce só como registro — nenhuma linha
--     digitável/QR Code real é gerada (nenhum provedor bancário real
--     conectado); marcar como paga chama registrar_recebimento_titulo()
--     já existente, pra nunca duplicar o estado do recebimento.
--
-- Checklist de segurança (CLAUDE.md): RLS habilitada em toda tabela nova
-- com teste de isolamento cross-tenant; toda mutação usa
-- assert_tenant_write() com a ação certa (nunca só 'manage' quando existe
-- ação mais específica — financeiro.aprovar/pagar/receber, mesmo espírito
-- de contratos.aprovar); permissão financeiro.aprovar cadastrada em
-- supabase/seed.sql (convenção do projeto: catálogo de permissões vive lá,
-- não em migration nova); SECURITY DEFINER com search_path=public em
-- todas; nenhuma alteração de comportamento pra quem nunca configurar
-- alçada (mesmo princípio de approval_thresholds/compras: sem etapa
-- aplicável não bloqueia).

insert into public.numbering_document_types (document_type, resource, action) values
  ('cobranca', 'financeiro', 'manage');

-- Permissão nova (financeiro.aprovar) vai em supabase/seed.sql — catálogo
-- de permissões vive lá, não em migration nova (mesma convenção de
-- financeiro.pagar/contratos.aprovar).

-- =========================================================================
-- 1. CONTA BANCÁRIA DA EMPRESA
-- =========================================================================

create table public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  banco text not null,
  agencia text not null,
  conta text not null,
  tipo_conta text not null check (tipo_conta in ('corrente', 'poupanca')),
  pix_chave text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contas_bancarias is
  'TÓPICO 13 §6, Fase 5 — cadastro de conta bancária da empresa. Nenhum provedor real conectado nesta fase (estrutura preparada, mesmo padrão do catálogo de integrações).';
create index contas_bancarias_company_id_idx on public.contas_bancarias (company_id);

create trigger set_updated_at before update on public.contas_bancarias
  for each row execute function public.set_updated_at();

alter table public.contas_bancarias enable row level security;
create policy contas_bancarias_select on public.contas_bancarias for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));

grant select on public.contas_bancarias to authenticated;

create or replace function public.configurar_conta_bancaria(
  p_id uuid, p_banco text, p_agencia text, p_conta text, p_tipo_conta text, p_pix_chave text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_id uuid;
begin
  if p_banco is null or btrim(p_banco) = '' then
    raise exception 'Banco é obrigatório.';
  end if;
  if p_agencia is null or btrim(p_agencia) = '' then
    raise exception 'Agência é obrigatória.';
  end if;
  if p_conta is null or btrim(p_conta) = '' then
    raise exception 'Conta é obrigatória.';
  end if;
  if p_tipo_conta not in ('corrente', 'poupanca') then
    raise exception 'Tipo de conta inválido: "%".', p_tipo_conta;
  end if;

  if p_id is not null then
    update public.contas_bancarias
    set banco = p_banco, agencia = p_agencia, conta = p_conta, tipo_conta = p_tipo_conta, pix_chave = p_pix_chave
    where id = p_id and company_id = v_company_id
    returning id into v_id;
    if not found then
      raise exception 'Conta bancária não encontrada nesta empresa.';
    end if;
  else
    insert into public.contas_bancarias (company_id, banco, agencia, conta, tipo_conta, pix_chave)
    values (v_company_id, p_banco, p_agencia, p_conta, p_tipo_conta, p_pix_chave)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (
    v_company_id, auth.uid(),
    case when p_id is null then 'financeiro.conta_bancaria_configurada' else 'financeiro.conta_bancaria_reconfigurada' end,
    'conta_bancaria', v_id, p_banco
  );

  return v_id;
end;
$$;

grant execute on function public.configurar_conta_bancaria(uuid, text, text, text, text, text) to authenticated;

create or replace function public.desativar_conta_bancaria(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
begin
  update public.contas_bancarias set ativa = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Conta bancária não encontrada nesta empresa.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'financeiro.conta_bancaria_desativada', 'conta_bancaria', p_id);
  return p_id;
end;
$$;

grant execute on function public.desativar_conta_bancaria(uuid) to authenticated;

create or replace function public.ativar_conta_bancaria(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
begin
  update public.contas_bancarias set ativa = true where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Conta bancária não encontrada nesta empresa.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'financeiro.conta_bancaria_ativada', 'conta_bancaria', p_id);
  return p_id;
end;
$$;

grant execute on function public.ativar_conta_bancaria(uuid) to authenticated;

-- =========================================================================
-- 2. ALÇADA DE PAGAMENTO (Financeiro) — engine própria, mesmo desenho da
--    de Compras (config por processo/ordem/valor_mínimo/role + instância
--    com etapas), mas com dono e gate corretos (financeiro.aprovar).
-- =========================================================================

create table public.financeiro_alcada_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  processo text not null,
  ordem smallint not null check (ordem > 0),
  valor_minimo numeric(14, 2) not null check (valor_minimo >= 0),
  role_id uuid not null references public.roles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_alcada_etapas_unique unique (company_id, processo, ordem)
);
comment on table public.financeiro_alcada_etapas is
  'TÓPICO 13 §6.2, Fase 5 — alçada multi-etapa do Financeiro, por processo (esta fase usa "titulo_pagar"). Engine irmã de compras_alcada_etapas, não compartilhada — gate de decisão é financeiro.aprovar, não compras.manage.';
create index financeiro_alcada_etapas_company_id_idx on public.financeiro_alcada_etapas (company_id);

create table public.financeiro_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  processo text not null,
  entidade_id uuid not null,
  valor numeric(14, 2) not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
comment on table public.financeiro_aprovacoes is
  'TÓPICO 13 §6.2, Fase 5 — instância de aprovação por alçada do Financeiro (título a pagar hoje). Sem etapa aplicável = aprovada automaticamente (mesmo espírito de approval_thresholds/compras_aprovacoes).';
create index financeiro_aprovacoes_company_id_idx on public.financeiro_aprovacoes (company_id);
create index financeiro_aprovacoes_entidade_idx on public.financeiro_aprovacoes (entidade_id);

create table public.financeiro_aprovacao_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  financeiro_aprovacao_id uuid not null references public.financeiro_aprovacoes(id) on delete cascade,
  ordem smallint not null,
  valor_minimo numeric(14, 2) not null,
  role_id uuid not null references public.roles(id),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  observacao text,
  constraint financeiro_aprovacao_etapas_unique unique (financeiro_aprovacao_id, ordem)
);
comment on table public.financeiro_aprovacao_etapas is
  'TÓPICO 13 §6.2, Fase 5 — etapa concreta de uma aprovação financeira (snapshot de valor_minimo/role_id). Decidida em ordem: só a etapa de menor ordem "pendente" é decidível.';
create index financeiro_aprovacao_etapas_company_id_idx on public.financeiro_aprovacao_etapas (company_id);
create index financeiro_aprovacao_etapas_aprovacao_id_idx on public.financeiro_aprovacao_etapas (financeiro_aprovacao_id);

alter table public.financeiro_alcada_etapas enable row level security;
create policy financeiro_alcada_etapas_select on public.financeiro_alcada_etapas for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));
grant select on public.financeiro_alcada_etapas to authenticated;

alter table public.financeiro_aprovacoes enable row level security;
create policy financeiro_aprovacoes_select on public.financeiro_aprovacoes for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));
grant select on public.financeiro_aprovacoes to authenticated;

alter table public.financeiro_aprovacao_etapas enable row level security;
create policy financeiro_aprovacao_etapas_select on public.financeiro_aprovacao_etapas for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));
grant select on public.financeiro_aprovacao_etapas to authenticated;

create trigger set_updated_at before update on public.financeiro_alcada_etapas
  for each row execute function public.set_updated_at();

create or replace function public.upsert_alcada_financeiro(
  p_processo text, p_ordem smallint, p_valor_minimo numeric, p_role_id uuid, p_ativo boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_id uuid;
begin
  if p_ordem is null or p_ordem <= 0 then
    raise exception 'Ordem da etapa deve ser maior que zero.';
  end if;
  if p_valor_minimo is null or p_valor_minimo < 0 then
    raise exception 'Valor mínimo inválido.';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (company_id = v_company_id or company_id is null)) then
    raise exception 'Perfil aprovador inválido para esta empresa.';
  end if;

  insert into public.financeiro_alcada_etapas (company_id, processo, ordem, valor_minimo, role_id, ativo)
  values (v_company_id, p_processo, p_ordem, p_valor_minimo, p_role_id, coalesce(p_ativo, true))
  on conflict (company_id, processo, ordem) do update set
    valor_minimo = excluded.valor_minimo, role_id = excluded.role_id, ativo = excluded.ativo, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'financeiro.alcada_definida', 'financeiro_alcada_etapas', v_id, p_processo);

  return v_id;
end;
$$;

grant execute on function public.upsert_alcada_financeiro(text, smallint, numeric, uuid, boolean) to authenticated;

create or replace function public.desativar_alcada_financeiro(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
begin
  update public.financeiro_alcada_etapas set ativo = false, updated_at = now()
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Etapa de alçada não encontrada nesta empresa.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'financeiro.alcada_desativada', 'financeiro_alcada_etapas', p_id);
  return p_id;
end;
$$;

grant execute on function public.desativar_alcada_financeiro(uuid) to authenticated;

-- Interna — só chamada de dentro de submeter_pagamento_titulo() abaixo,
-- mesmo padrão de submeter_aprovacao_compra() (sem grant a authenticated).
create or replace function public.submeter_aprovacao_financeiro(p_company_id uuid, p_processo text, p_entidade_id uuid, p_valor numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_aprovacao_id uuid;
  v_etapa record;
  v_qtd_etapas int := 0;
begin
  insert into public.financeiro_aprovacoes (company_id, processo, entidade_id, valor, status)
  values (p_company_id, p_processo, p_entidade_id, p_valor, 'pendente')
  returning id into v_aprovacao_id;

  for v_etapa in
    select ordem, valor_minimo, role_id from public.financeiro_alcada_etapas
    where company_id = p_company_id and processo = p_processo and ativo and valor_minimo <= p_valor
    order by ordem
  loop
    insert into public.financeiro_aprovacao_etapas (company_id, financeiro_aprovacao_id, ordem, valor_minimo, role_id)
    values (p_company_id, v_aprovacao_id, v_etapa.ordem, v_etapa.valor_minimo, v_etapa.role_id);
    v_qtd_etapas := v_qtd_etapas + 1;
  end loop;

  if v_qtd_etapas = 0 then
    update public.financeiro_aprovacoes set status = 'aprovada', decided_at = now() where id = v_aprovacao_id;
  end if;

  return v_aprovacao_id;
end;
$$;

create or replace function public.decidir_etapa_aprovacao_financeiro(p_etapa_id uuid, p_decisao text, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'aprovar');
  v_etapa public.financeiro_aprovacao_etapas;
  v_pendentes_anteriores int;
  v_pendentes_restantes int;
begin
  if p_decisao not in ('aprovar', 'rejeitar') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_etapa from public.financeiro_aprovacao_etapas where id = p_etapa_id and company_id = v_company_id;
  if not found then
    raise exception 'Etapa de aprovação não encontrada nesta empresa.';
  end if;
  if v_etapa.status <> 'pendente' then
    raise exception 'Etapa já foi decidida (status atual: %).', v_etapa.status;
  end if;

  select count(*) into v_pendentes_anteriores from public.financeiro_aprovacao_etapas
  where financeiro_aprovacao_id = v_etapa.financeiro_aprovacao_id and ordem < v_etapa.ordem and status = 'pendente';
  if v_pendentes_anteriores > 0 then
    raise exception 'Existe etapa anterior ainda pendente — a alçada é decidida em ordem.';
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.user_roles ur
    where ur.profile_id = auth.uid() and ur.role_id = v_etapa.role_id
      and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
  ) then
    raise exception 'Decisão desta etapa exige o perfil aprovador configurado na alçada.';
  end if;

  update public.financeiro_aprovacao_etapas
  set status = case p_decisao when 'aprovar' then 'aprovada' else 'rejeitada' end,
      decidido_por = auth.uid(), decidido_em = now(), observacao = p_observacao
  where id = p_etapa_id;

  if p_decisao = 'rejeitar' then
    update public.financeiro_aprovacoes set status = 'rejeitada', decided_at = now() where id = v_etapa.financeiro_aprovacao_id;
  else
    select count(*) into v_pendentes_restantes from public.financeiro_aprovacao_etapas
    where financeiro_aprovacao_id = v_etapa.financeiro_aprovacao_id and status = 'pendente';
    if v_pendentes_restantes = 0 then
      update public.financeiro_aprovacoes set status = 'aprovada', decided_at = now() where id = v_etapa.financeiro_aprovacao_id;
    end if;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'financeiro.etapa_aprovacao_decidida', 'financeiro_aprovacao_etapas', p_etapa_id, p_decisao);

  return p_etapa_id;
end;
$$;

grant execute on function public.decidir_etapa_aprovacao_financeiro(uuid, text, text) to authenticated;

-- =========================================================================
-- 3. SOLICITAÇÃO DE PAGAMENTO (§6.2 "Título → Solicitação") + AMPLIAÇÃO de
--    registrar_pagamento_titulo_compra() (§6.2 "Aprovação → ... →
--    Confirmação", colapsado num só passo manual — ver cabeçalho).
-- =========================================================================

create or replace function public.submeter_pagamento_titulo(p_titulo_pagar_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_titulo public.titulos_pagar;
  v_pendente_ou_aprovada uuid;
begin
  select * into v_titulo from public.titulos_pagar where id = p_titulo_pagar_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Título a pagar não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível submeter à aprovação título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;

  select id into v_pendente_ou_aprovada from public.financeiro_aprovacoes
  where processo = 'titulo_pagar' and entidade_id = p_titulo_pagar_id and status in ('pendente', 'aprovada')
  limit 1;
  if v_pendente_ou_aprovada is not null then
    raise exception 'Este título já tem uma submissão de aprovação pendente ou aprovada.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.pagamento_submetido_aprovacao', 'titulo_pagar', p_titulo_pagar_id, v_titulo.numero,
    jsonb_build_object('valor', v_titulo.saldo_pendente)
  );

  return public.submeter_aprovacao_financeiro(v_company_id, 'titulo_pagar', p_titulo_pagar_id, v_titulo.saldo_pendente);
end;
$$;

grant execute on function public.submeter_pagamento_titulo(uuid) to authenticated;

-- pagamentos_titulo_compra (Fase 6 da ADR-011) não guardava como/de qual
-- conta o pagamento saiu — colunas novas, nullable, sem quebrar nenhuma
-- linha já existente nem nenhum caller com 3 argumentos posicionais.
alter table public.pagamentos_titulo_compra
  add column conta_bancaria_id uuid references public.contas_bancarias(id),
  add column forma_pagamento text check (forma_pagamento in ('boleto', 'pix', 'ted', 'outro'));

-- create or replace NÃO troca a assinatura original de 3 argumentos por
-- uma de 5 — cria um segundo overload, e PostgREST passa a recusar toda
-- chamada por nome ("Could not choose the best candidate function") por
-- ambiguidade entre os dois. Precisa derrubar a assinatura antiga antes.
drop function if exists public.registrar_pagamento_titulo_compra(uuid, numeric, date);

create or replace function public.registrar_pagamento_titulo_compra(
  p_titulo_id uuid, p_valor numeric, p_data_pagamento date default current_date,
  p_conta_bancaria_id uuid default null, p_forma_pagamento text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'pagar');
  v_titulo public.titulos_pagar;
  v_id uuid;
  v_novo_pago numeric;
  v_status_aprovacao text;
  v_data_pagamento date := coalesce(p_data_pagamento, current_date);
begin
  select * into v_titulo from public.titulos_pagar where id = p_titulo_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Título a pagar não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível registrar pagamento em título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;
  if p_valor <= 0 then
    raise exception 'Valor pago precisa ser maior que zero.';
  end if;

  -- §6.2: só exige alçada aprovada se o título alguma vez foi submetido
  -- (submeter_pagamento_titulo()) — título nunca submetido continua
  -- pagável direto, mesmo comportamento de antes desta fase (Fase 6 da
  -- ADR-011), preservando toda empresa que não configura alçada.
  select status into v_status_aprovacao from public.financeiro_aprovacoes
  where processo = 'titulo_pagar' and entidade_id = p_titulo_id
  order by created_at desc limit 1;
  if v_status_aprovacao is not null and v_status_aprovacao <> 'aprovada' then
    raise exception 'Este título tem uma submissão de aprovação pendente ou rejeitada (status: %) — resolva antes de registrar o pagamento.', v_status_aprovacao;
  end if;

  if p_conta_bancaria_id is not null and not exists (
    select 1 from public.contas_bancarias where id = p_conta_bancaria_id and company_id = v_company_id
  ) then
    raise exception 'Conta bancária não encontrada nesta empresa.';
  end if;

  v_novo_pago := v_titulo.valor_pago + p_valor;
  if v_novo_pago > v_titulo.valor then
    raise exception 'Valor pago (%) excederia o valor do título (%, saldo pendente %).',
      v_novo_pago, v_titulo.valor, v_titulo.valor - v_titulo.valor_pago;
  end if;

  insert into public.pagamentos_titulo_compra (company_id, titulo_id, valor, data_pagamento, registrado_por, conta_bancaria_id, forma_pagamento)
  values (v_company_id, p_titulo_id, p_valor, v_data_pagamento, auth.uid(), p_conta_bancaria_id, p_forma_pagamento)
  returning id into v_id;

  update public.titulos_pagar
  set valor_pago = v_novo_pago,
      status = case when v_novo_pago >= valor then 'pago' else 'parcial' end,
      updated_at = now()
  where id = p_titulo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.pagamento_titulo_compra_registrado', 'titulo_pagar', p_titulo_id, null,
    jsonb_build_object('valor', p_valor, 'novo_total_pago', v_novo_pago)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_pagamento_titulo_compra(uuid, numeric, date, uuid, text) to authenticated;

-- =========================================================================
-- 4. COBRANÇA (BOLETO/PIX) SOBRE TÍTULO A RECEBER (T11) — estrutura
--    preparada, nenhum provedor real conectado (sem linha digitável/QR
--    Code de verdade). Marcar como paga chama registrar_recebimento_
--    titulo() já existente, nunca duplica o estado do recebimento.
-- =========================================================================

create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  titulo_id uuid not null references public.titulos_financeiros(id),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  numero text not null,
  tipo text not null check (tipo in ('boleto', 'pix')),
  valor numeric(14, 2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'gerada' check (status in ('gerada', 'paga', 'vencida', 'cancelada')),
  linha_digitavel text,
  pix_copia_cola text,
  criado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cobrancas_company_numero_unique unique (company_id, numero)
);
comment on table public.cobrancas is
  'TÓPICO 13 §6, Fase 5 — cobrança (boleto/PIX) sobre um título a receber (T11). linha_digitavel/pix_copia_cola ficam null nesta fase: nenhum provedor bancário real conectado, mesmo padrão do catálogo de integrações (estrutura preparada).';
create index cobrancas_company_id_idx on public.cobrancas (company_id);
create index cobrancas_titulo_id_idx on public.cobrancas (titulo_id);

create trigger set_updated_at before update on public.cobrancas
  for each row execute function public.set_updated_at();

alter table public.cobrancas enable row level security;
create policy cobrancas_select on public.cobrancas for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));
grant select on public.cobrancas to authenticated;

create or replace function public.gerar_cobranca(p_titulo_id uuid, p_conta_bancaria_id uuid, p_tipo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_titulo public.titulos_financeiros;
  v_conta public.contas_bancarias;
  v_numero text;
  v_id uuid;
begin
  if p_tipo not in ('boleto', 'pix') then
    raise exception 'Tipo de cobrança inválido: "%".', p_tipo;
  end if;

  select * into v_titulo from public.titulos_financeiros where id = p_titulo_id and company_id = v_company_id;
  if not found then
    raise exception 'Título a receber não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível gerar cobrança para título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;

  select * into v_conta from public.contas_bancarias where id = p_conta_bancaria_id and company_id = v_company_id;
  if not found then
    raise exception 'Conta bancária não encontrada nesta empresa.';
  end if;
  if not v_conta.ativa then
    raise exception 'Conta bancária inativa: ative antes de gerar cobrança.';
  end if;

  v_numero := public.next_document_number('cobranca');

  insert into public.cobrancas (company_id, titulo_id, conta_bancaria_id, numero, tipo, valor, vencimento, criado_por)
  values (v_company_id, p_titulo_id, p_conta_bancaria_id, v_numero, p_tipo, v_titulo.saldo_pendente, v_titulo.vencimento, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'financeiro.cobranca_gerada', 'cobranca', v_id, v_numero, jsonb_build_object('titulo_id', p_titulo_id, 'tipo', p_tipo));

  return v_id;
end;
$$;

grant execute on function public.gerar_cobranca(uuid, uuid, text) to authenticated;

create or replace function public.cancelar_cobranca(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_cobranca public.cobrancas;
begin
  select * into v_cobranca from public.cobrancas where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Cobrança não encontrada nesta empresa.';
  end if;
  if v_cobranca.status <> 'gerada' then
    raise exception 'Só é possível cancelar cobrança no status "gerada" (status atual: %).', v_cobranca.status;
  end if;

  update public.cobrancas set status = 'cancelada' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'financeiro.cobranca_cancelada', 'cobranca', p_id);

  return p_id;
end;
$$;

grant execute on function public.cancelar_cobranca(uuid) to authenticated;

create or replace function public.marcar_cobranca_paga(p_id uuid, p_data_recebimento date default current_date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_cobranca public.cobrancas;
  v_recebimento_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_cobranca from public.cobrancas where id = p_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Cobrança não encontrada nesta empresa.';
  end if;
  if v_cobranca.status <> 'gerada' then
    raise exception 'Só é possível marcar como paga uma cobrança no status "gerada" (status atual: %).', v_cobranca.status;
  end if;

  -- registrar_recebimento_titulo() já exige financeiro.receber e faz a
  -- checagem/atualização do título — nunca duplicamos esse estado aqui.
  v_recebimento_id := public.registrar_recebimento_titulo(v_cobranca.titulo_id, v_cobranca.valor, p_data_recebimento);

  update public.cobrancas set status = 'paga' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'financeiro.cobranca_paga', 'cobranca', p_id, v_cobranca.numero);

  return v_recebimento_id;
end;
$$;

grant execute on function public.marcar_cobranca_paga(uuid, date) to authenticated;

-- =========================================================================
-- 5. MOVIMENTAÇÃO BANCÁRIA + CONCILIAÇÃO MANUAL (§6.1)
-- =========================================================================

create table public.movimentacoes_bancarias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  tipo text not null check (tipo in ('credito', 'debito')),
  valor numeric(14, 2) not null check (valor > 0),
  data_movimento date not null,
  descricao text,
  conciliado boolean not null default false,
  conciliado_com_tipo text check (conciliado_com_tipo in ('titulo_receber', 'titulo_pagar', 'cobranca')),
  conciliado_com_id uuid,
  registrado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint movimentacoes_bancarias_conciliacao_check check (
    (conciliado = false and conciliado_com_tipo is null and conciliado_com_id is null) or
    (conciliado = true and conciliado_com_tipo is not null and conciliado_com_id is not null)
  )
);
comment on table public.movimentacoes_bancarias is
  'TÓPICO 13 §6.1, Fase 5 — lançamento manual de movimentação bancária (sem extrato real importado) e seu vínculo manual com título a receber/pagar ou cobrança. Sem conciliação automática/sugerida nesta fase (nenhum dado real de banco pra comparar).';
create index movimentacoes_bancarias_company_id_idx on public.movimentacoes_bancarias (company_id);
create index movimentacoes_bancarias_conta_idx on public.movimentacoes_bancarias (conta_bancaria_id);
create index movimentacoes_bancarias_pendentes_idx on public.movimentacoes_bancarias (company_id) where not conciliado;

alter table public.movimentacoes_bancarias enable row level security;
create policy movimentacoes_bancarias_select on public.movimentacoes_bancarias for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('financeiro', 'view')));
grant select on public.movimentacoes_bancarias to authenticated;

create or replace function public.registrar_movimentacao_bancaria(
  p_conta_bancaria_id uuid, p_tipo text, p_valor numeric, p_data_movimento date, p_descricao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_id uuid;
begin
  if p_tipo not in ('credito', 'debito') then
    raise exception 'Tipo de movimentação inválido: "%".', p_tipo;
  end if;
  if p_valor <= 0 then
    raise exception 'Valor precisa ser maior que zero.';
  end if;
  if p_data_movimento is null then
    raise exception 'Data do movimento é obrigatória.';
  end if;
  if not exists (select 1 from public.contas_bancarias where id = p_conta_bancaria_id and company_id = v_company_id) then
    raise exception 'Conta bancária não encontrada nesta empresa.';
  end if;

  insert into public.movimentacoes_bancarias (company_id, conta_bancaria_id, tipo, valor, data_movimento, descricao, registrado_por)
  values (v_company_id, p_conta_bancaria_id, p_tipo, p_valor, p_data_movimento, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'financeiro.movimentacao_registrada', 'movimentacao_bancaria', v_id, p_descricao, jsonb_build_object('tipo', p_tipo, 'valor', p_valor));

  return v_id;
end;
$$;

grant execute on function public.registrar_movimentacao_bancaria(uuid, text, numeric, date, text) to authenticated;

create or replace function public.conciliar_movimentacao(p_movimentacao_id uuid, p_tipo_alvo text, p_alvo_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_mov public.movimentacoes_bancarias;
  v_existe boolean;
begin
  if p_tipo_alvo not in ('titulo_receber', 'titulo_pagar', 'cobranca') then
    raise exception 'Tipo de alvo de conciliação inválido: "%".', p_tipo_alvo;
  end if;

  select * into v_mov from public.movimentacoes_bancarias where id = p_movimentacao_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Movimentação bancária não encontrada nesta empresa.';
  end if;
  if v_mov.conciliado then
    raise exception 'Movimentação já conciliada — desconcilie antes de vincular a outro registro.';
  end if;

  v_existe := case p_tipo_alvo
    when 'titulo_receber' then exists (select 1 from public.titulos_financeiros where id = p_alvo_id and company_id = v_company_id)
    when 'titulo_pagar' then exists (select 1 from public.titulos_pagar where id = p_alvo_id and company_id = v_company_id)
    else exists (select 1 from public.cobrancas where id = p_alvo_id and company_id = v_company_id)
  end;
  if not v_existe then
    raise exception 'Registro alvo da conciliação não encontrado nesta empresa.';
  end if;

  update public.movimentacoes_bancarias
  set conciliado = true, conciliado_com_tipo = p_tipo_alvo, conciliado_com_id = p_alvo_id
  where id = p_movimentacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'financeiro.movimentacao_conciliada', 'movimentacao_bancaria', p_movimentacao_id, null, jsonb_build_object('tipo_alvo', p_tipo_alvo, 'alvo_id', p_alvo_id));

  return p_movimentacao_id;
end;
$$;

grant execute on function public.conciliar_movimentacao(uuid, text, uuid) to authenticated;

create or replace function public.desconciliar_movimentacao(p_movimentacao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
begin
  update public.movimentacoes_bancarias
  set conciliado = false, conciliado_com_tipo = null, conciliado_com_id = null
  where id = p_movimentacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Movimentação bancária não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'financeiro.movimentacao_desconciliada', 'movimentacao_bancaria', p_movimentacao_id);

  return p_movimentacao_id;
end;
$$;

grant execute on function public.desconciliar_movimentacao(uuid) to authenticated;
