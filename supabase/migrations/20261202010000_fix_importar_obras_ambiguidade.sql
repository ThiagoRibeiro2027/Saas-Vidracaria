-- Fix da Fase 8a (mesma sessão, 29/09/2026): importar_obras() recusava
-- TODA linha com 'column reference "documento" is ambiguous'.
--
-- Causa: a função declara `documento` e `nome` como colunas de saída no
-- RETURNS TABLE. Dentro do corpo, esses nomes colidem com as colunas de
-- public.pessoas e public.obras, e o PL/pgSQL não resolve a favor de
-- nenhum dos dois — ele aborta. O importar_pessoas de 20260929000000 já
-- convivia com isso e por isso qualifica tudo (`pessoas.documento = ...`);
-- ao escrever o de Obras eu não levei esse detalhe junto.
--
-- Só as consultas mudam — toda a lógica de classificação, duplicidade,
-- savepoint por linha e histórico é a mesma. O erro era invisível para
-- typecheck, lint e build: só aparece executando contra o banco.

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
       select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'obras'
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

        -- Qualificado: sem o prefixo, `documento` colide com a coluna de
        -- saída homônima desta função.
        select p.id into v_pessoa_id from public.pessoas p
        where p.company_id = v_company_id and p.documento = v_documento;
        if v_pessoa_id is null then
          raise exception 'Cliente não encontrado com o documento informado. Importe a aba de Pessoas primeiro.';
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma obra (cliente + nome) repetida em outra linha deste arquivo.';
        else
          select count(*) into v_existentes from public.obras o
          where o.company_id = v_company_id and o.pessoa_id = v_pessoa_id and lower(o.nome) = lower(v_nome);

          if v_existentes > 1 then
            raise exception 'Já existem % obras com este nome para este cliente. Ajuste pela tela antes de importar.', v_existentes;
          end if;

          if v_existentes = 1 then
            select o.* into v_existente from public.obras o
            where o.company_id = v_company_id and o.pessoa_id = v_pessoa_id and lower(o.nome) = lower(v_nome);
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
