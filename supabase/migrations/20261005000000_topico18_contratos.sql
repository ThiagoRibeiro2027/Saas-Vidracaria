-- TÓPICO 18 — Contratos, recorte mínimo do MVP. Prompt TÓPICO 18 §12 já
-- define o corte, sem precisar de uma rodada extra de aprovação de escopo
-- (ao contrário do TÓPICO 13): "priorizar: estrutura genérica de contrato
-- com os três tipos, vigência, e ciclo de vida básico (rascunho → vigente
-- → encerrado). Aprovação por alçada, garantia e vínculo financeiro
-- detalhado podem ser incorporados em etapa seguinte."
--
-- O QUE ENTRA NESTA FASE:
--   - Estrutura genérica única (§2) com os três tipos — cliente, fornecedor,
--     funcionário/prestador — cada um vinculado ao cadastro certo:
--     cliente → pessoas (papel CLIENTE) + obra/pedido opcionais (Comercial/
--     T3); fornecedor → pessoas (papel FORNECEDOR); funcionário/prestador →
--     funcionarios (T17 RH). Uma tabela só, "tipo" decide o vínculo — o
--     próprio §2 pede isso, não três tabelas.
--   - Vigência (§3): data_inicio, data_fim, renovação manual/automática
--     (só o campo — nenhuma automação real de renovação nesta fase).
--     "Histórico de aditivos" não vira tabela própria: cada mutação já
--     grava em activity_logs, mesmo padrão de todo outro módulo — um
--     aditivo formal com fluxo próprio fica para quando for pedido.
--   - Valores e condições financeiras (§5): só os campos (valor, forma de
--     pagamento) — "vínculo rastreável com o Financeiro" (Contrato →
--     Cobrança → Pagamento) é o "vínculo financeiro detalhado" que o
--     próprio §12 adia.
--   - Ciclo de vida básico (§6, recortado pelo §12): rascunho → vigente →
--     encerrado. Sem em_aprovação/suspenso/cancelado do modelo completo —
--     "aprovação por alçada" fica pra depois, e um rascunho errado só se
--     edita (mesmo padrão do RH: sem status extra só pra corrigir engano
--     antes de qualquer efeito real).
--
-- O QUE FICA DE FORA DESTA FASE (§12 explícito, ou consequência direta):
--   aprovação por alçada (transição rascunho/vigente sem approval_
--   thresholds, só permissão direta); garantia (§4, prazo independente da
--   vigência); vínculo financeiro detalhado (§5); documentos anexos (§8 —
--   a estrutura genérica de files/register_file já suporta entity_type=
--   'contrato' sem nenhuma mudança de schema, mas não construo tela de
--   upload aqui, igual RH não construiu pra documentos de funcionário);
--   alertas de vencimento via ADR-007 (§7 — módulo de notificações já
--   existe com recorte próprio fechado, estender o gatilho fica pra
--   quando o alerta for pedido); gancho de assinatura eletrônica (§10 —
--   nem o campo de referência externa entra nesta fase, não há nada pra
--   referenciar ainda).
--
-- Checklist de segurança (auditoria 14/09/2026, CLAUDE.md): toda mutação
-- valida current_company_id() via assert_tenant_write(), nunca aceita
-- company_id do cliente; toda mutação checa empresa suspensa; gate
-- explícito has_permission('contratos', ...); SECURITY DEFINER com
-- search_path controlado; sem grant a PUBLIC/anon; RLS com teste de
-- isolamento cross-tenant e teste negativo no scripts/test-contratos.mjs.
--
-- SELECT exige contratos.view, não é aberto a qualquer autenticado da
-- empresa — mesma decisão do TÓPICO 17 RH (T17 foi "a primeira vez que
-- isso acontece no schema"), porque esta tabela mistura dado comercial
-- (cliente/fornecedor) com contrato de trabalho de pessoa identificada
-- (funcionário/prestador) — dado pessoal sensível (LGPD) na mesma tabela,
-- e §2 pede uma estrutura genérica única, não tabelas separadas por
-- sensibilidade.

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  tipo text not null check (tipo in ('cliente', 'fornecedor', 'funcionario')),
  pessoa_id uuid references public.pessoas(id),
  obra_id uuid references public.obras(id),
  pedido_id uuid references public.pedidos(id),
  funcionario_id uuid references public.funcionarios(id),
  objeto text not null,
  data_inicio date,
  data_fim date,
  renovacao text not null default 'manual' check (renovacao in ('manual', 'automatica')),
  valor numeric(14, 2),
  forma_pagamento text,
  status text not null default 'rascunho' check (status in ('rascunho', 'vigente', 'encerrado')),
  ativado_em timestamptz,
  encerrado_em timestamptz,
  motivo_encerramento text,
  observacoes text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contratos_company_numero_unique unique (company_id, numero),
  -- Vínculo obrigatório por tipo (§2), reforçado aqui além da validação
  -- amigável em upsert_contrato(): obra/pedido só fazem sentido pra
  -- cliente (Comercial); fornecedor e funcionário não referenciam obra/
  -- pedido; funcionario_id só existe pro tipo funcionario.
  constraint contratos_vinculo_por_tipo_check check (
    (tipo = 'cliente' and pessoa_id is not null and funcionario_id is null)
    or (tipo = 'fornecedor' and pessoa_id is not null and funcionario_id is null and obra_id is null and pedido_id is null)
    or (tipo = 'funcionario' and funcionario_id is not null and pessoa_id is null and obra_id is null and pedido_id is null)
  ),
  constraint contratos_encerramento_check check ((status = 'encerrado') = (encerrado_em is not null))
);
comment on table public.contratos is
  'TÓPICO 18, recorte mínimo do MVP (§12) — estrutura genérica única para contratos com cliente, fornecedor e funcionário/prestador. SELECT exige contratos.view (dado sensível de RH misturado com dado comercial, mesma decisão do T17). Sem aprovação por alçada, garantia, vínculo financeiro detalhado, anexos ou alertas de vencimento nesta fase.';
create index contratos_company_id_idx on public.contratos (company_id);
create index contratos_pessoa_id_idx on public.contratos (pessoa_id) where pessoa_id is not null;
create index contratos_funcionario_id_idx on public.contratos (funcionario_id) where funcionario_id is not null;

create trigger set_updated_at before update on public.contratos
  for each row execute function public.set_updated_at();

alter table public.contratos enable row level security;
create policy contratos_select on public.contratos for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('contratos', 'view')));

grant select on public.contratos to authenticated;

-- =========================================================================
-- upsert_contrato() — cria/edita. Só edita enquanto rascunho (mesmo padrão
-- de RH: depois de vigente, os únicos caminhos são ativar_contrato() e
-- encerrar_contrato(), nunca edição livre de um contrato já em vigor).
-- =========================================================================

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
  p_observacoes text default null
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
      valor = p_valor, forma_pagamento = p_forma_pagamento, observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
  else
    v_numero := public.next_document_number('contrato');

    insert into public.contratos (
      company_id, numero, tipo, pessoa_id, obra_id, pedido_id, funcionario_id, objeto,
      data_inicio, data_fim, renovacao, valor, forma_pagamento, observacoes, criado_por
    ) values (
      v_company_id, v_numero, p_tipo, p_pessoa_id, p_obra_id, p_pedido_id, p_funcionario_id, p_objeto,
      p_data_inicio, p_data_fim, p_renovacao, p_valor, p_forma_pagamento, p_observacoes, auth.uid()
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

grant execute on function public.upsert_contrato(uuid, text, uuid, uuid, uuid, uuid, text, date, date, text, numeric, text, text) to authenticated;

-- =========================================================================
-- ativar_contrato() — rascunho → vigente. Exige data_inicio (não dá pra
-- ter vigência sem data de início). Sem aprovação por alçada nesta fase
-- (§12): o gate é só contratos.manage.
-- =========================================================================

create or replace function public.ativar_contrato(p_id uuid)
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
    raise exception 'Só é possível ativar contrato em rascunho (status atual: %).', v_row.status;
  end if;
  if v_row.data_inicio is null then
    raise exception 'Data de início é obrigatória para ativar o contrato.';
  end if;

  update public.contratos set status = 'vigente', ativado_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.ativado', 'contrato', p_id, v_row.numero);

  return p_id;
end;
$$;

grant execute on function public.ativar_contrato(uuid) to authenticated;

-- =========================================================================
-- encerrar_contrato() — vigente → encerrado. Transição terminal.
-- =========================================================================

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
  if v_row.status <> 'vigente' then
    raise exception 'Só é possível encerrar contrato vigente (status atual: %).', v_row.status;
  end if;

  update public.contratos
  set status = 'encerrado', encerrado_em = now(), motivo_encerramento = p_motivo
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.encerrado', 'contrato', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.encerrar_contrato(uuid, text) to authenticated;

-- =========================================================================
-- next_document_number() ganha o tipo 'contrato' na lista fixa, com o
-- mesmo padrão de permissão explícita por tipo já usado pelos demais
-- documentos (mesma assinatura, CREATE OR REPLACE de verdade).
-- =========================================================================

create or replace function public.next_document_number(p_document_type text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_row public.numbering_sequences%rowtype;
  v_period_key text;
  v_number text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if p_document_type = 'orcamento' then
    if not public.has_permission('orcamentos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
    end if;
  elsif p_document_type = 'proposta' then
    if not public.has_permission('propostas', 'manage') then
      raise exception 'Sem permissão para emitir numeração de proposta (propostas.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not (public.has_permission('producao', 'planejar') or public.has_permission('producao', 'manage')) then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.planejar ou producao.manage).';
    end if;
  elsif p_document_type = 'expedicao' then
    if not public.has_permission('expedicao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de expedição (expedicao.manage).';
    end if;
  elsif p_document_type = 'instalacao' then
    if not public.has_permission('instalacao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de instalação (instalacao.manage).';
    end if;
  elsif p_document_type = 'titulo_financeiro' then
    if not public.has_permission('financeiro', 'manage') then
      raise exception 'Sem permissão para emitir numeração de título financeiro (financeiro.manage).';
    end if;
  elsif p_document_type = 'contrato' then
    if not public.has_permission('contratos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de contrato (contratos.manage).';
    end if;
  else
    raise exception 'Tipo de documento desconhecido: "%".', p_document_type;
  end if;

  perform public.assert_company_not_suspended();

  select * into v_row from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  if not found then
    raise exception 'Sequência de numeração não configurada para "%".', p_document_type;
  end if;

  v_period_key := case v_row.reinicio
    when 'anual' then to_char(now(), 'YYYY')
    when 'mensal' then to_char(now(), 'YYYY-MM')
    else ''
  end;

  if v_period_key is distinct from v_row.current_period_key then
    v_row.current_value := 0;
  end if;

  v_row.current_value := v_row.current_value + 1;

  update public.numbering_sequences
  set current_value = v_row.current_value,
      current_period_key = v_period_key
  where id = v_row.id;

  v_number := v_row.prefixo
    || (case when v_row.incluir_ano then to_char(now(), 'YYYY') else '' end)
    || (case when v_row.incluir_mes then to_char(now(), 'MM') else '' end)
    || lpad(v_row.current_value::text, v_row.digitos, '0')
    || v_row.sufixo;

  return v_number;
end;
$$;
