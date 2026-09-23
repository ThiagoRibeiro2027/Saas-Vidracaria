-- ADR-004 — Fiscal completo (ROTEIRO §5.2). O recorte mínimo
-- (20260916070000_adr004_fiscal_estrutura.sql) cobriu exatamente o §9.2
-- ("estrutura necessária... registro/rastreabilidade do documento em
-- si") e deixou documentado, no próprio comentário, o que faltava: "§6
-- (recepção não é aprovação): não existe nenhum campo/status de
-- aprovação aqui — é fora do recorte, 'poderá existir posteriormente'."
--
-- Esta migration fecha exatamente essa lacuna — e só essa. O restante da
-- ADR (§9.1/§9.3/§17) é explícito e definitivo: emissão fiscal real,
-- cancelamento fiscal real, inutilização, transmissão e qualquer operação
-- dependente de certificado digital do cliente permanecem fora de
-- qualquer piloto até nova definição de escopo por cliente — isso não
-- é código faltando, é decisão arquitetural que continua valendo. Não há
-- nada disso pra "completar" aqui.
--
-- O que o §15 (critérios de aceite) cobra e ainda não existia:
-- "recepção e aprovação forem processos distintos" + §9.2 "estados e
-- resultados de processamento" (que já estava na lista do que "permanece
-- dentro do MVP", não uma lista do que foi adiado).
--
-- Fluxo adicionado, só no nível do DOCUMENTO (§6: "podendo existir
-- posteriormente um fluxo de conferência, aprovação, rejeição,
-- pendência ou outra situação operacional" — não pede controle por item
-- nem comparação Pedido de Compra × NF-e × Recebimento; isso é
-- TÓPICO 13 §5.3-5.4, explicitamente adiado na Fase 1 de Integrações,
-- não duplicado aqui):
--
--   recebido → (iniciar_conferencia, opcional) → em_conferencia
--            → (avaliar) → aprovado | rejeitado | pendente
--   rejeitado/pendente → (reavaliar, §7 "reprocessamento controlado",
--     mantém tentativas anteriores no histórico via activity_logs) →
--     em_conferencia
--   qualquer status (exceto cancelado) → (cancelar, já existia) →
--     cancelado — continua sendo só correção interna do registro, nunca
--     um cancelamento fiscal real (§9.3, inalterado).
--
-- Reusa fiscal.manage pra tudo — a ADR não pede alçada/permissão
-- separada pra aprovação fiscal (diferente do TÓPICO 18, que tem
-- "aprovação por alçada" como conceito explícito e mesmo assim adiou).
--
-- Checklist de segurança (CLAUDE.md): SECURITY DEFINER com search_path
-- controlado, gate explícito fiscal.manage via assert_tenant_write(),
-- sem grant a PUBLIC/anon, isolamento por tenant já garantido pela RLS
-- existente da tabela (inalterada), auditoria em cada transição.

alter table public.documentos_fiscais
  add column decidido_por uuid references public.profiles(id),
  add column decidido_em timestamptz,
  add column motivo_decisao text;

alter table public.documentos_fiscais drop constraint documentos_fiscais_status_check;
alter table public.documentos_fiscais add constraint documentos_fiscais_status_check
  check (status in ('recebido', 'em_conferencia', 'aprovado', 'rejeitado', 'pendente', 'cancelado'));

comment on table public.documentos_fiscais is
  'ADR-004 §9.2 + §6 (avaliação, 20261007000000) — estrutura/registro/rastreabilidade do documento em si, com conferência/aprovação/rejeição/pendência no nível do documento. Sem emissão, cancelamento fiscal real, inutilização ou transmissão (§9.3, fora do piloto). "status=cancelado" é correção interna do registro, nunca um cancelamento fiscal real. Controle por item e comparação com Pedido de Compra ficam para o TÓPICO 13 §5.';

-- =========================================================================
-- iniciar_conferencia_documento_fiscal() — sinaliza que alguém está
-- avaliando agora, distinto da recepção (§6). Passo opcional: avaliar_
-- documento_fiscal() também aceita status='recebido' direto.
-- =========================================================================

create or replace function public.iniciar_conferencia_documento_fiscal(p_id uuid)
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
  if v_status <> 'recebido' then
    raise exception 'Só é possível iniciar conferência de documento recebido (status atual: %).', v_status;
  end if;

  update public.documentos_fiscais set status = 'em_conferencia' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'fiscal.documento_em_conferencia', 'documento_fiscal', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.iniciar_conferencia_documento_fiscal(uuid) to authenticated;

-- =========================================================================
-- avaliar_documento_fiscal() — decisão de conferência (§6). Aceita a
-- partir de 'recebido' (pula a conferência explícita) ou 'em_conferencia'.
-- =========================================================================

create or replace function public.avaliar_documento_fiscal(p_id uuid, p_decisao text, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('fiscal', 'manage');
  v_status text;
begin
  if p_decisao not in ('aprovado', 'rejeitado', 'pendente') then
    raise exception 'Decisão inválida: "%" (use aprovado, rejeitado ou pendente).', p_decisao;
  end if;

  select status into v_status from public.documentos_fiscais
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento fiscal não encontrado nesta empresa.';
  end if;
  if v_status not in ('recebido', 'em_conferencia') then
    raise exception 'Só é possível avaliar documento recebido ou em conferência (status atual: %).', v_status;
  end if;

  update public.documentos_fiscais
  set status = p_decisao, decidido_por = auth.uid(), decidido_em = now(), motivo_decisao = p_motivo
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'fiscal.documento_avaliado', 'documento_fiscal', p_id, p_motivo,
    jsonb_build_object('decisao', p_decisao)
  );

  return p_id;
end;
$$;

grant execute on function public.avaliar_documento_fiscal(uuid, text, text) to authenticated;

-- =========================================================================
-- reavaliar_documento_fiscal() — reprocessamento controlado (§7/§15):
-- reabre um documento rejeitado ou pendente pra nova conferência, sem
-- apagar a decisão/histórico anterior (fica preservado em activity_logs).
-- =========================================================================

create or replace function public.reavaliar_documento_fiscal(p_id uuid)
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
  if v_status not in ('rejeitado', 'pendente') then
    raise exception 'Só é possível reavaliar documento rejeitado ou pendente (status atual: %).', v_status;
  end if;

  update public.documentos_fiscais
  set status = 'em_conferencia', decidido_por = null, decidido_em = null, motivo_decisao = null
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'fiscal.documento_reavaliado', 'documento_fiscal', p_id, null, jsonb_build_object('status_anterior', v_status));

  return p_id;
end;
$$;

grant execute on function public.reavaliar_documento_fiscal(uuid) to authenticated;
