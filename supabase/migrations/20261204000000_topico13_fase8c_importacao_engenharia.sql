-- TÓPICO 13 §29, Fase 8c — importadores de Engenharia: Peças, Composição,
-- Características e Regras. Decisão do responsável do produto em 29/09/2026.
--
-- Molde das fases 8a/8b: laço sobre a função de gravação que já existe,
-- savepoint por linha, prévia por rollback, histórico ao confirmar.
--
-- Três decisões que valem registrar, porque nem tudo aqui tem função de
-- atualização e o silêncio seria pior que a recusa:
--
-- 1. Peça: criar_peca() recusa item que já é peça, e não existe função
--    para alterar a descrição técnica. Então reimportar a mesma peça com
--    descrição DIFERENTE é recusado com mensagem explícita, em vez de
--    ignorar a descrição nova em silêncio. Com descrição igual ou vazia é
--    'atualizacao' (no-op), o que mantém a reimportação idempotente.
-- 2. Característica: definir_caracteristica_peca() é INSERT puro (a unique
--    é (peca_id, nome)), e atualizar_caracteristica_peca() não muda o
--    TIPO. Característica existente com tipo diferente é recusada pelo
--    mesmo motivo.
-- 3. Regra: regras são versionadas e criar_regra_peca() sempre cria uma
--    versão nova. Sem cuidado, reimportar o mesmo arquivo duplicaria todas
--    as regras. Por isso o importador procura regra ATIVA equivalente
--    (mesma característica, operador, valor, ação, material e quantidade)
--    e a reporta como 'atualizacao' sem criar nada.
--
-- Todas as consultas são qualificadas com alias: os nomes das colunas de
-- saída do RETURNS TABLE colidem com colunas das tabelas (foi o que
-- derrubou importar_obras na 8a).

-- =========================================================================
-- Peças
-- =========================================================================
create or replace function public.importar_pecas(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, descricao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_codigo text;
  v_desc text;
  v_item public.itens;
  v_existente public.pecas;
  v_status text;
  v_erro text;
  v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'pecas') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_item := null; v_existente := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_desc := nullif(btrim(coalesce(v_row->>'descricao_tecnica', '')), '');

      <<linha>>
      begin
        if v_codigo is null then
          raise exception 'Código do item é obrigatório.';
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
          select pc.* into v_existente from public.pecas pc
          where pc.company_id = v_company_id and pc.item_id = v_item.id;

          if v_existente.id is not null then
            if v_desc is not null and coalesce(v_existente.descricao_tecnica, '') <> v_desc then
              raise exception 'Peça já existe e a descrição técnica não é alterável por importação. Ajuste pela tela de Peças.';
            end if;
            v_status := 'atualizacao';
          else
            perform public.criar_peca(v_item.id, v_desc);
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
      else v_invalidos := v_invalidos + 1;
      end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then
        v_erros := v_erros || jsonb_build_array(v_row);
      end if;

      v_resultados := v_resultados || jsonb_build_object(
        'linha', v_idx, 'codigo', v_codigo, 'descricao', coalesce(v_desc, v_item.descricao),
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;

    if p_dry_run then raise exception 'dry_run_rollback_marker_pecas'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_pecas' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'pecas', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('pecas.pecas_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select (r->>'linha')::int, r->>'codigo', r->>'descricao', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_pecas(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Composição da peça (lista de materiais)
-- =========================================================================
create or replace function public.importar_peca_composicao(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, peca text, material text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_cod_peca text; v_cod_material text;
  v_qtd numeric; v_tipo_calc text; v_perda numeric; v_obs text;
  v_peca_id uuid; v_material_id uuid; v_composicao_id uuid;
  v_existente public.peca_composicao;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'peca_composicao') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_cod_peca := nullif(btrim(coalesce(v_row->>'codigo_peca', '')), '');
      v_cod_material := nullif(btrim(coalesce(v_row->>'codigo_material', '')), '');
      v_qtd := nullif(btrim(coalesce(v_row->>'quantidade_por_unidade', '')), '')::numeric;
      v_tipo_calc := nullif(btrim(lower(coalesce(v_row->>'tipo_calculo', ''))), '');
      v_perda := coalesce(nullif(btrim(coalesce(v_row->>'percentual_perda', '')), '')::numeric, 0);
      v_obs := nullif(btrim(coalesce(v_row->>'observacao', '')), '');
      v_chave := coalesce(v_cod_peca, '') || '|' || coalesce(v_cod_material, '');

      <<linha>>
      begin
        if v_cod_peca is null then raise exception 'Código da peça é obrigatório.'; end if;
        if v_cod_material is null then raise exception 'Código do material é obrigatório.'; end if;
        if v_qtd is null then raise exception 'Quantidade por unidade é obrigatória.'; end if;

        select pc.id into v_peca_id from public.pecas pc
        join public.itens i on i.id = pc.item_id
        where pc.company_id = v_company_id and i.codigo = v_cod_peca;
        if v_peca_id is null then
          raise exception 'Peça não encontrada com o código informado. Importe a aba de Peças primeiro.';
        end if;

        select i.id into v_material_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_material;
        if v_material_id is null then
          raise exception 'Material não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma combinação de peça e material repetida em outra linha deste arquivo.';
        else
          select comp.* into v_existente from public.peca_composicao comp
          where comp.company_id = v_company_id and comp.peca_id = v_peca_id and comp.material_item_id = v_material_id;

          if v_existente.id is not null then
            perform public.atualizar_material_peca(v_existente.id, v_qtd, v_obs);
            v_composicao_id := v_existente.id;
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'quantidade_por_unidade', v_qtd, 'observacao', v_obs));
          else
            v_composicao_id := public.adicionar_material_peca(v_peca_id, v_material_id, v_qtd, v_obs);
            v_status := 'novo';
          end if;

          -- tipo_calculo e percentual_perda vivem numa função própria; só
          -- são tocados quando a planilha traz o tipo.
          if v_tipo_calc is not null then
            perform public.definir_tipo_calculo_composicao(v_composicao_id, v_tipo_calc, v_perda);
          end if;

          v_vistos := array_append(v_vistos, v_chave);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
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
        'linha', v_idx, 'peca', v_cod_peca, 'material', v_cod_material,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;

    if p_dry_run then raise exception 'dry_run_rollback_marker_peca_composicao'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_peca_composicao' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'peca_composicao', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('pecas.composicao_importada', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select (r->>'linha')::int, r->>'peca', r->>'material', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_peca_composicao(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Características da peça (configurador)
-- =========================================================================
create or replace function public.importar_peca_caracteristicas(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, peca text, caracteristica text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_cod_peca text; v_nome text; v_tipo text; v_unidade text; v_papel text;
  v_opcoes text[]; v_obrigatoria boolean;
  v_peca_id uuid; v_caracteristica_id uuid;
  v_existente public.peca_caracteristicas;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'peca_caracteristicas') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_cod_peca := nullif(btrim(coalesce(v_row->>'codigo_peca', '')), '');
      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_tipo := nullif(btrim(lower(coalesce(v_row->>'tipo', ''))), '');
      v_unidade := nullif(btrim(coalesce(v_row->>'unidade', '')), '');
      v_papel := nullif(btrim(lower(coalesce(v_row->>'papel_dimensional', ''))), '');
      -- Lista de opções vem como texto separado por vírgula na planilha.
      v_opcoes := case
        when nullif(btrim(coalesce(v_row->>'opcoes', '')), '') is null then null
        else (select array_agg(btrim(x)) from unnest(string_to_array(v_row->>'opcoes', ',')) x where btrim(x) <> '')
      end;
      v_obrigatoria := coalesce(lower(btrim(coalesce(v_row->>'obrigatoria', ''))) not in ('nao', 'não', 'false', '0', 'n'), true);
      v_chave := coalesce(v_cod_peca, '') || '|' || lower(coalesce(v_nome, ''));

      <<linha>>
      begin
        if v_cod_peca is null then raise exception 'Código da peça é obrigatório.'; end if;
        if v_nome is null then raise exception 'Nome da característica é obrigatório.'; end if;
        if v_tipo is null then raise exception 'Tipo da característica é obrigatório (numero, texto ou opcao).'; end if;

        select pc.id into v_peca_id from public.pecas pc
        join public.itens i on i.id = pc.item_id
        where pc.company_id = v_company_id and i.codigo = v_cod_peca;
        if v_peca_id is null then
          raise exception 'Peça não encontrada com o código informado. Importe a aba de Peças primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma característica (peça + nome) repetida em outra linha deste arquivo.';
        else
          select ca.* into v_existente from public.peca_caracteristicas ca
          where ca.company_id = v_company_id and ca.peca_id = v_peca_id and ca.nome = v_nome;

          if v_existente.id is not null then
            if v_existente.tipo <> v_tipo then
              raise exception 'Característica já existe com o tipo "%" e o tipo não é alterável por importação. Ajuste pela tela de Peças.', v_existente.tipo;
            end if;
            perform public.atualizar_caracteristica_peca(v_existente.id, v_unidade, v_opcoes, v_obrigatoria);
            v_caracteristica_id := v_existente.id;
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'unidade', v_unidade, 'opcoes', to_jsonb(v_opcoes), 'obrigatoria', v_obrigatoria));
          else
            v_caracteristica_id := public.definir_caracteristica_peca(
              v_peca_id, v_nome, v_tipo, v_unidade, v_opcoes, v_obrigatoria);
            v_status := 'novo';
          end if;

          if v_papel is not null then
            perform public.definir_papel_dimensional_caracteristica(v_caracteristica_id, v_papel);
          end if;

          v_vistos := array_append(v_vistos, v_chave);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
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
        'linha', v_idx, 'peca', v_cod_peca, 'caracteristica', v_nome,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;

    if p_dry_run then raise exception 'dry_run_rollback_marker_peca_caracteristicas'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_peca_caracteristicas' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'peca_caracteristicas', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('pecas.caracteristicas_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select (r->>'linha')::int, r->>'peca', r->>'caracteristica', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_peca_caracteristicas(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Regras da peça (configurador)
-- =========================================================================
create or replace function public.importar_peca_regras(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, peca text, caracteristica text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_cod_peca text; v_nome_carac text; v_operador text; v_acao text; v_cod_material text; v_motivo text;
  v_valor_num numeric; v_valor_txt text; v_acao_qtd numeric;
  v_peca_id uuid; v_caracteristica_id uuid; v_material_id uuid; v_regra_existente uuid;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'peca_regras') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_regra_existente := null;
      v_cod_peca := nullif(btrim(coalesce(v_row->>'codigo_peca', '')), '');
      v_nome_carac := nullif(btrim(coalesce(v_row->>'nome_caracteristica', '')), '');
      v_operador := nullif(btrim(coalesce(v_row->>'operador', '')), '');
      v_acao := nullif(btrim(lower(coalesce(v_row->>'acao', ''))), '');
      v_cod_material := nullif(btrim(coalesce(v_row->>'codigo_material_acao', '')), '');
      v_motivo := nullif(btrim(coalesce(v_row->>'motivo', '')), '');
      v_valor_num := nullif(btrim(coalesce(v_row->>'valor_comparacao_numero', '')), '')::numeric;
      v_valor_txt := nullif(btrim(coalesce(v_row->>'valor_comparacao_texto', '')), '');
      v_acao_qtd := nullif(btrim(coalesce(v_row->>'acao_quantidade', '')), '')::numeric;
      v_chave := concat_ws('|', v_cod_peca, lower(coalesce(v_nome_carac, '')), v_operador,
        coalesce(v_valor_num::text, v_valor_txt, ''), v_acao, v_cod_material, coalesce(v_acao_qtd::text, ''));

      <<linha>>
      begin
        if v_cod_peca is null then raise exception 'Código da peça é obrigatório.'; end if;
        if v_nome_carac is null then raise exception 'Nome da característica é obrigatório.'; end if;
        if v_operador is null then raise exception 'Operador é obrigatório.'; end if;
        if v_acao is null then raise exception 'Ação é obrigatória.'; end if;
        if v_cod_material is null then raise exception 'Código do material da ação é obrigatório.'; end if;

        select pc.id into v_peca_id from public.pecas pc
        join public.itens i on i.id = pc.item_id
        where pc.company_id = v_company_id and i.codigo = v_cod_peca;
        if v_peca_id is null then
          raise exception 'Peça não encontrada com o código informado. Importe a aba de Peças primeiro.';
        end if;

        select ca.id into v_caracteristica_id from public.peca_caracteristicas ca
        where ca.company_id = v_company_id and ca.peca_id = v_peca_id and ca.nome = v_nome_carac;
        if v_caracteristica_id is null then
          raise exception 'Característica "%" não existe nesta peça. Importe a aba de Características primeiro.', v_nome_carac;
        end if;

        select i.id into v_material_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_material;
        if v_material_id is null then
          raise exception 'Material da ação não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma regra repetida em outra linha deste arquivo.';
        else
          -- Regras são versionadas e criar_regra_peca() sempre cria versão
          -- nova. Sem esta busca, reimportar o mesmo arquivo duplicaria
          -- todas as regras.
          select pr.id into v_regra_existente from public.peca_regras pr
          where pr.company_id = v_company_id and pr.peca_id = v_peca_id
            and pr.caracteristica_id = v_caracteristica_id and pr.operador = v_operador
            and pr.acao = v_acao and pr.acao_material_item_id = v_material_id and pr.ativo
            and coalesce(pr.valor_comparacao_numero, -1e30) is not distinct from coalesce(v_valor_num, -1e30)
            and coalesce(pr.valor_comparacao_texto, '') is not distinct from coalesce(v_valor_txt, '')
            and coalesce(pr.acao_quantidade, -1e30) is not distinct from coalesce(v_acao_qtd, -1e30);

          if v_regra_existente is not null then
            v_status := 'atualizacao';
          else
            perform public.criar_regra_peca(v_peca_id, v_caracteristica_id, v_operador,
              v_valor_num, v_valor_txt, v_acao, v_material_id, v_acao_qtd, v_motivo, null);
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
      else v_invalidos := v_invalidos + 1;
      end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then
        v_erros := v_erros || jsonb_build_array(v_row);
      end if;

      v_resultados := v_resultados || jsonb_build_object(
        'linha', v_idx, 'peca', v_cod_peca, 'caracteristica', v_nome_carac,
        'status', v_status, 'erro', v_erro, 'campos_alterados', null);
    end loop;

    if p_dry_run then raise exception 'dry_run_rollback_marker_peca_regras'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_peca_regras' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'peca_regras', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('pecas.regras_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select (r->>'linha')::int, r->>'peca', r->>'caracteristica', r->>'status', r->>'erro',
    null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_peca_regras(jsonb, boolean, text, uuid) to authenticated;
