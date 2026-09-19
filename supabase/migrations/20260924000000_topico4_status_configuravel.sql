-- TÓPICO 4 — Fase 7c da ampliação de escopo (ADR-002 §4.7): §41 status
-- configurável. Decisão do responsável do produto em 2026-09-19, mesma
-- sessão que fechou §44/Fase 7d e adiou §45/Fase 7b: configurabilidade
-- fica restrita a RÓTULO — o valor interno de ordens_producao.status/
-- situacao/status_qualidade nunca muda.
--
-- Por quê: registrar_inspecao_qualidade() (T8, 20260915050000) e
-- adicionar_item_expedicao()/criar_expedicao() (T9, 20260915060000)
-- comparam esses três campos literalmente por string (status='concluida',
-- status_qualidade='aprovado', pedidos.status='liberado'). Deixar a
-- empresa redefinir os valores em si quebraria os dois módulos a jusante
-- sem nenhum desenho de como os gates deveriam se comportar sob estado
-- customizado — a ADR não especifica isso. Mesmo padrão de
-- configurabilidade "sem tocar no que outro módulo já lê" de
-- roteiros_produtivos/recursos_produtivos (Fase 5a): a empresa configura
-- a apresentação, nunca a semântica usada por gate de outro módulo.
--
-- "Pausada" (uma das 9 referências do §41) fica de fora: pausa/retomada/
-- parada com motivo foi excluída do recorte original de T4 como "tracking
-- de tempo, não de quantidade" (20260915000000) e nenhuma fase desde a
-- ampliação de escopo criou o estado subjacente — não há o que rotular.
-- "Evitar excesso de status" (§41) já estava satisfeito antes desta fase:
-- os 3 campos (status/situacao/status_qualidade) somam 10 valores fixos
-- cobrindo os outros 8 dos 9 estados de referência, contra a alternativa
-- de um único enum monolítico.

create table public.producao_status_labels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  campo text not null check (campo in ('status', 'situacao', 'status_qualidade')),
  valor_interno text not null,
  rotulo text not null check (btrim(rotulo) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint producao_status_labels_valor_valido check (
    (campo = 'status' and valor_interno in ('planejada', 'em_producao', 'concluida', 'cancelada'))
    or (campo = 'situacao' and valor_interno in ('liberada', 'liberada_com_restricao', 'bloqueada'))
    or (campo = 'status_qualidade' and valor_interno in ('pendente', 'aprovado', 'bloqueado'))
  ),
  constraint producao_status_labels_unique unique (company_id, campo, valor_interno)
);
comment on table public.producao_status_labels is 'TÓPICO 4 §41 — rótulo customizável por empresa para os valores fixos de ordens_producao.status/situacao/status_qualidade. Não é uma lista de status configurável: valor_interno é sempre um dos 10 valores fixos que T8 (registrar_inspecao_qualidade) e T9 (adicionar_item_expedicao/criar_expedicao) já leem literalmente — só a apresentação (rotulo) muda. "Pausada" (§41) fica fora: não há estado subjacente (pausa/retomada de OP foi excluída do recorte em 20260915000000).';

create trigger set_updated_at before update on public.producao_status_labels
  for each row execute function public.set_updated_at();

alter table public.producao_status_labels enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- producao.view — mesmo padrão de ordens_producao_select (T4) e das
-- tabelas de configuração de T15: qualquer usuário que veja uma OP
-- precisa ler o rótulo, não só quem administra Produção.
create policy producao_status_labels_select on public.producao_status_labels for select
  using (company_id = (select public.current_company_id()));

grant select on public.producao_status_labels to authenticated;

-- =========================================================================
-- definir_rotulo_status_producao() — única forma de escrita, upsert por
-- (company_id, campo, valor_interno). assert_tenant_write() cobre as 3
-- guardas (company nulo, has_permission, empresa suspensa).
-- =========================================================================

create or replace function public.definir_rotulo_status_producao(
  p_campo text, p_valor_interno text, p_rotulo text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if btrim(coalesce(p_rotulo, '')) = '' then
    raise exception 'Rótulo não pode ser vazio.';
  end if;

  insert into public.producao_status_labels (company_id, campo, valor_interno, rotulo)
  values (v_company_id, p_campo, p_valor_interno, btrim(p_rotulo))
  on conflict (company_id, campo, valor_interno) do update
    set rotulo = excluded.rotulo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.rotulo_status_definido', 'producao_status_labels', v_id, p_rotulo,
    jsonb_build_object('campo', p_campo, 'valor_interno', p_valor_interno)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_rotulo_status_producao(text, text, text) to authenticated;

-- =========================================================================
-- rotulos_status_producao() — leitura: os 10 valores fixos com rótulo
-- padrão (mesmo texto já usado hoje em ProducaoSection.tsx/
-- QualidadeSection.tsx), sobreposto pelo que a empresa configurou. Sem
-- producao.view — mesmo padrão de ordens_producao_select.
-- =========================================================================

create or replace function public.rotulos_status_producao()
returns table (campo text, valor_interno text, rotulo text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  return query
  with padrao (campo, valor_interno, rotulo_padrao) as (
    values
      ('status', 'planejada', 'Planejada'),
      ('status', 'em_producao', 'Em produção'),
      ('status', 'concluida', 'Concluída'),
      ('status', 'cancelada', 'Cancelada'),
      ('situacao', 'liberada', 'Liberada'),
      ('situacao', 'liberada_com_restricao', 'Liberada com restrição'),
      ('situacao', 'bloqueada', 'Bloqueada'),
      ('status_qualidade', 'pendente', 'Pendente de inspeção'),
      ('status_qualidade', 'aprovado', 'Aprovado'),
      ('status_qualidade', 'bloqueado', 'Bloqueado (não conformidade)')
  )
  select p.campo, p.valor_interno, coalesce(l.rotulo, p.rotulo_padrao)
  from padrao p
  left join public.producao_status_labels l
    on l.company_id = v_company_id and l.campo = p.campo and l.valor_interno = p.valor_interno
  order by p.campo, p.valor_interno;
end;
$$;

grant execute on function public.rotulos_status_producao() to authenticated;
