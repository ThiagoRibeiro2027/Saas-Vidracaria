-- TÓPICO 18 — Contratos, §7: alerta de vencimento de vigência/garantia
-- (ADR-002, decisão do responsável do produto em 26/09/2026 — 30 dias de
-- antecedência). A migration 20261029000000 (Contratos completo) deixou
-- isto deliberadamente fora: "estender o gatilho pra vigência/garantia de
-- contrato é uma peça nova (primeiro 'scan' periódico por data, em vez de
-- evento síncrono de mutação)". O restante do ADR-007 dispara notificação
-- de dentro da própria função que muda o estado (evento síncrono); aqui
-- não há mutação nenhuma no dia do alerta — o contrato só "chega perto"
-- de uma data, então precisa de um cron que varre por data, não de um
-- gatilho em upsert_contrato().
--
-- Desenho, mesmo padrão dos webhooks de saída (Fase 4 do T13,
-- 20261031000000): o cron (service_role, sem sessão de usuário) faz a
-- varredura cross-tenant com o client admin (bypassa RLS de propósito,
-- só pra achar QUAIS contratos vencem — nenhum dado é exposto fora do
-- próprio backend) e chama, por contrato encontrado, uma função de
-- sistema restrita a service_role que gera a notificação DENTRO da
-- empresa certa. Não reaproveita notificar_usuarios_com_permissao()
-- diretamente porque aquela função deriva a empresa de
-- current_company_id() (sessão) — aqui a empresa vem do próprio
-- contrato, nunca de parâmetro/sessão.
--
-- Idempotência: dois marcadores por contrato (um por tipo de alerta,
-- vigência e garantia são datas independentes) — sem eles, o cron
-- diário notificaria de novo todo santo dia enquanto o contrato
-- permanecesse dentro da janela de 30 dias. Simplificação aceita e
-- registrada aqui: se a vigência/garantia for alterada depois de já
-- notificada (upsert_contrato() em contrato ainda rascunho, ou uma
-- reaprovação), o marcador não é resetado automaticamente — não existe
-- fluxo de aditivo/alteração de contrato JÁ vigente neste recorte (só
-- suspender/retomar/encerrar mudam status, nunca as datas), então o
-- cenário não ocorre na prática hoje.
--
-- Prioridade 'atencao' (não 'critica'): é aviso prévio, não incidente de
-- segurança — não entra no e-mail do cron de notificações críticas
-- (§5 do ADR-007). Nunca muda o status do contrato (§7: "sem que a
-- notificação seja autoridade sobre o estado do contrato").
alter table public.contratos
  add column alerta_vigencia_enviado_em timestamptz,
  add column alerta_garantia_enviado_em timestamptz;

create or replace function public.sistema_notificar_vencimento_contrato(p_contrato_id uuid, p_tipo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_contrato public.contratos;
  v_pessoa_nome text;
  v_titulo text;
  v_mensagem text;
  v_data_referencia date;
  v_profile_id uuid;
begin
  if p_tipo not in ('vigencia', 'garantia') then
    raise exception 'Tipo de alerta inválido: %.', p_tipo;
  end if;

  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.';
  end if;
  if v_contrato.status <> 'vigente' then
    return; -- não é mais vigente — nada a alertar, sem erro (o cron pode ter uma linha desatualizada).
  end if;

  if p_tipo = 'vigencia' then
    if v_contrato.alerta_vigencia_enviado_em is not null or v_contrato.data_fim is null then
      return;
    end if;
    v_data_referencia := v_contrato.data_fim;
    v_titulo := format('Contrato %s com vigência vencendo em %s', v_contrato.numero, to_char(v_data_referencia, 'DD/MM/YYYY'));
  else
    if v_contrato.alerta_garantia_enviado_em is not null or v_contrato.garantia_fim is null then
      return;
    end if;
    v_data_referencia := v_contrato.garantia_fim;
    v_titulo := format('Contrato %s com garantia vencendo em %s', v_contrato.numero, to_char(v_data_referencia, 'DD/MM/YYYY'));
  end if;

  select nome into v_pessoa_nome from public.pessoas where id = v_contrato.pessoa_id;
  v_mensagem := format(
    'O %s do contrato %s (%s) vence em %s. Nenhuma ação foi tomada automaticamente — a decisão de renovar, encerrar ou seguir em frente continua manual.',
    case p_tipo when 'vigencia' then 'prazo de vigência' else 'prazo de garantia' end,
    v_contrato.numero, coalesce(v_pessoa_nome, 'sem cliente vinculado'), to_char(v_data_referencia, 'DD/MM/YYYY')
  );

  for v_profile_id in
    select distinct p.id
    from public.profiles p
    join public.user_roles ur on ur.profile_id = p.id and (ur.valid_until is null or ur.valid_until > now())
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where p.company_id = v_contrato.company_id and p.active and p.deleted_at is null
      and perm.resource = 'contratos' and perm.action = 'manage'
  loop
    insert into public.notificacoes (
      company_id, profile_id, titulo, mensagem, prioridade, tipo_evento,
      entity_type, entity_id, acao_necessaria, email_status
    ) values (
      v_contrato.company_id, v_profile_id, v_titulo, v_mensagem, 'atencao',
      format('contrato.%s_vencendo', p_tipo), 'contrato', p_contrato_id,
      'Decidir renovação, encerramento ou continuidade do contrato.', 'nao_aplicavel'
    );
  end loop;

  if p_tipo = 'vigencia' then
    update public.contratos set alerta_vigencia_enviado_em = now() where id = p_contrato_id;
  else
    update public.contratos set alerta_garantia_enviado_em = now() where id = p_contrato_id;
  end if;
end;
$$;

revoke all on function public.sistema_notificar_vencimento_contrato(uuid, text) from public, anon, authenticated;
grant execute on function public.sistema_notificar_vencimento_contrato(uuid, text) to service_role;
