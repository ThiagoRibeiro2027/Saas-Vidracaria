-- ADR-007 — Notificações e Alertas, recorte mínimo. Decisão do
-- responsável do produto em 2026-09-19: construir agora, junto com
-- TÓPICO 14, como pré-requisito antes de considerar a Fase 8 concluída.
--
-- O ADR-007 completo (29 seções) pede infraestrutura pra ~15 tipos de
-- evento em todo o sistema (pedidos, produção, materiais, estoque,
-- expedição, instalação, retrabalho, bloqueios, segurança...). Mesmo
-- critério do §37 de T13 (Integrações) aplicado aqui por analogia: "não
-- é necessário implementar todos os conectores agora, conforme
-- prioridade do produto" — a infraestrutura é geral, os EVENTOS
-- concretos wireados nesta fase são só os 3 que o próprio histórico do
-- projeto já sinalizava como "faltando":
--   - pedido com pendência aberta (T3) — a migration original de
--     pedidos já dizia "motor de notificações... fora do recorte, sem
--     ADR próprio ainda" (20260913200000). Agora tem.
--   - OP bloqueada por medição não confirmada (T4) — bloqueio
--     automático já existente, sem nenhum aviso além de abrir a tela.
--   - não conformidade aberta (T8) — mesma lógica.
-- Os outros ~12 tipos de evento do §9 ficam de fora até terem
-- prioridade real ("nem todo evento deverá gerar notificação... só
-- quando houver valor operacional", §9).
--
-- Fora do recorte, decisão consciente:
--   - Push real, WhatsApp, SMS — §6-7/§19 já tratam como canal
--     complementar/fora do MVP; não existe infraestrutura de push
--     (VAPID/subscription) no projeto, só o service worker de sync
--     offline do PWA de campo (ADR-005/008), que é outra coisa.
--   - Preferências configuráveis por usuário (§11) — fixo por ora:
--     prioridade 'critica' sempre por e-mail, o resto só interno.
--   - Agrupamento/consolidação (§16) — otimização, não essencial.
--   - Estados de §12 além de não-lida/lida (enviada/entregue/
--     reconhecida) só fazem sentido pra canal externo com confirmação —
--     e-mail aqui é best-effort (§5: "não deverá ser tratado como
--     garantia absoluta de entrega"), sem webhook de entrega do Resend
--     integrado.
--
-- Destinatário (§10): "perfil/permissões/responsabilidade pelo
-- processo" é resolvido por notificar_usuarios_com_permissao() —
-- notifica todo usuário ativo da empresa que tenha a permissão do
-- recurso relevante, sem precisar de um campo "responsável" novo em
-- cada módulo.
--
-- Falha nunca perde o evento operacional (§14): notificar_usuarios_
-- com_permissao() nunca propaga exceção — um erro ao gerar notificação
-- fica só como WARNING no log do Postgres, nunca reverte a transação
-- que a originou (abrir pendência, bloquear OP, abrir NC continuam
-- valendo mesmo se a notificação falhar).

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid not null references public.profiles(id),
  titulo text not null,
  mensagem text not null,
  prioridade text not null check (prioridade in ('informativa', 'atencao', 'importante', 'critica')),
  tipo_evento text not null,
  entity_type text,
  entity_id uuid,
  acao_necessaria text,
  lida boolean not null default false,
  lida_em timestamptz,
  email_status text not null default 'nao_aplicavel' check (email_status in ('nao_aplicavel', 'pendente', 'enviado', 'falhou')),
  email_erro text,
  created_at timestamptz not null default now()
);
comment on table public.notificacoes is 'ADR-007 — notificação interna, destinatário sempre um profile_id específico (nunca visível a outros usuários da mesma empresa, ao contrário do resto do schema). email_status só é relevante quando prioridade=critica (§5, único canal externo deste recorte).';

-- Consulta mais comum: "minhas notificações não lidas" — índice parcial
-- evita sequential scan conforme o volume cresce (mesmo padrão de
-- estoque_reservas_ativas_idx).
create index notificacoes_profile_nao_lida_idx on public.notificacoes (profile_id) where not lida;
-- Consulta do cron de e-mail (varredura por estado, não por janela de tempo).
create index notificacoes_email_pendente_idx on public.notificacoes (id) where email_status = 'pendente';

alter table public.notificacoes enable row level security;

-- Único lugar do schema onde o isolamento é mais estrito que "toda a
-- empresa" — só o próprio destinatário vê a própria notificação (§10:
-- "um usuário não deve receber informações de registros aos quais não
-- possui acesso" — aqui o próprio registro É a informação pessoal).
create policy notificacoes_select on public.notificacoes for select
  using (profile_id = auth.uid());

grant select on public.notificacoes to authenticated;

-- =========================================================================
-- notificar_usuarios_com_permissao() — função interna (sem grant a
-- authenticated, mesmo padrão de recalcular_situacao_ordem_producao),
-- chamada de dentro de outra função SECURITY DEFINER já autorizada.
-- Aceita várias ações pro mesmo recurso (mesmo padrão de
-- assert_tenant_write_any, Fase 7e) — evita perder quem só tem a ação
-- mais fina (ex.: producao.planejar) quando o recurso também tem
-- producao.manage como superset.
-- =========================================================================

create or replace function public.notificar_usuarios_com_permissao(
  p_resource text,
  p_actions text[],
  p_tipo_evento text,
  p_titulo text,
  p_mensagem text,
  p_prioridade text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_acao_necessaria text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_email_status text := case when p_prioridade = 'critica' then 'pendente' else 'nao_aplicavel' end;
  v_profile_id uuid;
begin
  begin
    if v_company_id is null then
      return;
    end if;
    if p_prioridade not in ('informativa', 'atencao', 'importante', 'critica') then
      raise exception 'Prioridade inválida: %.', p_prioridade;
    end if;

    for v_profile_id in
      select distinct p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id and (ur.valid_until is null or ur.valid_until > now())
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where p.company_id = v_company_id and p.active and p.deleted_at is null
        and perm.resource = p_resource and perm.action = any(p_actions)
    loop
      insert into public.notificacoes (
        company_id, profile_id, titulo, mensagem, prioridade, tipo_evento,
        entity_type, entity_id, acao_necessaria, email_status
      ) values (
        v_company_id, v_profile_id, p_titulo, p_mensagem, p_prioridade, p_tipo_evento,
        p_entity_type, p_entity_id, p_acao_necessaria, v_email_status
      );
    end loop;
  exception when others then
    -- ADR-007 §14: falha ao notificar nunca reverte o evento operacional
    -- que a originou.
    raise warning 'Falha ao gerar notificação (%): %', p_tipo_evento, sqlerrm;
  end;
end;
$$;

-- =========================================================================
-- marcar_notificacao_lida() — única forma de escrita exposta a
-- authenticated. Sempre a própria notificação (RLS já impediria ler a
-- de outro perfil; a checagem aqui é redundante e explícita).
-- =========================================================================

create or replace function public.marcar_notificacao_lida(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notificacoes set lida = true, lida_em = now()
  where id = p_id and profile_id = auth.uid();
  if not found then
    raise exception 'Notificação não encontrada.';
  end if;
end;
$$;

grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;

-- =========================================================================
-- 3 eventos wireados nesta fase — corpo idêntico ao que já estava em
-- produção (extraído via pg_get_functiondef), só adicionando a chamada
-- de notificar_usuarios_com_permissao() no ponto certo de cada um.
-- =========================================================================

create or replace function public.abrir_pendencia_pedido(p_id uuid, p_descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_pedido public.pedidos;
  v_pendencia_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da pendência é obrigatória.';
  end if;

  select * into v_pedido from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status not in ('em_conferencia', 'pendente') then
    raise exception 'Só é possível abrir pendência com o pedido em conferência (status atual: %).', v_pedido.status;
  end if;

  insert into public.pedido_pendencias (pedido_id, descricao, aberta_por)
  values (p_id, p_descricao, auth.uid())
  returning id into v_pendencia_id;

  if v_pedido.status <> 'pendente' then
    update public.pedidos set status = 'pendente' where id = p_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pendencia_aberta', 'pedido_pendencia', v_pendencia_id, v_pedido.numero,
    jsonb_build_object('pedido_id', p_id, 'descricao', p_descricao)
  );

  perform public.notificar_usuarios_com_permissao(
    'pedidos', array['manage'], 'pedidos.pendencia_aberta',
    'Pendência aberta — pedido ' || v_pedido.numero, p_descricao, 'atencao',
    'pedido_pendencia', v_pendencia_id, 'Resolver a pendência para liberar o pedido.'
  );

  return v_pendencia_id;
end;
$$;

create or replace function public.recalcular_situacao_ordem_producao(p_ordem_producao_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_op public.ordens_producao;
begin
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id for update;
  if not found then
    return;
  end if;

  if public.pedido_bloqueado_por_medicao(v_op.pedido_id) then
    update public.ordens_producao set
      situacao = 'bloqueada',
      motivo_bloqueio = 'Há item com medida em obra não confirmada neste pedido.',
      origem_bloqueio = 'medicao',
      categoria_bloqueio = 'cliente',
      impacto_bloqueio = 'Produção não pode iniciar nem prosseguir até a medida ser confirmada (TÓPICO 16 §7).',
      acao_necessaria = 'Confirmar a medição do item em obra (TÓPICO 5).'
    where id = p_ordem_producao_id and situacao <> 'bloqueada';
    if found then
      perform public.notificar_usuarios_com_permissao(
        'producao', array['planejar', 'manage'], 'producao.ordem_bloqueada',
        'OP ' || v_op.numero || ' bloqueada — medição não confirmada',
        'Produção não pode iniciar nem prosseguir até a medida ser confirmada.', 'importante',
        'ordem_producao', p_ordem_producao_id, 'Confirmar a medição do item em obra (TÓPICO 5).'
      );
    end if;
  elsif v_op.situacao = 'bloqueada' then
    update public.ordens_producao set
      situacao = 'liberada', motivo_bloqueio = null, origem_bloqueio = null,
      categoria_bloqueio = null, impacto_bloqueio = null, acao_necessaria = null
    where id = p_ordem_producao_id;
  end if;
end;
$$;

create or replace function public.registrar_inspecao_qualidade(
  p_ordem_producao_id uuid, p_quantidade_aprovada numeric, p_quantidade_reprovada numeric, p_observacoes text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('qualidade', 'manage');
  v_op public.ordens_producao;
  v_inspecao_id uuid;
  v_nc_id uuid;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status <> 'concluida' then
    raise exception 'Só é possível inspecionar ordem de produção concluída (status atual: %).', v_op.status;
  end if;
  if p_quantidade_aprovada < 0 or p_quantidade_reprovada < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if p_quantidade_aprovada + p_quantidade_reprovada <> v_op.quantidade_produzida then
    raise exception 'A soma de aprovada e reprovada (%) precisa ser igual à quantidade produzida (%).',
      p_quantidade_aprovada + p_quantidade_reprovada, v_op.quantidade_produzida;
  end if;
  if exists (
    select 1 from public.inspecoes_qualidade
    where ordem_producao_id = p_ordem_producao_id and nao_conformidade_id is null
  ) then
    raise exception 'Já existe inspeção registrada para esta ordem de produção.';
  end if;

  insert into public.inspecoes_qualidade (
    company_id, ordem_producao_id, nao_conformidade_id, quantidade_aprovada,
    quantidade_reprovada, observacoes, inspecionado_por
  ) values (
    v_company_id, p_ordem_producao_id, null, p_quantidade_aprovada,
    p_quantidade_reprovada, p_observacoes, auth.uid()
  ) returning id into v_inspecao_id;

  if p_quantidade_reprovada > 0 then
    insert into public.nao_conformidades (
      company_id, ordem_producao_id, inspecao_origem_id, quantidade, descricao, aberta_por
    ) values (
      v_company_id, p_ordem_producao_id, v_inspecao_id, p_quantidade_reprovada, p_observacoes, auth.uid()
    ) returning id into v_nc_id;
    update public.ordens_producao set status_qualidade = 'bloqueado' where id = p_ordem_producao_id;
    perform public.notificar_usuarios_com_permissao(
      'qualidade', array['manage'], 'qualidade.nao_conformidade_aberta',
      'Não conformidade aberta — OP ' || v_op.numero,
      coalesce(p_observacoes, 'Quantidade reprovada: ' || p_quantidade_reprovada), 'importante',
      'nao_conformidade', v_nc_id, 'Executar retrabalho ou disposição da não conformidade.'
    );
  else
    update public.ordens_producao set status_qualidade = 'aprovado' where id = p_ordem_producao_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'qualidade.inspecao_registrada', 'ordem_producao', p_ordem_producao_id, p_observacoes,
    jsonb_build_object(
      'inspecao_id', v_inspecao_id, 'quantidade_aprovada', p_quantidade_aprovada,
      'quantidade_reprovada', p_quantidade_reprovada, 'nao_conformidade_id', v_nc_id
    )
  );

  return v_inspecao_id;
end;
$$;

create or replace function public.reinspecionar_retrabalho(
  p_nao_conformidade_id uuid, p_quantidade_aprovada numeric, p_quantidade_reprovada numeric, p_observacoes text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('qualidade', 'manage');
  v_nc public.nao_conformidades;
  v_inspecao_id uuid;
  v_nova_nc_id uuid;
  v_numero_op text;
begin
  select * into v_nc from public.nao_conformidades
  where id = p_nao_conformidade_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Não conformidade não encontrada nesta empresa.';
  end if;
  if v_nc.status <> 'aberta' then
    raise exception 'Não conformidade já encerrada.';
  end if;
  if v_nc.retrabalho_executado_em is null then
    raise exception 'Execute o retrabalho antes de reinspecionar.';
  end if;
  if p_quantidade_aprovada < 0 or p_quantidade_reprovada < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if p_quantidade_aprovada + p_quantidade_reprovada <> v_nc.quantidade then
    raise exception 'A soma de aprovada e reprovada (%) precisa ser igual à quantidade em retrabalho (%).',
      p_quantidade_aprovada + p_quantidade_reprovada, v_nc.quantidade;
  end if;

  insert into public.inspecoes_qualidade (
    company_id, ordem_producao_id, nao_conformidade_id, quantidade_aprovada,
    quantidade_reprovada, observacoes, inspecionado_por
  ) values (
    v_company_id, v_nc.ordem_producao_id, p_nao_conformidade_id, p_quantidade_aprovada,
    p_quantidade_reprovada, p_observacoes, auth.uid()
  ) returning id into v_inspecao_id;

  update public.nao_conformidades
  set status = 'encerrada', encerrada_em = now()
  where id = p_nao_conformidade_id;

  if p_quantidade_reprovada > 0 then
    insert into public.nao_conformidades (
      company_id, ordem_producao_id, inspecao_origem_id, quantidade, descricao, aberta_por
    ) values (
      v_company_id, v_nc.ordem_producao_id, v_inspecao_id, p_quantidade_reprovada, p_observacoes, auth.uid()
    ) returning id into v_nova_nc_id;
    -- status_qualidade já é 'bloqueado' (é como a NC anterior chegou até
    -- aqui) — permanece bloqueado com a nova NC em aberto.
    select numero into v_numero_op from public.ordens_producao where id = v_nc.ordem_producao_id;
    perform public.notificar_usuarios_com_permissao(
      'qualidade', array['manage'], 'qualidade.nao_conformidade_aberta',
      'Não conformidade reaberta após retrabalho — OP ' || v_numero_op,
      coalesce(p_observacoes, 'Quantidade reprovada: ' || p_quantidade_reprovada), 'importante',
      'nao_conformidade', v_nova_nc_id, 'Executar retrabalho ou disposição da não conformidade.'
    );
  else
    update public.ordens_producao set status_qualidade = 'aprovado' where id = v_nc.ordem_producao_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'qualidade.reinspecao_registrada', 'nao_conformidade', p_nao_conformidade_id, p_observacoes,
    jsonb_build_object(
      'inspecao_id', v_inspecao_id, 'nova_nao_conformidade_id', v_nova_nc_id,
      'ordem_producao_id', v_nc.ordem_producao_id
    )
  );

  return v_inspecao_id;
end;
$$;
