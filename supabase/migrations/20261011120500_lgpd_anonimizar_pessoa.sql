-- Fecha o gap de LGPD achado na auditoria de gaps ADR-001 a ADR-012
-- (11/10/2026): o único caminho de anonimização hoje (anonymize_
-- activity_logs_for_user(), 20260913090000_adr010_profile_anonymization)
-- só atende um titular que é USUÁRIO do sistema (linha em profiles/
-- auth.users). Um cliente, fornecedor ou contato de obra cadastrado em
-- "pessoas" — titular de dado pessoal pela LGPD do mesmo jeito, mas que
-- nunca fez login no sistema — não tinha NENHUM mecanismo de exclusão/
-- anonimização. ADR-010 §5/§6 exige que a controladora (a vidraçaria)
-- consiga atender esse pedido; ADR-010 §2 deixa claro que dado
-- operacional de cliente/fornecedor é responsabilidade da controladora,
-- não do operador — diferente de activity_logs (que por ser trilha de
-- auditoria do próprio SaaS fica restrita a platform_admin). Por isso
-- aqui o gate é o mesmo de qualquer escrita em pessoas (pessoas.manage),
-- não platform_admin.
--
-- Fora do recorte, deliberadamente: anonimização de funcionarios. ADR-010
-- §4/§6 já registra que registros com obrigação legal de guarda
-- (trabalhista, no caso) permanecem pelo prazo aplicável mesmo após
-- pedido de exclusão — decidir por quanto tempo e quais campos de um
-- funcionário podem ser anonimizados sem violar a CLT é uma decisão
-- jurídica (ADR-010 item 4: "sujeito a validação jurídica"), não técnica;
-- construir isso sem essa validação arriscaria automatizar um apagamento
-- de dado que a legislação trabalhista ainda exige manter.

alter table public.pessoas add column if not exists anonymized_at timestamptz;

comment on column public.pessoas.anonymized_at is
  'LGPD — preenchido por anonimizar_pessoa(). Pessoa nunca é apagada (preserva histórico de pedidos/orçamentos/contratos que referenciam o id), só os campos de identificação pessoal.';

create or replace function public.anonimizar_pessoa(
  p_pessoa_id uuid,
  p_motivo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  if not exists (select 1 from public.pessoas where id = p_pessoa_id and company_id = v_company_id) then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;
  if exists (select 1 from public.pessoas where id = p_pessoa_id and anonymized_at is not null) then
    raise exception 'Esta pessoa já teve os dados anonimizados.';
  end if;

  update public.pessoas set
    nome = 'Titular de dados anonimizado',
    nome_fantasia = null,
    tipo_documento = null,
    documento = null,
    telefone = null,
    email = null,
    logradouro = null,
    cidade = null,
    uf = null,
    cep = null,
    anonymized_at = now()
  where id = p_pessoa_id;

  perform public.log_activity('lgpd.pessoa_anonimizada', 'pessoa', p_pessoa_id, p_motivo, null);
end;
$$;

grant execute on function public.anonimizar_pessoa(uuid, text) to authenticated;
