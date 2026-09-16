-- TÓPICO 17 — RH, recorte mínimo do MVP (PLANO DE ENTREGA §6, M3 —
-- "RH... sendo que o cadastro de equipes do RH é antecipado para o M1,
-- porque o T16 depende dele"). docs/Prompt TÓPICO 17 §11 já é enxuto e
-- objetivo (ao contrário de T7/T11, aqui não há conflito com o ADR-002):
-- "No MVP, priorizar: cadastro de funcionários, cadastro de equipes,
-- vínculo com usuários, e sinalização de desligamento. Documentos, EPI e
-- habilitações podem ser incorporados em etapa seguinte."
--
-- "Cadastro de equipes" já está feito — equipes_instalacao/equipe_membros
-- (20260916000000_topico16_instalacao.sql) foram construídas exatamente
-- como essa antecipação, e o próprio comentário daquela migration já
-- previa que T17 as adotaria em vez de duplicar. T4 Produção não modela
-- equipe nenhuma hoje (grep confirma), então "equipes de produção" (T17
-- §5) não tem o que migrar ainda — fica pra quando T4 precisar. Não
-- renomeio nem altero equipes_instalacao aqui (schema de outro módulo já
-- em produção) — só formalizo no comentário que ela cumpre esse papel.
-- equipe_membros.profile_id continua exigindo usuário do sistema (não
-- funcionario_id) — um funcionário sem conta de usuário não pode hoje
-- entrar numa equipe; é uma simplificação conhecida, não escopo deste
-- commit.
--
-- Fora do recorte (T17 §8, decisão consciente do próprio tópico, não um
-- corte nosso): folha de pagamento, encargos, rescisão, escala/jornada,
-- ponto/frequência. Fora por causa do §11 MVP: documentos do colaborador,
-- EPI, habilitações (§6), afastamentos/férias com datas (§7) — o campo
-- funcionarios.status já cobre 'afastado' como estado simples, sem
-- registro de período/motivo separado.
--
-- Decisões de recorte:
--   - desligar_funcionario() é a única via de desligamento (não um valor
--     de status no upsert_funcionario genérico) — mesmo padrão de
--     cancelar_expedicao()/cancelar_instalacao(): transição terminal
--     dedicada, não um campo editável qualquer. Quando o funcionário tem
--     profile_id vinculado, desativa esse profile na MESMA transação
--     (profiles.active = false) — T17 §4 é explícito: "Não deve ser
--     possível um funcionário permanecer 'desligado' no RH enquanto sua
--     conta permanece ativa sem revisão" — "disparar" é uma opção
--     explicitamente aceita pelo próprio tópico, não só "sinalizar".
--     Gate é só rh.manage (não também users.manage) — revogar acesso no
--     desligamento é responsabilidade central do RH pelo próprio tópico,
--     exigir uma segunda permissão bloquearia esse fluxo principal.
--   - SELECT NÃO é aberto a qualquer autenticado da empresa (diferente de
--     todo módulo anterior) — T17 §9 é explícito: "Dados de RH são dados
--     pessoais sensíveis (LGPD)... acesso restrito por permissão". Exige
--     rh.view na própria policy, primeira vez que isso acontece no
--     schema.
--   - unidade_id reaproveita public.company_units (Fundação/ADR-001,
--     já referenciada por profiles.unit_id) — não duplica o conceito de
--     unidade/filial.
--   - profile_id tem índice único parcial (um funcionário por usuário, no
--     máximo) — T17 §3: vínculo "explícito e rastreável", não muitos-
--     para-um.

create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  unidade_id uuid references public.company_units(id),
  profile_id uuid references public.profiles(id),
  nome text not null,
  cargo text,
  funcao text,
  telefone text,
  email text,
  data_admissao date,
  status text not null default 'ativo' check (status in ('ativo', 'afastado', 'desligado')),
  data_desligamento date,
  motivo_desligamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionarios_desligamento_check check (
    (status = 'desligado') = (data_desligamento is not null)
  )
);
comment on table public.funcionarios is
  'TÓPICO 17, recorte mínimo do MVP — cadastro de funcionários. Sem folha/encargos/rescisão/escala/ponto (§8) nem documentos/EPI/habilitações/afastamentos com data (§6-7, MVP §11 adia pra etapa seguinte). Dados pessoais sensíveis (LGPD, §9) — SELECT exige rh.view, não é aberto a qualquer autenticado.';
create index funcionarios_company_id_idx on public.funcionarios (company_id);
create unique index funcionarios_profile_id_unique on public.funcionarios (profile_id) where profile_id is not null;

create trigger set_updated_at before update on public.funcionarios
  for each row execute function public.set_updated_at();

alter table public.funcionarios enable row level security;
create policy funcionarios_select on public.funcionarios for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

grant select on public.funcionarios to authenticated;

-- =========================================================================
-- upsert_funcionario() — cria/edita. p_status só aceita 'ativo'/'afastado'
-- aqui — 'desligado' é sempre via desligar_funcionario().
-- =========================================================================

create or replace function public.upsert_funcionario(
  p_id uuid,
  p_nome text,
  p_cargo text default null,
  p_funcao text default null,
  p_unidade_id uuid default null,
  p_data_admissao date default null,
  p_telefone text default null,
  p_email text default null,
  p_profile_id uuid default null,
  p_status text default 'ativo',
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
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
    'funcionario', v_id, p_nome,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('status', p_status, 'profile_id', p_profile_id))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_funcionario(uuid, text, text, text, uuid, date, text, text, uuid, text, text) to authenticated;

-- =========================================================================
-- desligar_funcionario() — transição terminal; desativa o profile
-- vinculado na mesma transação (T17 §4).
-- =========================================================================

create or replace function public.desligar_funcionario(p_id uuid, p_data_desligamento date default current_date, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario public.funcionarios;
  -- coalesce, não só o default do parâmetro: a Server Action manda null
  -- explícito quando o campo de data fica em branco no formulário, e um
  -- null explícito via RPC ignora "default current_date" da assinatura
  -- (achado do code-review em T11/registrar_recebimento_titulo — mesmo
  -- risco aqui, corrigido preventivamente).
  v_data_desligamento date := coalesce(p_data_desligamento, current_date);
begin
  select * into v_funcionario from public.funcionarios
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_funcionario.status = 'desligado' then
    raise exception 'Funcionário já desligado.';
  end if;

  update public.funcionarios
  set status = 'desligado', data_desligamento = v_data_desligamento, motivo_desligamento = p_motivo
  where id = p_id;

  if v_funcionario.profile_id is not null then
    update public.profiles set active = false where id = v_funcionario.profile_id and company_id = v_company_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'rh.funcionario_desligado', 'funcionario', p_id, p_motivo,
    jsonb_build_object('data_desligamento', v_data_desligamento, 'profile_desativado', v_funcionario.profile_id is not null)
  );

  return p_id;
end;
$$;

grant execute on function public.desligar_funcionario(uuid, date, text) to authenticated;
