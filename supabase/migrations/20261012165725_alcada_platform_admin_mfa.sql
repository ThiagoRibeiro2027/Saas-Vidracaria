-- Auditoria TR Systems (12/10/2026) — achado 1 (P2, defesa em profundidade).
--
-- decidir_orcamento(), decidir_etapa_aprovacao_compra() e
-- decidir_etapa_aprovacao_financeiro() usavam public.is_platform_admin()
-- para dispensar o papel aprovador da alçada. Essa função não olha o AAL:
-- a regra 4 do CLAUDE.md exige is_platform_admin_mfa_verified() em toda
-- operação de platform_admin. Hoje o caminho só é alcançável com AAL2
-- (assert_tenant_write/has_permission já passam pelo gate de MFA antes),
-- então não há exploração conhecida — a troca elimina a dependência dessa
-- ordem de checagens.
--
-- Só muda a função chamada no bypass; o restante do corpo é idêntico à
-- última definição de cada função. Grants existentes são preservados pelo
-- create or replace.

-- 20260915020000_auditoria_15092026_p0.sql
create or replace function public.decidir_orcamento(
  p_id uuid,
  p_decisao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_before public.orcamentos;
  v_total numeric;
  v_threshold public.approval_thresholds;
begin
  if p_decisao not in ('aprovado', 'rejeitado') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_before from public.orcamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível decidir orçamento em rascunho (status atual: %).', v_before.status;
  end if;

  v_total := public.orcamento_valor_total(p_id);

  if p_decisao = 'aprovado' then
    if v_total <= 0 then
      raise exception 'Orçamento sem itens não pode ser aprovado.';
    end if;

    select * into v_threshold from public.approval_thresholds
    where company_id = v_company_id and processo = 'orcamento' and ativo;

    if found and v_total >= v_threshold.valor_minimo and not public.is_platform_admin_mfa_verified() then
      if not exists (
        select 1 from public.user_roles ur
        where ur.profile_id = auth.uid() and ur.role_id = v_threshold.role_id
          and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
      ) then
        raise exception 'Aprovação de orçamento a partir de R$ % exige o perfil aprovador configurado em Configurações.', v_threshold.valor_minimo;
      end if;
    end if;
  end if;

  update public.orcamentos set status = p_decisao where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_decidido', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('decisao', p_decisao, 'valor_total', v_total)
  );

  return p_id;
end;
$$;

-- 20261010001300_compras_cotacao_alcada.sql
create or replace function public.decidir_etapa_aprovacao_compra(p_etapa_id uuid, p_decisao text, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_etapa public.compras_aprovacao_etapas;
  v_pendentes_anteriores int;
  v_pendentes_restantes int;
begin
  if p_decisao not in ('aprovar', 'rejeitar') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_etapa from public.compras_aprovacao_etapas where id = p_etapa_id and company_id = v_company_id;
  if not found then
    raise exception 'Etapa de aprovação não encontrada nesta empresa.';
  end if;
  if v_etapa.status <> 'pendente' then
    raise exception 'Etapa já foi decidida (status atual: %).', v_etapa.status;
  end if;

  select count(*) into v_pendentes_anteriores from public.compras_aprovacao_etapas
  where compra_aprovacao_id = v_etapa.compra_aprovacao_id and ordem < v_etapa.ordem and status = 'pendente';
  if v_pendentes_anteriores > 0 then
    raise exception 'Existe etapa anterior ainda pendente — a alçada é decidida em ordem.';
  end if;

  if not public.is_platform_admin_mfa_verified() and not exists (
    select 1 from public.user_roles ur
    where ur.profile_id = auth.uid() and ur.role_id = v_etapa.role_id
      and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
  ) then
    raise exception 'Decisão desta etapa exige o perfil aprovador configurado na alçada.';
  end if;

  update public.compras_aprovacao_etapas
  set status = case p_decisao when 'aprovar' then 'aprovada' else 'rejeitada' end,
      decidido_por = auth.uid(), decidido_em = now(), observacao = p_observacao
  where id = p_etapa_id;

  if p_decisao = 'rejeitar' then
    update public.compras_aprovacoes set status = 'rejeitada', decided_at = now() where id = v_etapa.compra_aprovacao_id;
  else
    select count(*) into v_pendentes_restantes from public.compras_aprovacao_etapas
    where compra_aprovacao_id = v_etapa.compra_aprovacao_id and status = 'pendente';
    if v_pendentes_restantes = 0 then
      update public.compras_aprovacoes set status = 'aprovada', decided_at = now() where id = v_etapa.compra_aprovacao_id;
    end if;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.etapa_aprovacao_decidida', 'compras_aprovacao_etapas', p_etapa_id, p_decisao);

  return p_etapa_id;
end;
$$;

-- 20261010002200_topico13_bancos_boletos_pix.sql
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

  if not public.is_platform_admin_mfa_verified() and not exists (
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

