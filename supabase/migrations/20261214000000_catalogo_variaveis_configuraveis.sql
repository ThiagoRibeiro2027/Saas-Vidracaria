-- Catálogo de variáveis configuráveis — pedido do usuário, 2026-10-04.
--
-- Hoje cada peça (Pré-engenharia) cadastra suas próprias "Características
-- (configurador)" do zero (ver peca_caracteristicas, 20261016000000). Isso
-- obriga redigitar a mesma variável (ex.: "Cor do perfil: Branco/Preto
-- fosco") em toda peça que a usa. Este catálogo deixa a empresa cadastrar
-- a variável uma vez (agrupada por categoria, ex.: "Perfil", "Vidro") e
-- cada peça só marcar quais categorias usa e quais variáveis dessas
-- categorias se aplicam — sem reescrever nome/tipo/opções.
--
-- Decisão confirmada com o usuário: editar uma variável do catálogo (ex.:
-- acrescentar uma opção) atualiza automaticamente toda peça que já a usa —
-- por isso peca_caracteristicas ganha só uma FK opcional (template_id) e
-- atualizar_variavel_template() propaga unidade/opções pra quem usa,
-- em vez de cada peça guardar uma cópia que poderia divergir.
--
-- Peça↔categoria é N:N (peca_categorias), não uma categoria por peça: uma
-- peça como "Box de vidro" usa material de vidro E de perfil na
-- composição, então precisa poder marcar as duas categorias.
--
-- Nenhuma função existente (cálculo de preço ADR-012, configurador do
-- orçamento) é alterada — elas continuam lendo peca_caracteristicas do
-- jeito que já liam. Só listar_caracteristicas_peca() ganha uma coluna
-- nova (template_id), pra tela saber que a característica vem do
-- catálogo e travar a edição de unidade/opções ali (editar isso agora é
-- só em Configurações → Variáveis do configurador).

create table public.variavel_categorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  created_at timestamptz not null default now(),
  constraint variavel_categorias_unique unique (company_id, nome)
);
comment on table public.variavel_categorias is 'Catálogo de variáveis configuráveis — agrupamento (ex.: "Perfil", "Vidro") usado só pra organizar o catálogo na tela; uma peça pode usar mais de uma categoria.';
create index variavel_categorias_company_id_idx on public.variavel_categorias (company_id);

create table public.variavel_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  categoria_id uuid not null references public.variavel_categorias(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('numero', 'texto', 'opcao')),
  unidade text,
  opcoes text[],
  obrigatoria_padrao boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variavel_templates_unique unique (company_id, categoria_id, nome),
  constraint variavel_templates_opcoes_check check (
    (tipo = 'opcao' and opcoes is not null and array_length(opcoes, 1) > 0)
    or (tipo <> 'opcao' and opcoes is null)
  )
);
comment on table public.variavel_templates is 'Catálogo de variáveis configuráveis — a definição reutilizável (nome/tipo/opções) que uma peça anexa via anexar_variavel_peca(). Editar aqui (atualizar_variavel_template) propaga pra toda peça que já anexou.';
create index variavel_templates_company_id_idx on public.variavel_templates (company_id);
create index variavel_templates_categoria_id_idx on public.variavel_templates (categoria_id);

create table public.peca_categorias (
  peca_id uuid not null references public.pecas(id) on delete cascade,
  categoria_id uuid not null references public.variavel_categorias(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  created_at timestamptz not null default now(),
  primary key (peca_id, categoria_id)
);
comment on table public.peca_categorias is 'N:N — quais categorias do catálogo de variáveis uma peça usa (ex.: uma peça de box usa "Vidro" e "Perfil" ao mesmo tempo). Define o que aparece pra anexar na peça.';
create index peca_categorias_company_id_idx on public.peca_categorias (company_id);

alter table public.peca_caracteristicas
  add column template_id uuid references public.variavel_templates(id);
comment on column public.peca_caracteristicas.template_id is 'Quando preenchido, esta característica veio do catálogo (anexar_variavel_peca) — nome/tipo/unidade/opções são copiados do template e opções/unidade são atualizados junto quando o template muda. Nulo = característica avulsa desta peça, como já era antes.';

create trigger set_updated_at before update on public.variavel_templates
  for each row execute function public.set_updated_at();

alter table public.variavel_categorias enable row level security;
alter table public.variavel_templates enable row level security;
alter table public.peca_categorias enable row level security;

-- Leitura liberada a qualquer autenticado da empresa — mesmo padrão de
-- cutting_margin_settings (20260913150000): a TELA de administração do
-- catálogo exige configuracoes.manage, mas quem só vê peças (pecas.view)
-- precisa listar o catálogo pra anexar variável numa peça. Escrita só via
-- função SECURITY DEFINER.
create policy variavel_categorias_select on public.variavel_categorias for select
  using (company_id = (select public.current_company_id()));
grant select on public.variavel_categorias to authenticated;

create policy variavel_templates_select on public.variavel_templates for select
  using (company_id = (select public.current_company_id()));
grant select on public.variavel_templates to authenticated;

create policy peca_categorias_select on public.peca_categorias for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_categorias to authenticated;

-- =========================================================================
-- Administração do catálogo (Configurações → Variáveis do configurador).
-- =========================================================================

create or replace function public.criar_variavel_categoria(p_nome text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_id uuid;
begin
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome da categoria não pode ser vazio.';
  end if;
  if exists (select 1 from public.variavel_categorias where company_id = v_company_id and nome = btrim(p_nome)) then
    raise exception 'Já existe uma categoria chamada "%".', p_nome;
  end if;

  insert into public.variavel_categorias (company_id, nome)
  values (v_company_id, btrim(p_nome))
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'config.variavel_categoria_criada', 'variavel_categoria', v_id, p_nome);

  return v_id;
end;
$$;

grant execute on function public.criar_variavel_categoria(text) to authenticated;

create or replace function public.criar_variavel_template(
  p_categoria_id uuid, p_nome text, p_tipo text, p_unidade text default null,
  p_opcoes text[] default null, p_obrigatoria_padrao boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.variavel_categorias where id = p_categoria_id and company_id = v_company_id) then
    raise exception 'Categoria não encontrada nesta empresa.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome da variável não pode ser vazio.';
  end if;
  if p_tipo not in ('numero', 'texto', 'opcao') then
    raise exception 'Tipo de variável inválido: "%" (aceito: numero, texto, opcao).', p_tipo;
  end if;
  if p_tipo = 'opcao' and (p_opcoes is null or array_length(p_opcoes, 1) is null) then
    raise exception 'Variável do tipo "opcao" exige a lista de valores permitidos.';
  end if;
  if p_tipo <> 'opcao' and p_opcoes is not null then
    raise exception 'Só variável do tipo "opcao" pode ter lista de valores permitidos.';
  end if;
  if exists (
    select 1 from public.variavel_templates
    where company_id = v_company_id and categoria_id = p_categoria_id and nome = btrim(p_nome)
  ) then
    raise exception 'Esta categoria já tem uma variável chamada "%".', p_nome;
  end if;

  insert into public.variavel_templates (company_id, categoria_id, nome, tipo, unidade, opcoes, obrigatoria_padrao)
  values (v_company_id, p_categoria_id, btrim(p_nome), p_tipo, p_unidade, p_opcoes, p_obrigatoria_padrao)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.variavel_template_criada', 'variavel_template', v_id, p_nome,
    jsonb_build_object('categoria_id', p_categoria_id, 'tipo', p_tipo)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_variavel_template(uuid, text, text, text, text[], boolean) to authenticated;

-- Nome e tipo ficam imutáveis (mesma regra de atualizar_caracteristica_peca,
-- mesmo motivo: valor já pode estar gravado em orçamento/pedido sob aquele
-- tipo). "Editar atualiza em todas": depois de salvar o template, propaga
-- unidade/opções pra toda peça que já anexou — fonte única, sem cópias
-- divergentes.
create or replace function public.atualizar_variavel_template(
  p_id uuid, p_unidade text default null, p_opcoes text[] default null,
  p_obrigatoria_padrao boolean default true, p_ativo boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_template public.variavel_templates;
begin
  select * into v_template from public.variavel_templates where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Variável do catálogo não encontrada nesta empresa.';
  end if;
  if v_template.tipo = 'opcao' and (p_opcoes is null or array_length(p_opcoes, 1) is null) then
    raise exception 'Variável do tipo "opcao" exige a lista de valores permitidos.';
  end if;
  if v_template.tipo <> 'opcao' and p_opcoes is not null then
    raise exception 'Só variável do tipo "opcao" pode ter lista de valores permitidos.';
  end if;

  update public.variavel_templates
  set unidade = p_unidade, opcoes = p_opcoes, obrigatoria_padrao = p_obrigatoria_padrao, ativo = p_ativo
  where id = p_id;

  update public.peca_caracteristicas
  set unidade = p_unidade, opcoes = p_opcoes
  where template_id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'config.variavel_template_atualizada', 'variavel_template', p_id, v_template.nome);

  return p_id;
end;
$$;

grant execute on function public.atualizar_variavel_template(uuid, text, text[], boolean, boolean) to authenticated;

-- =========================================================================
-- Uso do catálogo numa peça (Pré-engenharia).
-- =========================================================================

-- Substitui o conjunto de categorias da peça por completo (editor de tags:
-- a tela manda a lista inteira marcada, não um add/remove individual).
create or replace function public.definir_categorias_peca(p_peca_id uuid, p_categoria_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_categoria_ids, array[]::uuid[])) cid
    where not exists (select 1 from public.variavel_categorias where id = cid and company_id = v_company_id)
  ) then
    raise exception 'Categoria inválida para esta empresa.';
  end if;

  delete from public.peca_categorias
  where peca_id = p_peca_id and company_id = v_company_id
    and categoria_id <> all (coalesce(p_categoria_ids, array[]::uuid[]));

  insert into public.peca_categorias (peca_id, categoria_id, company_id)
  select p_peca_id, cid, v_company_id
  from unnest(coalesce(p_categoria_ids, array[]::uuid[])) cid
  on conflict (peca_id, categoria_id) do nothing;
end;
$$;

grant execute on function public.definir_categorias_peca(uuid, uuid[]) to authenticated;

-- Copia nome/tipo/unidade/opções do template pra uma peca_caracteristicas
-- nova, com template_id preenchido. Reaproveita a constraint
-- peca_caracteristicas_unique(peca_id, nome) pra impedir anexar duas vezes
-- (mesmo erro amigável de definir_caracteristica_peca).
create or replace function public.anexar_variavel_peca(
  p_peca_id uuid, p_template_id uuid, p_obrigatoria boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_template public.variavel_templates;
  v_id uuid;
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  select * into v_template from public.variavel_templates where id = p_template_id and company_id = v_company_id;
  if not found then
    raise exception 'Variável do catálogo não encontrada nesta empresa.';
  end if;
  if not v_template.ativo then
    raise exception 'Esta variável do catálogo está inativa.';
  end if;
  if exists (select 1 from public.peca_caracteristicas where peca_id = p_peca_id and nome = v_template.nome) then
    raise exception 'Esta peça já tem uma característica chamada "%".', v_template.nome;
  end if;

  insert into public.peca_caracteristicas (company_id, peca_id, nome, tipo, unidade, opcoes, obrigatoria, template_id)
  values (
    v_company_id, p_peca_id, v_template.nome, v_template.tipo, v_template.unidade, v_template.opcoes,
    p_obrigatoria, v_template.id
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.variavel_catalogo_anexada', 'peca_caracteristica', v_id, v_template.nome,
    jsonb_build_object('peca_id', p_peca_id, 'template_id', p_template_id)
  );

  return v_id;
end;
$$;

grant execute on function public.anexar_variavel_peca(uuid, uuid, boolean) to authenticated;

-- =========================================================================
-- listar_caracteristicas_peca() ganha template_id na saída (mudança de
-- formato de retorno — precisa do drop antes do create or replace, mesmo
-- padrão já usado em 20261104010000 pra acrescentar papel_dimensional).
-- =========================================================================

drop function if exists public.listar_caracteristicas_peca(uuid);
create or replace function public.listar_caracteristicas_peca(p_peca_id uuid)
returns table (
  id uuid, nome text, tipo text, unidade text, opcoes text[], obrigatoria boolean,
  papel_dimensional text, template_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pecas', 'view') then
    raise exception 'Sem permissão para consultar peças (pecas.view).';
  end if;
  if not exists (select 1 from public.pecas p where p.id = p_peca_id and p.company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.opcoes, pc.obrigatoria, pc.papel_dimensional, pc.template_id
  from public.peca_caracteristicas pc
  where pc.peca_id = p_peca_id and pc.company_id = v_company_id
  order by pc.nome;
end;
$$;

grant execute on function public.listar_caracteristicas_peca(uuid) to authenticated;
