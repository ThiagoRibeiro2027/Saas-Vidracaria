-- TÓPICO 13 §29, Fase 8a — fundação para importar todos os cadastros.
--
-- Decisão do responsável do produto em 29/09/2026: estender a importação
-- das 2 entidades atuais (Pessoas e Itens) para os demais cadastros que a
-- planilha de carga inicial cobre. Esta migration não importa nada nova
-- sozinha — ela abre o caminho e entrega Obras como prova de que o padrão
-- estende sem caso especial.
--
-- Levantamento que definiu o custo: das 24 abas da planilha, 22 já têm
-- função de gravação no banco (upsert_obra, criar_peca, upsert_funcionario,
-- ajustar_saldo, ...). O importador de cada entidade é o MESMO laço do
-- importar_pessoas sobre a função que já existe — nenhuma regra de negócio
-- nova, nenhuma validação duplicada, nenhum segundo caminho de gravação a
-- manter em sincronia. Ficam de fora: Unidades (única sem função — seria
-- funcionalidade nova, não importador) e Usuários (importar em massa cria
-- CREDENCIAL DE ACESSO; um erro de digitação vira gente com acesso
-- indevido, então exige decisão explícita, não uma planilha).
--
-- Segurança: cada importador herda integralmente o gate da função que
-- chama — quem não pode criar obra pela tela não cria por importação. O
-- mapa abaixo existe para que o histórico use exatamente o mesmo recurso
-- de permissão da gravação, em vez de repetir a regra em dois lugares e
-- deixar os dois divergirem com o tempo.

-- =========================================================================
-- 1. Mapa entidade -> recurso de permissão.
--    Fonte única, usada pelo histórico e por obter_linhas_com_erro.
-- =========================================================================
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
    when 'cutting_margin_settings'     then 'configuracoes'
    when 'measurement_rules'           then 'configuracoes'
    when 'calendario_feriados'         then 'configuracoes'
  end;
$$;
comment on function public.recurso_permissao_importacao(text) is
  'TÓPICO 13 §29 Fase 8a — recurso de permissão de cada entidade importável. Retorna null para entidade desconhecida, e quem chama trata isso como erro.';

-- =========================================================================
-- 2. O histórico passa a aceitar todas as entidades previstas.
--    O CHECK continua existindo (em vez de virar texto livre) porque ele é
--    a lista do que o sistema reconhece: entidade nova exige migration, e
--    isso é proposital.
-- =========================================================================
alter table public.importacoes drop constraint importacoes_entidade_check;
alter table public.importacoes add constraint importacoes_entidade_check
  check (public.recurso_permissao_importacao(entidade) is not null);

-- A policy de SELECT checava a permissão com ramo fixo por entidade. Agora
-- usa o mapa — sem isso, importação de Obras ficaria invisível no histórico
-- para todo mundo.
drop policy if exists importacoes_select on public.importacoes;
create policy importacoes_select on public.importacoes for select
  using (
    company_id = (select public.current_company_id())
    and (select public.has_permission(public.recurso_permissao_importacao(entidade), 'view'))
  );

-- =========================================================================
-- 3. obter_linhas_com_erro deixa de ter um ramo por entidade.
-- =========================================================================
create or replace function public.obter_linhas_com_erro(p_importacao_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_importacao public.importacoes;
  v_recurso text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select * into v_importacao from public.importacoes
  where id = p_importacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Importação não encontrada nesta empresa.';
  end if;

  v_recurso := public.recurso_permissao_importacao(v_importacao.entidade);
  if v_recurso is null then
    raise exception 'Entidade de importação inválida: %', v_importacao.entidade;
  end if;
  -- Permissão de ESCRITA, não de leitura: quem vê o histórico não
  -- necessariamente pode reimportar, e este retorno é insumo de gravação.
  perform public.assert_tenant_write(v_recurso, 'manage');

  return v_importacao.linhas_com_erro;
end;
$$;

grant execute on function public.recurso_permissao_importacao(text) to authenticated;
grant execute on function public.obter_linhas_com_erro(uuid) to authenticated;

-- =========================================================================
-- 4. Obras — primeiro importador do padrão novo.
--
--    Chave natural: documento do cliente (a planilha não tem como conhecer
--    o id interno). upsert_obra() já valida que a pessoa existe, tem papel
--    CLIENTE e pertence à empresa — nada disso é reimplementado aqui.
--
--    obras NÃO tem chave única por (cliente, nome). Então "já existe" é
--    resolvido por busca, e mais de uma obra com o mesmo nome para o mesmo
--    cliente é recusado com mensagem explícita, em vez de a importação
--    escolher uma das duas em silêncio.
-- =========================================================================
drop function if exists public.importar_obras(jsonb, boolean, text, uuid);

create or replace function public.importar_obras(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
returns table (linha int, documento text, nome text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('obras', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_documento text;
  v_nome text;
  v_pessoa_id uuid;
  v_existentes int;
  v_existente public.obras;
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
       select 1 from public.importacoes
       where id = p_origem_importacao_id and company_id = v_company_id and entidade = 'obras'
     ) then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_documento := nullif(regexp_replace(coalesce(v_row->>'documento_cliente', ''), '\D', '', 'g'), '');
      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_chave := coalesce(v_documento, '') || '|' || lower(coalesce(v_nome, ''));

      <<linha>>
      begin
        if v_documento is null then
          raise exception 'Documento do cliente é obrigatório.';
        end if;
        if v_nome is null then
          raise exception 'Nome da obra é obrigatório.';
        end if;

        select id into v_pessoa_id from public.pessoas
        where company_id = v_company_id and documento = v_documento;
        if v_pessoa_id is null then
          raise exception 'Cliente não encontrado com o documento informado. Importe a aba de Pessoas primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma obra (cliente + nome) repetida em outra linha deste arquivo.';
        else
          select count(*) into v_existentes from public.obras
          where company_id = v_company_id and pessoa_id = v_pessoa_id and lower(nome) = lower(v_nome);

          if v_existentes > 1 then
            raise exception 'Já existem % obras com este nome para este cliente. Ajuste pela tela antes de importar.', v_existentes;
          end if;

          if v_existentes = 1 then
            select * into v_existente from public.obras
            where company_id = v_company_id and pessoa_id = v_pessoa_id and lower(nome) = lower(v_nome);
          end if;

          perform public.upsert_obra(
            case when v_existente.id is not null then v_existente.id else null end,
            v_pessoa_id, v_nome,
            nullif(btrim(coalesce(v_row->>'logradouro', '')), ''),
            nullif(btrim(coalesce(v_row->>'cidade', '')), ''),
            nullif(btrim(coalesce(v_row->>'uf', '')), ''),
            nullif(btrim(coalesce(v_row->>'cep', '')), ''),
            'ativo'
          );

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'nome', v_nome,
              'logradouro', nullif(btrim(coalesce(v_row->>'logradouro', '')), ''),
              'cidade', nullif(btrim(coalesce(v_row->>'cidade', '')), ''),
              'uf', nullif(btrim(coalesce(v_row->>'uf', '')), ''),
              'cep', nullif(btrim(coalesce(v_row->>'cep', '')), '')
            ));
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
        'linha', v_idx, 'documento', v_documento, 'nome', v_nome,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados)
      );
    end loop;

    if p_dry_run then
      raise exception 'dry_run_rollback_marker_obras';
    end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_obras' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (
      company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados,
      resultados, linhas_com_erro, origem_importacao_id, criado_por
    ) values (
      v_company_id, 'obras', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados,
      v_resultados, v_erros, p_origem_importacao_id, auth.uid()
    );

    perform public.log_activity('cadastros.obras_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query
  select
    (r->>'linha')::int, r->>'documento', r->>'nome', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados'))
      else null
    end
  from jsonb_array_elements(v_resultados) r;
end;
$$;

grant execute on function public.importar_obras(jsonb, boolean, text, uuid) to authenticated;
