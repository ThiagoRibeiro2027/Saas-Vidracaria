-- Auditoria TR Systems (12/10/2026) — achado 9 (LGPD): a trilha de auditoria
-- (activity_logs, imutável por trigger) recebia dado pessoal em texto livre —
-- nome em `description`, e-mail em `metadata`, a ficha inteira do funcionário
-- em `metadata.before`, resultado linha-a-linha de importação com nome e
-- CPF/CNPJ. Como o log é imutável e o titular pode pedir eliminação (ADR-010 §6),
-- cada dado pessoal gravado ali vira dado que não dá para apagar nem anonimizar
-- por procedimento normal.
--
-- DECISÃO DO RESPONSÁVEL (12/10/2026): parar de gravar dado pessoal nos logs
-- NOVOS. O log registra QUEM fez O QUÊ em QUAL entidade (action, entity_id,
-- user_id) e os nomes dos campos alterados — o nome/documento/e-mail se
-- recupera pelo entity_id enquanto o cadastro existir, e é anonimizado junto
-- com ele (anonimizar_pessoa). Sem rotina de limpeza do histórico já gravado
-- (decisão explícita): os logs antigos continuam como estão.
--
-- Funções redefinidas (corpo idêntico ao vigente, exceto a chamada de auditoria):
--   upsert_pessoa, upsert_obra         description deixa de ser o nome;
--   upsert_funcionario                 description nula; metadata sem a ficha
--                                      (before) — fica status anterior/novo;
--   criar_perfil_usuario               description deixa de ser o display_name;
--   registrar_aceite_instalacao        description deixa de ser o nome de quem aceitou
--                                      (o nome continua em instalacoes.aceite_nome_cliente);
--   marcar_proposta_enviada            metadata sem o e-mail do destinatário
--                                      (continua em propostas.destinatario);
--   importar_pessoas/obras/funcionarios/pessoa_papeis/fornecedor_dados
--                                      log com contagem de linhas, sem o resultado
--                                      por linha (o detalhe continua na tabela de
--                                      importação, que é dado do tenant e anonimizável).
-- Assinaturas inalteradas: grants e guardas existentes se mantêm.

CREATE OR REPLACE FUNCTION public.upsert_pessoa(p_id uuid, p_tipo_documento text, p_documento text, p_nome text, p_nome_fantasia text, p_telefone text, p_email text, p_logradouro text, p_cidade text, p_uf text, p_cep text, p_situacao text DEFAULT 'ativo'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pessoas;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo', 'bloqueado') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;

  if p_documento is not null then
    p_documento := nullif(regexp_replace(p_documento, '\D', '', 'g'), '');
  end if;

  if p_id is not null then
    select * into v_before from public.pessoas
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Pessoa não encontrada nesta empresa.';
    end if;

    update public.pessoas set
      tipo_documento = p_tipo_documento, documento = p_documento, nome = p_nome,
      nome_fantasia = p_nome_fantasia, telefone = p_telefone, email = p_email,
      logradouro = p_logradouro, cidade = p_cidade, uf = p_uf, cep = p_cep,
      situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.pessoas (
      company_id, tipo_documento, documento, nome, nome_fantasia, telefone,
      email, logradouro, cidade, uf, cep, situacao
    ) values (
      v_company_id, p_tipo_documento, p_documento, p_nome, p_nome_fantasia, p_telefone,
      p_email, p_logradouro, p_cidade, p_uf, p_cep, p_situacao
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.pessoa_upserted', 'pessoa', v_id, null,
    jsonb_build_object(
      'changed', public.audit_changed_fields(
        case when v_before.id is null then null else to_jsonb(v_before) end,
        jsonb_build_object(
          'tipo_documento', p_tipo_documento, 'documento', p_documento, 'nome', p_nome,
          'nome_fantasia', p_nome_fantasia, 'telefone', p_telefone, 'email', p_email,
          'logradouro', p_logradouro, 'cidade', p_cidade, 'uf', p_uf, 'cep', p_cep,
          'situacao', p_situacao
        )
      )
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_obra(p_id uuid, p_pessoa_id uuid, p_nome text, p_logradouro text, p_cidade text, p_uf text, p_cep text, p_situacao text DEFAULT 'ativo'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.obras;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('obras', 'manage') then
    raise exception 'Sem permissão para gerenciar obras (obras.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da obra é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'CLIENTE' and pp.ativo
  ) then
    raise exception 'A pessoa vinculada à obra precisa ter o papel CLIENTE ativo.';
  end if;

  if p_id is not null then
    select * into v_before from public.obras
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Obra não encontrada nesta empresa.';
    end if;

    update public.obras set
      pessoa_id = p_pessoa_id, nome = p_nome, logradouro = p_logradouro,
      cidade = p_cidade, uf = p_uf, cep = p_cep, situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.obras (company_id, pessoa_id, nome, logradouro, cidade, uf, cep, situacao)
    values (v_company_id, p_pessoa_id, p_nome, p_logradouro, p_cidade, p_uf, p_cep, p_situacao)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.obra_upserted', 'obra', v_id, null,
    jsonb_build_object(
      'changed', public.audit_changed_fields(
        case when v_before.id is null then null else to_jsonb(v_before) end,
        jsonb_build_object(
          'pessoa_id', p_pessoa_id, 'nome', p_nome, 'logradouro', p_logradouro,
          'cidade', p_cidade, 'uf', p_uf, 'cep', p_cep, 'situacao', p_situacao
        )
      )
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_funcionario(p_id uuid, p_nome text, p_cargo text DEFAULT NULL::text, p_funcao text DEFAULT NULL::text, p_unidade_id uuid DEFAULT NULL::uuid, p_data_admissao date DEFAULT NULL::date, p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_profile_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'ativo'::text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_before public.funcionarios;
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_status not in ('ativo', 'afastado') then
    raise exception 'Status inválido para upsert: "%" (desligamento usa desligar_funcionario()).', p_status;
  end if;
  if p_unidade_id is not null and not exists (select 1 from public.company_units where id = p_unidade_id and company_id = v_company_id) then
    raise exception 'Unidade não encontrada nesta empresa.';
  end if;
  if p_profile_id is not null and not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.funcionarios
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Funcionário não encontrado nesta empresa.';
    end if;
    if v_before.status = 'desligado' then
      raise exception 'Funcionário desligado não pode ser editado por aqui.';
    end if;

    update public.funcionarios set
      unidade_id = p_unidade_id, profile_id = p_profile_id, nome = p_nome, cargo = p_cargo, funcao = p_funcao,
      telefone = p_telefone, email = p_email, data_admissao = p_data_admissao, status = p_status,
      observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
  else
    insert into public.funcionarios (
      company_id, unidade_id, profile_id, nome, cargo, funcao, telefone, email, data_admissao, status, observacoes
    ) values (
      v_company_id, p_unidade_id, p_profile_id, p_nome, p_cargo, p_funcao, p_telefone, p_email, p_data_admissao,
      p_status, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'rh.funcionario_admitido' else 'rh.funcionario_atualizado' end,
    'funcionario', v_id, null,
    jsonb_build_object('status_anterior', v_before.status, 'status', p_status, 'profile_id', p_profile_id)
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.criar_perfil_usuario(p_auth_user_id uuid, p_login_identifier text, p_display_name text, p_contact_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
  v_max_users integer;
  v_active_count integer;
begin
  if btrim(coalesce(p_login_identifier, '')) = '' then
    raise exception 'Matrícula/identificador de login não pode ser vazio.';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Nome não pode ser vazio.';
  end if;

  select pl.max_users into v_max_users
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  where s.company_id = v_company_id;

  if v_max_users is not null then
    select count(*) into v_active_count from public.profiles where company_id = v_company_id and active;
    if v_active_count >= v_max_users then
      raise exception 'Limite de usuários do plano atingido (%/% usuários ativos). Desative um usuário ou faça upgrade de plano.', v_active_count, v_max_users;
    end if;
  end if;

  insert into public.profiles (id, company_id, login_identifier, display_name, contact_email, must_change_password)
  values (p_auth_user_id, v_company_id, btrim(p_login_identifier), btrim(p_display_name), p_contact_email, true);

  perform public.log_activity('users.usuario_criado', 'profile', p_auth_user_id, null, null);

  return p_auth_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_aceite_instalacao(p_instalacao_id uuid, p_nome_cliente text, p_client_operation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'aceite');
  v_instalacao public.instalacoes;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_aceite_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'concluida' then
    raise exception 'Só é possível registrar aceite de instalação concluída (status atual: %).', v_instalacao.status;
  end if;
  if p_nome_cliente is null or btrim(p_nome_cliente) = '' then
    raise exception 'Nome de quem aceitou é obrigatório.';
  end if;

  update public.instalacoes
  set status = 'aceita', aceite_por = auth.uid(), aceite_nome_cliente = p_nome_cliente, aceite_em = now()
  where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.aceite_registrado', 'instalacao', p_instalacao_id, null, null);

  perform public.sync_operation_complete('registrar_aceite_instalacao', p_client_operation_id, p_instalacao_id);
  return p_instalacao_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_proposta_enviada(p_id uuid, p_canal text, p_destinatario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível enviar proposta em rascunho (status atual: %).', v_before.status;
  end if;

  update public.propostas set
    status = 'enviada', enviada_em = now(), enviada_por = auth.uid(),
    canal = p_canal, destinatario = p_destinatario
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_enviada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('canal', p_canal)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_pessoas(p_linhas jsonb, p_dry_run boolean DEFAULT true, p_arquivo_nome text DEFAULT NULL::text, p_origem_importacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(linha integer, documento text, nome text, status text, erro text, campos_alterados text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('linhas_processadas', v_idx));
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
$function$;

CREATE OR REPLACE FUNCTION public.importar_obras(p_linhas jsonb, p_dry_run boolean DEFAULT true, p_arquivo_nome text DEFAULT NULL::text, p_origem_importacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(linha integer, documento text, nome text, status text, erro text, campos_alterados text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('linhas_processadas', v_idx));
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
$function$;

CREATE OR REPLACE FUNCTION public.importar_funcionarios(p_linhas jsonb, p_dry_run boolean DEFAULT true, p_arquivo_nome text DEFAULT NULL::text, p_origem_importacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(linha integer, nome text, cargo text, status text, erro text, campos_alterados text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('linhas_processadas', v_idx));
  end if;

  return query select (r->>'linha')::int, r->>'nome', r->>'cargo', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_pessoa_papeis(p_linhas jsonb, p_dry_run boolean DEFAULT true, p_arquivo_nome text DEFAULT NULL::text, p_origem_importacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(linha integer, documento text, papel text, status text, erro text, campos_alterados text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          -- Sem company_id aqui: a tabela não tem a coluna, e a pessoa
          -- acima já veio filtrada pela empresa.
          select pp.* into v_existente from public.pessoa_papeis pp
          where pp.pessoa_id = v_pessoa_id and pp.papel = v_papel;

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
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('linhas_processadas', v_idx));
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
$function$;

CREATE OR REPLACE FUNCTION public.importar_fornecedor_dados(p_linhas jsonb, p_dry_run boolean DEFAULT true, p_arquivo_nome text DEFAULT NULL::text, p_origem_importacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(linha integer, documento text, banco text, status text, erro text, campos_alterados text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      format('%s linha(s) processada(s)', v_idx), jsonb_build_object('linhas_processadas', v_idx));
  end if;

  return query select (r->>'linha')::int, r->>'documento', r->>'banco', r->>'status', r->>'erro',
    case when jsonb_typeof(r->'campos_alterados') = 'array'
      then array(select jsonb_array_elements_text(r->'campos_alterados')) else null end
  from jsonb_array_elements(v_resultados) r;
end;
$function$;
