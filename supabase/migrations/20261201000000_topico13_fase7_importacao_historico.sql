-- TÓPICO 13 — Integrações, Fase 7: histórico e reprocessamento de
-- importação (§29, decisão do responsável do produto em 28/09/2026).
--
-- Achado que definiu o recorte: importação NÃO era terreno virgem. A
-- migration 20260929000000_topico2_importacao_inicial.sql (TÓPICO 2 §28)
-- já entrega CSV, Pessoas/Itens, prévia via p_dry_run, validação linha a
-- linha, importação parcial por savepoint aninhado e detecção de
-- duplicado (inclusive duplicado dentro do próprio arquivo). Reconstruir
-- isso teria sido trabalho jogado fora. Do que o §29 pede, faltava só:
-- histórico, reprocessamento e mapeamento de colunas — este último é
-- inteiramente de UI/Server Action (o parsing decide com que chave cada
-- valor entra no jsonb), então não aparece aqui. XLSX fica para a Fase
-- 7b por exigir dependência nova no package.json, que obriga a outra
-- máquina do projeto a rodar npm install — passo que merece ser visível.
--
-- Por que uma tabela e não só o activity_log: as funções já chamam
-- log_activity() com os resultados desde 19/09, mas activity_logs é
-- trilha de auditoria — não é consultável por entidade, não guarda as
-- linhas que falharam e não serve de base para reprocessar. O §29 pede
-- "histórico" e "reprocessamento" como capacidades do usuário, não como
-- registro de auditoria. As duas coisas coexistem: o log continua sendo
-- escrito, sem alteração.
--
-- Dados pessoais (ADR-010, INVENTÁRIO DE DADOS PESSOAIS): linhas_com_erro
-- guarda o payload ORIGINAL apenas das linhas que falharam, porque é o
-- insumo do reprocessamento — para Pessoas isso inclui documento, nome,
-- telefone e e-mail. Linha que entrou com sucesso NÃO tem o payload
-- guardado aqui: o dado já vive em public.pessoas/public.itens, e
-- duplicá-lo seria retenção sem finalidade. O campo resultados guarda
-- documento/nome por linha para a conferência na tela — mesma exposição
-- que log_activity() já faz desde 19/09, não uma superfície nova.
--
-- Checklist de segurança (auditoria 14/09/2026, CLAUDE.md): RLS
-- habilitada com policy de SELECT por empresa E pela permissão do módulo
-- correspondente à entidade — nunca uma permissão nova e genérica de
-- "importação", que contornaria o controle por módulo já existente
-- (mesma lógica documentada em exportar_dados_csv(), regra 8). Escrita só
-- por função SECURITY DEFINER com search_path=public; nenhuma policy de
-- INSERT/UPDATE/DELETE, então nem o dono da empresa grava direto. Sem
-- grant a anon. Teste negativo em scripts/test-importacao.mjs.
--
-- ATENÇÃO à armadilha que já mordeu este projeto em 27/09
-- (20261105050000_fix_recurso_produtivo_custo_hora_localizacao.sql): ao
-- acrescentar parâmetro a uma função existente, "create or replace" com
-- assinatura diferente NÃO substitui — cria uma sobrecarga paralela, e a
-- função antiga continua sendo escolhida. Por isso o drop explícito da
-- assinatura antiga (jsonb, boolean) antes de recriar.

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  entidade text not null check (entidade in ('pessoas', 'itens')),
  arquivo_nome text,
  total_linhas int not null,
  novos int not null default 0,
  atualizados int not null default 0,
  invalidos int not null default 0,
  duplicados int not null default 0,
  resultados jsonb not null,
  linhas_com_erro jsonb not null default '[]'::jsonb,
  -- Preenchido quando esta importação é o reprocessamento de outra:
  -- liga a tentativa nova à original, para o histórico mostrar a corrente
  -- inteira em vez de N execuções soltas do mesmo arquivo.
  origem_importacao_id uuid references public.importacoes(id),
  -- not null é seguro: importar_* só chega a inserir depois de
  -- assert_tenant_write(), que já falha se não houver usuário autenticado
  -- com perfil e empresa.
  criado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.importacoes is
  'TÓPICO 13 §29, Fase 7 — histórico de importações. linhas_com_erro guarda o payload original SÓ das linhas que falharam (insumo do reprocessamento); linha importada com sucesso não tem payload duplicado aqui. Escrita exclusivamente por importar_pessoas()/importar_itens().';

create index importacoes_company_created_idx
  on public.importacoes (company_id, created_at desc);
create index importacoes_origem_idx
  on public.importacoes (origem_importacao_id)
  where origem_importacao_id is not null;

alter table public.importacoes enable row level security;

-- A permissão exigida é a do módulo da entidade importada, nunca uma
-- permissão genérica de importação: quem não pode ver Pessoas não vê o
-- histórico de importação de Pessoas (que carrega documento e nome).
create policy importacoes_select on public.importacoes for select
  using (
    company_id = (select public.current_company_id())
    and (
      (entidade = 'pessoas' and (select public.has_permission('pessoas', 'view')))
      or (entidade = 'itens' and (select public.has_permission('itens', 'view')))
    )
  );

grant select on public.importacoes to authenticated;

-- =========================================================================
-- Pessoas — mesma função de 20260929000000, acrescida do registro no
-- histórico. A lógica de validação, upsert, duplicidade e savepoint por
-- linha é a original, sem alteração de comportamento.
-- =========================================================================
drop function if exists public.importar_pessoas(jsonb, boolean);

create or replace function public.importar_pessoas(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
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
         and entidade = 'pessoas'
     ) then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

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

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1;
      end if;

      -- Só a linha que falhou tem o payload original guardado — é o que o
      -- reprocessamento precisa reenviar depois de corrigido.
      if v_status in ('invalido', 'duplicado_no_arquivo') then
        v_erros := v_erros || jsonb_build_array(v_row);
      end if;

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

  -- Fora do bloco acima de propósito: na prévia (p_dry_run) o bloco é
  -- desfeito por rollback, e nem o histórico nem o log devem sobreviver a
  -- uma execução que não gravou nada. As variáveis PL/pgSQL, essas sim,
  -- sobrevivem ao rollback — é o mesmo mecanismo em que v_resultados já
  -- se apoiava desde 19/09.
  if not p_dry_run then
    insert into public.importacoes (
      company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados,
      resultados, linhas_com_erro, origem_importacao_id, criado_por
    ) values (
      v_company_id, 'pessoas', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados,
      v_resultados, v_erros, p_origem_importacao_id, auth.uid()
    );

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

grant execute on function public.importar_pessoas(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Itens — mesma estrutura.
-- =========================================================================
drop function if exists public.importar_itens(jsonb, boolean);

create or replace function public.importar_itens(
  p_linhas jsonb,
  p_dry_run boolean default true,
  p_arquivo_nome text default null,
  p_origem_importacao_id uuid default null
)
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

grant execute on function public.importar_itens(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Reprocessamento: devolve o payload original das linhas que falharam,
-- para a tela reenviá-las pelo MESMO caminho de importação (com
-- p_origem_importacao_id preenchido). Deliberadamente não existe uma
-- função "reprocessar" que importe por conta própria — isso duplicaria a
-- validação e criaria um segundo caminho de gravação a manter em sincronia.
--
-- Exige a permissão de escrita do módulo, não só de leitura: quem vê o
-- histórico não necessariamente pode reimportar, e este retorno é o
-- insumo de uma gravação.
-- =========================================================================
create or replace function public.obter_linhas_com_erro(p_importacao_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_importacao public.importacoes;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select * into v_importacao from public.importacoes
  where id = p_importacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Importação não encontrada nesta empresa.';
  end if;

  -- assert_tenant_write() exige literal de recurso, então o ramo é
  -- explícito por entidade — a mesma escolha feita em exportar_dados_csv()
  -- para não criar uma permissão genérica que contorne o módulo.
  if v_importacao.entidade = 'pessoas' then
    perform public.assert_tenant_write('pessoas', 'manage');
  elsif v_importacao.entidade = 'itens' then
    perform public.assert_tenant_write('itens', 'manage');
  else
    raise exception 'Entidade de importação inválida: %', v_importacao.entidade;
  end if;

  return v_importacao.linhas_com_erro;
end;
$$;

grant execute on function public.obter_linhas_com_erro(uuid) to authenticated;
