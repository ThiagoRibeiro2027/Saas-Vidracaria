-- TÓPICO 18 — Contratos completo (§4-6): aprovação por alçada, garantia e
-- vínculo financeiro detalhado. O recorte mínimo (20261005000000) cobriu
-- exatamente o que o próprio §12 priorizou: estrutura genérica, vigência,
-- ciclo de vida básico (rascunho → vigente → encerrado). Esta migration
-- fecha os três itens que o §12 explicitamente adiou "para etapa seguinte".
--
-- §6 — CICLO DE VIDA COMPLETO E ALÇADA: o modelo completo do próprio prompt
-- é rascunho → em_aprovação → vigente → suspenso → encerrado → cancelado.
-- ativar_contrato() (rascunho→vigente direto, só contratos.manage) é
-- substituída por um fluxo de duas etapas: enviar_contrato_para_
-- aprovacao() (rascunho→em_aprovação, contratos.manage) e aprovar_
-- contrato() (em_aprovação→vigente, contratos.aprovar — a alçada nova,
-- permissão própria e distinta de manage, "conforme o modelo de
-- permissões do ADR-001" que o próprio §6 pede). reprovar_contrato() manda
-- de volta pra rascunho (mesma alçada decide reprovar). suspender_
-- contrato()/retomar_contrato() cobrem vigente↔suspenso. cancelar_
-- contrato() cobre rascunho/em_aprovação→cancelado (uma vez vigente, o
-- único jeito de parar é encerrar, nunca cancelar — mesma distinção já
-- usada em orçamentos/propostas). encerrar_contrato() passa a aceitar
-- vigente OU suspenso como origem.
--
-- §4 — GARANTIA: prazo independente da vigência, só para contrato com
-- cliente (garantia de instalação/produto não faz sentido pra contrato de
-- fornecedor ou de funcionário). Só os campos + validação de data; alerta
-- de vencimento (§7) fica fora desta fase — o ADR-007 já tem recorte
-- próprio fechado (20260928000000), e estender o gatilho pra vigência/
-- garantia de contrato é uma peça nova (primeiro "scan" periódico por
-- data, em vez de evento síncrono de mutação) que fica pra quando for
-- pedida — não está entre os "3 itens adiados" do §12.
--
-- §5 — VÍNCULO FINANCEIRO DETALHADO: Contrato → Título financeiro →
-- Recebimento, mesmo desenho que pedidos já usam (T11). titulos_
-- financeiros ganha contrato_id nullable (XOR com pedido_id, nunca os
-- dois) e gerar_titulos_contrato() espelha gerar_titulos_pedido(), só pra
-- contrato tipo=cliente e status=vigente — contrato de fornecedor geraria
-- conta A PAGAR, não a receber (módulo inexistente ainda, fora de escopo
-- aqui); contrato de funcionário não gera título financeiro (RH não
-- calcula folha, §2). "parcelas"/"reajuste_previsto" (§5) viram campos
-- descritivos no contrato em si, sem automação de reajuste.
--
-- Checklist de segurança (CLAUDE.md): toda função nova valida
-- current_company_id() via assert_tenant_write(), nunca aceita company_id
-- do cliente; checa empresa suspensa; gate explícito has_permission();
-- SECURITY DEFINER com search_path controlado; sem grant a PUBLIC/anon;
-- teste negativo e de isolamento cross-tenant em scripts/test-contratos.mjs,
-- incluindo deny de aprovar_contrato() sem contratos.aprovar.

-- =========================================================================
-- 1. Schema: ciclo de vida completo, garantia, campos financeiros
-- =========================================================================

alter table public.contratos drop constraint contratos_status_check;
alter table public.contratos add constraint contratos_status_check
  check (status in ('rascunho', 'em_aprovacao', 'vigente', 'suspenso', 'encerrado', 'cancelado'));

alter table public.contratos
  add column garantia_inicio date,
  add column garantia_fim date,
  add column parcelas int check (parcelas is null or parcelas > 0),
  add column reajuste_previsto text,
  add column enviado_aprovacao_em timestamptz,
  add column suspenso_em timestamptz,
  add column motivo_suspensao text,
  add column cancelado_em timestamptz,
  add column motivo_cancelamento text;

alter table public.contratos drop constraint contratos_encerramento_check;
alter table public.contratos add constraint contratos_encerrado_check
  check ((status = 'encerrado') = (encerrado_em is not null));
alter table public.contratos add constraint contratos_suspenso_check
  check ((status = 'suspenso') = (suspenso_em is not null));
alter table public.contratos add constraint contratos_cancelado_check
  check ((status = 'cancelado') = (cancelado_em is not null));

alter table public.contratos add constraint contratos_garantia_tipo_check
  check ((garantia_inicio is null and garantia_fim is null) or tipo = 'cliente');
alter table public.contratos add constraint contratos_garantia_datas_check
  check (garantia_fim is null or garantia_inicio is null or garantia_fim >= garantia_inicio);

comment on column public.contratos.garantia_inicio is
  'TÓPICO 18 §4 — prazo de garantia (instalação/produto), independente da vigência. Só para tipo=cliente.';
comment on column public.contratos.parcelas is
  'TÓPICO 18 §5 — número de parcelas combinado (informativo). Os títulos financeiros de fato são gerados por gerar_titulos_contrato(), que não precisa bater com este número.';
comment on column public.contratos.reajuste_previsto is
  'TÓPICO 18 §5 — descrição livre do reajuste previsto (ex.: "IGPM anual"), sem automação de cálculo.';

-- =========================================================================
-- 2. upsert_contrato() — ganha garantia/parcelas/reajuste. `create or
--    replace` NÃO troca a assinatura antiga por uma com mais parâmetros —
--    isso cria um SEGUNDO overload (mesmo nome, contagem de parâmetros
--    diferente), e o PostgREST passa a recusar qualquer chamada que não
--    informe todos os parâmetros novos por nome ("could not choose the
--    best candidate function", achado ao rodar a suíte local). A
--    assinatura de 13 parâmetros precisa ser derrubada explicitamente
--    antes de criar a de 17.
-- =========================================================================

drop function if exists public.upsert_contrato(uuid, text, uuid, uuid, uuid, uuid, text, date, date, text, numeric, text, text);

create or replace function public.upsert_contrato(
  p_id uuid,
  p_tipo text,
  p_pessoa_id uuid,
  p_obra_id uuid,
  p_pedido_id uuid,
  p_funcionario_id uuid,
  p_objeto text,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_renovacao text default 'manual',
  p_valor numeric default null,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_garantia_inicio date default null,
  p_garantia_fim date default null,
  p_parcelas int default null,
  p_reajuste_previsto text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_before public.contratos;
  v_numero text;
  v_id uuid;
begin
  if p_tipo not in ('cliente', 'fornecedor', 'funcionario') then
    raise exception 'Tipo de contrato inválido: "%".', p_tipo;
  end if;
  if p_objeto is null or btrim(p_objeto) = '' then
    raise exception 'Objeto do contrato é obrigatório.';
  end if;
  if p_renovacao not in ('manual', 'automatica') then
    raise exception 'Renovação inválida: "%".', p_renovacao;
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;
  if (p_garantia_inicio is not null or p_garantia_fim is not null) and p_tipo <> 'cliente' then
    raise exception 'Garantia só é aplicável a contrato com cliente.';
  end if;
  if p_garantia_inicio is not null and p_garantia_fim is not null and p_garantia_fim < p_garantia_inicio then
    raise exception 'Fim da garantia não pode ser anterior ao início da garantia.';
  end if;
  if p_parcelas is not null and p_parcelas <= 0 then
    raise exception 'Número de parcelas precisa ser maior que zero.';
  end if;

  if p_tipo = 'cliente' then
    if p_pessoa_id is null or p_funcionario_id is not null then
      raise exception 'Contrato com cliente exige pessoa e não referencia funcionário.';
    end if;
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = p_pessoa_id and p.company_id = v_company_id
        and pp.papel = 'CLIENTE' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato precisa ter o papel CLIENTE ativo.';
    end if;
    if p_obra_id is not null and not exists (
      select 1 from public.obras where id = p_obra_id and company_id = v_company_id and pessoa_id = p_pessoa_id
    ) then
      raise exception 'Obra não encontrada nesta empresa para esta pessoa.';
    end if;
    if p_pedido_id is not null and not exists (
      select 1 from public.pedidos where id = p_pedido_id and company_id = v_company_id and pessoa_id = p_pessoa_id
    ) then
      raise exception 'Pedido não encontrado nesta empresa para esta pessoa.';
    end if;
  elsif p_tipo = 'fornecedor' then
    if p_pessoa_id is null or p_funcionario_id is not null or p_obra_id is not null or p_pedido_id is not null then
      raise exception 'Contrato com fornecedor exige só pessoa, sem obra/pedido/funcionário.';
    end if;
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = p_pessoa_id and p.company_id = v_company_id
        and pp.papel = 'FORNECEDOR' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato precisa ter o papel FORNECEDOR ativo.';
    end if;
  else -- funcionario
    if p_funcionario_id is null or p_pessoa_id is not null or p_obra_id is not null or p_pedido_id is not null then
      raise exception 'Contrato com funcionário exige só funcionário, sem pessoa/obra/pedido.';
    end if;
    if not exists (select 1 from public.funcionarios where id = p_funcionario_id and company_id = v_company_id) then
      raise exception 'Funcionário não encontrado nesta empresa.';
    end if;
  end if;

  if p_id is not null then
    select * into v_before from public.contratos
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Contrato não encontrado nesta empresa.';
    end if;
    if v_before.status <> 'rascunho' then
      raise exception 'Só é possível editar contrato em rascunho (status atual: %).', v_before.status;
    end if;
    if v_before.tipo <> p_tipo then
      raise exception 'Não é possível mudar o tipo de um contrato existente.';
    end if;

    update public.contratos set
      pessoa_id = p_pessoa_id, obra_id = p_obra_id, pedido_id = p_pedido_id, funcionario_id = p_funcionario_id,
      objeto = p_objeto, data_inicio = p_data_inicio, data_fim = p_data_fim, renovacao = p_renovacao,
      valor = p_valor, forma_pagamento = p_forma_pagamento, observacoes = p_observacoes,
      garantia_inicio = p_garantia_inicio, garantia_fim = p_garantia_fim,
      parcelas = p_parcelas, reajuste_previsto = p_reajuste_previsto
    where id = p_id
    returning id into v_id;
  else
    v_numero := public.next_document_number('contrato');

    insert into public.contratos (
      company_id, numero, tipo, pessoa_id, obra_id, pedido_id, funcionario_id, objeto,
      data_inicio, data_fim, renovacao, valor, forma_pagamento, observacoes, criado_por,
      garantia_inicio, garantia_fim, parcelas, reajuste_previsto
    ) values (
      v_company_id, v_numero, p_tipo, p_pessoa_id, p_obra_id, p_pedido_id, p_funcionario_id, p_objeto,
      p_data_inicio, p_data_fim, p_renovacao, p_valor, p_forma_pagamento, p_observacoes, auth.uid(),
      p_garantia_inicio, p_garantia_fim, p_parcelas, p_reajuste_previsto
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'contratos.criado' else 'contratos.editado' end,
    'contrato', v_id, p_objeto,
    jsonb_build_object('tipo', p_tipo, 'before', to_jsonb(v_before))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_contrato(uuid, text, uuid, uuid, uuid, uuid, text, date, date, text, numeric, text, text, date, date, int, text) to authenticated;

-- =========================================================================
-- 3. Ciclo de vida — enviar/aprovar/reprovar/suspender/retomar/cancelar
-- =========================================================================

drop function if exists public.ativar_contrato(uuid);

create or replace function public.enviar_contrato_para_aprovacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'rascunho' then
    raise exception 'Só é possível enviar para aprovação contrato em rascunho (status atual: %).', v_row.status;
  end if;
  if v_row.data_inicio is null then
    raise exception 'Data de início é obrigatória para enviar o contrato para aprovação.';
  end if;

  update public.contratos set status = 'em_aprovacao', enviado_aprovacao_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.enviado_aprovacao', 'contrato', p_id, v_row.numero);

  return p_id;
end;
$$;

grant execute on function public.enviar_contrato_para_aprovacao(uuid) to authenticated;

create or replace function public.aprovar_contrato(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'aprovar');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'em_aprovacao' then
    raise exception 'Só é possível aprovar contrato em aprovação (status atual: %).', v_row.status;
  end if;

  -- Revalidação no momento em que o contrato de fato vira vigente (mesma
  -- regra que ativar_contrato() já fazia, achado do code review de
  -- 23/09/2026): o papel CLIENTE/FORNECEDOR ou o funcionário vinculado
  -- pode ter sido desativado/removido depois que o rascunho foi enviado
  -- para aprovação.
  if v_row.tipo = 'cliente' then
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = v_row.pessoa_id and p.company_id = v_company_id
        and pp.papel = 'CLIENTE' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato não tem mais o papel CLIENTE ativo — corrija antes de aprovar.';
    end if;
  elsif v_row.tipo = 'fornecedor' then
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = v_row.pessoa_id and p.company_id = v_company_id
        and pp.papel = 'FORNECEDOR' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato não tem mais o papel FORNECEDOR ativo — corrija antes de aprovar.';
    end if;
  else -- funcionario
    if not exists (select 1 from public.funcionarios where id = v_row.funcionario_id and company_id = v_company_id) then
      raise exception 'O funcionário vinculado ao contrato não foi encontrado nesta empresa.';
    end if;
  end if;

  update public.contratos set status = 'vigente', ativado_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.aprovado', 'contrato', p_id, v_row.numero);

  return p_id;
end;
$$;

grant execute on function public.aprovar_contrato(uuid) to authenticated;

create or replace function public.reprovar_contrato(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'aprovar');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'em_aprovacao' then
    raise exception 'Só é possível reprovar contrato em aprovação (status atual: %).', v_row.status;
  end if;

  update public.contratos set status = 'rascunho', enviado_aprovacao_em = null where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.reprovado', 'contrato', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.reprovar_contrato(uuid, text) to authenticated;

create or replace function public.suspender_contrato(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'vigente' then
    raise exception 'Só é possível suspender contrato vigente (status atual: %).', v_row.status;
  end if;

  update public.contratos set status = 'suspenso', suspenso_em = now(), motivo_suspensao = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.suspenso', 'contrato', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.suspender_contrato(uuid, text) to authenticated;

create or replace function public.retomar_contrato(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'suspenso' then
    raise exception 'Só é possível retomar contrato suspenso (status atual: %).', v_row.status;
  end if;

  update public.contratos set status = 'vigente', suspenso_em = null, motivo_suspensao = null where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.retomado', 'contrato', p_id, v_row.numero);

  return p_id;
end;
$$;

grant execute on function public.retomar_contrato(uuid) to authenticated;

create or replace function public.cancelar_contrato(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status not in ('rascunho', 'em_aprovacao') then
    raise exception 'Só é possível cancelar contrato em rascunho ou em aprovação (status atual: %).', v_row.status;
  end if;

  update public.contratos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.cancelado', 'contrato', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_contrato(uuid, text) to authenticated;

create or replace function public.encerrar_contrato(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status not in ('vigente', 'suspenso') then
    raise exception 'Só é possível encerrar contrato vigente ou suspenso (status atual: %).', v_row.status;
  end if;

  -- Encerrar a partir de suspenso precisa limpar suspenso_em/motivo_
  -- suspensao — do contrário contratos_suspenso_check ("status = suspenso"
  -- equivale a "suspenso_em preenchido") rejeita a linha, porque o status
  -- muda mas o timestamp de suspensão continuaria preenchido.
  update public.contratos
  set status = 'encerrado', encerrado_em = now(), motivo_encerramento = p_motivo,
      suspenso_em = null, motivo_suspensao = null
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.encerrado', 'contrato', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.encerrar_contrato(uuid, text) to authenticated;

-- =========================================================================
-- 4. Vínculo financeiro detalhado (§5) — titulos_financeiros ganha
--    contrato_id, alternativa a pedido_id (XOR, nunca os dois).
-- =========================================================================

alter table public.titulos_financeiros alter column pedido_id drop not null;
alter table public.titulos_financeiros add column contrato_id uuid references public.contratos(id);
alter table public.titulos_financeiros add constraint titulos_financeiros_origem_check
  check ((pedido_id is not null) <> (contrato_id is not null));
create index titulos_financeiros_contrato_id_idx on public.titulos_financeiros (contrato_id) where contrato_id is not null;

comment on column public.titulos_financeiros.contrato_id is
  'TÓPICO 18 §5 — vínculo financeiro detalhado: título gerado a partir de contrato com cliente vigente (gerar_titulos_contrato()), alternativa a pedido_id (nunca os dois ao mesmo tempo).';

create or replace function public.gerar_titulos_contrato(p_contrato_id uuid, p_parcelas jsonb)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_contrato public.contratos;
  v_soma_parcelas numeric := 0;
  v_total_parcelas int;
  v_parcela jsonb;
  v_indice int := 0;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_numero text;
begin
  select * into v_contrato from public.contratos
  where id = p_contrato_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_contrato.tipo <> 'cliente' then
    raise exception 'Só é possível gerar título financeiro para contrato com cliente.';
  end if;
  if v_contrato.status <> 'vigente' then
    raise exception 'Só é possível gerar títulos de contrato vigente (status atual: %).', v_contrato.status;
  end if;
  if v_contrato.valor is null or v_contrato.valor <= 0 then
    raise exception 'Contrato sem valor definido.';
  end if;
  if exists (select 1 from public.titulos_financeiros where contrato_id = p_contrato_id) then
    raise exception 'Este contrato já tem título financeiro gerado.';
  end if;

  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.';
  end if;
  v_total_parcelas := jsonb_array_length(p_parcelas);

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_soma_parcelas := v_soma_parcelas + (v_parcela->>'valor')::numeric;
  end loop;
  if v_soma_parcelas <> v_contrato.valor then
    raise exception 'Soma das parcelas (%) precisa ser igual ao valor do contrato (%).', v_soma_parcelas, v_contrato.valor;
  end if;

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_indice := v_indice + 1;
    if (v_parcela->>'valor')::numeric <= 0 then
      raise exception 'Parcela % com valor inválido.', v_indice;
    end if;
    if (v_parcela->>'vencimento') is null then
      raise exception 'Parcela % sem vencimento.', v_indice;
    end if;

    v_numero := public.next_document_number('titulo_financeiro');

    insert into public.titulos_financeiros (
      company_id, contrato_id, numero, valor, vencimento, condicao_pagamento,
      parcela_numero, parcela_total, criado_por
    ) values (
      v_company_id, p_contrato_id, v_numero, (v_parcela->>'valor')::numeric, (v_parcela->>'vencimento')::date,
      v_parcela->>'condicao_pagamento', v_indice, v_total_parcelas, auth.uid()
    )
    returning id into v_id;

    v_ids := array_append(v_ids, v_id);

    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (
      v_company_id, auth.uid(), 'financeiro.titulo_gerado', 'titulo_financeiro', v_id, v_numero,
      jsonb_build_object('contrato_id', p_contrato_id, 'valor', v_parcela->>'valor', 'parcela', v_indice, 'de', v_total_parcelas)
    );
  end loop;

  return v_ids;
end;
$$;

grant execute on function public.gerar_titulos_contrato(uuid, jsonb) to authenticated;
