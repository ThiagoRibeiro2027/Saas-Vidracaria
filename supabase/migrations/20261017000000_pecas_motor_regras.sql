-- Motor de regras básico — Fase G do plano de evolução da BOM leve,
-- liberada pela emenda ao ADR-002 §4.5 v2.8 (aprovação explícita do
-- responsável do produto — CLAUDE.md "não implementar regra de negócio
-- fora do que está definido em ADR").
--
-- Regra = 1 condição (uma característica já configurada na peça, Fase
-- F + um operador + um valor de comparação) → 1 ação sobre a
-- composição (ajustar quantidade de um material, adicionar material,
-- remover material). Regra é imutável uma vez criada — "editar" cria
-- uma nova vinculada à anterior via substitui_regra_id, que é
-- desativada — preserva o princípio do Prompt TÓPICO 5 §14 ("nova
-- versão não altera projetos históricos") sem precisar de UPDATE em
-- nenhuma regra existente.
--
-- simular_bom_sugerida() é só leitura: aplica as regras ativas cujas
-- condições batem com os valores já capturados (Fase F) para um
-- pedido_item, e mostra o resultado comparado com a composição base —
-- nada é escrito na composição real. "O sistema sugere, a Engenharia
-- decide" (Prompt TÓPICO 5 §13). Gravar a sugestão como BOM definitiva
-- é Fase H, ainda não implementada.

create table public.peca_regras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  peca_id uuid not null references public.pecas(id) on delete cascade,
  versao integer not null default 1 check (versao > 0),
  substitui_regra_id uuid references public.peca_regras(id),
  caracteristica_id uuid not null references public.peca_caracteristicas(id),
  operador text not null check (operador in ('>', '>=', '<', '<=', '=', '<>')),
  valor_comparacao_numero numeric(14, 4),
  valor_comparacao_texto text,
  acao text not null check (acao in ('ajustar_quantidade', 'adicionar_material', 'remover_material')),
  acao_material_item_id uuid not null references public.itens(id),
  acao_quantidade numeric(14, 4),
  ativo boolean not null default true,
  motivo text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint peca_regras_valor_comparacao_check check (
    (valor_comparacao_numero is not null and valor_comparacao_texto is null)
    or (valor_comparacao_numero is null and valor_comparacao_texto is not null)
  ),
  constraint peca_regras_acao_quantidade_check check (
    (acao = 'remover_material' and acao_quantidade is null)
    or (acao in ('ajustar_quantidade', 'adicionar_material') and acao_quantidade is not null and acao_quantidade > 0)
  )
);
comment on table public.peca_regras is 'Fase G — regra condição→ação do motor básico. Imutável: "editar" é criar nova regra com substitui_regra_id apontando pra anterior, que vira ativo=false. Nunca aplicada automaticamente na composição real (isso é Fase H, futura).';
create index peca_regras_company_id_idx on public.peca_regras (company_id);
create index peca_regras_peca_id_idx on public.peca_regras (peca_id);

alter table public.peca_regras enable row level security;
create policy peca_regras_select on public.peca_regras for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_regras to authenticated;

-- =========================================================================
-- criar_regra_peca() — valida a condição contra a característica (tipo
-- compatível, operador coerente com o tipo, valor dentro das opções
-- permitidas se for tipo "opcao") e a ação contra a composição atual da
-- peça (remover/ajustar exige que o material já esteja na composição;
-- adicionar exige que ainda não esteja).
-- =========================================================================

create or replace function public.criar_regra_peca(
  p_peca_id uuid, p_caracteristica_id uuid, p_operador text,
  p_valor_comparacao_numero numeric default null, p_valor_comparacao_texto text default null,
  p_acao text default 'ajustar_quantidade', p_acao_material_item_id uuid default null, p_acao_quantidade numeric default null,
  p_motivo text default null, p_substitui_regra_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_caract public.peca_caracteristicas;
  v_material public.itens;
  v_sub_peca public.pecas;
  v_anterior public.peca_regras;
  v_versao integer := 1;
  v_id uuid;
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_caracteristica_id and company_id = v_company_id and peca_id = p_peca_id;
  if not found then
    raise exception 'Característica não encontrada nesta peça.';
  end if;

  if v_caract.tipo = 'numero' then
    if p_operador not in ('>', '>=', '<', '<=', '=', '<>') then
      raise exception 'Operador inválido: "%".', p_operador;
    end if;
    if p_valor_comparacao_numero is null or p_valor_comparacao_texto is not null then
      raise exception 'Característica "%" é numérica — informe só valor_comparacao_numero.', v_caract.nome;
    end if;
  else
    if p_operador not in ('=', '<>') then
      raise exception 'Característica "%" é de texto/opção — só aceita operador = ou <>.', v_caract.nome;
    end if;
    if p_valor_comparacao_texto is null or p_valor_comparacao_numero is not null then
      raise exception 'Característica "%" é de texto/opção — informe só valor_comparacao_texto.', v_caract.nome;
    end if;
    if v_caract.tipo = 'opcao' and not (p_valor_comparacao_texto = any(v_caract.opcoes)) then
      raise exception 'Valor "%" não é uma opção permitida para "%" (permitidas: %).', p_valor_comparacao_texto, v_caract.nome, array_to_string(v_caract.opcoes, ', ');
    end if;
  end if;

  if p_acao not in ('ajustar_quantidade', 'adicionar_material', 'remover_material') then
    raise exception 'Ação inválida: "%".', p_acao;
  end if;

  select * into v_material from public.itens where id = p_acao_material_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de material da ação não encontrado nesta empresa.';
  end if;
  if v_material.tipo in ('componente', 'produto_acabado') then
    select * into v_sub_peca from public.pecas where item_id = p_acao_material_item_id and company_id = v_company_id;
    if not found then
      raise exception 'Item "%" ainda não é uma peça cadastrada — não pode ser usado como subconjunto numa regra.', v_material.codigo;
    end if;
  elsif v_material.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Item do tipo "%" não pode compor a peça (aceito: matéria-prima, insumo, material auxiliar, ou outra peça já cadastrada).', v_material.tipo;
  end if;

  if p_acao in ('remover_material', 'ajustar_quantidade') then
    if not exists (select 1 from public.peca_composicao where peca_id = p_peca_id and material_item_id = p_acao_material_item_id) then
      raise exception 'Ação "%" exige que "%" já esteja na composição base da peça.', p_acao, v_material.codigo;
    end if;
    if p_acao = 'remover_material' and p_acao_quantidade is not null then
      raise exception 'Ação "remover_material" não usa quantidade.';
    end if;
    if p_acao = 'ajustar_quantidade' and (p_acao_quantidade is null or p_acao_quantidade <= 0) then
      raise exception 'Ação "ajustar_quantidade" exige quantidade maior que zero.';
    end if;
  else
    if exists (select 1 from public.peca_composicao where peca_id = p_peca_id and material_item_id = p_acao_material_item_id) then
      raise exception 'Ação "adicionar_material" exige que "%" ainda não esteja na composição base — use ajustar_quantidade.', v_material.codigo;
    end if;
    if p_acao_quantidade is null or p_acao_quantidade <= 0 then
      raise exception 'Ação "adicionar_material" exige quantidade maior que zero.';
    end if;
  end if;

  if p_substitui_regra_id is not null then
    select * into v_anterior from public.peca_regras where id = p_substitui_regra_id and company_id = v_company_id and peca_id = p_peca_id;
    if not found then
      raise exception 'Regra anterior não encontrada nesta peça.';
    end if;
    if not v_anterior.ativo then
      raise exception 'A regra anterior já está desativada.';
    end if;
    v_versao := v_anterior.versao + 1;
    update public.peca_regras set ativo = false where id = p_substitui_regra_id;
  end if;

  insert into public.peca_regras (
    company_id, peca_id, versao, substitui_regra_id, caracteristica_id, operador,
    valor_comparacao_numero, valor_comparacao_texto, acao, acao_material_item_id, acao_quantidade,
    motivo, criado_por
  ) values (
    v_company_id, p_peca_id, v_versao, p_substitui_regra_id, p_caracteristica_id, p_operador,
    p_valor_comparacao_numero, p_valor_comparacao_texto, p_acao, p_acao_material_item_id, p_acao_quantidade,
    p_motivo, auth.uid()
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.regra_criada', 'peca_regra', v_id, v_caract.nome,
    jsonb_build_object('peca_id', p_peca_id, 'versao', v_versao, 'acao', p_acao)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_regra_peca(uuid, uuid, text, numeric, text, text, uuid, numeric, text, uuid) to authenticated;

create or replace function public.desativar_regra_peca(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  update public.peca_regras set ativo = false where id = p_id and company_id = v_company_id and ativo = true;
  if not found then
    raise exception 'Regra ativa não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.regra_desativada', 'peca_regra', p_id, null);
end;
$$;

grant execute on function public.desativar_regra_peca(uuid) to authenticated;

create or replace function public.listar_regras_peca(p_peca_id uuid, p_somente_ativas boolean default true)
returns table (
  id uuid, versao integer, substitui_regra_id uuid, caracteristica_id uuid, caracteristica_nome text,
  operador text, valor_comparacao_numero numeric, valor_comparacao_texto text,
  acao text, acao_material_item_id uuid, acao_material_codigo text, acao_quantidade numeric,
  ativo boolean, motivo text, created_at timestamptz
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
  select pr.id, pr.versao, pr.substitui_regra_id, pr.caracteristica_id, pcar.nome,
    pr.operador, pr.valor_comparacao_numero, pr.valor_comparacao_texto,
    pr.acao, pr.acao_material_item_id, i.codigo, pr.acao_quantidade,
    pr.ativo, pr.motivo, pr.created_at
  from public.peca_regras pr
  join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
  join public.itens i on i.id = pr.acao_material_item_id
  where pr.peca_id = p_peca_id and pr.company_id = v_company_id
    and (not p_somente_ativas or pr.ativo)
  order by pr.created_at desc;
end;
$$;

grant execute on function public.listar_regras_peca(uuid, boolean) to authenticated;

-- =========================================================================
-- simular_bom_sugerida() — leitura pura, motor de regras aplicado a um
-- pedido_item. Parte da composição base, aplica cada regra ativa cuja
-- condição bate com o valor já capturado (Fase F) pra aquele pedido_item,
-- na ordem de criação. Regra sem valor capturado pra sua característica
-- é ignorada (não dá pra avaliar). Nada é escrito em peca_composicao.
-- =========================================================================

create or replace function public.simular_bom_sugerida(p_pedido_item_id uuid)
returns table (
  material_item_id uuid, material_codigo text, material_descricao text,
  quantidade_base numeric, quantidade_sugerida numeric, origem text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
  v_peca_id uuid;
  v_comp record;
  v_regra record;
  v_valor_numero numeric;
  v_valor_texto text;
  v_condicao_bate boolean;
  v_sugestao jsonb := '{}'::jsonb;
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

  select id into v_peca_id from public.pecas where item_id = v_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Este item não é uma peça configurável (sem BOM cadastrada).';
  end if;

  for v_comp in
    select pc.material_item_id, pc.quantidade_por_unidade
    from public.peca_composicao pc
    where pc.peca_id = v_peca_id
  loop
    v_sugestao := v_sugestao || jsonb_build_object(v_comp.material_item_id::text, v_comp.quantidade_por_unidade);
  end loop;

  for v_regra in
    select pr.*, pcar.tipo as caract_tipo
    from public.peca_regras pr
    join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
    where pr.peca_id = v_peca_id and pr.company_id = v_company_id and pr.ativo = true
    order by pr.created_at
  loop
    select pic.valor_numero, pic.valor_texto
      into v_valor_numero, v_valor_texto
    from public.pedido_item_caracteristicas pic
    where pic.pedido_item_id = p_pedido_item_id and pic.peca_caracteristica_id = v_regra.caracteristica_id;

    if not found then
      continue;
    end if;

    v_condicao_bate := case
      when v_regra.caract_tipo = 'numero' then
        case v_regra.operador
          when '>' then v_valor_numero > v_regra.valor_comparacao_numero
          when '>=' then v_valor_numero >= v_regra.valor_comparacao_numero
          when '<' then v_valor_numero < v_regra.valor_comparacao_numero
          when '<=' then v_valor_numero <= v_regra.valor_comparacao_numero
          when '=' then v_valor_numero = v_regra.valor_comparacao_numero
          else v_valor_numero <> v_regra.valor_comparacao_numero
        end
      else
        case v_regra.operador
          when '=' then v_valor_texto = v_regra.valor_comparacao_texto
          else v_valor_texto <> v_regra.valor_comparacao_texto
        end
    end;

    if v_condicao_bate then
      if v_regra.acao = 'remover_material' then
        v_sugestao := v_sugestao - v_regra.acao_material_item_id::text;
      else
        v_sugestao := v_sugestao || jsonb_build_object(v_regra.acao_material_item_id::text, v_regra.acao_quantidade);
      end if;
    end if;
  end loop;

  return query
  select
    (kv.key)::uuid,
    i.codigo,
    i.descricao,
    pc.quantidade_por_unidade,
    (kv.value)::numeric,
    case
      when pc.quantidade_por_unidade is null then 'regra'
      when pc.quantidade_por_unidade = (kv.value)::numeric then 'base'
      else 'regra'
    end
  from jsonb_each_text(v_sugestao) kv
  join public.itens i on i.id = (kv.key)::uuid
  left join public.peca_composicao pc on pc.peca_id = v_peca_id and pc.material_item_id = (kv.key)::uuid
  order by i.codigo;
end;
$$;

grant execute on function public.simular_bom_sugerida(uuid) to authenticated;
