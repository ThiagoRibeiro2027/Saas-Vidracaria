-- TÓPICO 13 §29, Fase 8f — últimos importadores: Funcionários, Equipes de
-- Instalação, Contas Bancárias, Margem de Quebra, Regra de Medição e
-- Feriados. Decisão do responsável do produto em 29/09/2026.
--
-- Fecha o conjunto das 22 entidades da planilha de carga inicial que têm
-- função de gravação no banco. Fora ficaram, com motivo registrado na
-- Fase 8a: Unidades (sem função — seria funcionalidade nova) e Usuários
-- (importar em massa cria credencial de acesso).
--
-- Duas tabelas desta fase NÃO têm chave única no banco — funcionarios e
-- contas_bancarias. Chave natural é escolhida aqui e documentada:
--   * Funcionário: a matrícula do usuário vinculado, quando informada;
--     senão o nome. Mais de um com o mesmo nome é recusado, em vez de a
--     importação escolher um deles (mesmo tratamento das Obras na 8a).
--   * Conta bancária: banco + agência + conta.
--
-- Todas as consultas qualificadas com alias.

-- =========================================================================
-- Funcionários
-- =========================================================================
create or replace function public.importar_funcionarios(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, nome text, cargo text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_row jsonb; v_idx int := 0;
  v_nome text; v_cargo text; v_funcao text; v_tel text; v_email text;
  v_situacao text; v_obs text; v_unidade text; v_matricula text;
  v_admissao date; v_unidade_id uuid; v_profile_id uuid; v_quantos int;
  v_existente public.funcionarios;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'funcionarios') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_unidade_id := null; v_profile_id := null;
      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_cargo := nullif(btrim(coalesce(v_row->>'cargo', '')), '');
      v_funcao := nullif(btrim(coalesce(v_row->>'funcao', '')), '');
      v_tel := nullif(btrim(coalesce(v_row->>'telefone', '')), '');
      v_email := nullif(btrim(coalesce(v_row->>'email', '')), '');
      v_obs := nullif(btrim(coalesce(v_row->>'observacoes', '')), '');
      v_unidade := nullif(btrim(coalesce(v_row->>'unidade', '')), '');
      v_matricula := nullif(btrim(coalesce(v_row->>'matricula_usuario', '')), '');
      v_situacao := coalesce(nullif(btrim(lower(coalesce(v_row->>'status', ''))), ''), 'ativo');
      v_admissao := nullif(btrim(coalesce(v_row->>'data_admissao', '')), '')::date;
      v_chave := coalesce(v_matricula, lower(coalesce(v_nome, '')));

      <<linha>>
      begin
        if v_nome is null then raise exception 'Nome do funcionário é obrigatório.'; end if;

        if v_unidade is not null then
          select cu.id into v_unidade_id from public.company_units cu
          where cu.company_id = v_company_id and lower(cu.name) = lower(v_unidade);
          if v_unidade_id is null then
            raise exception 'Unidade "%" não encontrada nesta empresa.', v_unidade;
          end if;
        end if;

        if v_matricula is not null then
          select pr.id into v_profile_id from public.profiles pr
          where pr.company_id = v_company_id and pr.login_identifier = v_matricula;
          if v_profile_id is null then
            raise exception 'Usuário com matrícula "%" não encontrado nesta empresa.', v_matricula;
          end if;
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo funcionário repetido em outra linha deste arquivo.';
        else
          -- Sem chave única no banco: a matrícula identifica quando existe;
          -- senão o nome, e nome ambíguo é recusado em vez de adivinhado.
          if v_profile_id is not null then
            select f.* into v_existente from public.funcionarios f
            where f.company_id = v_company_id and f.profile_id = v_profile_id;
          else
            select count(*) into v_quantos from public.funcionarios f
            where f.company_id = v_company_id and lower(f.nome) = lower(v_nome);
            if v_quantos > 1 then
              raise exception 'Já existem % funcionários com este nome. Informe a matrícula do usuário para identificar, ou ajuste pela tela de RH.', v_quantos;
            elsif v_quantos = 1 then
              select f.* into v_existente from public.funcionarios f
              where f.company_id = v_company_id and lower(f.nome) = lower(v_nome);
            end if;
          end if;

          perform public.upsert_funcionario(
            case when v_existente.id is not null then v_existente.id else null end,
            v_nome, v_cargo, v_funcao, v_unidade_id, v_admissao, v_tel, v_email,
            v_profile_id, v_situacao, v_obs);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'nome', v_nome, 'cargo', v_cargo, 'funcao', v_funcao, 'telefone', v_tel,
              'email', v_email, 'status', v_situacao));
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'nome', v_nome,
        'cargo', coalesce(v_cargo, '—'), 'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_funcionarios'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_funcionarios' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'funcionarios', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('rh.funcionarios_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'nome', r->>'cargo', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_funcionarios(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Equipes de instalação — uma linha por MEMBRO. A equipe é criada na
-- primeira linha que a menciona; as demais só acrescentam membros.
-- =========================================================================
create or replace function public.importar_equipes_instalacao(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, equipe text, membro text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_row jsonb; v_idx int := 0;
  v_nome_equipe text; v_matricula text;
  v_equipe_id uuid; v_profile_id uuid;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'equipes_instalacao') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_equipe_id := null; v_profile_id := null;
      v_nome_equipe := nullif(btrim(coalesce(v_row->>'nome_equipe', '')), '');
      v_matricula := nullif(btrim(coalesce(v_row->>'matricula_membro', '')), '');
      v_chave := lower(coalesce(v_nome_equipe, '')) || '|' || coalesce(v_matricula, '');

      <<linha>>
      begin
        if v_nome_equipe is null then raise exception 'Nome da equipe é obrigatório.'; end if;
        if v_matricula is null then raise exception 'Matrícula do membro é obrigatória.'; end if;

        select pr.id into v_profile_id from public.profiles pr
        where pr.company_id = v_company_id and pr.login_identifier = v_matricula;
        if v_profile_id is null then
          raise exception 'Usuário com matrícula "%" não encontrado nesta empresa.', v_matricula;
        end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo membro repetido na mesma equipe em outra linha deste arquivo.';
        else
          select ei.id into v_equipe_id from public.equipes_instalacao ei
          where ei.company_id = v_company_id and lower(ei.nome) = lower(v_nome_equipe);

          if v_equipe_id is null then
            v_equipe_id := public.criar_equipe_instalacao(v_nome_equipe);
          end if;

          if exists (select 1 from public.equipe_membros em
                     where em.equipe_id = v_equipe_id and em.profile_id = v_profile_id) then
            v_status := 'atualizacao';
          else
            perform public.adicionar_membro_equipe(v_equipe_id, v_profile_id);
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'equipe', v_nome_equipe,
        'membro', v_matricula, 'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_equipes'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_equipes' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'equipes_instalacao', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('instalacao.equipes_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'equipe', r->>'membro', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_equipes_instalacao(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Contas bancárias — sem chave única no banco; aqui é banco+agência+conta.
-- =========================================================================
create or replace function public.importar_contas_bancarias(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, banco text, conta text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_row jsonb; v_idx int := 0;
  v_banco text; v_agencia text; v_conta text; v_tipo text; v_pix text;
  v_existente public.contas_bancarias;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'contas_bancarias') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_banco := nullif(btrim(coalesce(v_row->>'banco', '')), '');
      v_agencia := nullif(btrim(coalesce(v_row->>'agencia', '')), '');
      v_conta := nullif(btrim(coalesce(v_row->>'conta', '')), '');
      v_tipo := nullif(btrim(lower(coalesce(v_row->>'tipo_conta', ''))), '');
      v_pix := nullif(btrim(coalesce(v_row->>'pix_chave', '')), '');
      v_chave := concat_ws('|', v_banco, v_agencia, v_conta);

      <<linha>>
      begin
        if v_banco is null then raise exception 'Banco é obrigatório.'; end if;
        if v_agencia is null then raise exception 'Agência é obrigatória.'; end if;
        if v_conta is null then raise exception 'Conta é obrigatória.'; end if;
        if v_tipo is null then raise exception 'Tipo de conta é obrigatório (corrente ou poupanca).'; end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma conta (banco + agência + conta) repetida em outra linha deste arquivo.';
        else
          select cb.* into v_existente from public.contas_bancarias cb
          where cb.company_id = v_company_id and cb.banco = v_banco
            and cb.agencia = v_agencia and cb.conta = v_conta;

          perform public.configurar_conta_bancaria(
            case when v_existente.id is not null then v_existente.id else null end,
            v_banco, v_agencia, v_conta, v_tipo, v_pix);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'tipo_conta', v_tipo, 'pix_chave', v_pix));
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'banco', v_banco,
        'conta', concat_ws(' / ', v_agencia, v_conta), 'status', v_status, 'erro', v_erro,
        'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_contas'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_contas' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'contas_bancarias', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('financeiro.contas_importadas', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'banco', r->>'conta', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_contas_bancarias(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Margem de quebra — unique (company, material_tipo, processo).
-- Processo vazio é um valor legítimo ("vale em qualquer processo"), não
-- ausência: por isso vira string vazia, não null.
-- =========================================================================
create or replace function public.importar_cutting_margin_settings(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, material text, processo text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_row jsonb; v_idx int := 0;
  v_material text; v_processo text; v_percentual numeric; v_ativo boolean;
  v_existente public.cutting_margin_settings;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[]; v_chave text;
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'cutting_margin_settings') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_material := nullif(btrim(coalesce(v_row->>'material_tipo', '')), '');
      v_processo := btrim(coalesce(v_row->>'processo', ''));
      v_percentual := nullif(btrim(coalesce(v_row->>'percentual', '')), '')::numeric;
      v_ativo := coalesce(lower(btrim(coalesce(v_row->>'ativo', ''))) not in ('nao', 'não', 'false', '0', 'n'), true);
      v_chave := coalesce(v_material, '') || '|' || v_processo;

      <<linha>>
      begin
        if v_material is null then raise exception 'Tipo de material é obrigatório.'; end if;
        if v_percentual is null then raise exception 'Percentual é obrigatório.'; end if;

        if v_chave = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma combinação de material e processo repetida em outra linha deste arquivo.';
        else
          select cm.* into v_existente from public.cutting_margin_settings cm
          where cm.company_id = v_company_id and cm.material_tipo = v_material and cm.processo = v_processo;

          perform public.upsert_cutting_margin(v_material, v_processo, v_percentual, v_ativo);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'percentual', v_percentual, 'ativo', v_ativo));
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

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'material', v_material,
        'processo', case when v_processo = '' then '(qualquer)' else v_processo end,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_margem'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_margem' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'cutting_margin_settings', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('configuracoes.margem_quebra_importada', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'material', r->>'processo', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_cutting_margin_settings(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Regra de medição
-- =========================================================================
create or replace function public.importar_measurement_rules(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, tipo text, exige text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_row jsonb; v_idx int := 0;
  v_tipo text; v_exige boolean; v_ativo boolean;
  v_existente public.measurement_rules;
  v_status text; v_erro text; v_alterados text[];
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'measurement_rules') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_alterados := null; v_existente := null;
      v_tipo := nullif(btrim(coalesce(v_row->>'tipo_item', '')), '');
      -- Aqui o vazio NÃO pode virar "sim": exigir medição confirmada trava
      -- produção, então só vale quando dito explicitamente.
      v_exige := lower(btrim(coalesce(v_row->>'exige_medicao_confirmada', ''))) in ('sim', 's', 'true', '1');
      v_ativo := coalesce(lower(btrim(coalesce(v_row->>'ativo', ''))) not in ('nao', 'não', 'false', '0', 'n'), true);

      <<linha>>
      begin
        if v_tipo is null then raise exception 'Tipo de item é obrigatório.'; end if;

        if v_tipo = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesmo tipo de item repetido em outra linha deste arquivo.';
        else
          select mr.* into v_existente from public.measurement_rules mr
          where mr.company_id = v_company_id and mr.tipo_item = v_tipo;

          perform public.upsert_measurement_rule(v_tipo, v_exige, v_ativo);

          if v_existente.id is not null then
            v_status := 'atualizacao';
            v_alterados := public.audit_changed_fields(to_jsonb(v_existente), jsonb_build_object(
              'exige_medicao_confirmada', v_exige, 'ativo', v_ativo));
          else
            v_status := 'novo';
          end if;
          v_vistos := array_append(v_vistos, v_tipo);
        end if;
      exception when others then
        v_status := 'invalido'; v_erro := sqlerrm;
      end;

      if v_status = 'novo' then v_novos := v_novos + 1;
      elsif v_status = 'atualizacao' then v_atualizados := v_atualizados + 1;
      elsif v_status = 'duplicado_no_arquivo' then v_duplicados := v_duplicados + 1;
      else v_invalidos := v_invalidos + 1; end if;
      if v_status in ('invalido', 'duplicado_no_arquivo') then v_erros := v_erros || jsonb_build_array(v_row); end if;

      v_resultados := v_resultados || jsonb_build_object('linha', v_idx, 'tipo', v_tipo,
        'exige', case when v_exige then 'sim' else 'não' end,
        'status', v_status, 'erro', v_erro, 'campos_alterados', to_jsonb(v_alterados));
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_medicao'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_medicao' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'measurement_rules', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('configuracoes.regra_medicao_importada', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'tipo', r->>'exige', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_measurement_rules(jsonb, boolean, text, uuid) to authenticated;

-- =========================================================================
-- Feriados
-- =========================================================================
create or replace function public.importar_calendario_feriados(
  p_linhas jsonb, p_dry_run boolean default true,
  p_arquivo_nome text default null, p_origem_importacao_id uuid default null
)
returns table (linha int, data_feriado text, descricao text, status text, erro text, campos_alterados text[])
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_row jsonb; v_idx int := 0;
  v_data date; v_descricao text;
  v_existente public.calendario_feriados;
  v_status text; v_erro text;
  v_vistos text[] := array[]::text[];
  v_resultados jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb;
  v_novos int := 0; v_atualizados int := 0; v_invalidos int := 0; v_duplicados int := 0;
begin
  if p_origem_importacao_id is not null
     and not exists (select 1 from public.importacoes i
       where i.id = p_origem_importacao_id and i.company_id = v_company_id and i.entidade = 'calendario_feriados') then
    raise exception 'Importação de origem não encontrada nesta empresa.';
  end if;

  <<lote>>
  begin
    for v_row in select * from jsonb_array_elements(p_linhas)
    loop
      v_idx := v_idx + 1;
      v_status := null; v_erro := null; v_existente := null; v_data := null;
      v_descricao := nullif(btrim(coalesce(v_row->>'descricao', '')), '');

      <<linha>>
      begin
        if nullif(btrim(coalesce(v_row->>'data', '')), '') is null then
          raise exception 'Data é obrigatória.';
        end if;
        -- Conversão explícita para dar mensagem útil em vez do erro cru do
        -- Postgres quando a planilha traz 31/02 ou texto.
        begin
          v_data := (btrim(v_row->>'data'))::date;
        exception when others then
          raise exception 'Data inválida: "%". Use o formato AAAA-MM-DD.', btrim(v_row->>'data');
        end;

        if v_data::text = any(v_vistos) then
          v_status := 'duplicado_no_arquivo';
          v_erro := 'Mesma data repetida em outra linha deste arquivo.';
        else
          select cf.* into v_existente from public.calendario_feriados cf
          where cf.company_id = v_company_id and cf.data = v_data;

          perform public.upsert_feriado(v_data, v_descricao);

          v_status := case when v_existente.id is not null then 'atualizacao' else 'novo' end;
          v_vistos := array_append(v_vistos, v_data::text);
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
        'data_feriado', coalesce(v_data::text, btrim(coalesce(v_row->>'data', ''))),
        'descricao', coalesce(v_descricao, '—'), 'status', v_status, 'erro', v_erro);
    end loop;
    if p_dry_run then raise exception 'dry_run_rollback_marker_feriados'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback_marker_feriados' then raise; end if;
  end;

  if not p_dry_run then
    insert into public.importacoes (company_id, entidade, arquivo_nome, total_linhas,
      novos, atualizados, invalidos, duplicados, resultados, linhas_com_erro, origem_importacao_id, criado_por)
    values (v_company_id, 'calendario_feriados', nullif(btrim(coalesce(p_arquivo_nome, '')), ''), v_idx,
      v_novos, v_atualizados, v_invalidos, v_duplicados, v_resultados, v_erros, p_origem_importacao_id, auth.uid());
    perform public.log_activity('configuracoes.feriados_importados', 'importacao', null,
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('resultados', v_resultados));
  end if;

  return query select (r->>'linha')::int, r->>'data_feriado', r->>'descricao', r->>'status', r->>'erro', null::text[]
  from jsonb_array_elements(v_resultados) r;
end;
$$;
grant execute on function public.importar_calendario_feriados(jsonb, boolean, text, uuid) to authenticated;
