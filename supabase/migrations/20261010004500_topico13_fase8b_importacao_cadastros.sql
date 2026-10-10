-- TÓPICO 13 §29, Fase 8b — importadores de Papéis da Pessoa e Controle
-- Dimensional do Item. Decisão do responsável do produto em 29/09/2026.
--
-- Mesmo molde da Fase 8a: laço sobre a função de gravação que já existe
-- (set_pessoa_papel, definir_propriedades_dimensionais_item), savepoint por
-- linha, prévia por rollback, histórico ao confirmar. Nenhuma regra nova.
--
-- Cuidado herdado da 8a, que custou uma rodada inteira lá: as funções
-- declaram colunas de SAÍDA no RETURNS TABLE, e esses nomes colidem com
-- colunas das tabelas dentro do corpo. Toda consulta aqui é qualificada
-- com alias — sem exceção.

-- =========================================================================
-- Papéis da Pessoa — quem é CLIENTE, quem é FORNECEDOR.
-- Chave natural: documento + papel. A mesma pessoa pode ter os dois, então
-- duplicidade é a combinação, não só o documento.
-- =========================================================================
create or replace function public.importar_pessoa_papeis(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, documento text, papel text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pessoas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_documento text;
  v_papel text;
  v_ativo boolean;
  v_pessoa_id uuid;
  v_existente public.pessoa_papeis;
  v_status text;
  v_erro text;
  v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_chave text;
  v_resultados jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_novos int := 0;
  v_atualizados int := 0;
  v_invalidos int := 0;
  v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (
       select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'pessoa_papeis'
     ) then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_documento := nullif(regexp_replace(coalesce(v_row->>'documento_pessoa', ''), '\D', '', 'g'), '');
      v_papel := upper(nullif(btrim(coalesce(v_row->>'papel', '')), ''));
      -- "ativo" vazio significa ativo: a planilha existe para cadastrar
      -- papel, não para desativar.
      v_ativo := coalesce(lower(btrim(coalesce(v_row->>'ativo', ''))) not in ('nao', 'não', 'false', '0', 'n'), true);
      v_chave := coalesce(v_documento, '') || '|' || coalesce(v_papel, '');

      <<linha>>
      begin
        if v_documento is null then
          raise exception 'Documento da pessoa é obrigatório.';
        end if;
        if v_papel is null then
          raise exception 'Papel é obrigatório (CLIENTE ou FORNECEDOR).';
        end if;

        select p.id into v_pessoa_id from public.pessoas p
        where p.company_id = v_company_id and p.documento = v_documento;
        if v_pessoa_id is null then
          raise exception 'Pessoa não encontrada com o documento informado. Importe a aba de Pessoas primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma combinação de pessoa e papel repetida em outra linha deste arquivo.';
        else
          select pp.* into v_existente from public.pessoa_papeis pp
          where pp.company_id = v_company_id and pp.pessoa_id = v_pessoa_id and pp.papel = v_papel;

          perform public.set_pessoa_papel(v_pessoa_id, v_papel, v_ativo);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object('ativo', v_ativo));
          else
            v_status := 'novo';
          end if;

          v_vistos := array_append(v_vistos, v_chave);
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
        'linha', v_idx, 'documento', v_documento, 'papel', v_papel,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados)
      );
    end loop;

    if p_dry_run then
      raise exception 'dry_run_rollback_marker_pessoa_papeis';
    end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_pessoa_papeis' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (
      company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados,
      resultados, linhas_com_erro, origem_importacao_id, criado_por
    ) values (
      v_company_id, 'pessoa_papeis', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados,
      v_resultados, v_erros, p_origem_importacao_id, auth.uid()
    );

    perform public.log_activity('cadastros.pessoa_papeis_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select
    (r->>'linha')::int, r->>'documento', r->>'papel', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados'))
      else null
    end
  from jsonb_array_elements(v_resultados) r;
end;
$$;

grant execute on function public.importar_pessoa_papeis(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Controle dimensional do item (ADR-011 Fase 2).
-- Chave natural: código do item. Não cria item — só liga o controle num
-- item que já existe, por isso "novo" aqui significa "item que ainda não
-- tinha controle dimensional".
-- =========================================================================
create or replace function public.importar_itens_dimensional(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, dimensao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('itens', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_codigo text;
  v_dimensao text;
  v_peso numeric;
  v_item public.itens;
  v_status text;
  v_erro text;
  v_alterados text[];
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
       select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'itens_dimensional'
     ) then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_item := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_dimensao := nullif(btrim(lower(coalesce(v_row->>'dimensao_tipo', ''))), '');
      v_peso := nullif(btrim(coalesce(v_row->>'peso_por_unidade_dimensao', '')), '')::numeric;

      <<linha>>
      begin
        if v_codigo is null then
          raise exception 'Código do item é obrigatório.';
        end if;
        if v_dimensao is null then
          raise exception 'Tipo de dimensão é obrigatório (linear ou area).';
        end if;

        select i.* into v_item from public.itens i
        where i.company_id = v_company_id and i.codigo = v_codigo;
        if v_item.id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código de item repetido em outra linha deste arquivo.';
        else
          -- A função valida o tipo, o peso positivo e recusa desligar o
          -- controle quando já existe peça registrada. Nada reimplementado.
          perform public.definir_propriedades_dimensionais_item(v_item.id, v_dimensao, v_peso);

          if v_item.dimensao_tipo is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_item), jsonb_build_object(
              'dimensao_tipo', v_dimensao,
              'peso_por_unidade_dimensao', v_peso
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
        'linha', v_idx, 'codigo', v_codigo, 'dimensao', v_dimensao,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados)
      );
    end loop;

    if p_dry_run then
      raise exception 'dry_run_rollback_marker_itens_dimensional';
    end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_itens_dimensional' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (
      company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados,
      resultados, linhas_com_erro, origem_importacao_id, criado_por
    ) values (
      v_company_id, 'itens_dimensional', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados,
      v_resultados, v_erros, p_origem_importacao_id, auth.uid()
    );

    perform public.log_activity('cadastros.itens_dimensional_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select
    (r->>'linha')::int, r->>'codigo', r->>'dimensao', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados'))
      else null
    end
  from jsonb_array_elements(v_resultados) r;
end;
$$;

grant execute on function public.importar_itens_dimensional(jsonb, boolean, text, uuid) to authenticated;
