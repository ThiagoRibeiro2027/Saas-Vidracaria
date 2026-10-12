-- Auditoria TR Systems (12/10/2026) — achado 8 (LGPD): anonimizar_pessoa() só
-- limpava a linha de `pessoas`.
--
-- PROBLEMA (provado com dados reais, scripts/test-lgpd-pessoa.mjs seção 4):
-- depois de anonimizar um titular continuavam no banco, ligados a ele:
--   * obras: nome da obra e endereço completo (rua, cidade, UF, CEP) — o
--     "endereço de obra" que o ADR-010 §3 lista como dado pessoal do cliente;
--   * propostas.destinatario: o e-mail/contato para quem a proposta foi enviada;
--   * fornecedor_dados: banco, agência, conta e chave PIX (a chave PIX de pessoa
--     física costuma ser o próprio CPF).
--
-- DECISÃO DO RESPONSÁVEL (12/10/2026): limpar as cópias junto com o titular,
-- preservando o que tem obrigação de guarda — ADR-010 §6. Por isso esta função
-- NÃO toca:
--   * documentos_fiscais, contratos e títulos financeiros (guarda fiscal,
--     contratual e trabalhista);
--   * propostas.snapshot, que só guarda ids e valores (verificado — não carrega
--     nome, documento nem endereço);
--   * o vínculo (pessoa_id) de obra/fornecedor: o fato de que a obra existiu e
--     foi executada continua rastreável, só deixa de identificar o titular.
-- Campos de texto livre (observações, descrições) não podem ser higienizados de
-- forma confiável por uma rotina automática — ficam fora e são citados no ADR.
--
-- O que muda em cada tabela, só para as linhas do titular, na própria empresa:
--   obras            nome -> 'Obra de titular anonimizado'; logradouro, cidade,
--                    uf, cep -> nulos (obras.nome é NOT NULL);
--   propostas        destinatario -> nulo (canal e datas ficam: são o fato);
--   fornecedor_dados banco, agencia, conta, tipo_conta, chave_pix -> nulos
--                    (prazo, lead time e homologação ficam: não identificam).
--
-- O log da anonimização passa a registrar as CONTAGENS do que foi limpo (prova
-- de que a rotina rodou) e nunca o conteúdo removido.
--
-- Mantidos como antes: gate pessoas.manage, current_company_id() (nunca um
-- company_id do cliente), assert_company_not_suspended(), recusa de repetição,
-- SECURITY DEFINER com search_path controlado. Assinatura inalterada, então os
-- grants existentes se mantêm.

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
    telefone = null,
    email = null,
    logradouro = null,
    cidade = null,
    uf = null,
    cep = null,
    anonymized_at = now()
  where id = p_pessoa_id;

  -- Cópias do mesmo dado pessoal em outras tabelas (achado 8).
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
