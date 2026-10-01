-- TÓPICO 13 §29, Fase 8d — importadores de Produção e Estoque: Recursos
-- Produtivos, Roteiros, Operações do Roteiro, Estoque Inicial e Peças
-- Dimensionais. Decisão do responsável do produto em 29/09/2026.
--
-- ARMADILHA PRINCIPAL DESTA FASE, resolvida no Estoque Inicial:
-- ajustar_saldo() recebe um DELTA, não um valor absoluto. A planilha dá o
-- saldo do dia da virada, que é absoluto. Passar o valor direto faria
-- reimportar o mesmo arquivo DOBRAR o estoque — e ninguém perceberia até
-- o inventário. O importador lê o saldo atual e aplica a diferença; com o
-- arquivo já importado, a diferença é zero e nada acontece.
--
-- Roteiros não têm chave única por (item, nome): mesmo tratamento dado às
-- Obras na 8a — mais de um com o mesmo nome é recusado com mensagem, em
-- vez de a importação escolher um deles.
--
-- Todas as consultas qualificadas com alias (colisão com as colunas de
-- saída do RETURNS TABLE; foi o que derrubou importar_obras na 8a).

-- =========================================================================
-- Recursos produtivos
-- =========================================================================
create or replace function public.importar_recursos_produtivos(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, nome text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_row jsonb; v_idx int := 0;
  v_codigo text; v_nome text; v_tipo text; v_setor text; v_local text;
  v_capacidade numeric; v_custo numeric;
  v_existente public.recursos_produtivos;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'recursos_produtivos') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo', '')), '');
      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_tipo := nullif(btrim(lower(coalesce(v_row->>'tipo', ''))), '');
      v_setor := nullif(btrim(coalesce(v_row->>'setor', '')), '');
      v_local := nullif(btrim(coalesce(v_row->>'localizacao', '')), '');
      v_capacidade := nullif(btrim(coalesce(v_row->>'capacidade_horas_dia', '')), '')::numeric;
      v_custo := nullif(btrim(coalesce(v_row->>'custo_hora', '')), '')::numeric;

      <<linha>>
      begin
        if v_codigo is null then raise exception 'Código do recurso é obrigatório.'; end if;
        if v_nome is null then raise exception 'Nome do recurso é obrigatório.'; end if;
        if v_tipo is null then raise exception 'Tipo do recurso é obrigatório.'; end if;

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código de recurso repetido em outra linha deste arquivo.';
        else
          select rp.* into v_existente from public.recursos_produtivos rp
          where rp.company_id = v_company_id and rp.codigo = v_codigo;

          if v_existente.id is not null then
            if v_existente.tipo <> v_tipo then
              raise exception 'Recurso já existe com o tipo "%" e o tipo não é alterável por importação. Ajuste pela tela de Produção.', v_existente.tipo;
            end if;
            perform public.editar_recurso_produtivo(v_existente.id, v_nome, v_setor, v_capacidade, v_local, v_custo);
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'nome', v_nome, 'setor', v_setor, 'capacidade_horas_dia', v_capacidade,
              'localizacao', v_local, 'custo_hora', v_custo));
          else
            perform public.criar_recurso_produtivo(v_codigo, v_nome, v_tipo, v_setor, v_capacidade, v_local, v_custo);
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'codigo', v_codigo, 'nome', v_nome,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_recursos'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_recursos' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'recursos_produtivos', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('producao.recursos_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'codigo', r->>'nome', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_recursos_produtivos(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Roteiros produtivos
-- =========================================================================
create or replace function public.importar_roteiros_produtivos(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, item text, roteiro text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_row jsonb; v_idx int := 0;
  v_codigo text; v_nome text; v_item_id uuid; v_quantos int;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'roteiros_produtivos') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_chave := coalesce(v_codigo, '') || '|' || lower(coalesce(v_nome, ''));

      <<linha>>
      begin
        if v_codigo is null then raise exception 'Código do item é obrigatório.'; end if;
        if v_nome is null then raise exception 'Nome do roteiro é obrigatório.'; end if;

        select i.id into v_item_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_codigo;
        if v_item_id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo roteiro (item + nome) repetido em outra linha deste arquivo.';
        else
          select count(*) into v_quantos from public.roteiros_produtivos rt
          where rt.company_id = v_company_id and rt.item_id = v_item_id and lower(rt.nome) = lower(v_nome);

          if v_quantos > 1 then
            raise exception 'Já existem % roteiros com este nome para este item. Ajuste pela tela antes de importar.', v_quantos;
          elsif v_quantos = 1 then
            v_status := 'atualizacao';
          else
            perform public.criar_roteiro_produtivo(v_item_id, v_nome);
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'item', v_codigo, 'roteiro', v_nome,
        'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_roteiros'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_roteiros' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'roteiros_produtivos', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('producao.roteiros_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'item', r->>'roteiro', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_roteiros_produtivos(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Operações do roteiro
-- A unique é (roteiro_id, sequencia): a sequência identifica a operação
-- dentro do roteiro, então é ela que decide novo × já existe.
-- =========================================================================
create or replace function public.importar_roteiro_operacoes(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, roteiro text, operacao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_row jsonb; v_idx int := 0;
  v_cod_item text; v_nome_rot text; v_descricao text; v_cod_recurso text;
  v_sequencia int; v_tempo numeric;
  v_item_id uuid; v_roteiro_id uuid; v_recurso_id uuid;
  v_existente public.roteiro_operacoes;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'roteiro_operacoes') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_existente := null; v_recurso_id := null;
      v_cod_item := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_nome_rot := nullif(btrim(coalesce(v_row->>'nome_roteiro', '')), '');
      v_descricao := nullif(btrim(coalesce(v_row->>'descricao', '')), '');
      v_cod_recurso := nullif(btrim(coalesce(v_row->>'codigo_recurso', '')), '');
      v_sequencia := nullif(btrim(coalesce(v_row->>'sequencia', '')), '')::int;
      v_tempo := nullif(btrim(coalesce(v_row->>'tempo_previsto_minutos', '')), '')::numeric;
      v_chave := concat_ws('|', v_cod_item, lower(coalesce(v_nome_rot, '')), coalesce(v_sequencia::text, ''));

      <<linha>>
      begin
        if v_cod_item is null then raise exception 'Código do item é obrigatório.'; end if;
        if v_nome_rot is null then raise exception 'Nome do roteiro é obrigatório.'; end if;
        if v_sequencia is null then raise exception 'Sequência é obrigatória.'; end if;
        if v_descricao is null then raise exception 'Descrição da operação é obrigatória.'; end if;

        select i.id into v_item_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_cod_item;
        if v_item_id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        select rt.id into v_roteiro_id from public.roteiros_produtivos rt
        where rt.company_id = v_company_id and rt.item_id = v_item_id and lower(rt.nome) = lower(v_nome_rot);
        if v_roteiro_id is null then
          raise exception 'Roteiro "%" não existe para este item. Importe a aba de Roteiros primeiro.', v_nome_rot;
        end if;

        if v_cod_recurso is not null then
          select rp.id into v_recurso_id from public.recursos_produtivos rp
          where rp.company_id = v_company_id and rp.codigo = v_cod_recurso;
          if v_recurso_id is null then
            raise exception 'Recurso produtivo "%" não encontrado. Importe a aba de Recursos primeiro.', v_cod_recurso;
          end if;
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma sequência repetida para este roteiro em outra linha deste arquivo.';
        else
          select ro.* into v_existente from public.roteiro_operacoes ro
          where ro.company_id = v_company_id and ro.roteiro_id = v_roteiro_id and ro.sequencia = v_sequencia;

          if v_existente.id is not null then
            -- Não há função de edição de operação: a sequência já ocupada
            -- é reportada, não sobrescrita em silêncio.
            v_status := 'atualizacao';
          else
            perform public.adicionar_operacao_roteiro(
              v_roteiro_id, v_sequencia, v_descricao, v_recurso_id, v_tempo,
              nullif(btrim(coalesce(v_row->>'requisitos', '')), ''),
              nullif(btrim(coalesce(v_row->>'criterios_qualidade', '')), ''),
              null,
              nullif(btrim(coalesce(v_row->>'perfil', '')), ''),
              nullif(btrim(coalesce(v_row->>'ferramenta', '')), ''),
              nullif(btrim(coalesce(v_row->>'processo', '')), '')
            );
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx,
        'roteiro', concat_ws(' / ', v_cod_item, v_nome_rot), 'operacao', concat_ws(' - ', v_sequencia::text, v_descricao),
        'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_operacoes'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_operacoes' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'roteiro_operacoes', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('producao.operacoes_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'roteiro', r->>'operacao', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_roteiro_operacoes(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Estoque inicial
--
-- ajustar_saldo() recebe DELTA. A planilha dá o saldo ABSOLUTO do dia da
-- virada. Aplicar o valor direto faria a segunda importação do mesmo
-- arquivo dobrar o estoque, sem erro nenhum na tela — o tipo de defeito
-- que só aparece no inventário. Aqui a diferença é calculada; com o
-- arquivo já importado ela é zero e nada é movimentado.
-- =========================================================================
create or replace function public.importar_estoque_saldos(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, quantidade text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_row jsonb; v_idx int := 0;
  v_codigo text; v_desejado numeric; v_atual numeric; v_delta numeric;
  v_item_id uuid; v_tinha_saldo boolean;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'estoque_saldos') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_atual := 0; v_tinha_saldo := false;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_desejado := nullif(btrim(coalesce(v_row->>'quantidade_fisica', '')), '')::numeric;

      <<linha>>
      begin
        if v_codigo is null then raise exception 'Código do item é obrigatório.'; end if;
        if v_desejado is null then raise exception 'Quantidade física é obrigatória.'; end if;
        if v_desejado < 0 then raise exception 'Quantidade física não pode ser negativa.'; end if;

        select i.id into v_item_id from public.itens i
        where i.company_id = v_company_id and i.codigo = v_codigo;
        if v_item_id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código de item repetido em outra linha deste arquivo.';
        else
          select es.quantidade_fisica, true into v_atual, v_tinha_saldo
          from public.estoque_saldos es
          where es.company_id = v_company_id and es.item_id = v_item_id;
          v_atual := coalesce(v_atual, 0);

          v_delta := v_desejado - v_atual;
          if v_delta <> 0 then
            perform public.ajustar_saldo(v_item_id, v_delta, 'Carga inicial por importação');
          end if;

          v_status := case when coalesce(v_tinha_saldo, false) then 'atualizacao' else 'novo' end;
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'codigo', v_codigo,
        'quantidade', v_desejado::text, 'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_estoque'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_estoque' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'estoque_saldos', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('estoque.saldos_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'codigo', r->>'quantidade', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_estoque_saldos(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Peças dimensionais em estoque
--
-- Cada linha é uma peça física distinta (uma barra, uma chapa). Não existe
-- chave natural: duas barras de 6m do mesmo perfil são duas linhas
-- legítimas. Por isso o identificador, quando informado, é a única chave
-- possível — e sem ele toda linha é 'novo'. A planilha avisa disso.
-- =========================================================================
create or replace function public.importar_itens_pecas_dimensionais(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, codigo text, identificacao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_row jsonb; v_idx int := 0;
  v_codigo text; v_ident text; v_obs text;
  v_qtd_original numeric; v_qtd_disp numeric;
  v_item public.itens; v_peca_id uuid;
  v_existente public.itens_pecas_dimensionais;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'itens_pecas_dimensionais') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_item := null; v_existente := null;
      v_codigo := nullif(btrim(coalesce(v_row->>'codigo_item', '')), '');
      v_ident := nullif(btrim(coalesce(v_row->>'identificador', '')), '');
      v_obs := nullif(btrim(coalesce(v_row->>'observacao', '')), '');
      v_qtd_original := nullif(btrim(coalesce(v_row->>'quantidade_original', '')), '')::numeric;
      v_qtd_disp := nullif(btrim(coalesce(v_row->>'quantidade_disponivel', '')), '')::numeric;
      v_chave := coalesce(v_codigo, '') || '|' || coalesce(v_ident, '');

      <<linha>>
      begin
        if v_codigo is null then raise exception 'Código do item é obrigatório.'; end if;
        if v_qtd_original is null then raise exception 'Quantidade original é obrigatória.'; end if;
        if v_qtd_disp is not null and v_qtd_disp > v_qtd_original then
          raise exception 'Quantidade disponível (%) não pode ser maior que a original (%).', v_qtd_disp, v_qtd_original;
        end if;

        select i.* into v_item from public.itens i
        where i.company_id = v_company_id and i.codigo = v_codigo;
        if v_item.id is null then
          raise exception 'Item não encontrado com o código informado. Importe a aba de Itens primeiro.';
        end if;
        if v_item.dimensao_tipo is null then
          raise exception 'Item não tem controle dimensional. Importe a aba de Itens - Controle Dimensional primeiro.';
        end if;

        -- Sem identificador não há como distinguir duas peças iguais, e
        -- duas barras iguais são legítimas: a checagem de duplicidade só
        -- se aplica quando o identificador existe.
        if v_ident is not null and v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma identificação de peça repetida em outra linha deste arquivo.';
        else
          if v_ident is not null then
            select pd.* into v_existente from public.itens_pecas_dimensionais pd
            where pd.company_id = v_company_id and pd.item_id = v_item.id and pd.identificador = v_ident;
          end if;

          if v_existente.id is not null then
            -- Peça já registrada: consumo é operação de estoque, não de
            -- carga. Reimportar não mexe no saldo dela.
            v_status := 'atualizacao';
          else
            v_peca_id := public.registrar_peca_dimensional(v_item.id, v_qtd_original, v_ident, v_obs);
            -- A função registra a peça cheia. Quando a planilha diz que
            -- parte já foi usada, o consumo da diferença é aplicado pela
            -- função própria, que mantém a regra de sobra intacta.
            if v_qtd_disp is not null and v_qtd_disp < v_qtd_original then
              perform public.consumir_peca_dimensional(v_peca_id, v_qtd_original - v_qtd_disp,
                'Saldo já consumido na carga inicial');
            end if;
            v_status := 'novo';
          end if;

          if v_ident is not null then v_vistos := array_append(v_vistos, v_chave); end if;
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'codigo', v_codigo,
        'identificacao', coalesce(v_ident, '(sem identificação)'), 'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_pecas_dim'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_pecas_dim' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'itens_pecas_dimensionais', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('estoque.pecas_dimensionais_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'codigo', r->>'identificacao', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_itens_pecas_dimensionais(jsonb, boolean, text, uuid) to authenticated;
