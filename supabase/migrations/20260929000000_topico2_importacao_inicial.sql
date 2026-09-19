-- TÓPICO 2 — Importação inicial de dados (ADR-002 §4.2.1, TÓPICO 2 §28).
-- Decisão do responsável do produto em 2026-09-19: construir agora,
-- terceiro gap encontrado na varredura de fechamento de M1-M3 (junto de
-- T14 e ADR-007). Achado: nenhum código existia — nem tela, nem função
-- de upsert em massa — apesar de ADR-002 §4.2.1 colocar isso como parte
-- ATIVA do MVP (validação, identificação de inválidos/duplicados,
-- correção antes de efetivar, conferência, auditoria).
--
-- Recorte: só CSV nesta fase (§28 completo pede XLSX também — decisão
-- de escopo registrada aqui, não é omissão: qualquer planilha exporta
-- pra CSV, evita adicionar parsing binário agora; "arquitetura preparada
-- para outros formatos" do próprio §28 é satisfeita porque o parsing
-- fica isolado no Server Action, trocar o formato de entrada não muda
-- nada destas funções). Só Pessoas e Itens — "preços" do §4.2.1 não tem
-- campo em itens pra importar (preço vive em orçamento_itens, T10, por
-- pedido, não no cadastro) e "demais dados cadastrais" ficam pra quando
-- houver necessidade real comprovada, mesmo critério do §4.2.1: "não
-- fazem parte do MVP... migração irrestrita de todos os dados
-- existentes".
--
-- Desenho: reaproveita 100% da validação e da gravação que já existem
-- (upsert_pessoa()/upsert_item(), com todas as regras de negócio e o
-- registro de auditoria que já fazem) — nenhuma regra de negócio nova
-- foi inventada aqui, só o laço de repetição sobre várias linhas e a
-- decisão novo×atualização por documento/código.
--
-- Preview sem gravar (Arquivo → Leitura → Validação → Identificação de
-- erros → Correção → Pré-visualização → Confirmação → Gravação, §28):
-- p_dry_run=true roda a função inteira, chama upsert_pessoa()/
-- upsert_item() normalmente pra cada linha válida — MESMA lógica do
-- commit real, sem duplicar código de validação — e desfaz tudo no
-- final via ROLLBACK TO SAVEPOINT implícito de um bloco BEGIN/EXCEPTION
-- (as variáveis PL/pgSQL com o resultado por linha sobrevivem ao
-- rollback, só o efeito no banco é desfeito). Uma linha inválida nunca
-- derruba o lote inteiro: cada linha tem seu próprio savepoint aninhado
-- — "não gravar silenciosamente registros problemáticos" (§28) vira,
-- na gravação real (p_dry_run=false), pular só a linha ruim e reportar
-- o erro dela, gravando as demais.
--
-- "Campos alterados" (§28) reaproveita audit_changed_fields() — mesmo
-- helper que upsert_pessoa() já usa pro próprio log de auditoria.
--
-- Identificação de duplicado (ADR-002 §4.2.1: "evitar criação de
-- registros duplicados quando houver critérios confiáveis"): documento
-- (normalizado, só dígitos, mesma normalização de upsert_pessoa) pra
-- Pessoa; código pra Item — ambos já são UNIQUE por empresa no schema
-- (pessoas_company_documento_unique / itens_company_codigo_unique).
-- Duplicado DENTRO do próprio arquivo (duas linhas com o mesmo
-- documento/código) é um status à parte, nunca silenciosamente
-- sobrescrito linha a linha.

create or replace function public.importar_pessoas(p_linhas jsonb, p_dry_run boolean default true)
returns table (linha int, documento text, nome text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pessoas', 'manage');
  v_row jsonb;
  v_idx int := 0;
  v_documento text;
  v_existente public.pessoas;
  v_status text;
  v_erro text;
  v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb;
begin
  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null;
      v_documento := nullif(regexp_replace(coalesce(v_row->>'documento', ''), '\D', '', 'g'), '');

      <<linha>>
      begin
        if coalesce(btrim(v_row->>'nome'), '') = '' then
          raise exception 'Nome é obrigatório.';
        end if;
        if v_documento is null then
          raise exception 'Documento é obrigatório.';
        end if;
        if coalesce(v_row->>'tipo_documento', '') not in ('CPF', 'CNPJ') then
          raise exception 'tipo_documento deve ser CPF ou CNPJ.';
        end if;

        if v_documento = any(v_vistos) then
          -- Duplicado DENTRO do arquivo é status próprio (§28: "possíveis
          -- duplicados" é categoria distinta de "inválidos") — nunca
          -- gravado, nunca passa pelo catch-all genérico abaixo.
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Documento repetido em outra linha deste arquivo.';
        else
          select * into v_existente from public.pessoas
          where pessoas.company_id = v_company_id and pessoas.documento = v_documento;

          perform public.upsert_pessoa(
            case when v_existente.id is not null then v_existente.id else null end,
            v_row->>'tipo_documento', v_documento, btrim(v_row->>'nome'),
            nullif(v_row->>'nome_fantasia', ''), nullif(v_row->>'telefone', ''), nullif(v_row->>'email', ''),
            nullif(v_row->>'logradouro', ''), nullif(v_row->>'cidade', ''), nullif(v_row->>'uf', ''),
            nullif(v_row->>'cep', ''), 'ativo'
          );

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'tipo_documento', v_row->>'tipo_documento', 'documento', v_documento, 'nome', btrim(v_row->>'nome'),
              'nome_fantasia', nullif(v_row->>'nome_fantasia', ''), 'telefone', nullif(v_row->>'telefone', ''),
              'email', nullif(v_row->>'email', ''), 'logradouro', nullif(v_row->>'logradouro', ''),
              'cidade', nullif(v_row->>'cidade', ''), 'uf', nullif(v_row->>'uf', ''), 'cep', nullif(v_row->>'cep', '')
            ));
          else
            v_status := 'novo';
          end if;

          v_vistos := array_append(v_vistos, v_documento);
        end if;
      exception when others then
        v_status := 'invalido';
        v_erro := sqlerrm;
      end;

      v_resultados := v_resultados || jsonb_build_object(
        'linha', v_idx, 'documento', v_documento, 'nome', v_row->>'nome',
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados)
      );
    end loop;

    if p_dry_run then
      raise exception 'dry_run_rollback_marker_pessoas';
    end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_pessoas' then
      raise;
    end if;
  end;

  if not p_dry_run then
    perform public.log_activity('cadastros.pessoas_importadas', 'importacao', null,
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

grant execute on function public.importar_pessoas(jsonb, boolean) to authenticated;

create or replace function public.importar_itens(p_linhas jsonb, p_dry_run boolean default true)
returns table (linha int, codigo text, descricao text, status text, erro text, campos_alterados text[])
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
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb;
begin
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

        if v_codigo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Código repetido em outra linha deste arquivo.';
        else
          select * into v_existente from public.itens
          where itens.company_id = v_company_id and itens.codigo = v_codigo;

          perform public.upsert_item(
            case when v_existente.id is not null then v_existente.id else null end,
            v_codigo, btrim(v_row->>'descricao'), v_row->>'tipo',
            nullif(v_row->>'classificacao', ''), btrim(v_row->>'unidade_principal'), 'ativo'
          );

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'codigo', v_codigo, 'descricao', btrim(v_row->>'descricao'), 'tipo', v_row->>'tipo',
              'classificacao', nullif(v_row->>'classificacao', ''), 'unidade_principal', btrim(v_row->>'unidade_principal')
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

grant execute on function public.importar_itens(jsonb, boolean) to authenticated;
