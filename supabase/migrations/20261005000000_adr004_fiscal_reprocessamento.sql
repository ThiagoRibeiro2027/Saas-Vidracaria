-- ADR-004 — Fiscal completo (ROTEIRO §5.2, aprovação explícita do
-- responsável do produto em 22/09/2026). A migration 20260916070000
-- cobriu a estrutura mínima do §9.2 (registro, tipo, vínculo opcional,
-- idempotência por chave de acesso, cancelamento interno, auditoria,
-- isolamento por tenant). Comparando com os critérios de aceite do
-- próprio ADR (§15), o único item claramente pendente era "existir
-- reprocessamento controlado" (§7-§8).
--
-- Decisão confirmada com o responsável do produto: construir o
-- placeholder ESTRUTURAL agora — sem nenhum provedor fiscal real sendo
-- chamado, porque §9.1/§9.3 são explícitos que nenhum processamento
-- fiscal real acontece neste piloto (nem emissão, nem transmissão, nem
-- integração de produção). O que este recorte adiciona é só o "estados e
-- resultados de processamento" que o §9.2 já pedia como parte do MVP:
-- uma linha por tentativa (§8: "tentativa de processamento... retorno
-- recebido... erro ou rejeição... reprocessamento... resultado final"),
-- e uma ação para solicitar um novo processamento quando o anterior
-- falhou (§7: "reprocessamento controlado de operações que tenham
-- falhado, mantendo o histórico das tentativas"). Quando uma integração
-- real existir, ela passa a chamar registrar_tentativa_processamento_
-- fiscal() no lugar de um operador fazer isso manualmente — a estrutura
-- não muda.
--
-- Fora do escopo, ainda (§9.3, inalterado): nenhuma chamada real a
-- SEFAZ/prefeitura/provedor. "resultado" de uma tentativa aqui é só o que
-- foi informado a este registro — não existe nenhum processo automático
-- gerando esse resultado neste recorte.

alter table public.documentos_fiscais
  add column status_processamento text not null default 'nao_processado'
    check (status_processamento in ('nao_processado', 'processado', 'com_erro'));
comment on column public.documentos_fiscais.status_processamento is
  'ADR-004 §9.2/§15 — estado do PROCESSAMENTO fiscal do documento (distinto de status, que é o ciclo de vida do REGISTRO). Some para com_erro/processado só via registrar_tentativa_processamento_fiscal(); volta a nao_processado via reprocessar_documento_fiscal(). Nenhuma função aqui chama um provedor real (§9.3).';

create table public.documento_fiscal_tentativas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  documento_fiscal_id uuid not null references public.documentos_fiscais(id) on delete cascade,
  numero_tentativa integer not null,
  resultado text not null check (resultado in ('sucesso', 'erro', 'rejeitado')),
  mensagem_retorno text,
  provedor text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint documento_fiscal_tentativas_unique unique (documento_fiscal_id, numero_tentativa)
);
comment on table public.documento_fiscal_tentativas is
  'ADR-004 §7-8 — histórico append-only de tentativas de processamento por documento fiscal. Sem UPDATE/DELETE (§8: "informações fiscais relevantes não deverão ser sobrescritas de maneira a eliminar o histórico operacional") — só INSERT via registrar_tentativa_processamento_fiscal().';
create index documento_fiscal_tentativas_documento_id_idx on public.documento_fiscal_tentativas (documento_fiscal_id);
create index documento_fiscal_tentativas_company_id_idx on public.documento_fiscal_tentativas (company_id);

-- Mesmo padrão de acesso de documentos_fiscais: dado fiscal/comercial,
-- não pessoal sensível — SELECT aberto a qualquer autenticado do tenant.
alter table public.documento_fiscal_tentativas enable row level security;
create policy documento_fiscal_tentativas_select on public.documento_fiscal_tentativas for select
  using (company_id = (select public.current_company_id()));

revoke all on public.documento_fiscal_tentativas from anon, authenticated;
grant select on public.documento_fiscal_tentativas to authenticated;

-- =========================================================================
-- registrar_tentativa_processamento_fiscal() — única via de escrita da
-- tabela de tentativas; atualiza documentos_fiscais.status_processamento
-- na mesma transação.
-- =========================================================================

create or replace function public.registrar_tentativa_processamento_fiscal(
  p_documento_id uuid,
  p_resultado text,
  p_mensagem_retorno text default null,
  p_provedor text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_status text;
  v_numero_tentativa integer;
  v_id uuid;
begin
  if p_resultado not in ('sucesso', 'erro', 'rejeitado') then
    raise exception 'Resultado inválido: "%".', p_resultado;
  end if;

  select status into v_status from public.documentos_fiscais
  where id = p_documento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento fiscal não encontrado nesta empresa.';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Documento fiscal cancelado não recebe tentativa de processamento.';
  end if;

  select coalesce(max(numero_tentativa), 0) + 1 into v_numero_tentativa
  from public.documento_fiscal_tentativas
  where documento_fiscal_id = p_documento_id;

  insert into public.documento_fiscal_tentativas (
    company_id, documento_fiscal_id, numero_tentativa, resultado, mensagem_retorno, provedor, created_by
  ) values (
    v_company_id, p_documento_id, v_numero_tentativa, p_resultado, p_mensagem_retorno, p_provedor, auth.uid()
  )
  returning id into v_id;

  update public.documentos_fiscais
  set status_processamento = case when p_resultado = 'sucesso' then 'processado' else 'com_erro' end
  where id = p_documento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'fiscal.tentativa_processamento_registrada', 'documento_fiscal', p_documento_id, p_mensagem_retorno,
    jsonb_build_object('numero_tentativa', v_numero_tentativa, 'resultado', p_resultado, 'provedor', p_provedor)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_tentativa_processamento_fiscal(uuid, text, text, text) to authenticated;

-- =========================================================================
-- reprocessar_documento_fiscal() — só documento com falha registrada
-- (§7: "reprocessamento controlado de operações que tenham falhado").
-- Não reprocessa nada de verdade (não existe provedor real, §9.3) — só
-- reabre o documento para receber uma nova tentativa.
-- =========================================================================

create or replace function public.reprocessar_documento_fiscal(p_documento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_status text;
  v_status_processamento text;
begin
  select status, status_processamento into v_status, v_status_processamento
  from public.documentos_fiscais
  where id = p_documento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento fiscal não encontrado nesta empresa.';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Documento fiscal cancelado não pode ser reprocessado.';
  end if;
  if v_status_processamento <> 'com_erro' then
    raise exception 'Só é possível solicitar reprocessamento de um documento com erro (status_processamento atual: %).', v_status_processamento;
  end if;

  update public.documentos_fiscais set status_processamento = 'nao_processado' where id = p_documento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'fiscal.documento_reprocessamento_solicitado', 'documento_fiscal', p_documento_id, null, null);

  return p_documento_id;
end;
$$;

grant execute on function public.reprocessar_documento_fiscal(uuid) to authenticated;
