-- TÓPICO 17 §6 — complemento pós-reconciliação (2026-09-25): a migration
-- 20261006000000_topico17_rh_completo.sql modelou habilitação de
-- equipamento como um `tipo` dentro da tabela genérica
-- funcionario_documentos, com `nome` em texto livre (ex.: "forno de
-- têmpera"). Uma frente de trabalho paralela (nunca publicada) tinha
-- modelado a mesma coisa como vínculo real com o cadastro de recursos
-- produtivos (TÓPICO 4 §31) — permitindo, por exemplo, listar quem está
-- habilitado a operar uma máquina específica, e não só ler o nome digitado
-- por quem cadastrou. Esta migration incorpora esse vínculo como um
-- complemento OPCIONAL ao desenho já mesclado, sem alterar o
-- comportamento existente: registro de admissão/certificação/EPI continua
-- exatamente igual, e habilitação sem recurso vinculado (nome livre)
-- continua válida — só passa a existir a opção de vincular a um recurso
-- produtivo cadastrado quando ele existir.
--
-- Nunca reescrever a migration 20261006000000 já mesclada (CLAUDE.md §14:
-- toda alteração estrutural do banco deve ser versionada) — este arquivo
-- só adiciona.

alter table public.funcionario_documentos
  add column recurso_produtivo_id uuid references public.recursos_produtivos(id);
comment on column public.funcionario_documentos.recurso_produtivo_id is
  'TÓPICO 17 §6, complemento — vínculo opcional com o recurso produtivo (TÓPICO 4 §31) ao qual uma habilitação (tipo=''habilitacao'') se refere. Null para os demais tipos, e também aceito em habilitação sem recurso cadastrado (nome livre).';

create index funcionario_documentos_recurso_produtivo_id_idx
  on public.funcionario_documentos (recurso_produtivo_id)
  where recurso_produtivo_id is not null;

-- Só habilitação pode referenciar um recurso; os demais tipos (admissão,
-- certificação, EPI) nunca preenchem esse campo.
alter table public.funcionario_documentos
  add constraint funcionario_documentos_recurso_so_habilitacao_check
  check (recurso_produtivo_id is null or tipo = 'habilitacao');

-- =========================================================================
-- registrar_documento_funcionario() — mesmo corpo da versão mesclada
-- (20261006000000), só acrescentando o parâmetro opcional
-- p_recurso_produtivo_id com a mesma validação que a frente paralela já
-- fazia: só aceita recurso do tipo 'maquina'/'equipamento' da própria
-- empresa, e só quando p_tipo = 'habilitacao'.
--
-- Acrescentar um parâmetro novo cria uma assinatura (uuid, text, text,
-- date, date, text, uuid) diferente da original (uuid, text, text, date,
-- date, text) — "create or replace" NÃO substitui a função original
-- nesse caso, cria uma segunda sobrecarga. Isso deixaria as duas versões
-- coexistindo e o PostgREST sem saber qual escolher numa chamada por RPC
-- com os mesmos nomes de parâmetro. Por isso o drop explícito abaixo.
-- =========================================================================

drop function if exists public.registrar_documento_funcionario(uuid, text, text, date, date, text);

create or replace function public.registrar_documento_funcionario(
  p_funcionario_id uuid,
  p_tipo text,
  p_nome text,
  p_data_referencia date default null,
  p_validade date default null,
  p_observacoes text default null,
  p_recurso_produtivo_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario public.funcionarios;
  v_id uuid;
begin
  if p_tipo not in ('admissao', 'certificacao', 'epi', 'habilitacao') then
    raise exception 'Tipo de documento inválido: "%".', p_tipo;
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do documento é obrigatório.';
  end if;
  if p_validade is not null and p_data_referencia is not null and p_validade < p_data_referencia then
    raise exception 'Validade não pode ser anterior à data de referência.';
  end if;
  if p_recurso_produtivo_id is not null and p_tipo <> 'habilitacao' then
    raise exception 'Vínculo com recurso produtivo só é aceito para habilitação.';
  end if;
  if p_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos
    where id = p_recurso_produtivo_id and company_id = v_company_id and tipo in ('maquina', 'equipamento')
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa, ou não é do tipo máquina/equipamento.';
  end if;

  select * into v_funcionario from public.funcionarios
  where id = p_funcionario_id and company_id = v_company_id;
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_funcionario.status = 'desligado' then
    raise exception 'Não é possível registrar documento para funcionário desligado.';
  end if;

  insert into public.funcionario_documentos (
    company_id, funcionario_id, tipo, nome, data_referencia, validade, observacoes, criado_por, recurso_produtivo_id
  ) values (
    v_company_id, p_funcionario_id, p_tipo, p_nome, p_data_referencia, p_validade, p_observacoes, auth.uid(), p_recurso_produtivo_id
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'rh.documento_registrado', 'funcionario_documento', v_id, p_nome,
    jsonb_build_object('funcionario_id', p_funcionario_id, 'tipo', p_tipo, 'validade', p_validade, 'recurso_produtivo_id', p_recurso_produtivo_id)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_documento_funcionario(uuid, text, text, date, date, text, uuid) to authenticated;
