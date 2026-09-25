-- Configurador (características de peça) — Fase F do plano de evolução
-- da BOM leve (aprovado em 23/09/2026), dentro do que o ADR-002 §4.5 já
-- autoriza ("características técnicas" está explícito na lista) — não
-- precisa de emenda ao ADR.
--
-- Duas coisas distintas, por isso duas tabelas e duas permissões
-- diferentes:
--   1. Definir QUAIS características uma peça tem (ex.: "largura",
--      "vidro", "acabamento") — configuração da peça, gate pecas.manage
--      (mesma permissão de toda a BOM, Fase A/E).
--   2. Informar o VALOR de cada característica para um pedido_item
--      específico (ex.: largura=1800 para esta janela deste pedido) —
--      isso é Engenharia transformando pedido em informação executável
--      (ADR-002 §4.5, "medidas... características técnicas"), gate
--      engenharia.manage, igual a registrar_medicao()/criar_item_
--      producao() já usam.
--
-- O motor de regras (Fase G, exige emenda ao ADR-002 §4.5) vai consumir
-- os valores capturados aqui pra sugerir a composição — esta fase só
-- cria o cadastro e a captura, sem nenhuma regra condicionando nada
-- ainda.

create table public.peca_caracteristicas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  peca_id uuid not null references public.pecas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('numero', 'texto', 'opcao')),
  unidade text,
  opcoes text[],
  obrigatoria boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint peca_caracteristicas_unique unique (peca_id, nome),
  constraint peca_caracteristicas_opcoes_check check (
    (tipo = 'opcao' and opcoes is not null and array_length(opcoes, 1) > 0)
    or (tipo <> 'opcao' and opcoes is null)
  )
);
comment on table public.peca_caracteristicas is 'Fase F — características configuráveis de uma peça (largura, vidro, acabamento...) que alimentam o configurador. tipo=opcao exige a lista de valores permitidos em `opcoes`.';
create index peca_caracteristicas_company_id_idx on public.peca_caracteristicas (company_id);
create index peca_caracteristicas_peca_id_idx on public.peca_caracteristicas (peca_id);

create table public.pedido_item_caracteristicas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_item_id uuid not null references public.pedido_itens(id) on delete cascade,
  peca_caracteristica_id uuid not null references public.peca_caracteristicas(id),
  valor_numero numeric(14, 4),
  valor_texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_item_caracteristicas_unique unique (pedido_item_id, peca_caracteristica_id),
  constraint pedido_item_caracteristicas_valor_check check (
    (valor_numero is not null and valor_texto is null) or (valor_numero is null and valor_texto is not null)
  )
);
comment on table public.pedido_item_caracteristicas is 'Fase F — valor de cada característica configurada, para um pedido_item específico (ex.: largura=1800 desta janela deste pedido). Só um de valor_numero/valor_texto é preenchido, conforme peca_caracteristicas.tipo.';
create index pedido_item_caracteristicas_company_id_idx on public.pedido_item_caracteristicas (company_id);
create index pedido_item_caracteristicas_pedido_item_id_idx on public.pedido_item_caracteristicas (pedido_item_id);

alter table public.peca_caracteristicas enable row level security;
create policy peca_caracteristicas_select on public.peca_caracteristicas for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_caracteristicas to authenticated;

alter table public.pedido_item_caracteristicas enable row level security;
create policy pedido_item_caracteristicas_select on public.pedido_item_caracteristicas for select
  using (company_id = (select public.current_company_id()));
grant select on public.pedido_item_caracteristicas to authenticated;

create trigger set_updated_at before update on public.peca_caracteristicas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pedido_item_caracteristicas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- definir_caracteristica_peca() / atualizar_caracteristica_peca() /
-- remover_caracteristica_peca() — cadastro da característica na peça.
-- =========================================================================

create or replace function public.definir_caracteristica_peca(
  p_peca_id uuid, p_nome text, p_tipo text, p_unidade text default null,
  p_opcoes text[] default null, p_obrigatoria boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome da característica não pode ser vazio.';
  end if;
  if p_tipo not in ('numero', 'texto', 'opcao') then
    raise exception 'Tipo de característica inválido: "%" (aceito: numero, texto, opcao).', p_tipo;
  end if;
  if p_tipo = 'opcao' and (p_opcoes is null or array_length(p_opcoes, 1) is null) then
    raise exception 'Característica do tipo "opcao" exige a lista de valores permitidos.';
  end if;
  if p_tipo <> 'opcao' and p_opcoes is not null then
    raise exception 'Só característica do tipo "opcao" pode ter lista de valores permitidos.';
  end if;
  if exists (select 1 from public.peca_caracteristicas where peca_id = p_peca_id and nome = btrim(p_nome)) then
    raise exception 'Esta peça já tem uma característica chamada "%" — use atualizar_caracteristica_peca() para alterar.', p_nome;
  end if;

  insert into public.peca_caracteristicas (company_id, peca_id, nome, tipo, unidade, opcoes, obrigatoria)
  values (v_company_id, p_peca_id, btrim(p_nome), p_tipo, p_unidade, p_opcoes, p_obrigatoria)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.caracteristica_definida', 'peca_caracteristica', v_id, p_nome,
    jsonb_build_object('peca_id', p_peca_id, 'tipo', p_tipo)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_caracteristica_peca(uuid, text, text, text, text[], boolean) to authenticated;

create or replace function public.atualizar_caracteristica_peca(
  p_id uuid, p_unidade text default null, p_opcoes text[] default null, p_obrigatoria boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_caract public.peca_caracteristicas;
begin
  select * into v_caract from public.peca_caracteristicas where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if v_caract.tipo = 'opcao' and (p_opcoes is null or array_length(p_opcoes, 1) is null) then
    raise exception 'Característica do tipo "opcao" exige a lista de valores permitidos.';
  end if;
  if v_caract.tipo <> 'opcao' and p_opcoes is not null then
    raise exception 'Só característica do tipo "opcao" pode ter lista de valores permitidos.';
  end if;

  update public.peca_caracteristicas
  set unidade = p_unidade, opcoes = p_opcoes, obrigatoria = p_obrigatoria
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.caracteristica_atualizada', 'peca_caracteristica', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.atualizar_caracteristica_peca(uuid, text, text[], boolean) to authenticated;

create or replace function public.remover_caracteristica_peca(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  if not exists (select 1 from public.peca_caracteristicas where id = p_id and company_id = v_company_id) then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if exists (select 1 from public.pedido_item_caracteristicas where peca_caracteristica_id = p_id) then
    raise exception 'Não é possível remover: já existe valor informado para esta característica em algum pedido.';
  end if;

  delete from public.peca_caracteristicas where id = p_id and company_id = v_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.caracteristica_removida', 'peca_caracteristica', p_id, null);
end;
$$;

grant execute on function public.remover_caracteristica_peca(uuid) to authenticated;

create or replace function public.listar_caracteristicas_peca(p_peca_id uuid)
returns table (id uuid, nome text, tipo text, unidade text, opcoes text[], obrigatoria boolean)
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
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.opcoes, pc.obrigatoria
  from public.peca_caracteristicas pc
  where pc.peca_id = p_peca_id and pc.company_id = v_company_id
  order by pc.nome;
end;
$$;

grant execute on function public.listar_caracteristicas_peca(uuid) to authenticated;

-- =========================================================================
-- definir_valor_caracteristica_pedido_item() — Engenharia informa o valor
-- de uma característica pra um pedido_item específico. Só aceita
-- característica que pertence à peça deste pedido_item (não dá pra
-- informar "largura" de uma peça diferente da que o item realmente é).
-- =========================================================================

create or replace function public.definir_valor_caracteristica_pedido_item(
  p_pedido_item_id uuid, p_peca_caracteristica_id uuid,
  p_valor_numero numeric default null, p_valor_texto text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_pedido_item public.pedido_itens;
  v_caract public.peca_caracteristicas;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_peca_caracteristica_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if not exists (select 1 from public.pecas where id = v_caract.peca_id and item_id = v_pedido_item.item_id) then
    raise exception 'Esta característica não pertence à peça deste item de pedido.';
  end if;

  if v_caract.tipo = 'numero' then
    if p_valor_numero is null or p_valor_texto is not null then
      raise exception 'Característica "%" é numérica — informe só valor_numero.', v_caract.nome;
    end if;
  else
    if p_valor_texto is null or p_valor_numero is not null then
      raise exception 'Característica "%" é de texto/opção — informe só valor_texto.', v_caract.nome;
    end if;
    if v_caract.tipo = 'opcao' and not (p_valor_texto = any(v_caract.opcoes)) then
      raise exception 'Valor "%" não é uma opção permitida para "%" (permitidas: %).', p_valor_texto, v_caract.nome, array_to_string(v_caract.opcoes, ', ');
    end if;
  end if;

  insert into public.pedido_item_caracteristicas (company_id, pedido_item_id, peca_caracteristica_id, valor_numero, valor_texto)
  values (v_company_id, p_pedido_item_id, p_peca_caracteristica_id, p_valor_numero, p_valor_texto)
  on conflict (pedido_item_id, peca_caracteristica_id)
  do update set valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.caracteristica_valor_definido', 'pedido_item_caracteristica', v_id, v_caract.nome,
    jsonb_build_object('pedido_item_id', p_pedido_item_id, 'valor_numero', p_valor_numero, 'valor_texto', p_valor_texto)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_valor_caracteristica_pedido_item(uuid, uuid, numeric, text) to authenticated;

create or replace function public.listar_valores_caracteristicas_pedido_item(p_pedido_item_id uuid)
returns table (
  peca_caracteristica_id uuid, nome text, tipo text, unidade text, obrigatoria boolean,
  valor_numero numeric, valor_texto text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('engenharia', 'view') then
    raise exception 'Sem permissão para consultar engenharia (engenharia.view).';
  end if;

  select pi.item_id into v_item_id from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.obrigatoria, pic.valor_numero, pic.valor_texto
  from public.pecas p
  join public.peca_caracteristicas pc on pc.peca_id = p.id
  left join public.pedido_item_caracteristicas pic
    on pic.peca_caracteristica_id = pc.id and pic.pedido_item_id = p_pedido_item_id
  where p.item_id = v_item_id and p.company_id = v_company_id
  order by pc.nome;
end;
$$;

grant execute on function public.listar_valores_caracteristicas_pedido_item(uuid) to authenticated;
