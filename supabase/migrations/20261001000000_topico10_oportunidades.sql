-- TÓPICO 10 — Oportunidades e funil comercial, ampliação de escopo do
-- Comercial aprovada em ADR-002 v2.4 (§4.3, decisão de 19/09/2026). Funil
-- FIXO (não configurável por empresa nesta fase) e motivo de perda de
-- lista fixa — funil configurável e atividades/follow-up (§6) continuam
-- fora do MVP.
--
-- "Prospect" não ganha modelagem própria: reaproveita a tabela `pessoas`
-- (TÓPICO 2) sem exigir papel CLIENTE ativo — é só uma pessoa cadastrada
-- que ainda não tem esse papel. "Converter em cliente" (§2) já existe via
-- set_pessoa_papel() do TÓPICO 2; a oportunidade não duplica esse
-- cadastro. Quando a oportunidade evolui para orçamento,
-- upsert_orcamento() já exige papel CLIENTE ativo (recorte original do
-- M1) — a conversão de prospect em cliente precisa acontecer antes desse
-- ponto, no Cadastros. O vínculo orçamento→oportunidade é opcional e feito
-- por uma função dedicada (vincular_oportunidade_orcamento), sem alterar
-- a assinatura de upsert_orcamento já testada pelo TÓPICO 3.

create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pessoa_id uuid not null references public.pessoas(id),
  responsavel_id uuid not null references public.profiles(id),
  origem text,
  descricao text,
  valor_potencial numeric(14, 2) check (valor_potencial is null or valor_potencial >= 0),
  probabilidade numeric(5, 2) check (probabilidade is null or (probabilidade between 0 and 100)),
  previsao_fechamento date,
  estagio text not null default 'prospeccao' check (estagio in (
    'prospeccao', 'contato', 'levantamento', 'qualificada',
    'orcamento', 'negociacao', 'aprovacao', 'ganha', 'perdida'
  )),
  motivo_perda text check (motivo_perda in (
    'preco', 'prazo', 'concorrente', 'condicao_comercial', 'especificacao',
    'cliente_desistiu', 'projeto_cancelado', 'falta_orcamento', 'produto_inadequado', 'outros'
  )),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oportunidades_motivo_perda_so_quando_perdida
    check (estagio = 'perdida' or motivo_perda is null)
);
comment on table public.oportunidades is 'TÓPICO 10 §3-4, ampliação ADR-002 v2.4 — funil fixo (não configurável), motivo de perda de lista fixa.';
create index oportunidades_pessoa_id_idx on public.oportunidades (pessoa_id);
create index oportunidades_company_estagio_idx on public.oportunidades (company_id, estagio);

alter table public.orcamentos add column oportunidade_id uuid references public.oportunidades(id);
comment on column public.orcamentos.oportunidade_id is 'TÓPICO 10 §7 — origem opcional do orçamento numa oportunidade (ADR-002 v2.4). Setado por vincular_oportunidade_orcamento(), não por upsert_orcamento.';

create trigger set_updated_at before update on public.oportunidades
  for each row execute function public.set_updated_at();

alter table public.oportunidades enable row level security;

-- Mesmo padrão de orcamentos_select: SELECT liberado a qualquer
-- autenticado da empresa, sem exigir oportunidades.view — a tela gateia
-- via has_permission() na aplicação, RLS só isola por tenant.
create policy oportunidades_select on public.oportunidades for select
  using (company_id = (select public.current_company_id()));

grant select on public.oportunidades to authenticated;

-- =========================================================================
-- upsert_oportunidade() — cabeçalho. Bloqueia edição em estágio terminal
-- (ganha/perdida), mesmo padrão de "decidido é terminal" do orçamento.
-- =========================================================================

create or replace function public.upsert_oportunidade(
  p_id uuid,
  p_pessoa_id uuid,
  p_origem text,
  p_descricao text,
  p_valor_potencial numeric,
  p_probabilidade numeric,
  p_previsao_fechamento date,
  p_observacoes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.oportunidades;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('oportunidades', 'manage') then
    raise exception 'Sem permissão para gerenciar oportunidades (oportunidades.manage).';
  end if;
  if p_probabilidade is not null and (p_probabilidade < 0 or p_probabilidade > 100) then
    raise exception 'Probabilidade deve estar entre 0 e 100.';
  end if;
  if not exists (select 1 from public.pessoas where id = p_pessoa_id and company_id = v_company_id) then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.oportunidades
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Oportunidade não encontrada nesta empresa.';
    end if;
    if v_before.estagio in ('ganha', 'perdida') then
      raise exception 'Oportunidade em estágio terminal ("%") não pode ser editada.', v_before.estagio;
    end if;

    update public.oportunidades set
      pessoa_id = p_pessoa_id, origem = p_origem, descricao = p_descricao,
      valor_potencial = p_valor_potencial, probabilidade = p_probabilidade,
      previsao_fechamento = p_previsao_fechamento, observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
  else
    insert into public.oportunidades (
      company_id, pessoa_id, responsavel_id, origem, descricao,
      valor_potencial, probabilidade, previsao_fechamento, observacoes
    ) values (
      v_company_id, p_pessoa_id, auth.uid(), p_origem, p_descricao,
      p_valor_potencial, p_probabilidade, p_previsao_fechamento, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.oportunidade_upserted', 'oportunidade', v_id, p_descricao,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'valor_potencial', p_valor_potencial, 'probabilidade', p_probabilidade
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_oportunidade(uuid, uuid, text, text, numeric, numeric, date, text) to authenticated;

-- =========================================================================
-- mudar_estagio_oportunidade() — funil fixo (§3). "perdida" exige motivo
-- de lista fixa (§4); ganha/perdida são terminais.
-- =========================================================================

create or replace function public.mudar_estagio_oportunidade(
  p_id uuid,
  p_estagio text,
  p_motivo_perda text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.oportunidades;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('oportunidades', 'manage') then
    raise exception 'Sem permissão para gerenciar oportunidades (oportunidades.manage).';
  end if;
  if p_estagio not in (
    'prospeccao', 'contato', 'levantamento', 'qualificada',
    'orcamento', 'negociacao', 'aprovacao', 'ganha', 'perdida'
  ) then
    raise exception 'Estágio inválido: "%".', p_estagio;
  end if;
  if p_estagio = 'perdida' and p_motivo_perda is null then
    raise exception 'Motivo da perda é obrigatório ao mover para "perdida".';
  end if;
  if p_estagio <> 'perdida' and p_motivo_perda is not null then
    raise exception 'Motivo de perda só se aplica ao estágio "perdida".';
  end if;

  select * into v_before from public.oportunidades
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Oportunidade não encontrada nesta empresa.';
  end if;
  if v_before.estagio in ('ganha', 'perdida') then
    raise exception 'Oportunidade em estágio terminal ("%") não pode mudar de estágio.', v_before.estagio;
  end if;

  update public.oportunidades set estagio = p_estagio, motivo_perda = p_motivo_perda where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.oportunidade_estagio_mudado', 'oportunidade', p_id, p_estagio,
    jsonb_build_object('estagio_anterior', v_before.estagio, 'estagio_novo', p_estagio, 'motivo_perda', p_motivo_perda)
  );

  return p_id;
end;
$$;

grant execute on function public.mudar_estagio_oportunidade(uuid, text, text) to authenticated;

-- =========================================================================
-- vincular_oportunidade_orcamento() — liga um orçamento (em rascunho) à
-- oportunidade que o originou (§7). Gate é orcamentos.manage (é o
-- orçamento que muda), não oportunidades.manage.
-- =========================================================================

create or replace function public.vincular_oportunidade_orcamento(
  p_orcamento_id uuid,
  p_oportunidade_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento public.orcamentos;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
  if not exists (
    select 1 from public.oportunidades where id = p_oportunidade_id and company_id = v_company_id
  ) then
    raise exception 'Oportunidade não encontrada nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível vincular oportunidade a orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  update public.orcamentos set oportunidade_id = p_oportunidade_id where id = p_orcamento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_vinculado_oportunidade', 'orcamento', p_orcamento_id, v_orcamento.numero,
    jsonb_build_object('oportunidade_id', p_oportunidade_id)
  );

  return p_orcamento_id;
end;
$$;

grant execute on function public.vincular_oportunidade_orcamento(uuid, uuid) to authenticated;
