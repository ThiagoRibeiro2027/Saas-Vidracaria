-- Melhorias do responsável do produto (item 7, 17/10/2026). Decisão: duas
-- ações separadas.
--   1) anonimizar_pessoa() — INALTERADA em comportamento (pedido do titular,
--      LGPD art. 18): elimina nome, documento, contato e endereço.
--   2) ocultar_documento_pessoa() — NOVA: o cliente continua identificável
--      pra operar (nome, telefone, e-mail, endereço preservados), mas o
--      CPF/CNPJ deixa de existir inteiro no banco: guarda só a versão
--      mascarada (034.***.***-00). É irreversível de propósito (o número
--      completo é apagado), não é só máscara de tela.
-- Não é "anonimização" no sentido da LGPD (a pessoa segue identificável) —
-- por isso é outra ação, com outro nome e outro registro de auditoria.

alter table public.pessoas
  add column documento_mascarado text,
  add column documento_oculto_em timestamptz;

comment on column public.pessoas.documento_mascarado is
  'Melhorias 17/10/2026, item 7 — documento no formato 034.***.***-00 quando o número completo foi apagado por ocultar_documento_pessoa().';

-- Quem digitar um documento novo numa pessoa com documento oculto volta ao
-- estado normal (a máscara antiga deixaria de valer).
create or replace function public.pessoas_limpa_mascara_ao_informar_documento()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.documento is not null and old.documento is null and new.documento_oculto_em is not null then
    new.documento_mascarado := null;
    new.documento_oculto_em := null;
  end if;
  return new;
end;
$$;

create trigger pessoas_limpa_mascara before update on public.pessoas
  for each row execute function public.pessoas_limpa_mascara_ao_informar_documento();

create or replace function public.ocultar_documento_pessoa(p_pessoa_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pessoa public.pessoas;
  v_digitos text;
  v_mascara text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_pessoa from public.pessoas
  where id = p_pessoa_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;
  if v_pessoa.anonymized_at is not null then
    raise exception 'Esta pessoa já teve os dados anonimizados.';
  end if;
  if v_pessoa.documento is null then
    raise exception 'Esta pessoa não tem documento completo para ocultar.';
  end if;

  v_digitos := regexp_replace(v_pessoa.documento, '\D', '', 'g');
  if length(v_digitos) = 11 then
    v_mascara := substr(v_digitos, 1, 3) || '.***.***-' || substr(v_digitos, 10, 2);
  elsif length(v_digitos) = 14 then
    v_mascara := substr(v_digitos, 1, 2) || '.***.***/****-' || substr(v_digitos, 13, 2);
  else
    raise exception 'Documento com tamanho inesperado — não é CPF nem CNPJ.';
  end if;

  update public.pessoas set
    documento = null,
    documento_mascarado = v_mascara,
    documento_oculto_em = now()
  where id = p_pessoa_id;

  -- O número completo nunca vai pro log.
  perform public.log_activity(
    'lgpd.documento_ocultado', 'pessoa', p_pessoa_id, p_motivo,
    jsonb_build_object('documento_mascarado', v_mascara)
  );
end;
$$;

grant execute on function public.ocultar_documento_pessoa(uuid, text) to authenticated;

-- A anonimização completa também apaga a versão mascarada (ela ainda
-- revelaria 5 dígitos). Corpo idêntico ao da migration 20261012184715,
-- só com as duas colunas novas zeradas.
create or replace function public.anonimizar_pessoa(p_pessoa_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_obras int;
  v_propostas int;
  v_fornecedor int;
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
    documento_mascarado = null,
    documento_oculto_em = null,
    telefone = null,
    email = null,
    logradouro = null,
    cidade = null,
    uf = null,
    cep = null,
    anonymized_at = now()
  where id = p_pessoa_id;

  update public.obras set
    nome = 'Obra de titular anonimizado',
    logradouro = null,
    cidade = null,
    uf = null,
    cep = null
  where pessoa_id = p_pessoa_id and company_id = v_company_id;
  get diagnostics v_obras = row_count;

  update public.propostas set destinatario = null
  where company_id = v_company_id
    and destinatario is not null
    and orcamento_id in (
      select id from public.orcamentos where pessoa_id = p_pessoa_id and company_id = v_company_id
    );
  get diagnostics v_propostas = row_count;

  update public.fornecedor_dados set
    banco = null,
    agencia = null,
    conta = null,
    tipo_conta = null,
    chave_pix = null
  where pessoa_id = p_pessoa_id and company_id = v_company_id;
  get diagnostics v_fornecedor = row_count;

  perform public.log_activity(
    'lgpd.pessoa_anonimizada', 'pessoa', p_pessoa_id, p_motivo,
    jsonb_build_object(
      'obras_anonimizadas', v_obras,
      'propostas_sem_destinatario', v_propostas,
      'fornecedor_dados_limpos', v_fornecedor
    )
  );
end;
$$;
