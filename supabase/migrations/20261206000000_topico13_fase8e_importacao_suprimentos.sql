-- TÓPICO 13 §29, Fase 8e — importadores de Suprimentos: Fornecedor por
-- Item, Materiais Alternativos, Dados do Fornecedor e Política de
-- Abastecimento. Decisão do responsável do produto em 29/09/2026.
--
-- As quatro funções de gravação são upsert com chave única clara
-- ((item, pessoa), (origem, equivalente), (pessoa), (item)), então novo ×
-- atualização sai direto da busca, sem heurística.
--
-- "principal" não é parâmetro do upsert_item_fornecedor: existe uma
-- função própria, definir_fornecedor_principal(), porque marcar um
-- fornecedor como principal desmarca os outros do mesmo item. O
-- importador chama as duas em sequência quando a planilha pede principal,
-- em vez de escrever a coluna na mão e furar essa regra.
--
-- Todas as consultas qualificadas com alias.

-- =========================================================================
-- Fornecedor por item
-- =========================================================================
create or replace function public.importar_item_fornecedores(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, item text, fornecedor text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_row jsonb; v_idx int := 0;
  v_cod_item text; v_doc text; v_condicoes text;
  v_prioridade int; v_preco numeric; v_homologado boolean; v_principal boolean;
  v_item_id uuid; v_pessoa_id uuid;
  v_existente public.item_fornecedores;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'item_fornecedores') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_cod_item := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_doc := nullif(regexp_replace(coalesce(v_row->>'documento_fornecedor', ''), '\D', '', 'g'), '');
      v_prioridade := coalesce(nullif(btrim(coalesce(v_row->>'prioridade', '')), '')::int, 100);
      v_preco := nullif(btrim(coalesce(v_row->>'preco_referencia', '')), '')::numeric;
      v_condicoes := nullif(btrim(coalesce(v_row->>'condicoes', '')), '');
      v_homologado := lower(btrim(coalesce(v_row->>'homologado', ''))) in ('sim', 's', 'true', '1');
      v_principal := lower(btrim(coalesce(v_row->>'principal', ''))) in ('sim', 's', 'true', '1');
      v_chave := coalesce(v_cod_item, '') || '|' || coalesce(v_doc, '');

      <<linha>>
      begin
        if v_cod_item is null then raise exception 'Código do item é obrigatório.'; end if;
        if v_doc is null then raise exception 'Documento do fornecedor é obrigatório.'; end if;

        select i.id into v_item_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_item;
        if v_item_id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        select p.id into v_pessoa_id from public.pessoas p
        where p.company_id = v_company_id and p.documento = v_doc;
        if v_pessoa_id is null then
          raise exception 'Fornecedor não encontrado com o documento informado. Importe a aba de Pessoas primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma combinação de item e fornecedor repetida em outra linha deste arquivo.';
        else
          select f.* into v_existente from public.item_fornecedores f
          where f.company_id = v_company_id and f.item_id = v_item_id and f.pessoa_id = v_pessoa_id;

          perform public.upsert_item_fornecedor(v_item_id, v_pessoa_id, v_prioridade, v_homologado, v_preco, v_condicoes);

          -- Marcar principal desmarca os outros do item: é função própria,
          -- não uma coluna a escrever.
          if v_principal then
            perform public.definir_fornecedor_principal(v_item_id, v_pessoa_id);
          end if;

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'prioridade', v_prioridade, 'homologado', v_homologado,
              'preco_referencia', v_preco, 'condicoes', v_condicoes));
          else
            v_status := 'novo';
          end if;
          v_vistos := array_append(v_vistos, v_chave);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'item', v_cod_item, 'fornecedor', v_doc,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_item_fornecedores'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_item_fornecedores' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'item_fornecedores', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('compras.item_fornecedores_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'item', r->>'fornecedor', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_item_fornecedores(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Materiais alternativos
-- =========================================================================
create or replace function public.importar_item_materiais_alternativos(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, origem text, equivalente text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_row jsonb; v_idx int := 0;
  v_cod_origem text; v_cod_equiv text; v_regra text; v_exige boolean;
  v_origem_id uuid; v_equiv_id uuid;
  v_existente public.item_materiais_alternativos;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'item_materiais_alternativos') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_cod_origem := nullif(btrim(coalesce(v_row->>'codigo_item_origem', '')), '');
      v_cod_equiv := nullif(btrim(coalesce(v_row->>'codigo_item_equivalente', '')), '');
      v_regra := nullif(btrim(coalesce(v_row->>'regra_substituicao', '')), '');
      -- Vazio é "sim": exigir aprovação é o padrão seguro para troca de
      -- material, e a planilha não deveria afrouxar isso por omissão.
      v_exige := coalesce(lower(btrim(coalesce(v_row->>'exige_aprovacao', ''))) not in ('nao', 'não', 'false', '0', 'n'), true);
      v_chave := coalesce(v_cod_origem, '') || '|' || coalesce(v_cod_equiv, '');

      <<linha>>
      begin
        if v_cod_origem is null then raise exception 'Código do item de origem é obrigatório.'; end if;
        if v_cod_equiv is null then raise exception 'Código do item equivalente é obrigatório.'; end if;
        if v_cod_origem = v_cod_equiv then raise exception 'Um item não pode ser alternativo de si mesmo.'; end if;

        select i.id into v_origem_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_origem;
        if v_origem_id is null then
          raise exception 'Item de origem não encontrado. Importe a aba de Itens primeiro.';
        end if;
        select i.id into v_equiv_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_equiv;
        if v_equiv_id is null then
          raise exception 'Item equivalente não encontrado. Importe a aba de Itens primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo par de itens repetido em outra linha deste arquivo.';
        else
          select ma.* into v_existente from public.item_materiais_alternativos ma
          where ma.company_id = v_company_id and ma.item_origem_id = v_origem_id and ma.item_equivalente_id = v_equiv_id;

          perform public.upsert_item_material_alternativo(v_origem_id, v_equiv_id, v_exige, v_regra);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'exige_aprovacao', v_exige, 'regra_substituicao', v_regra));
          else
            v_status := 'novo';
          end if;
          v_vistos := array_append(v_vistos, v_chave);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'origem', v_cod_origem, 'equivalente', v_cod_equiv,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_alternativos'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_alternativos' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'item_materiais_alternativos', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('compras.materiais_alternativos_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'origem', r->>'equivalente', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_item_materiais_alternativos(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Dados do fornecedor
-- =========================================================================
create or replace function public.importar_fornecedor_dados(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, documento text, banco text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_row jsonb; v_idx int := 0;
  v_doc text; v_banco text; v_agencia text; v_conta text; v_tipo_conta text;
  v_pix text; v_condicoes text; v_homologado boolean;
  v_prazo int; v_lead int;
  v_pessoa_id uuid;
  v_existente public.fornecedor_dados;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'fornecedor_dados') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_doc := nullif(regexp_replace(coalesce(v_row->>'documento_fornecedor', ''), '\D', '', 'g'), '');
      v_banco := nullif(btrim(coalesce(v_row->>'banco', '')), '');
      v_agencia := nullif(btrim(coalesce(v_row->>'agencia', '')), '');
      v_conta := nullif(btrim(coalesce(v_row->>'conta', '')), '');
      v_tipo_conta := nullif(btrim(lower(coalesce(v_row->>'tipo_conta', ''))), '');
      v_pix := nullif(btrim(coalesce(v_row->>'chave_pix', '')), '');
      v_condicoes := nullif(btrim(coalesce(v_row->>'condicoes_padrao', '')), '');
      v_prazo := nullif(btrim(coalesce(v_row->>'prazo_pagamento_dias', '')), '')::int;
      v_lead := nullif(btrim(coalesce(v_row->>'lead_time_dias', '')), '')::int;
      v_homologado := lower(btrim(coalesce(v_row->>'homologado', ''))) in ('sim', 's', 'true', '1');

      <<linha>>
      begin
        if v_doc is null then raise exception 'Documento do fornecedor é obrigatório.'; end if;

        select p.id into v_pessoa_id from public.pessoas p
        where p.company_id = v_company_id and p.documento = v_doc;
        if v_pessoa_id is null then
          raise exception 'Fornecedor não encontrado com o documento informado. Importe a aba de Pessoas primeiro.';
        end if;

        if v_doc = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo fornecedor repetido em outra linha deste arquivo.';
        else
          select fd.* into v_existente from public.fornecedor_dados fd
          where fd.company_id = v_company_id and fd.pessoa_id = v_pessoa_id;

          perform public.upsert_fornecedor_dados(v_pessoa_id, v_prazo, v_lead, v_banco, v_agencia,
            v_conta, v_tipo_conta, v_pix, v_condicoes, v_homologado);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'prazo_pagamento_dias', v_prazo, 'lead_time_dias', v_lead, 'banco', v_banco,
              'agencia', v_agencia, 'conta', v_conta, 'tipo_conta', v_tipo_conta,
              'chave_pix', v_pix, 'condicoes_padrao', v_condicoes, 'homologado', v_homologado));
          else
            v_status := 'novo';
          end if;
          v_vistos := array_append(v_vistos, v_doc);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'documento', v_doc,
        'banco', coalesce(v_banco, '—'), 'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_fornecedor_dados'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_fornecedor_dados' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'fornecedor_dados', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('compras.fornecedor_dados_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'documento', r->>'banco', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_fornecedor_dados(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Política de abastecimento
-- =========================================================================
create or replace function public.importar_politicas_abastecimento(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, tipo text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_row jsonb; v_idx int := 0;
  v_codigo text; v_tipo text; v_doc_forn text;
  v_minimo numeric; v_seguranca numeric; v_reposicao numeric;
  v_lote_min numeric; v_lote_eco numeric; v_multiplo numeric;
  v_item_id uuid; v_forn_id uuid;
  v_existente public.politicas_abastecimento;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'politicas_abastecimento') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null; v_forn_id := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_tipo := coalesce(nullif(btrim(lower(coalesce(v_row->>'tipo', ''))), ''), 'sob_demanda');
      v_doc_forn := nullif(regexp_replace(coalesce(v_row->>'documento_fornecedor_preferencial', ''), '\D', '', 'g'), '');
      v_minimo := nullif(btrim(coalesce(v_row->>'estoque_minimo', '')), '')::numeric;
      v_seguranca := nullif(btrim(coalesce(v_row->>'estoque_seguranca', '')), '')::numeric;
      v_reposicao := nullif(btrim(coalesce(v_row->>'ponto_reposicao', '')), '')::numeric;
      v_lote_min := nullif(btrim(coalesce(v_row->>'lote_minimo', '')), '')::numeric;
      v_lote_eco := nullif(btrim(coalesce(v_row->>'lote_economico', '')), '')::numeric;
      v_multiplo := nullif(btrim(coalesce(v_row->>'multiplo', '')), '')::numeric;

      <<linha>>
      begin
        if v_codigo is null then raise exception 'Código do item é obrigatório.'; end if;

        select i.id into v_item_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_codigo;
        if v_item_id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_doc_forn is not null then
          select p.id into v_forn_id from public.pessoas p
          where p.company_id = v_company_id and p.documento = v_doc_forn;
          if v_forn_id is null then
            raise exception 'Fornecedor preferencial não encontrado com o documento informado.';
          end if;
        end if;

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código de item repetido em outra linha deste arquivo.';
        else
          select pa.* into v_existente from public.politicas_abastecimento pa
          where pa.company_id = v_company_id and pa.item_id = v_item_id;

          perform public.upsert_politica_abastecimento(v_item_id, v_tipo, v_minimo, v_seguranca,
            v_reposicao, v_lote_min, v_lote_eco, v_multiplo, v_forn_id);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'tipo', v_tipo, 'estoque_minimo', v_minimo, 'estoque_seguranca', v_seguranca,
              'ponto_reposicao', v_reposicao, 'lote_minimo', v_lote_min,
              'lote_economico', v_lote_eco, 'multiplo', v_multiplo));
          else
            v_status := 'novo';
          end if;
          v_vistos := array_append(v_vistos, v_codigo);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'codigo', v_codigo, 'tipo', v_tipo,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_politicas'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_politicas' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'politicas_abastecimento', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('compras.politicas_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'codigo', r->>'tipo', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_politicas_abastecimento(jsonb, boolean, text, uuid) to authenticated;
