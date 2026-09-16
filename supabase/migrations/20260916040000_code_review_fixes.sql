-- Achados do code-review sobre os commits desta sessão (T16 completo, T7,
-- T11) — revisão pedida antes de seguir pra M3. Corrige:
--
--   1. sync_claim()/sync_operation_complete() (20260916010000) tinham
--      GRANT EXECUTE TO authenticated — são helpers internos, só chamados
--      de dentro de outra função SECURITY DEFINER (que já resolveu o
--      próprio has_permission/assert_tenant_write antes de chamá-los). O
--      grant os deixava invocáveis DIRETO via PostgREST por qualquer
--      autenticado do tenant, sem nenhum gate de permissão — sync_claim()
--      só valida company_id, e sync_operation_complete() grava um
--      result_id ARBITRÁRIO escolhido pelo chamador na linha de
--      sync_operations. Um retry legítimo futuro com o mesmo client_
--      operation_id (colisão improvável, mas o desenho não deveria
--      depender só disso) receberia esse resultado forjado sem nunca
--      executar a lógica real da operação. Revoga o grant — chamada
--      interna (owner de SECURITY DEFINER sempre pode executar suas
--      próprias funções, independente de GRANT, mesmo padrão já usado no
--      comentário de SEC-006/phase8_security_gate_p0) continua funcionando
--      normalmente; só a chamada direta via RPC é que fica fechada.
--   2. registrar_execucao_item_instalacao() e registrar_dano_instalacao()
--      liam instalacoes.status sem FOR UPDATE, ao contrário de toda outra
--      transição de status do módulo (concluir_instalacao, cancelar_
--      instalacao, etc.) — sob READ COMMITTED, duas transações quase
--      simultâneas (retry da fila offline torna isso realista, não só
--      teórico) podiam ler o status pré-commit de uma delas e aplicar uma
--      mudança de execução/dano depois que a instalação já tinha sido
--      concluída por outra. Mesmo espírito de lock já usado no resto do
--      arquivo. registrar_dano_instalacao() também não travava a leitura
--      de instalacao_itens.
--
-- Achados avaliados e descartados nesta rodada (não é regressão real):
--   - "instalacao.manage sozinho permite ver botões que instalacao.aceite
--     exigiria" (UI): servidor já rejeita via assert_tenant_write, sem
--     brecha de segurança — ver commit separado de UX se justificar.
--   - Cache de navegação do service worker sem escopo por usuário: nenhum
--     dado de negócio é embutido no HTML (CampoAgenda/CampoInstalacaoDetalhe
--     são client components, dado vem só de RPC->IndexedDB) — risco real
--     é IndexedDB não ser limpo no logout em dispositivo compartilhado,
--     que é um problema maior, fora do escopo de um fix pontual aqui.

-- REVOKE FROM authenticated sozinho não bastava (achado ao testar o fix):
-- toda função nova neste schema recebe um grant implícito a PUBLIC na
-- criação (confirmado via aclexplode(proacl) — grantee 0/PUBLIC aparece
-- até em criar_instalacao(), que nunca teve "grant ... to public" escrito
-- em lugar nenhum), mesmo depois do ALTER DEFAULT PRIVILEGES REVOKE do
-- Security Gate P0. Toda função de negócio sobrevive a isso porque se
-- autodefende (has_permission/current_company_id nulo por dentro) — mas
-- sync_claim()/sync_operation_complete() são as únicas sem checagem
-- própria, então dependiam inteiramente do GRANT para ficar fechadas.
-- Revoga de PUBLIC/anon/authenticated — mesmo padrão de 3 alvos do
-- Security Gate P0 — e não só de authenticated.
revoke execute on function public.sync_claim(text, uuid) from public, anon, authenticated;
revoke execute on function public.sync_operation_complete(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.registrar_execucao_item_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade_instalada numeric,
  p_client_operation_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_execucao_item_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select ii.* into v_item
  from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id for update;
  if v_instalacao_status <> 'em_execucao' then
    raise exception 'Só é possível registrar execução de instalação em execução (status atual: %).', v_instalacao_status;
  end if;
  if p_quantidade_instalada <= 0 then
    raise exception 'Quantidade instalada precisa ser maior que zero.';
  end if;
  if v_item.quantidade_instalada + p_quantidade_instalada > v_item.quantidade then
    raise exception 'Quantidade instalada (%) excederia a quantidade planejada (%).',
      v_item.quantidade_instalada + p_quantidade_instalada, v_item.quantidade;
  end if;

  update public.instalacao_itens
  set quantidade_instalada = quantidade_instalada + p_quantidade_instalada
  where id = p_instalacao_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'instalacao.execucao_registrada', 'instalacao_item', p_instalacao_item_id, null,
    jsonb_build_object('quantidade_instalada', p_quantidade_instalada)
  );

  perform public.sync_operation_complete('registrar_execucao_item_instalacao', p_client_operation_id, p_instalacao_item_id);
  return p_instalacao_item_id;
end;
$$;

grant execute on function public.registrar_execucao_item_instalacao(uuid, numeric, uuid) to authenticated;

create or replace function public.registrar_dano_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade numeric,
  p_causa text,
  p_descricao text default null,
  p_client_operation_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
  v_id uuid;
  v_claim record;
begin
  select * into v_claim from public.sync_claim('registrar_dano_instalacao', p_client_operation_id);
  if not v_claim.is_new then
    return v_claim.result_id;
  end if;

  select ii.* into v_item from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id for update;
  if v_instalacao_status not in ('em_execucao', 'concluida') then
    raise exception 'Só é possível registrar dano em instalação em execução ou concluída (status atual: %).', v_instalacao_status;
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;
  if p_causa not in ('fabricacao', 'transporte', 'instalacao', 'cliente', 'indeterminada') then
    raise exception 'Causa inválida: "%".', p_causa;
  end if;

  insert into public.danos_instalacao (company_id, instalacao_item_id, quantidade, causa, descricao, registrado_por)
  values (v_company_id, p_instalacao_item_id, p_quantidade, p_causa, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'instalacao.dano_registrado', 'instalacao_item', p_instalacao_item_id, p_descricao,
    jsonb_build_object('dano_id', v_id, 'quantidade', p_quantidade, 'causa', p_causa)
  );

  perform public.sync_operation_complete('registrar_dano_instalacao', p_client_operation_id, v_id);
  return v_id;
end;
$$;

grant execute on function public.registrar_dano_instalacao(uuid, numeric, text, text, uuid) to authenticated;
