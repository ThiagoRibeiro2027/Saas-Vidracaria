-- Achados do code-review de 15/09/2026 sobre a Fase 8 (P0-P2) e o T4
-- Produção — revisão pedida antes de seguir pra T8. Corrige:
--
--   1. Storage DELETE (SEC-002/003/004 ficou incompleto): a policy nunca
--      recebeu o gate de has_permission('files','delete') aplicado aos
--      outros três verbos — qualquer usuário do tenant, mesmo sem
--      files.delete, podia apagar objetos direto via
--      storage.from(...).remove() (usado como rollback em
--      src/lib/storage/upload.ts), contornando delete_file() e a
--      auditoria/soft-delete que ele garante.
--   2. lista_corte() (T4 §54) comparava get_cutting_margin(i.tipo, '')
--      contra itens.tipo (enum materia_prima/produto_acabado/...), mas
--      cutting_margin_settings.material_tipo é configurado com a
--      classificação livre do material (ex.: 'vidro_temperado', igual a
--      itens.classificacao — ver scripts/test-configuracoes.mjs). A
--      margem saía sempre nula, silenciosamente, mesmo configurada.
--   3. As 4 funções de escrita do T4 repetiam manualmente a mesma
--      sequência de 3 guardas (company nulo, has_permission,
--      assert_company_not_suspended) — o próprio cabeçalho da migration
--      anterior já registrava que essa cópia manual causou o gap do
--      SEC-007 (só T2 recebeu a guarda). Introduz assert_tenant_write()
--      como ponto único, pra um esquecimento futuro ficar estruturalmente
--      mais difícil.

-- =========================================================================
-- 1. Storage DELETE — mesmo padrão de SEC-002/003/004.
-- =========================================================================

drop policy if exists company_files_delete on storage.objects;
create policy company_files_delete on storage.objects for delete
  using (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (select public.has_permission('files', 'delete'))
  );

-- =========================================================================
-- 3. assert_tenant_write() — helper único pras 3 guardas repetidas em toda
-- função de escrita de tenant. Retorna o company_id já resolvido (evita
-- uma segunda chamada a current_company_id() no corpo da função).
-- =========================================================================

create or replace function public.assert_tenant_write(p_resource text, p_action text default 'manage')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission(p_resource, p_action) then
    raise exception 'Sem permissão para esta operação (%.%).', p_resource, p_action;
  end if;
  perform public.assert_company_not_suspended();
  return v_company_id;
end;
$$;

grant execute on function public.assert_tenant_write(text, text) to authenticated;

create or replace function public.criar_ordem_producao(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_numero text;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if public.pedido_bloqueado_por_medicao(v_pedido.id) then
    raise exception 'Pedido bloqueado para produção: há item com medida em obra não confirmada (TÓPICO 16 §7).';
  end if;
  if exists (select 1 from public.ordens_producao where pedido_item_id = p_pedido_item_id) then
    raise exception 'Este item de pedido já tem ordem de produção.';
  end if;

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (company_id, pedido_id, pedido_item_id, numero, quantidade_planejada)
  values (v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_pedido_item.quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id, 'quantidade_planejada', v_pedido_item.quantidade)
  );

  return v_id;
end;
$$;

create or replace function public.apontar_producao(
  p_ordem_producao_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_perdida numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
  v_id uuid;
begin
  if coalesce(p_quantidade_produzida, 0) < 0 or coalesce(p_quantidade_perdida, 0) < 0 then
    raise exception 'Quantidade produzida e perdida não podem ser negativas.';
  end if;
  if coalesce(p_quantidade_produzida, 0) = 0 and coalesce(p_quantidade_perdida, 0) = 0 then
    raise exception 'Informe quantidade produzida e/ou perdida maior que zero.';
  end if;

  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, quantidade_produzida, quantidade_perdida, observacao, registrado_por
  ) values (
    v_company_id, p_ordem_producao_id, coalesce(p_quantidade_produzida, 0), coalesce(p_quantidade_perdida, 0),
    p_observacao, auth.uid()
  ) returning id into v_id;

  update public.ordens_producao set
    quantidade_produzida = quantidade_produzida + coalesce(p_quantidade_produzida, 0),
    quantidade_perdida = quantidade_perdida + coalesce(p_quantidade_perdida, 0),
    status = 'em_producao'
  where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', p_ordem_producao_id, p_observacao,
    jsonb_build_object('quantidade_produzida', p_quantidade_produzida, 'quantidade_perdida', p_quantidade_perdida)
  );

  return v_id;
end;
$$;

create or replace function public.concluir_ordem_producao(p_ordem_producao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível concluir OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if v_op.quantidade_produzida < v_op.quantidade_planejada then
    raise exception 'Quantidade produzida (%) ainda não atinge a planejada (%).', v_op.quantidade_produzida, v_op.quantidade_planejada;
  end if;

  update public.ordens_producao set status = 'concluida' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_concluida', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('quantidade_produzida', v_op.quantidade_produzida, 'quantidade_perdida', v_op.quantidade_perdida)
  );

  return p_ordem_producao_id;
end;
$$;

create or replace function public.cancelar_ordem_producao(p_ordem_producao_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status = 'concluida' then
    raise exception 'Ordem de produção já concluída não pode ser cancelada.';
  end if;
  if v_op.status = 'cancelada' then
    raise exception 'Ordem de produção já está cancelada.';
  end if;

  update public.ordens_producao set status = 'cancelada' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_cancelada', 'ordem_producao', p_ordem_producao_id, p_motivo,
    jsonb_build_object('status_anterior', v_op.status)
  );

  return p_ordem_producao_id;
end;
$$;

-- =========================================================================
-- 2. lista_corte() — corrige a coluna de comparação da margem de quebra.
-- Corpo idêntico ao anterior, só trocando i.tipo por i.classificacao na
-- chamada de get_cutting_margin().
-- =========================================================================

create or replace function public.lista_corte(p_ordem_producao_id uuid)
returns table (
  ordem_producao_id uuid,
  numero text,
  pedido_numero text,
  pessoa_nome text,
  obra_nome text,
  ambiente text,
  item_codigo text,
  item_descricao text,
  largura_mm numeric,
  altura_mm numeric,
  quantidade numeric,
  margem_quebra_percentual numeric,
  responsavel text,
  emitido_em timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  return query
  select
    v_op.id,
    v_op.numero,
    p.numero,
    pe.nome,
    o.nome,
    ip.ambiente,
    i.codigo,
    i.descricao,
    ip.largura_mm,
    ip.altura_mm,
    v_op.quantidade_planejada,
    public.get_cutting_margin(i.classificacao, ''),
    prof.display_name,
    now()
  from public.pedido_itens pit
  join public.pedidos p on p.id = pit.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  join public.itens i on i.id = pit.item_id
  left join public.itens_producao ip on ip.pedido_item_id = pit.id
  left join public.profiles prof on prof.id = auth.uid()
  where pit.id = v_op.pedido_item_id;
end;
$$;

-- =========================================================================
-- Bookkeeping do cron de alertas (achado de code-review): o marcador de
-- idempotência (checked_until) estava sendo gravado como uma linha
-- sintética em activity_logs — a mesma tabela sujeita ao expurgo de
-- retenção de 24 meses (purge_activity_logs_older_than_retention). Tabela
-- dedicada, fora da trilha de auditoria e fora do escopo da retenção.
-- =========================================================================

create table public.cron_job_state (
  job_name text primary key,
  checked_until timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.cron_job_state is 'Bookkeeping de jobs agendados (ex.: /api/cron/security-alerts) — deliberadamente fora de activity_logs, pra não competir com a política de retenção de auditoria.';

create trigger set_updated_at before update on public.cron_job_state
  for each row execute function public.set_updated_at();

alter table public.cron_job_state enable row level security;
-- Nenhuma policy para authenticated/anon — só a rota de cron acessa, via
-- createAdminClient() (service_role, que ignora RLS).
revoke all on public.cron_job_state from anon, authenticated;
