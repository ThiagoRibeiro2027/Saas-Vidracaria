-- TÓPICO 2 — Cadastros, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, outubro: "entrada do pedido"). Três fatos do spec mudam a
-- leitura literal do resumo do plano de entrega ("cliente, obra,
-- fornecedor, produto/item, material"):
--
--   1. Cliente/Fornecedor não são tabelas separadas — TÓPICO 2 §4-6 define
--      uma entidade única Pessoa com Papéis. "Pessoa = entidade. Papel =
--      relacionamento." Não duplicar Pessoa quando documento já existe.
--   2. Produto/Item e Material são a mesma entidade (§7-10): um Item com
--      campo `tipo` — "essas classificações não devem gerar cadastros
--      mestres separados."
--   3. "Obra" não está no TÓPICO 2 — pertence ao TÓPICO 16 (Instalação,
--      ADR-002 §4.9), que só entra em dezembro. Registro mínimo aqui é só
--      para T3 Pedidos referenciar uma obra; agendamento/equipe/agenda
--      ficam para o T16 real.
--
-- Fora de escopo: migrar cutting_margin_settings.material_tipo e
-- measurement_rules.tipo_item (T15, hoje texto livre) para referenciar
-- itens de verdade — fica para quando o catálogo real for populado.

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tipo_documento text check (tipo_documento in ('CPF', 'CNPJ')),
  documento text,
  nome text not null,
  nome_fantasia text,
  telefone text,
  email text,
  logradouro text,
  cidade text,
  uf text,
  cep text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo', 'bloqueado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pessoas is 'TÓPICO 2 §4 — entidade única; Cliente/Fornecedor são papéis (pessoa_papeis), não tabelas separadas.';
create unique index pessoas_company_documento_unique on public.pessoas (company_id, documento) where documento is not null;
-- ADR-009 §3.1: índice sem NULL-block algum na coluna de isolamento —
-- o unique acima é parcial (só cobre documento not null) e não atende
-- pessoas sem documento; a policy de SELECT filtra só por company_id.
create index pessoas_company_id_idx on public.pessoas (company_id);

create table public.pessoa_papeis (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  papel text not null check (papel in ('CLIENTE', 'FORNECEDOR')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pessoa_papeis_unique unique (pessoa_id, papel)
);
comment on table public.pessoa_papeis is 'TÓPICO 2 §5 — sem campos específicos de papel (código do cliente, condição de pagamento...): isso é enriquecimento comercial (T10/T11), fora do recorte de M1.';

create table public.obras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pessoa_id uuid not null references public.pessoas(id),
  nome text not null,
  logradouro text,
  cidade text,
  uf text,
  cep text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.obras is 'Registro mínimo — ADR-002 §4.9 (agendamento/equipe/agenda) é TÓPICO 16, dezembro. pessoa_id precisa ter papel CLIENTE ativo (checado em upsert_obra).';
-- ADR-009 §3.1: nenhuma tabela multi-tenant nova pode ficar sem índice na
-- coluna de isolamento; obras não tem nenhuma unique constraint que a cubra.
create index obras_company_id_idx on public.obras (company_id);
create index obras_pessoa_id_idx on public.obras (pessoa_id);

create table public.itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  codigo text not null,
  descricao text not null,
  tipo text not null check (tipo in (
    'materia_prima', 'insumo', 'componente', 'produto_intermediario',
    'produto_acabado', 'material_auxiliar', 'embalagem', 'servico', 'outro'
  )),
  classificacao text,
  unidade_principal text not null,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itens_company_codigo_unique unique (company_id, codigo)
);
comment on table public.itens is 'TÓPICO 2 §7-10 — Produto/Item e Material são a mesma entidade, diferenciados por `tipo`. `classificacao` é texto livre (ex.: vidro_temperado); hierarquia completa Grupo/Família/Subfamília/Categoria fica fora do M1.';

create trigger set_updated_at before update on public.pessoas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pessoa_papeis
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.obras
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.itens
  for each row execute function public.set_updated_at();

alter table public.pessoas enable row level security;
alter table public.pessoa_papeis enable row level security;
alter table public.obras enable row level security;
alter table public.itens enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir *.view —
-- mesma decisão de T15/Configurações: módulos operacionais futuros (T3,
-- T10...) vão precisar ler pessoas/obras/itens, não só quem administra
-- Cadastros. *.view/*.manage gate a TELA, não a leitura da RLS.
create policy pessoas_select on public.pessoas for select
  using (company_id = (select public.current_company_id()));
create policy obras_select on public.obras for select
  using (company_id = (select public.current_company_id()));
create policy itens_select on public.itens for select
  using (company_id = (select public.current_company_id()));
-- pessoa_papeis não tem company_id próprio — isolamento via join com
-- pessoas, igual ao padrão já usado para tabelas de junção no schema.
create policy pessoa_papeis_select on public.pessoa_papeis for select
  using (exists (
    select 1 from public.pessoas p
    where p.id = pessoa_papeis.pessoa_id
      and p.company_id = (select public.current_company_id())
  ));

grant select on public.pessoas to authenticated;
grant select on public.pessoa_papeis to authenticated;
grant select on public.obras to authenticated;
grant select on public.itens to authenticated;

-- =========================================================================
-- upsert_pessoa() — dedup por documento é a UNIQUE parcial acima (TÓPICO 2
-- §6: "não criar automaticamente uma segunda Pessoa quando houver forte
-- indicação de duplicidade" — dedupe por nome/telefone/e-mail exigiria
-- fuzzy matching, fora do M1; documento é a garantia forte).
-- =========================================================================

create or replace function public.upsert_pessoa(
  p_id uuid,
  p_tipo_documento text,
  p_documento text,
  p_nome text,
  p_nome_fantasia text,
  p_telefone text,
  p_email text,
  p_logradouro text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pessoas;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo', 'bloqueado') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;

  -- Normaliza pra só dígitos antes de comparar/gravar — sem isso,
  -- "11.222.333/0001-81" e "11222333000181" não colidem no UNIQUE parcial
  -- (pessoas_company_documento_unique), e a mesma pessoa jurídica pode ser
  -- cadastrada duas vezes só por formatação diferente.
  if p_documento is not null then
    p_documento := nullif(regexp_replace(p_documento, '\D', '', 'g'), '');
  end if;

  if p_id is not null then
    select * into v_before from public.pessoas
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Pessoa não encontrada nesta empresa.';
    end if;

    update public.pessoas set
      tipo_documento = p_tipo_documento, documento = p_documento, nome = p_nome,
      nome_fantasia = p_nome_fantasia, telefone = p_telefone, email = p_email,
      logradouro = p_logradouro, cidade = p_cidade, uf = p_uf, cep = p_cep,
      situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.pessoas (
      company_id, tipo_documento, documento, nome, nome_fantasia, telefone,
      email, logradouro, cidade, uf, cep, situacao
    ) values (
      v_company_id, p_tipo_documento, p_documento, p_nome, p_nome_fantasia, p_telefone,
      p_email, p_logradouro, p_cidade, p_uf, p_cep, p_situacao
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.pessoa_upserted', 'pessoa', v_id, p_nome,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'nome', p_nome, 'documento', p_documento, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_pessoa(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.set_pessoa_papel(
  p_pessoa_id uuid,
  p_papel text,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  if p_papel not in ('CLIENTE', 'FORNECEDOR') then
    raise exception 'Papel inválido: "%".', p_papel;
  end if;
  if not exists (select 1 from public.pessoas where id = p_pessoa_id and company_id = v_company_id) then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;

  insert into public.pessoa_papeis (pessoa_id, papel, ativo)
  values (p_pessoa_id, p_papel, p_ativo)
  on conflict (pessoa_id, papel) do update
  set ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.pessoa_papel_set', 'pessoa', p_pessoa_id, p_papel,
    jsonb_build_object('papel', p_papel, 'ativo', p_ativo)
  );

  return v_id;
end;
$$;

grant execute on function public.set_pessoa_papel(uuid, text, boolean) to authenticated;

-- =========================================================================
-- upsert_obra() — pessoa_id precisa ter papel CLIENTE ativo.
-- =========================================================================

create or replace function public.upsert_obra(
  p_id uuid,
  p_pessoa_id uuid,
  p_nome text,
  p_logradouro text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.obras;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('obras', 'manage') then
    raise exception 'Sem permissão para gerenciar obras (obras.manage).';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da obra é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'CLIENTE' and pp.ativo
  ) then
    raise exception 'A pessoa vinculada à obra precisa ter o papel CLIENTE ativo.';
  end if;

  if p_id is not null then
    select * into v_before from public.obras
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Obra não encontrada nesta empresa.';
    end if;

    update public.obras set
      pessoa_id = p_pessoa_id, nome = p_nome, logradouro = p_logradouro,
      cidade = p_cidade, uf = p_uf, cep = p_cep, situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.obras (company_id, pessoa_id, nome, logradouro, cidade, uf, cep, situacao)
    values (v_company_id, p_pessoa_id, p_nome, p_logradouro, p_cidade, p_uf, p_cep, p_situacao)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.obra_upserted', 'obra', v_id, p_nome,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'nome', p_nome, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_obra(uuid, uuid, text, text, text, text, text, text) to authenticated;

-- =========================================================================
-- upsert_item() — TÓPICO 2 §7: Produto/Item e Material são a mesma
-- entidade, diferenciados por `tipo`.
-- =========================================================================

create or replace function public.upsert_item(
  p_id uuid,
  p_codigo text,
  p_descricao text,
  p_tipo text,
  p_classificacao text,
  p_unidade_principal text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('itens', 'manage') then
    raise exception 'Sem permissão para gerenciar itens (itens.manage).';
  end if;
  if p_codigo is null or btrim(p_codigo) = '' or p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Código e descrição são obrigatórios.';
  end if;
  if p_unidade_principal is null or btrim(p_unidade_principal) = '' then
    raise exception 'Unidade principal é obrigatória.';
  end if;
  if p_tipo not in (
    'materia_prima', 'insumo', 'componente', 'produto_intermediario',
    'produto_acabado', 'material_auxiliar', 'embalagem', 'servico', 'outro'
  ) then
    raise exception 'Tipo inválido: "%".', p_tipo;
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;

  if p_id is not null then
    select * into v_before from public.itens
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Item não encontrado nesta empresa.';
    end if;

    update public.itens set
      codigo = p_codigo, descricao = p_descricao, tipo = p_tipo,
      classificacao = p_classificacao, unidade_principal = p_unidade_principal,
      situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.itens (company_id, codigo, descricao, tipo, classificacao, unidade_principal, situacao)
    values (v_company_id, p_codigo, p_descricao, p_tipo, p_classificacao, p_unidade_principal, p_situacao)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.item_upserted', 'item', v_id, p_codigo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'codigo', p_codigo, 'tipo', p_tipo, 'classificacao', p_classificacao, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_item(uuid, text, text, text, text, text, text) to authenticated;
