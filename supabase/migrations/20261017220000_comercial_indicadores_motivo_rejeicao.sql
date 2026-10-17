-- Melhorias do responsável do produto (item 6, 17/10/2026): Visão geral de
-- Comercial ganha valor orçado, valor em aberto, taxa de conversão e motivos
-- de não aprovação. Os três primeiros saem de dados que já existem; o motivo
-- de rejeição de orçamento NÃO era guardado em lugar nenhum (só oportunidades
-- tinham `motivo_perda`), então nasce aqui, com a mesma lista fixa de
-- oportunidades (um vocabulário só pro funil comercial inteiro).
--
-- Obrigatório ao rejeitar daqui pra frente (regra na função, não no CHECK de
-- tabela — orçamentos já rejeitados ficam com motivo NULL e aparecem como
-- "Não informado" nos indicadores, sem reescrever histórico).

alter table public.orcamentos
  add column motivo_rejeicao text check (motivo_rejeicao in (
    'preco', 'prazo', 'concorrente', 'condicao_comercial', 'especificacao',
    'cliente_desistiu', 'projeto_cancelado', 'falta_orcamento', 'produto_inadequado', 'outros'
  )),
  add constraint orcamentos_motivo_rejeicao_so_quando_rejeitado
    check (status = 'rejeitado' or motivo_rejeicao is null);

comment on column public.orcamentos.motivo_rejeicao is
  'Melhorias 17/10/2026, item 6 — motivo de não aprovação (mesma lista de oportunidades.motivo_perda). NULL em rejeitados antigos = "não informado".';

drop function if exists public.decidir_orcamento(uuid, text);

create or replace function public.decidir_orcamento(
  p_id uuid,
  p_decisao text,
  p_motivo_rejeicao text default null
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
  if p_decisao = 'rejeitado' and p_motivo_rejeicao is null then
    raise exception 'Informe o motivo da rejeição.';
  end if;
  if p_decisao = 'aprovado' and p_motivo_rejeicao is not null then
    raise exception 'Motivo de rejeição só se aplica a orçamento rejeitado.';
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

  update public.orcamentos set status = p_decisao, motivo_rejeicao = p_motivo_rejeicao where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_decidido', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('decisao', p_decisao, 'valor_total', v_total, 'motivo_rejeicao', p_motivo_rejeicao)
  );

  return p_id;
end;
$$;

grant execute on function public.decidir_orcamento(uuid, text, text) to authenticated;

-- Indicadores da Visão geral. SECURITY INVOKER de propósito: o isolamento
-- entre empresas vem das policies de SELECT de orcamentos/orcamento_itens
-- (a função não precisa de privilégio extra nem recebe company_id).
--   valor_orcado  = soma dos orçamentos não cancelados
--   valor_em_aberto = soma dos orçamentos ainda em rascunho (sem decisão)
--   taxa_conversao  = aprovados ÷ (aprovados + rejeitados), por quantidade;
--                     NULL enquanto nada foi decidido
create or replace function public.comercial_indicadores_orcamentos()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with totais as (
    select o.id, o.status, o.motivo_rejeicao,
           coalesce(sum(oi.quantidade * oi.preco_unitario), 0) as total
    from public.orcamentos o
    left join public.orcamento_itens oi on oi.orcamento_id = o.id
    group by o.id, o.status, o.motivo_rejeicao
  ),
  motivos as (
    select coalesce(motivo_rejeicao, 'nao_informado') as motivo, count(*)::int as quantidade
    from totais where status = 'rejeitado'
    group by 1
  )
  select jsonb_build_object(
    'valor_orcado', coalesce((select sum(total) from totais where status <> 'cancelado'), 0),
    'valor_em_aberto', coalesce((select sum(total) from totais where status = 'rascunho'), 0),
    'aprovados', (select count(*) from totais where status = 'aprovado'),
    'rejeitados', (select count(*) from totais where status = 'rejeitado'),
    'taxa_conversao', (
      select case when count(*) filter (where status in ('aprovado', 'rejeitado')) = 0 then null
        else round(100.0 * count(*) filter (where status = 'aprovado')
                   / count(*) filter (where status in ('aprovado', 'rejeitado')), 1) end
      from totais
    ),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'quantidade', quantidade) order by quantidade desc) from motivos), '[]'::jsonb)
  );
$$;

grant execute on function public.comercial_indicadores_orcamentos() to authenticated;
