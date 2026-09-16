-- TÓPICO 8 — Qualidade, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, dezembro: "saída, campo e homologação"). Texto exato do
-- recorte (PLANO §4): "T8 — Qualidade: inspeção simples com aprovação,
-- reprovação e retrabalho. Sem plano de amostragem nem gestão de
-- instrumentos." ADR-002 §4.13 é a lista autoritativa mais detalhada:
-- "inspeção essencial; registro de não conformidade; bloqueio;
-- aprovação/reprovação; retrabalho; liberação; histórico. Funcionalidades
-- avançadas de qualidade ficam para Release 1."
--
-- O TÓPICO 8 completo (docs/Prompt TÓPICO 8) é o módulo mais amplo do
-- MVP: planos de inspeção versionados e reutilizáveis (§4/§9),
-- características configuráveis com comparação automática (§5-6),
-- amostragem/níveis de inspeção por fornecedor (§15), concessão (§23),
-- auditorias de qualidade (§32), controle de documentos (§33),
-- instrumentos de medição (§34), indicadores/BI (§42-44). Nada disso
-- entra aqui — mesmo critério de recorte de T2/T3/T4/T5/T6/T10/T15: só o
-- que sustenta "inspeção simples com aprovação, reprovação e retrabalho".
--
-- Decisões de recorte:
--   - Qualidade ganha uma autoridade PARALELA à de Produção, nunca
--     substitui: nenhuma função/enum de T4 (ordens_producao.status,
--     apontar_producao, concluir_ordem_producao, cancelar_ordem_producao)
--     é alterada. Nova coluna ordens_producao.status_qualidade é a
--     "autoridade sobre o status de qualidade" do item 48 do prompt
--     completo ("Qualidade: 'Lote bloqueado.' Estoque: executa a
--     movimentação... não como autoridade sobre saldos ou processos
--     operacionais de outros módulos").
--   - Garantia estrutural (sem código novo): uma OP concluída e bloqueada
--     por qualidade nunca pode ser cancelada por engano —
--     cancelar_ordem_producao() já rejeita status='concluida'
--     incondicionalmente (T4, 20260915000000), então bloqueio de
--     qualidade nunca abre uma janela de cancelamento indevido.
--   - "Inspeção simples": um único ponto de inspeção por OP concluída
--     (não os múltiplos tipos/pontos do §3/§16 do prompt completo —
--     recebimento, em processo, etc. — que dependem de módulos que ainda
--     não existem, T18 Compras e o roteiro operação-a-operação de T4).
--     Cobre quantidade_produzida inteira (o que a produção efetivamente
--     entregou), nunca quantidade_planejada nem quantidade_perdida (essa
--     já é perda própria de produção, TÓPICO 4, não é decisão de
--     qualidade).
--   - "Retrabalho" (§24 do prompt completo) aqui é só do lado de
--     Qualidade: registra que a atividade aconteceu (quem/quando/
--     observação) e o resultado da reinspeção, mas NÃO gera
--     producao_apontamentos nem movimento de estoque — isso seria
--     "alimentar PCP/Produção e Estoque" (§24), fora do "sem plano de
--     amostragem nem gestão de instrumentos" do recorte do PLANO.
--     Revisitar quando T9/T6 precisarem consumir isso de verdade.
--   - "Liberação" (ADR-002) é o próprio status_qualidade='aprovado',
--     automático quando reprovada chega a zero — sem função liberar_*
--     separada nem o checklist de liberação para expedição (prompt
--     completo §27, que é T9/Release 1).
--   - "Histórico" (ADR-002) são as duas tabelas abaixo, já seleccionáveis
--     com timestamp — sem função leitora dedicada (diferente de
--     lista_corte() em T4, que existia porque cruzava várias tabelas;
--     aqui seria escopo redundante).
--   - Disposição de não conformidade fixa em 'retrabalho' — as outras do
--     prompt completo (sucata, concessão, devolução, seleção) são
--     Release 1, ADR-002 não as lista.
--   - insert into activity_logs direto (não log_activity()), mesmo
--     padrão já usado em T2/T3/T4/T5/T6/T10.

-- =========================================================================
-- 1. ordens_producao ganha uma coluna nova (autoridade de Qualidade em
--    paralelo, nunca substituindo o status de Produção).
-- =========================================================================

alter table public.ordens_producao
  add column status_qualidade text not null default 'pendente'
    check (status_qualidade in ('pendente', 'aprovado', 'bloqueado'));
create index ordens_producao_status_qualidade_idx on public.ordens_producao (status_qualidade);

-- =========================================================================
-- 2. Tabelas. FK circular entre inspecoes_qualidade e nao_conformidades:
--    cria inspecoes_qualidade com nao_conformidade_id como uuid puro
--    (sem FK ainda), depois nao_conformidades (cuja FK para
--    inspecoes_qualidade já funciona normalmente), e só então adiciona a
--    FK que faltava em inspecoes_qualidade.
-- =========================================================================

create table public.inspecoes_qualidade (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ordem_producao_id uuid not null references public.ordens_producao(id),
  -- null = primeira inspeção da OP; preenchido = reinspeção de retrabalho
  -- de uma não conformidade específica (FK adicionada mais abaixo).
  nao_conformidade_id uuid,
  quantidade_aprovada numeric(14, 3) not null check (quantidade_aprovada >= 0),
  quantidade_reprovada numeric(14, 3) not null check (quantidade_reprovada >= 0),
  -- Derivado, nunca pode divergir das quantidades que o gerou (§7 do
  -- prompt completo: resultado da inspeção).
  resultado text generated always as (
    case when quantidade_reprovada > 0 then 'reprovado' else 'aprovado' end
  ) stored,
  observacoes text,
  inspecionado_por uuid not null references public.profiles(id),
  inspecionado_em timestamptz not null default now(),
  constraint inspecoes_qualidade_quantidade_check check (quantidade_aprovada + quantidade_reprovada > 0)
);
comment on table public.inspecoes_qualidade is
  'TÓPICO 8, recorte mínimo — uma linha por evento de inspeção (primeira ou reinspeção de retrabalho). Insert-only: nunca editar/apagar um resultado já registrado (§25 do prompt completo — "nunca apagar a reprovação anterior").';
create index inspecoes_qualidade_ordem_producao_id_idx on public.inspecoes_qualidade (ordem_producao_id);
-- No máximo uma "primeira inspeção" (sem NC de origem) por OP.
create unique index inspecoes_qualidade_primeira_unique on public.inspecoes_qualidade (ordem_producao_id) where nao_conformidade_id is null;
-- No máximo uma reinspeção por NC — uma reprovação na reinspeção fecha
-- esta NC e abre uma nova (nunca reaproveita a mesma).
create unique index inspecoes_qualidade_reinspecao_unique on public.inspecoes_qualidade (nao_conformidade_id) where nao_conformidade_id is not null;

create table public.nao_conformidades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ordem_producao_id uuid not null references public.ordens_producao(id),
  inspecao_origem_id uuid not null references public.inspecoes_qualidade(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  disposicao text not null default 'retrabalho' check (disposicao in ('retrabalho')),
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  descricao text,
  aberta_por uuid not null references public.profiles(id),
  aberta_em timestamptz not null default now(),
  retrabalho_executado_em timestamptz,
  retrabalho_observacao text,
  encerrada_em timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.nao_conformidades is
  'TÓPICO 8, recorte mínimo — disposição fixa em retrabalho (sucata/concessão/devolução são Release 1, ADR-002 §4.13 não as lista). Nunca reescrita após encerrada: uma reprovação na reinspeção abre uma NC nova, preservando a cadeia via inspecao_origem_id.';
create index nao_conformidades_ordem_producao_id_idx on public.nao_conformidades (ordem_producao_id);
-- No máximo um ciclo de retrabalho em andamento por OP.
create unique index nao_conformidades_aberta_unique on public.nao_conformidades (ordem_producao_id) where status = 'aberta';

create trigger set_updated_at before update on public.nao_conformidades
  for each row execute function public.set_updated_at();

alter table public.inspecoes_qualidade
  add constraint inspecoes_qualidade_nao_conformidade_id_fkey
  foreign key (nao_conformidade_id) references public.nao_conformidades(id);

-- =========================================================================
-- 3. RLS — SELECT aberto a qualquer autenticado da empresa, sem exigir
--    qualidade.view: mesmo padrão de ordens_producao_select (T4) — T9
--    Expedição, quando existir, vai precisar ler status_qualidade sem que
--    seu usuário administre Qualidade. Nenhuma policy de INSERT/UPDATE
--    para authenticated: toda escrita passa pelas funções abaixo.
-- =========================================================================

alter table public.inspecoes_qualidade enable row level security;
alter table public.nao_conformidades enable row level security;

create policy inspecoes_qualidade_select on public.inspecoes_qualidade for select
  using (company_id = (select public.current_company_id()));
create policy nao_conformidades_select on public.nao_conformidades for select
  using (company_id = (select public.current_company_id()));

grant select on public.inspecoes_qualidade to authenticated;
grant select on public.nao_conformidades to authenticated;

-- =========================================================================
-- 4. registrar_inspecao_qualidade() — só a partir de OP concluída,
--    cobrindo a quantidade_produzida inteira. Reprovação parcial ou total
--    abre uma não conformidade e bloqueia o status de qualidade da OP.
-- =========================================================================

create or replace function public.registrar_inspecao_qualidade(
  p_ordem_producao_id uuid,
  p_quantidade_aprovada numeric,
  p_quantidade_reprovada numeric,
  p_observacoes text default null
) returns uuid
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

grant execute on function public.registrar_inspecao_qualidade(uuid, numeric, numeric, text) to authenticated;

-- =========================================================================
-- 5. executar_retrabalho() — carimba que a atividade de retrabalho
--    aconteceu (§24: "tratado como atividade rastreável"), sem gerar
--    apontamento de produção nem movimento de estoque (fora do recorte).
-- =========================================================================

create or replace function public.executar_retrabalho(
  p_nao_conformidade_id uuid,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('qualidade', 'manage');
  v_nc public.nao_conformidades;
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
  -- A NC continua 'aberta' entre executar e reinspecionar — sem esta
  -- checagem, o mesmo retrabalho poderia ser "executado" várias vezes.
  if v_nc.retrabalho_executado_em is not null then
    raise exception 'Retrabalho já executado para esta não conformidade.';
  end if;

  update public.nao_conformidades
  set retrabalho_executado_em = now(), retrabalho_observacao = p_observacao
  where id = p_nao_conformidade_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'qualidade.retrabalho_executado', 'nao_conformidade', p_nao_conformidade_id, p_observacao,
    jsonb_build_object('ordem_producao_id', v_nc.ordem_producao_id)
  );

  return p_nao_conformidade_id;
end;
$$;

grant execute on function public.executar_retrabalho(uuid, text) to authenticated;

-- =========================================================================
-- 6. reinspecionar_retrabalho() — fecha a NC atual; se ainda sobrar
--    quantidade reprovada, abre uma NC nova (nunca reescreve a anterior,
--    §25: "nunca apagar a reprovação anterior").
-- =========================================================================

create or replace function public.reinspecionar_retrabalho(
  p_nao_conformidade_id uuid,
  p_quantidade_aprovada numeric,
  p_quantidade_reprovada numeric,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('qualidade', 'manage');
  v_nc public.nao_conformidades;
  v_inspecao_id uuid;
  v_nova_nc_id uuid;
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

grant execute on function public.reinspecionar_retrabalho(uuid, numeric, numeric, text) to authenticated;
