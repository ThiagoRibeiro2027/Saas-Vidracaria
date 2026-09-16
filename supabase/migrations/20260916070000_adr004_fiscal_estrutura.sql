-- ADR-004 — Estratégia Fiscal, recorte mínimo do MVP (§9.2). PLANO DE
-- ENTREGA §6, M3: "Fiscal (ADR-004)".
--
-- ADR-004 §9.1 é taxativo pro piloto da JR Box: "o faturamento
-- permanecerá no sistema atualmente utilizado pela empresa... o SaaS não
-- será o sistema emissor de documentos fiscais reais durante o piloto...
-- não será necessário colocar em produção uma integração de emissão
-- fiscal real". §9.3 exclui explicitamente do piloto: emissão,
-- cancelamento, inutilização e transmissão fiscal REAL pelo SaaS.
--
-- Mas §9.2 pede — como parte do MVP, não adiado — que o sistema
-- "**mantenha** a estrutura necessária para que os processos
-- operacionais possam posteriormente receber integração fiscal":
-- estrutura de documentos fiscais; identificação do tipo; associação com
-- operações internas; armazenamento de informações fiscais; estados e
-- resultados de processamento; rastreabilidade; auditoria; preparação
-- para integração com provedor fiscal. Decisão confirmada com o
-- responsável do produto: construir esse placeholder estrutural agora
-- (mesmo sem nenhum documento fiscal real fluindo pelo sistema neste
-- piloto — nem emitido, nem recebido de fornecedor, já que T7 Suprimentos
-- não tem fluxo de recebimento), em vez de adiar como o T13 Integrações
-- (que concluiu "nada a fazer" e não gerou nenhuma migration).
--
-- Este é só REGISTRO/RASTREABILIDADE do documento em si — nunca emissão,
-- cancelamento fiscal real, inutilização ou transmissão (§9.3, fora do
-- piloto). "Cancelar" aqui é só uma correção interna do PRÓPRIO REGISTRO
-- (ex.: duplicidade, erro de digitação) — nunca um cancelamento fiscal
-- perante SEFAZ/prefeitura, que não existe neste recorte.
--
-- §5 (recepção independente de Pedido de Compra): o documento pode ficar
-- sem vínculo operacional, ser vinculado depois, ou ser vinculado a uma
-- necessidade de compra (T7) ou a "outra operação existente" — por isso
-- entity_type/entity_id são genéricos e sem FK, mesmo padrão já usado por
-- activity_logs/files (nenhuma entidade fixa é obrigatória).
-- §6 (recepção não é aprovação): não existe nenhum campo/status de
-- aprovação aqui — é fora do recorte, "poderá existir posteriormente".
-- §7 (idempotência): chave_acesso (quando existir — nem todo "outro" tipo
-- de documento tem) é única por empresa, mesmo padrão de
-- pessoas_company_documento_unique (índice único parcial).
-- §8 (auditoria): activity_logs em cada ação, mesmo padrão de T2-T17;
-- dados nunca são sobrescritos de forma destrutiva (updated_at existe,
-- mas o histórico de ações já fica preservado em activity_logs).
-- §9.2 "preparação para integração com provedor": campo `provedor` e
-- `dados` (jsonb livre) existem só como espaço reservado — nenhuma
-- função aqui chama um provedor real.

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tipo text not null check (tipo in ('nfe', 'nfse', 'outro')),
  numero text,
  chave_acesso text,
  provedor text,
  entity_type text,
  entity_id uuid,
  dados jsonb,
  status text not null default 'recebido' check (status in ('recebido', 'cancelado')),
  motivo_cancelamento text,
  observacoes text,
  registrado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.documentos_fiscais is
  'ADR-004 §9.2, recorte mínimo do MVP — só estrutura/registro/rastreabilidade do documento em si. Sem emissão, cancelamento fiscal real, inutilização ou transmissão (§9.3, fora do piloto da JR Box). "status=cancelado" é correção interna do registro, nunca um cancelamento fiscal real.';
create index documentos_fiscais_company_id_idx on public.documentos_fiscais (company_id);
create index documentos_fiscais_entity_idx on public.documentos_fiscais (company_id, entity_type, entity_id) where entity_id is not null;
-- Idempotência (§7) — mesmo documento (chave de acesso) não duplica por
-- reenvio. Só cobre quando chave_acesso existe (nem todo "outro" tipo tem).
create unique index documentos_fiscais_chave_acesso_unique on public.documentos_fiscais (company_id, chave_acesso) where chave_acesso is not null;

create trigger set_updated_at before update on public.documentos_fiscais
  for each row execute function public.set_updated_at();

-- SELECT aberto a qualquer autenticado da empresa — dado fiscal/comercial,
-- não pessoal sensível como T17 RH (que exigiu fiscal.view/rh.view na
-- própria policy); mesmo padrão geral de T2-T16.
alter table public.documentos_fiscais enable row level security;
create policy documentos_fiscais_select on public.documentos_fiscais for select
  using (company_id = (select public.current_company_id()));

grant select on public.documentos_fiscais to authenticated;

-- =========================================================================
-- registrar_documento_fiscal() — recepção independente de vínculo (§5).
-- =========================================================================

create or replace function public.registrar_documento_fiscal(
  p_tipo text,
  p_numero text default null,
  p_chave_acesso text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dados jsonb default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_id uuid;
begin
  if p_tipo not in ('nfe', 'nfse', 'outro') then
    raise exception 'Tipo de documento fiscal inválido: "%".', p_tipo;
  end if;
  if (p_entity_type is null) <> (p_entity_id is null) then
    raise exception 'Associação precisa informar tipo e id da operação juntos, ou nenhum dos dois.';
  end if;

  insert into public.documentos_fiscais (
    company_id, tipo, numero, chave_acesso, entity_type, entity_id, dados, observacoes, registrado_por
  ) values (
    v_company_id, p_tipo, p_numero, p_chave_acesso, p_entity_type, p_entity_id, p_dados, p_observacoes, auth.uid()
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'fiscal.documento_registrado', 'documento_fiscal', v_id, p_numero,
    jsonb_build_object('tipo', p_tipo, 'chave_acesso', p_chave_acesso, 'associado_a', p_entity_type)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_documento_fiscal(text, text, text, text, uuid, jsonb, text) to authenticated;

-- =========================================================================
-- vincular_documento_fiscal() — vínculo pode acontecer depois da recepção
-- (§5: "permanecer temporariamente sem vínculo... pendente para
-- posterior classificação").
-- =========================================================================

create or replace function public.vincular_documento_fiscal(p_id uuid, p_entity_type text, p_entity_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_status text;
begin
  if p_entity_type is null or p_entity_id is null then
    raise exception 'Informe o tipo e o id da operação a vincular.';
  end if;

  select status into v_status from public.documentos_fiscais
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento fiscal não encontrado nesta empresa.';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Documento fiscal cancelado não pode ser vinculado.';
  end if;

  update public.documentos_fiscais set entity_type = p_entity_type, entity_id = p_entity_id where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'fiscal.documento_vinculado', 'documento_fiscal', p_id, null, jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id));

  return p_id;
end;
$$;

grant execute on function public.vincular_documento_fiscal(uuid, text, uuid) to authenticated;

-- =========================================================================
-- cancelar_documento_fiscal() — correção INTERNA do registro (duplicidade,
-- erro de digitação). Nunca um cancelamento fiscal real (§9.3).
-- =========================================================================

create or replace function public.cancelar_documento_fiscal(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_status text;
begin
  select status into v_status from public.documentos_fiscais
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento fiscal não encontrado nesta empresa.';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Documento fiscal já cancelado.';
  end if;

  update public.documentos_fiscais set status = 'cancelado', motivo_cancelamento = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'fiscal.documento_cancelado', 'documento_fiscal', p_id, p_motivo, null);

  return p_id;
end;
$$;

grant execute on function public.cancelar_documento_fiscal(uuid, text) to authenticated;
