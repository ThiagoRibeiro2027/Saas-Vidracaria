-- Melhorias do responsável do produto (item 5, 17/10/2026): hoje cor exige um
-- código de item totalmente separado (ex.: "PERF-QUAD-BRANCO",
-- "PERF-QUAD-PRETO" como itens distintos, duplicando todo o cadastro).
-- Decisão do responsável ("item-base + variantes de cor"): um item pode
-- virar item-base de outros itens (as variantes), cada variante com seu
-- próprio código (exigência de estoque/compras já existente — cada SKU
-- físico precisa do seu próprio `codigo`) e uma `cor`. Reaproveita a mesma
-- tabela `itens` e a mesma função `upsert_item()` — a variante é só um item
-- normal com `item_pai_id` preenchido, não uma entidade nova.
--
-- Decisão de simplicidade (CLAUDE.md §48): sem hierarquia de N níveis — uma
-- variante não pode virar item-base de outra variante, e um item que já é
-- item-base (tem ao menos uma variante) não pode virar variante de outro.
-- Isso evita cadeias ambíguas sem precisar de CTE recursiva nas telas que
-- consultam itens.

alter table public.itens
  add column cor text,
  add column item_pai_id uuid references public.itens(id);

comment on column public.itens.cor is
  'Melhorias 17/10/2026, item 5 — cor da variante. Só tem sentido junto de item_pai_id (a variante declara o que a diferencia do item-base); upsert_item() exige os dois juntos.';
comment on column public.itens.item_pai_id is
  'Melhorias 17/10/2026, item 5 — item-base do qual este item é uma variante de cor. NULL = item normal ou item-base. Sem cadeias: o item apontado nunca pode ter item_pai_id próprio (ver checagem em upsert_item()).';

-- Mesma empresa do item-base, garantida por upsert_item() (RLS não valida
-- FK entre linhas da mesma tabela) — índice de apoio pra essa checagem e
-- pra listar variantes de um item-base sem full scan.
create index itens_item_pai_id_idx on public.itens (item_pai_id) where item_pai_id is not null;

-- No máximo uma variante por cor (case-insensitive) dentro do mesmo
-- item-base — evita "Branco" e "branco" como duas variantes distintas por
-- erro de digitação.
create unique index itens_pai_cor_unique on public.itens (item_pai_id, lower(btrim(cor)))
  where item_pai_id is not null;

-- upsert_item() ganha dois parâmetros no fim (ambos default null) — mesma
-- técnica da migration 20261012235145 (DROP explícito da aridade anterior,
-- pra não deixar duas sobrecargas ambíguas pro PostgREST).
drop function if exists public.upsert_item(uuid, text, text, text, text, text, text, numeric);

create or replace function public.upsert_item(
  p_id uuid, p_codigo text, p_descricao text, p_tipo text, p_classificacao text,
  p_unidade_principal text, p_situacao text default 'ativo',
  p_percentual_quebra numeric default null,
  p_item_pai_id uuid default null,
  p_cor text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens;
  v_pai public.itens;
  v_id uuid;
  v_cor text := nullif(btrim(p_cor), '');
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('itens', 'manage') then
    raise exception 'Sem permissão para gerenciar itens (itens.manage).';
  end if;
  perform public.assert_company_not_suspended();
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
  if p_percentual_quebra is not null and p_percentual_quebra < 0 then
    raise exception 'Percentual de quebra não pode ser negativo.';
  end if;

  if p_item_pai_id is not null then
    if p_item_pai_id = p_id then
      raise exception 'Um item não pode ser variante de si mesmo.';
    end if;
    select * into v_pai from public.itens where id = p_item_pai_id and company_id = v_company_id;
    if not found then
      raise exception 'Item-base não encontrado nesta empresa.';
    end if;
    if v_pai.item_pai_id is not null then
      raise exception 'Este item já é uma variante de cor — não é possível criar uma variante de outra variante. Use o item-base "%".', v_pai.codigo;
    end if;
    if v_cor is null then
      raise exception 'Informe a cor da variante.';
    end if;
  end if;

  if p_id is not null and exists (
    select 1 from public.itens where item_pai_id = p_id and company_id = v_company_id
  ) then
    -- Item já é item-base de ao menos uma variante — tanto faz se a
    -- chamada está tentando desvincular (p_item_pai_id = null, inofensivo)
    -- ou virar variante de outro (bloqueado): o que não pode é ESTE item
    -- passar a ter um pai enquanto ele próprio é pai de outros.
    if p_item_pai_id is not null then
      raise exception 'Este item já é item-base de variantes de cor — não pode virar variante de outro item.';
    end if;
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
      situacao = p_situacao, percentual_quebra = p_percentual_quebra,
      item_pai_id = p_item_pai_id, cor = v_cor
    where id = p_id
    returning id into v_id;
  else
    insert into public.itens (
      company_id, codigo, descricao, tipo, classificacao, unidade_principal,
      situacao, percentual_quebra, item_pai_id, cor
    )
    values (
      v_company_id, p_codigo, p_descricao, p_tipo, p_classificacao, p_unidade_principal,
      p_situacao, p_percentual_quebra, p_item_pai_id, v_cor
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.item_upserted', 'item', v_id, p_codigo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'codigo', p_codigo, 'tipo', p_tipo, 'classificacao', p_classificacao,
      'situacao', p_situacao, 'percentual_quebra', p_percentual_quebra,
      'item_pai_id', p_item_pai_id, 'cor', v_cor
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_item(
  uuid, text, text, text, text, text, text, numeric, uuid, text
) to authenticated;

-- importar_itens() ganha `cor` e `item_pai_codigo` (texto — resolvido pro
-- `id` do item-base por código, igual ao padrão já usado em `documento_
-- pessoa` na importação de pessoa_papeis). Mesma assinatura de antes (4
-- args), CREATE OR REPLACE substitui direto, sem sobrecarga nova. Linha de
-- variante exige que a linha do item-base já tenha sido processada ANTES
-- no mesmo arquivo (mesma transação — "lote" só comita no fim, mas leitura
-- dentro da própria transação já enxerga o insert anterior) ou já exista
-- de uma importação anterior; a validação de fato (cor obrigatória junto
-- de item_pai_id, sem cadeia de variante de variante) continua só dentro
-- de upsert_item(), sem duplicar regra aqui.
create or replace function public.importar_itens(
  p_linhas jsonb, p_dry_run boolean default true, p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha integer, codigo text, descricao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('itens', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_codigo text;
  v_existente public.itens;
  v_status text;
  v_erro text;
  v_alterados text[];
  v_percentual_quebra numeric;
  v_cor text;
  v_item_pai_codigo text;
  v_item_pai_id uuid;
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_novos int := 0;
  v_atualizados int := 0;
  v_invalidos int := 0;
  v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (
       select 1 from public.importacoes
       where id = p_origem_importacao_id
         and company_id = v_company_id
         and entidade = 'itens'
     ) then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo', '')), '');

      <<linha>>
      begin
        if v_codigo is null then
          raise exception 'Código é obrigatório.';
        end if;
        if coalesce(btrim(v_row->>'descricao'), '') = '' then
          raise exception 'Descrição é obrigatória.';
        end if;
        if coalesce(btrim(v_row->>'unidade_principal'), '') = '' then
          raise exception 'Unidade principal é obrigatória.';
        end if;
        if coalesce(v_row->>'tipo', '') not in (
          'materia_prima', 'insumo', 'componente', 'produto_intermediario',
          'produto_acabado', 'material_auxiliar', 'embalagem', 'servico', 'outro'
        ) then
          raise exception 'Tipo inválido: "%".', coalesce(v_row->>'tipo', '');
        end if;
        v_percentual_quebra := nullif(btrim(coalesce(v_row->>'percentual_quebra', '')), '')::numeric;
        if v_percentual_quebra is not null and v_percentual_quebra < 0 then
          raise exception 'Percentual de quebra não pode ser negativo.';
        end if;
        v_cor := nullif(btrim(coalesce(v_row->>'cor', '')), '');
        v_item_pai_codigo := nullif(btrim(coalesce(v_row->>'item_pai_codigo', '')), '');
        v_item_pai_id := null;
        if v_item_pai_codigo is not null then
          select id into v_item_pai_id from public.itens
          where itens.company_id = v_company_id and itens.codigo = v_item_pai_codigo;
          if v_item_pai_id is null then
            raise exception 'Item-base com código "%" não encontrado nesta empresa.', v_item_pai_codigo;
          end if;
        end if;

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código repetido em outra linha deste arquivo.';
        else
          select * into v_existente from public.itens
          where itens.company_id = v_company_id and itens.codigo = v_codigo;

          perform public.upsert_item(
            case when v_existente.id is not null then v_existente.id else null end,
            v_codigo, btrim(v_row->>'descricao'), v_row->>'tipo',
            nullif(v_row->>'classificacao', ''), btrim(v_row->>'unidade_principal'), 'ativo',
            v_percentual_quebra, v_item_pai_id, v_cor
          );

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'codigo', v_codigo, 'descricao', btrim(v_row->>'descricao'), 'tipo', v_row->>'tipo',
              'classificacao', nullif(v_row->>'classificacao', ''), 'unidade_principal', btrim(v_row->>'unidade_principal'),
              'percentual_quebra', v_percentual_quebra, 'item_pai_id', v_item_pai_id, 'cor', v_cor
            ));
          else
            v_status := 'novo';
          end if;

          v_vistos := array_append(v_vistos, v_codigo);
        end if;
      exception when others then
        v_status := 'invalido';
        v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1;
      end if;

      if v_status in ('invalido', 'duplicado_no_arquivo') then
        v_erros := v_erros || jsonb_build_array(v_row);
      end if;

      v_resultados := v_resultados || jsonb_build_object(
        'linha', v_idx, 'codigo', v_codigo, 'descricao', v_row->>'descricao',
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados)
      );
    end loop;

    if p_dry_run then
      raise exception 'dry_run_rollback_marker_itens';
    end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_itens' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (
      company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados,
      resultados, linhas_com_erro, origem_importacao_id, criado_por
    ) values (
      v_company_id, 'itens', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados,
      v_resultados, v_erros, p_origem_importacao_id, auth.uid()
    );

    perform public.log_activity('cadastros.itens_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select
    (r->>'linha')::int, r->>'codigo', r->>'descricao', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados'))
      else null
    end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
