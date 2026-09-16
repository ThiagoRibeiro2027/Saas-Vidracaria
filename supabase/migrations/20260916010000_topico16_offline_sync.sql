-- TÓPICO 16 — camada de sincronização offline (ADR-005/ADR-008), segundo
-- commit do recorte de M1 (o primeiro, 20260916000000, foi só o backend
-- síncrono). Este migration não adiciona funcionalidade de negócio nova —
-- só torna um subconjunto das RPCs de T16 seguro para retry vindo de uma
-- fila local (ADR-005 §11/§24: "toda operação offline deve ter
-- identificador único gerado no dispositivo" e "repetir uma mesma
-- tentativa não pode criar duplicidade"), e adiciona a leitura mínima que
-- a PWA precisa pra funcionar offline (ADR-005 §7: "dados necessários...
-- não copiar indiscriminadamente todo o tenant").
--
-- Escopo do que fica idempotente (chamável da fila offline): só as ações
-- que ADR-005 §32 lista como prioridade de offline no MVP — execução,
-- ocorrências, evidências, conclusão, aceite. "Agenda" (criar_instalacao,
-- adicionar/remover item, gestão de equipe) continua só-síncrona: é
-- trabalho de escritório/despacho, não de campo, e ADR-005 §31 trata como
-- Online Obrigatório qualquer operação que precise reservar disponibilidade
-- compartilhada entre instalações (mesmo raciocínio de "disponibilidade
-- real de estoque não pode depender de dado offline").
--
-- Mecanismo (ADR-005 §11/§24, sem prescrição de implementação no ADR —
-- decisão de arquitetura tomada aqui): cada chamada offline carrega um
-- p_client_operation_id (uuid gerado no dispositivo, novo parâmetro
-- opcional no fim da assinatura — CREATE OR REPLACE aceita isso sem quebrar
-- quem já chama sem o parâmetro). public.sync_claim() reivindica esse id
-- de forma atômica via INSERT ... ON CONFLICT DO NOTHING — o Postgres, sob
-- READ COMMITTED, bloqueia um segundo INSERT concorrente pro mesmo
-- (company_id, client_operation_id, rpc_name) até a primeira transação
-- terminar, então não existe janela de corrida real entre "reivindicar" e
-- "ler se já foi processado": se a primeira tentativa comitou, a segunda
-- vê o resultado pronto; se ela reverteu (erro de validação, por exemplo),
-- a linha de sync_operations reverte junto (é a mesma transação da função),
-- e a nova tentativa reivindica o slot normalmente. Isso também significa
-- que uma tentativa REJEITADA nunca fica "presa" — só chamadas que
-- efetivamente terminam com sucesso ficam registradas para deduplicação.
--
-- Sem prescrição de resolução de conflito de conteúdo (ADR-005 §15/§16) —
-- neste recorte, cada campo idempotente já é uma soma/transição de estado
-- que o servidor valida contra o estado ATUAL a cada chamada (mesma trava
-- FOR UPDATE do commit anterior); duas operações OFFLINE DIFERENTES pro
-- mesmo registro (não um retry da mesma, um client_operation_id diferente)
-- continuam concorrendo pelas mesmas regras de negócio de sempre, sem
-- tratamento especial — não há "merge" de conteúdo neste recorte.

-- =========================================================================
-- 1. sync_operations — registro de deduplicação por operação de cliente.
-- =========================================================================

create table public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_operation_id uuid not null,
  rpc_name text not null,
  result_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sync_operations_unique unique (company_id, client_operation_id, rpc_name)
);
comment on table public.sync_operations is
  'ADR-005 §11/§24 — deduplicação de operações reenviadas pela fila offline da PWA de campo (ADR-008). result_id nulo = reivindicada mas ainda não concluída (só existe durante a transação em andamento, nunca fica visível persistido a outra transação por mais tempo que isso).';
create index sync_operations_company_id_idx on public.sync_operations (company_id);

alter table public.sync_operations enable row level security;
create policy sync_operations_select on public.sync_operations for select
  using (company_id = (select public.current_company_id()));
grant select on public.sync_operations to authenticated;

create or replace function public.sync_claim(p_rpc_name text, p_client_operation_id uuid)
returns table (is_new boolean, result_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_inserted_id uuid;
  v_existing_result uuid;
begin
  if p_client_operation_id is null then
    -- Chamada síncrona/online comum (desktop, ou PWA já conectada no
    -- momento da ação) — sem idempotência solicitada, sempre executa.
    return query select true, null::uuid;
    return;
  end if;

  insert into public.sync_operations (company_id, client_operation_id, rpc_name, created_by)
  values (v_company_id, p_client_operation_id, p_rpc_name, auth.uid())
  on conflict (company_id, client_operation_id, rpc_name) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return query select true, null::uuid; -- esta chamada reivindicou o slot, deve prosseguir
    return;
  end if;

  -- so.result_id qualificado: RETURNS TABLE cria uma variável plpgsql
  -- implícita chamada "result_id" no escopo da função, que colide com a
  -- coluna de mesmo nome — sem o alias a leitura é ambígua (42702).
  select so.result_id into v_existing_result from public.sync_operations so
  where so.company_id = v_company_id and so.client_operation_id = p_client_operation_id and so.rpc_name = p_rpc_name;
  return query select false, v_existing_result; -- já processada antes, devolve o mesmo resultado
end;
$$;

grant execute on function public.sync_claim(text, uuid) to authenticated;

create or replace function public.sync_operation_complete(p_rpc_name text, p_client_operation_id uuid, p_result_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if p_client_operation_id is null then
    return;
  end if;
  update public.sync_operations set result_id = p_result_id, completed_at = now()
  where company_id = v_company_id and client_operation_id = p_client_operation_id and rpc_name = p_rpc_name;
end;
$$;

grant execute on function public.sync_operation_complete(text, uuid, uuid) to authenticated;

-- =========================================================================
-- 2. Retrofit de idempotência nas RPCs de campo (execução, ocorrência,
--    dano, nova fabricação, conclusão, aceite). Adiciona p_client_
--    operation_id como último parâmetro, com default null — mas Postgres
--    identifica função por (nome, tipos dos parâmetros): CREATE OR REPLACE
--    com uma lista de parâmetros diferente NÃO substitui a função antiga,
--    cria uma SEGUNDA função por overload, e o PostgREST passa a recusar a
--    chamada por ambiguidade ("Could not choose the best candidate
--    function"). Por isso cada função abaixo é precedida de DROP FUNCTION
--    IF EXISTS com a assinatura antiga.
-- =========================================================================

drop function if exists public.iniciar_execucao_instalacao(uuid);

create or replace function public.iniciar_execucao_instalacao(p_instalacao_id uuid, p_client_operation_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_total_itens int;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('iniciar_execucao_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'agendada' then
    raise exception 'Só é possível iniciar execução de instalação agendada (status atual: %).', v_instalacao.status;
  end if;

  select count(*) into v_total_itens from public.instalacao_itens where instalacao_id = p_instalacao_id;
  if v_total_itens = 0 then
    raise exception 'Instalação sem itens não pode iniciar execução.';
  end if;

  update public.instalacoes set status = 'em_execucao' where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.execucao_iniciada', 'instalacao', p_instalacao_id, v_instalacao.numero, null);

  perform public.sync_operation_complete('iniciar_execucao_instalacao', p_client_operation_id, p_instalacao_id);
  return p_instalacao_id;
end;
$$;

grant execute on function public.iniciar_execucao_instalacao(uuid, uuid) to authenticated;

drop function if exists public.registrar_execucao_item_instalacao(uuid, numeric);

create or replace function public.registrar_execucao_item_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade_instalada numeric,
  p_client_operation_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_execucao_item_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select ii.* into v_item
  from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id;
  if v_instalacao_status <> 'em_execucao' then
    raise exception 'Só é possível registrar execução de instalação em execução (status atual: %).', v_instalacao_status;
  end if;
  if p_quantidade_instalada <= 0 then
    raise exception 'Quantidade instalada precisa ser maior que zero.';
  end if;
  if v_item.quantidade_instalada + p_quantidade_instalada > v_item.quantidade then
    raise exception 'Quantidade instalada (%) excederia a quantidade planejada (%).',
      v_item.quantidade_instalada + p_quantidade_instalada, v_item.quantidade;
  end if;

  update public.instalacao_itens
  set quantidade_instalada = quantidade_instalada + p_quantidade_instalada
  where id = p_instalacao_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'instalacao.execucao_registrada', 'instalacao_item', p_instalacao_item_id, null,
    jsonb_build_object('quantidade_instalada', p_quantidade_instalada)
  );

  perform public.sync_operation_complete('registrar_execucao_item_instalacao', p_client_operation_id, p_instalacao_item_id);
  return p_instalacao_item_id;
end;
$$;

grant execute on function public.registrar_execucao_item_instalacao(uuid, numeric, uuid) to authenticated;

drop function if exists public.concluir_instalacao(uuid);

create or replace function public.concluir_instalacao(p_instalacao_id uuid, p_client_operation_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('concluir_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'em_execucao' then
    raise exception 'Só é possível concluir instalação em execução (status atual: %).', v_instalacao.status;
  end if;

  update public.instalacoes set status = 'concluida' where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.concluida', 'instalacao', p_instalacao_id, v_instalacao.numero, null);

  perform public.sync_operation_complete('concluir_instalacao', p_client_operation_id, p_instalacao_id);
  return p_instalacao_id;
end;
$$;

grant execute on function public.concluir_instalacao(uuid, uuid) to authenticated;

drop function if exists public.registrar_aceite_instalacao(uuid, text);

create or replace function public.registrar_aceite_instalacao(p_instalacao_id uuid, p_nome_cliente text, p_client_operation_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'aceite');
  v_instalacao public.instalacoes;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_aceite_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'concluida' then
    raise exception 'Só é possível registrar aceite de instalação concluída (status atual: %).', v_instalacao.status;
  end if;
  if p_nome_cliente is null or btrim(p_nome_cliente) = '' then
    raise exception 'Nome de quem aceitou é obrigatório.';
  end if;

  update public.instalacoes
  set status = 'aceita', aceite_por = auth.uid(), aceite_nome_cliente = p_nome_cliente, aceite_em = now()
  where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.aceite_registrado', 'instalacao', p_instalacao_id, p_nome_cliente, null);

  perform public.sync_operation_complete('registrar_aceite_instalacao', p_client_operation_id, p_instalacao_id);
  return p_instalacao_id;
end;
$$;

grant execute on function public.registrar_aceite_instalacao(uuid, text, uuid) to authenticated;

drop function if exists public.registrar_ocorrencia_instalacao(uuid, text);

create or replace function public.registrar_ocorrencia_instalacao(p_instalacao_id uuid, p_descricao text, p_client_operation_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_id uuid;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_ocorrencia_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status = 'cancelada' then
    raise exception 'Não é possível registrar ocorrência em instalação cancelada.';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da ocorrência é obrigatória.';
  end if;

  insert into public.ocorrencias_instalacao (company_id, instalacao_id, descricao, registrado_por)
  values (v_company_id, p_instalacao_id, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.ocorrencia_registrada', 'instalacao', p_instalacao_id, p_descricao, null);

  perform public.sync_operation_complete('registrar_ocorrencia_instalacao', p_client_operation_id, v_id);
  return v_id;
end;
$$;

grant execute on function public.registrar_ocorrencia_instalacao(uuid, text, uuid) to authenticated;

drop function if exists public.registrar_dano_instalacao(uuid, numeric, text, text);

create or replace function public.registrar_dano_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade numeric,
  p_causa text,
  p_descricao text default null,
  p_client_operation_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
  v_id uuid;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_dano_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select ii.* into v_item from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id;
  if v_instalacao_status not in ('em_execucao', 'concluida') then
    raise exception 'Só é possível registrar dano em instalação em execução ou concluída (status atual: %).', v_instalacao_status;
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;
  if p_causa not in ('fabricacao', 'transporte', 'instalacao', 'cliente', 'indeterminada') then
    raise exception 'Causa inválida: "%".', p_causa;
  end if;

  insert into public.danos_instalacao (company_id, instalacao_item_id, quantidade, causa, descricao, registrado_por)
  values (v_company_id, p_instalacao_item_id, p_quantidade, p_causa, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'instalacao.dano_registrado', 'instalacao_item', p_instalacao_item_id, p_descricao,
    jsonb_build_object('dano_id', v_id, 'quantidade', p_quantidade, 'causa', p_causa)
  );

  perform public.sync_operation_complete('registrar_dano_instalacao', p_client_operation_id, v_id);
  return v_id;
end;
$$;

grant execute on function public.registrar_dano_instalacao(uuid, numeric, text, text, uuid) to authenticated;

drop function if exists public.solicitar_nova_fabricacao(uuid, text);

create or replace function public.solicitar_nova_fabricacao(p_dano_id uuid, p_motivo text default null, p_client_operation_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_id uuid;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('solicitar_nova_fabricacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  if not exists (select 1 from public.danos_instalacao where id = p_dano_id and company_id = v_company_id) then
    raise exception 'Dano não encontrado nesta empresa.';
  end if;

  insert into public.solicitacoes_nova_fabricacao (company_id, dano_id, motivo, solicitado_por)
  values (v_company_id, p_dano_id, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.nova_fabricacao_solicitada', 'dano_instalacao', p_dano_id, p_motivo, jsonb_build_object('solicitacao_id', v_id));

  perform public.sync_operation_complete('solicitar_nova_fabricacao', p_client_operation_id, v_id);
  return v_id;
end;
$$;

grant execute on function public.solicitar_nova_fabricacao(uuid, text, uuid) to authenticated;

-- =========================================================================
-- 3. Leitura mínima offline (ADR-005 §7) — só as instalações das equipes
--    do próprio usuário, status agendada/em_execucao/concluida (aceita e
--    cancelada não precisam de nenhuma ação de campo). server_now() dá ao
--    cliente a referência temporal do servidor (ADR-005 §10 — o relógio do
--    dispositivo não é confiável) para calcular a validade de 3/7 dias.
-- =========================================================================

create or replace function public.server_now()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select now();
$$;

grant execute on function public.server_now() to authenticated;

create or replace function public.pacote_offline_instalacoes()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('instalacao', 'view') then
    raise exception 'Sem permissão para consultar instalações (instalacao.view).';
  end if;
  perform public.assert_company_not_suspended();

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'numero', i.numero,
          'status', i.status,
          'data_agendada', i.data_agendada,
          'observacoes', i.observacoes,
          'equipe_id', i.equipe_id,
          'pedido', jsonb_build_object('id', p.id, 'numero', p.numero),
          'pessoa', jsonb_build_object('nome', pe.nome),
          'obra', jsonb_build_object('id', o.id, 'nome', o.nome, 'logradouro', o.logradouro, 'cidade', o.cidade, 'uf', o.uf, 'cep', o.cep),
          'itens', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', ii.id, 'pedido_item_id', ii.pedido_item_id,
              'item_codigo', it.codigo, 'item_descricao', it.descricao,
              'quantidade', ii.quantidade, 'quantidade_instalada', ii.quantidade_instalada, 'quantidade_pendente', ii.quantidade_pendente
            )), '[]'::jsonb)
            from public.instalacao_itens ii
            join public.pedido_itens pit on pit.id = ii.pedido_item_id
            join public.itens it on it.id = pit.item_id
            where ii.instalacao_id = i.id
          ),
          'ocorrencias', (
            select coalesce(jsonb_agg(jsonb_build_object('id', oc.id, 'descricao', oc.descricao, 'registrado_em', oc.registrado_em) order by oc.registrado_em desc), '[]'::jsonb)
            from public.ocorrencias_instalacao oc where oc.instalacao_id = i.id
          ),
          'danos', (
            select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'instalacao_item_id', d.instalacao_item_id, 'quantidade', d.quantidade, 'causa', d.causa, 'descricao', d.descricao, 'registrado_em', d.registrado_em) order by d.registrado_em desc), '[]'::jsonb)
            from public.danos_instalacao d
            join public.instalacao_itens ii2 on ii2.id = d.instalacao_item_id
            where ii2.instalacao_id = i.id
          )
        )
        order by i.data_agendada
      )
      from public.instalacoes i
      join public.pedidos p on p.id = i.pedido_id
      join public.pessoas pe on pe.id = p.pessoa_id
      left join public.obras o on o.id = p.obra_id
      where i.company_id = v_company_id
        and i.status in ('agendada', 'em_execucao', 'concluida')
        and exists (
          select 1 from public.equipe_membros em
          where em.equipe_id = i.equipe_id and em.profile_id = auth.uid()
        )
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.pacote_offline_instalacoes() to authenticated;
