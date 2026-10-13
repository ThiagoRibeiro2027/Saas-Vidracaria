-- Melhorias do responsável do produto (item 8, 12/10/2026): a unidade de
-- medida do item era texto livre (já existiam "UN", "m", "M" e "M2"
-- cadastrados de forma inconsistente na mesma empresa). Decisão do
-- responsável: a empresa escolhe, em Configurações Gerais, quais unidades
-- ela usa; o cadastro de item passa a oferecer só essas opções num dropdown.
-- Itens já cadastrados com texto livre inconsistente NÃO são tocados/
-- normalizados por esta migration (decisão explícita) — convivem com o
-- catálogo novo até alguém editar o item e escolher uma unidade da lista.
--
-- Mesmo padrão das outras 4 tabelas de TÓPICO 15 (numbering_sequences,
-- cutting_margin_settings, measurement_rules, approval_thresholds): leitura
-- liberada a qualquer autenticado da empresa (módulos operacionais, aqui o
-- cadastro de item, precisam ler sem exigir configuracoes.view — a tela de
-- administração é que exige a permissão), escrita só via função
-- SECURITY DEFINER com has_permission('configuracoes','manage').
--
-- `itens.unidade_principal` continua `text` livre, sem FK pra esta tabela —
-- constranger por FK quebraria todo item já cadastrado com valor fora do
-- catálogo (ou exigiria normalizar os dados existentes, que é exatamente o
-- que o responsável decidiu NÃO fazer agora). A validação de "só units do
-- catálogo" fica só na UI (dropdown), não no banco.

create table public.company_measurement_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  unidade text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_measurement_units_unique unique (company_id, unidade)
);
comment on table public.company_measurement_units is 'Melhorias 12/10/2026, item 8 — unidades de medida que a empresa escolheu usar. Sem FK de itens.unidade_principal de propósito (ver cabeçalho da migration).';

create trigger set_updated_at before update on public.company_measurement_units
  for each row execute function public.set_updated_at();

alter table public.company_measurement_units enable row level security;

create policy company_measurement_units_select on public.company_measurement_units for select
  using (company_id = (select public.current_company_id()));

grant select on public.company_measurement_units to authenticated;

create or replace function public.upsert_company_measurement_unit(
  p_unidade text, p_descricao text default null, p_ativo boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.company_measurement_units;
  v_unidade text := btrim(coalesce(p_unidade, ''));
  v_id uuid;
begin
  if v_unidade = '' then
    raise exception 'Unidade é obrigatória.';
  end if;

  select * into v_before from public.company_measurement_units
  where company_id = v_company_id and unidade = v_unidade
  for update;

  insert into public.company_measurement_units (company_id, unidade, descricao, ativo)
  values (v_company_id, v_unidade, nullif(btrim(coalesce(p_descricao, '')), ''), p_ativo)
  on conflict (company_id, unidade) do update
  set descricao = excluded.descricao, ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.unidade_medida_upserted', 'company_measurement_unit', v_id,
    v_unidade,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('descricao', p_descricao, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

-- Regra 7 do CLAUDE.md / achado 4 da auditoria: função nova não nasce com
-- EXECUTE pra ninguém — grant explícito, revisado por quem cria.
grant execute on function public.upsert_company_measurement_unit(text, text, boolean) to authenticated;

-- Catálogo padrão razoável — toda empresa já existente ganha agora (backfill
-- abaixo) e toda empresa NOVA ganha a partir de agora (trigger), pra não
-- nascer com a tela de Configurações e o dropdown de unidade do item vazios
-- até alguém popular manualmente. O responsável de cada empresa pode
-- desativar o que não usa ou adicionar outras depois.
create or replace function public.seed_default_measurement_units()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_measurement_units (company_id, unidade, descricao)
  values
    (new.id, 'UN', 'Unidade'),
    (new.id, 'M', 'Metro'),
    (new.id, 'M2', 'Metro quadrado'),
    (new.id, 'KG', 'Quilograma'),
    (new.id, 'L', 'Litro'),
    (new.id, 'PC', 'Peça')
  on conflict (company_id, unidade) do nothing;
  return new;
end;
$$;

create trigger seed_default_measurement_units after insert on public.companies
  for each row execute function public.seed_default_measurement_units();

-- Backfill pras empresas que já existiam antes desta migration.
insert into public.company_measurement_units (company_id, unidade, descricao)
select c.id, u.unidade, u.descricao
from public.companies c
cross join (values
  ('UN', 'Unidade'),
  ('M', 'Metro'),
  ('M2', 'Metro quadrado'),
  ('KG', 'Quilograma'),
  ('L', 'Litro'),
  ('PC', 'Peça')
) as u(unidade, descricao)
on conflict (company_id, unidade) do nothing;
