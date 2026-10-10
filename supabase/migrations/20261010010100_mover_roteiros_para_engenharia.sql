-- Roteiros produtivos muda de lugar no menu (Produção → Engenharia, pedido
-- do responsável do produto em 10/10/2026). A leitura (SELECT) de
-- roteiros_produtivos/roteiro_operacoes já é liberada a qualquer
-- autenticado da empresa (RLS só verifica company_id, sem checagem de
-- recurso) — só as 4 funções de ESCRITA checavam o recurso 'producao'
-- dentro do banco (SECURITY DEFINER), independente do que a tela checa.
-- Sem essa migration, mudar só o frontend pra 'engenharia' deixaria um
-- usuário com permissão de Engenharia mas sem a de Produção ver a aba e
-- levar erro de permissão do banco ao tentar salvar. Corpo das funções
-- idêntico ao de 20260925000000_topico4_permissoes_granulares.sql — só
-- o recurso checado por assert_tenant_write_any muda, de 'producao' para
-- 'engenharia' (mesmas actions 'configurar'/'manage').

CREATE OR REPLACE FUNCTION public.desativar_roteiro(p_roteiro_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('engenharia', array['configurar', 'manage']);
begin
  update public.roteiros_produtivos set ativo = false
  where id = p_roteiro_id and company_id = v_company_id;
  if not found then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.roteiro_desativado', 'roteiro_produtivo', p_roteiro_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_roteiro_produtivo(p_item_id uuid, p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('engenharia', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do roteiro é obrigatório.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  -- Só pode haver 1 roteiro ativo por item (roteiros_produtivos_ativo_
  -- unique) — desativa o anterior antes de criar o novo, mesmo padrão de
  -- liberar_engenharia() rebaixando a versão vigente antes de inserir.
  update public.roteiros_produtivos set ativo = false
  where item_id = p_item_id and company_id = v_company_id and ativo;

  insert into public.roteiros_produtivos (company_id, item_id, nome)
  values (v_company_id, p_item_id, btrim(p_nome))
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.roteiro_criado', 'roteiro_produtivo', v_id, p_nome,
    jsonb_build_object('item_id', p_item_id)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.remover_operacao_roteiro(p_roteiro_operacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('engenharia', array['configurar', 'manage']);
begin
  delete from public.roteiro_operacoes
  where id = p_roteiro_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de roteiro não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.operacao_roteiro_removida', 'roteiro_operacao', p_roteiro_operacao_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.adicionar_operacao_roteiro(p_roteiro_id uuid, p_sequencia integer, p_descricao text, p_recurso_produtivo_id uuid DEFAULT NULL::uuid, p_tempo_previsto_minutos numeric DEFAULT NULL::numeric, p_requisitos text DEFAULT NULL::text, p_criterios_qualidade text DEFAULT NULL::text, p_equipamentos_alternativos text DEFAULT NULL::text, p_perfil text DEFAULT NULL::text, p_ferramenta text DEFAULT NULL::text, p_processo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('engenharia', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da operação é obrigatória.';
  end if;
  if p_sequencia is null or p_sequencia <= 0 then
    raise exception 'Sequência deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.roteiros_produtivos where id = p_roteiro_id and company_id = v_company_id) then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;
  if p_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.roteiro_operacoes (
    company_id, roteiro_id, sequencia, descricao, recurso_produtivo_id,
    tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos,
    perfil, ferramenta, processo
  ) values (
    v_company_id, p_roteiro_id, p_sequencia, btrim(p_descricao), p_recurso_produtivo_id,
    p_tempo_previsto_minutos, p_requisitos, p_criterios_qualidade, p_equipamentos_alternativos,
    p_perfil, p_ferramenta, p_processo
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_roteiro_adicionada', 'roteiro_produtivo', p_roteiro_id, p_descricao,
    jsonb_build_object('roteiro_operacao_id', v_id, 'sequencia', p_sequencia)
  );

  return v_id;
end;
$function$
;
