-- Recebimento leve de material — Fase D do plano aprovado em 23/09/2026
-- (fila de produção, peças fabricadas e necessidades automáticas de
-- suprimentos), liberada pela emenda ao ADR-002 §4.18 v2.7 (aprovação
-- explícita do responsável do produto, mesma migration não pode ser
-- escrita sem essa emenda já registrada — CLAUDE.md "não implementar
-- regra de negócio fora do que está definido em ADR").
--
-- O módulo completo de Compras continua fora do MVP (ADR-002 §4.18) —
-- isto NÃO é um Pedido de Compra, fornecedor, cotação ou nota fiscal de
-- entrada. É só um passo a mais no ciclo de vida de necessidades_compra
-- já existente: 'atendida' → 'recebida', registrando quantidade recebida
-- e dando entrada física no estoque via ajustar_saldo() (TÓPICO 6) já
-- existente — nenhum mecanismo de entrada de estoque novo é criado.
--
-- Decisão de permissão deliberada: registrar_recebimento_necessidade()
-- exige suprimentos.manage (é uma ação de Suprimentos) E, por chamar
-- ajustar_saldo() sem contornar o gate dele, exige também estoque.manage
-- do chamador — reaproveitar o mecanismo de T6 significa reaproveitar a
-- fronteira de permissão dele também, não abrir uma exceção pra
-- Suprimentos mexer em saldo de estoque sem a permissão do módulo dono
-- do dado. Uma empresa que queira um perfil "recebimento" único concede
-- as duas permissões a esse perfil — não é este código que decide isso.

alter table public.necessidades_compra
  drop constraint necessidades_compra_status_check;
alter table public.necessidades_compra
  add constraint necessidades_compra_status_check check (status in ('aberta', 'atendida', 'cancelada', 'recebida'));

alter table public.necessidades_compra
  add column quantidade_recebida numeric(14, 3),
  add column data_recebimento timestamptz,
  add column recebido_por uuid references public.profiles(id);
comment on column public.necessidades_compra.quantidade_recebida is 'Fase D (ADR-002 §4.18 v2.7) — quantidade efetivamente recebida, pode divergir de `quantidade` (recebimento a menor/maior que o planejado). Preenchida só quando status = ''recebida''.';

create or replace function public.registrar_recebimento_necessidade(
  p_id uuid, p_quantidade_recebida numeric, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_necessidade public.necessidades_compra;
begin
  if p_quantidade_recebida is null or p_quantidade_recebida <= 0 then
    raise exception 'Quantidade recebida precisa ser maior que zero.';
  end if;

  select * into v_necessidade from public.necessidades_compra
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Necessidade de compra não encontrada nesta empresa.';
  end if;
  if v_necessidade.status <> 'atendida' then
    raise exception 'Só é possível registrar recebimento de necessidade atendida (status atual: %).', v_necessidade.status;
  end if;

  -- ajustar_saldo() faz sua própria checagem de estoque.manage — não é
  -- contornada aqui (ver nota no cabeçalho da migration).
  perform public.ajustar_saldo(
    v_necessidade.item_id, p_quantidade_recebida,
    format('Recebimento da necessidade de compra %s.', p_id)
  );

  update public.necessidades_compra set
    status = 'recebida',
    quantidade_recebida = p_quantidade_recebida,
    data_recebimento = now(),
    recebido_por = auth.uid(),
    observacoes = coalesce(p_observacao, observacoes)
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidade_recebida', 'necessidade_compra', p_id, p_observacao,
    jsonb_build_object('item_id', v_necessidade.item_id, 'quantidade_recebida', p_quantidade_recebida)
  );

  return p_id;
end;
$$;

grant execute on function public.registrar_recebimento_necessidade(uuid, numeric, text) to authenticated;
