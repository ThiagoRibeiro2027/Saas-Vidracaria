-- Melhorias do responsável do produto (12/10/2026, follow-up ao item 4):
-- `lista_corte`, `lista_corte_lote_fabril` e `verificar_tolerancia_perda` já
-- passaram a ler `itens.percentual_quebra` (migration
-- `20261012235145_percentual_quebra_no_item.sql`). Desde então, a tela
-- "Margem de quebra" de Configurações Gerais, a tabela
-- `cutting_margin_settings` e as funções que a cercam ficaram configurando
-- algo sem nenhum efeito em cálculo nenhum — decisão do responsável:
-- remover de vez, em vez de deixar uma tela morta no ar.
--
-- Removidos: `upsert_cutting_margin()`, `get_cutting_margin()`,
-- `importar_cutting_margin_settings()` e a tabela `cutting_margin_settings`
-- (cascade: a policy de SELECT e o trigger de updated_at vão junto). Dado
-- histórico em `cutting_margin_settings` não é migrado pra nenhum outro lugar
-- — já foi herdado por `itens.percentual_quebra` no backfill da migration
-- anterior; o que sobrava aqui era só configuração morta.
--
-- Fora do banco, removidos na mesma leva (commit): a aba "Margem de quebra"
-- em Configurações (`CuttingMarginsSection.tsx`, a entrada na tabela de
-- `page.tsx`), a entrada "cutting_margin_settings" do catálogo de
-- importação genérica (`importacao-entidades.ts`) e a referência em
-- `export/actions.ts` (exportação de dados da empresa). Os testes de
-- `test-configuracoes.mjs` (seções 1, 5 e 9) e `test-importacao.mjs` que
-- cobriam essa tabela foram removidos junto — não sobrou função pra testar.

drop function if exists public.upsert_cutting_margin(text, text, numeric, boolean);
drop function if exists public.get_cutting_margin(text, text);
drop function if exists public.importar_cutting_margin_settings(jsonb, boolean, text, uuid);
drop table if exists public.cutting_margin_settings cascade;

-- recurso_permissao_importacao() tinha um case pra essa entidade — corpo
-- idêntico, só sem essa linha, pra não deixar uma entidade morta no mapa.
create or replace function public.recurso_permissao_importacao(p_entidade text)
returns text
language sql immutable set search_path = public as $$
  select case p_entidade
    when 'pessoas'                     then 'pessoas'
    when 'pessoa_papeis'               then 'pessoas'
    when 'obras'                       then 'obras'
    when 'itens'                       then 'itens'
    when 'itens_dimensional'           then 'itens'
    when 'item_fornecedores'           then 'compras'
    when 'item_materiais_alternativos' then 'compras'
    when 'fornecedor_dados'            then 'compras'
    when 'politicas_abastecimento'     then 'compras'
    when 'pecas'                       then 'pecas'
    when 'peca_composicao'             then 'pecas'
    when 'peca_caracteristicas'        then 'pecas'
    when 'peca_regras'                 then 'pecas'
    when 'recursos_produtivos'         then 'producao'
    when 'roteiros_produtivos'         then 'producao'
    when 'roteiro_operacoes'           then 'producao'
    when 'estoque_saldos'              then 'estoque'
    when 'itens_pecas_dimensionais'    then 'estoque'
    when 'funcionarios'                then 'rh'
    when 'equipes_instalacao'          then 'instalacao'
    when 'contas_bancarias'            then 'financeiro'
    when 'measurement_rules'           then 'configuracoes'
    when 'calendario_feriados'         then 'configuracoes'
  end;
$$;

-- Melhorias 12/10/2026, item 4 (follow-up): a importação de itens também
-- passa a aceitar percentual_quebra, opcional, igual ao cadastro manual.
-- upsert_item() já tem o parâmetro desde a migration anterior.
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
            v_percentual_quebra
          );

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'codigo', v_codigo, 'descricao', btrim(v_row->>'descricao'), 'tipo', v_row->>'tipo',
              'classificacao', nullif(v_row->>'classificacao', ''), 'unidade_principal', btrim(v_row->>'unidade_principal'),
              'percentual_quebra', v_percentual_quebra
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
