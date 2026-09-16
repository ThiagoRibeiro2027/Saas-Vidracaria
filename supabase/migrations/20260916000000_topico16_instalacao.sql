-- TÓPICO 16 — Instalação/Montagem, recorte mínimo do M1 (PLANO DE ENTREGA
-- — MVP DO PILOTO v1.0, dezembro: "saída, campo e homologação", mesmo mês
-- de T8/T9). Texto exato do recorte (PLANO §4): "T16 — Instalação: agenda,
-- execução, ocorrências, evidências fotográficas, conclusão e aceite — na
-- plataforma de campo do ADR-008, com operação offline conforme ADR-005."
-- ADR-002 §4.9 é a lista autoritativa mais detalhada: agendamento; obra;
-- equipe; responsáveis; agenda; materiais; execução; observações;
-- ocorrências; pendências; execução parcial; conclusão; aceite;
-- evidências; encerramento — mesma lista do próprio Prompt TÓPICO 16 §17,
-- que também formaliza dentro do MVP a medição em obra (§7, já construída
-- em T5/itens_producao) e quebra/dano em obra (§8).
--
-- Este commit é só o BACKEND (schema + RPCs + RLS + testes negativos),
-- mesmo padrão DB-only de T4/T8/T9. A camada de PWA/offline do ADR-008
-- (service worker, fila local de sincronização, indicador online/offline,
-- alertas de validade de 3/7 dias do ADR-005 §9) é um commit separado — é
-- o que efetivamente fecha o critério de aceite do ADR-008 §5/§11, mas
-- construir os dois juntos multiplicaria o escopo de um módulo que já é
-- estruturalmente maior que os anteriores. Os RPCs abaixo já são
-- desenhados pra tolerar reenvio (idempotência por chave natural — ex.:
-- instalacao_itens_unique por (instalacao_id, pedido_item_id) — e updates
-- que somam quantidade em vez de substituir), pra não exigir retrabalho
-- quando a fila de sincronização for construída.
--
-- Fora do recorte (Release 2+, TÓPICO 16 completo): viagem/rota/logística
-- avançada (isso é T9, não T16); assinatura eletrônica formal do aceite
-- (TÓPICO 18 — Contratos); plano de instalação com etapas configuráveis;
-- pendências como entidade própria (aqui, pendência é só quantidade_
-- pendente do item, mesmo padrão de expedicao_itens); revisita como fluxo
-- dedicado (uma nova instalação para o mesmo pedido resolve o caso mínimo).
--
-- Decisões de recorte:
--   - "Equipe" (equipes_instalacao/equipe_membros): TÓPICO 17 (RH) não
--     existe ainda — o PLANO §10 antecipa pro M1 só "o cadastro de equipes
--     do RH, por ser dependência da Instalação". Construído aqui, mínimo
--     (nome + membros), não como parte de RH completo. Quando T17 for
--     implementado, é candidato a migrar pra lá sem mudar a FK que T16
--     consome.
--   - "Obra": instalacoes não duplica endereço — usa pedidos.obra_id (T3),
--     que já referencia public.obras (T2, com logradouro/cidade/uf/cep).
--     criar_instalacao() exige que o pedido tenha obra_id preenchido.
--   - "Materiais": instalação só consome disponibilidade que T9 (Expedição)
--     já entregou — instalacao_itens.quantidade não pode exceder a soma de
--     expedicao_itens.quantidade_entregue pro mesmo pedido_item_id, líquida
--     do que outras instalações ativas já usaram. Mesmo espírito de T9 ler
--     T4/T8 só por leitura: instalação não escreve em expedicao/estoque.
--   - Não reconfirma pedido_bloqueado_por_medicao() (T5/T16 §7) aqui: já é
--     invariante transitivo — criar_ordem_producao() (T4) já bloqueia OP
--     pra item com medida não confirmada, e só existe quantidade_entregue
--     em T9 depois de OP concluída. Reler a regra aqui duplicaria a
--     autoridade de T4, mesmo raciocínio do comentário de T9 sobre não
--     reler inspecoes_qualidade diretamente.
--   - "Conclusão" aceita quantidade_instalada < quantidade (instalação
--     parcial é uma das exceções operacionais básicas exigidas pelo PLANO
--     §4) — diferente de concluir_ordem_producao() (T4), que exige 100%.
--     Mesmo espírito de registrar_saida_expedicao() não exigir entrega
--     completa.
--   - "Aceite" é uma ação separada de "conclusão", com permissão própria
--     (instalacao.aceite, distinta de instalacao.manage) — quem executa a
--     instalação não necessariamente é quem tem autoridade pra registrar
--     que o cliente aceitou. Sem assinatura eletrônica formal (TÓPICO 18).
--   - "Quebra/dano" (§8): registra causa e pode gerar uma solicitação de
--     nova fabricação, mas a solicitação só muda de status (pendente →
--     aprovada/rejeitada) via decidir_nova_fabricacao() — não cria uma OP
--     automaticamente. ordens_producao tem unique(pedido_item_id) (T4):
--     não existe hoje um caminho estrutural pra abrir uma segunda OP pro
--     mesmo pedido_item, e criar esse caminho (novo pedido_item, nova
--     liberação) está fora do recorte de T3. Aprovar a solicitação
--     autoriza o trabalho; abrir a OP em si (com um pedido_item novo, por
--     um fluxo comercial que ainda não existe) é acompanhamento manual
--     fora do sistema neste recorte — mesmo tipo de corte que T9 fez com
--     "cancelamento após saída vira fluxo de devolução, Release 1".
--   - "Evidências fotográficas": sem tabela nova — reaproveita public.files
--     (entity_type='instalacao', entity_id=instalacoes.id), que já é
--     genérico por design (Prompt Mestre item 19) e já tem RLS de storage
--     com has_permission('files','upload').
--   - "Ocorrências": mesmo padrão minimalista de ocorrencias_expedicao —
--     descrição livre, sem tipo/tratamento/status configurável.
--   - insert into activity_logs direto (não log_activity()), mesmo padrão
--     já usado em T2-T9.
--
-- Pré-requisito funcional (não é escopo extra): next_document_number()
-- (allow-list fechada, F09) precisa do ramo 'instalacao', ou
-- criar_instalacao() nunca funciona.

create or replace function public.next_document_number(p_document_type text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_row public.numbering_sequences%rowtype;
  v_period_key text;
  v_number text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if p_document_type = 'orcamento' then
    if not public.has_permission('orcamentos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not public.has_permission('producao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.manage).';
    end if;
  elsif p_document_type = 'expedicao' then
    if not public.has_permission('expedicao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de expedição (expedicao.manage).';
    end if;
  elsif p_document_type = 'instalacao' then
    if not public.has_permission('instalacao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de instalação (instalacao.manage).';
    end if;
  else
    raise exception 'Tipo de documento desconhecido: "%".', p_document_type;
  end if;

  perform public.assert_company_not_suspended();

  select * into v_row from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  if not found then
    raise exception 'Sequência de numeração não configurada para "%".', p_document_type;
  end if;

  v_period_key := case v_row.reinicio
    when 'anual' then to_char(now(), 'YYYY')
    when 'mensal' then to_char(now(), 'YYYY-MM')
    else ''
  end;

  if v_period_key is distinct from v_row.current_period_key then
    v_row.current_value := 0;
  end if;

  v_row.current_value := v_row.current_value + 1;

  update public.numbering_sequences
  set current_value = v_row.current_value,
      current_period_key = v_period_key
  where id = v_row.id;

  v_number := v_row.prefixo
    || (case when v_row.incluir_ano then to_char(now(), 'YYYY') else '' end)
    || (case when v_row.incluir_mes then to_char(now(), 'MM') else '' end)
    || lpad(v_row.current_value::text, v_row.digitos, '0')
    || v_row.sufixo;

  return v_number;
end;
$$;

-- =========================================================================
-- 1. Tabelas
-- =========================================================================

create table public.equipes_instalacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipes_instalacao_company_nome_unique unique (company_id, nome)
);
comment on table public.equipes_instalacao is
  'TÓPICO 16, recorte mínimo — cadastro de equipes antecipado do TÓPICO 17 (RH), que ainda não existe (PLANO §10: "cadastro de equipes do RH é antecipado para o M1, porque o T16 depende dele"). Só nome + membros, não RH completo.';
create index equipes_instalacao_company_id_idx on public.equipes_instalacao (company_id);

create table public.equipe_membros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  equipe_id uuid not null references public.equipes_instalacao(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint equipe_membros_equipe_profile_unique unique (equipe_id, profile_id)
);
comment on table public.equipe_membros is 'TÓPICO 16, recorte mínimo — vínculo equipe x usuário, sem habilitação/especialidade (Release 2).';
create index equipe_membros_equipe_id_idx on public.equipe_membros (equipe_id);
create index equipe_membros_company_id_idx on public.equipe_membros (company_id);

create table public.instalacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_id uuid not null references public.pedidos(id),
  equipe_id uuid not null references public.equipes_instalacao(id),
  numero text not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'em_execucao', 'concluida', 'aceita', 'cancelada')),
  data_agendada date not null,
  observacoes text,
  motivo_cancelamento text,
  aceite_por uuid references public.profiles(id),
  aceite_nome_cliente text,
  aceite_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instalacoes_company_numero_unique unique (company_id, numero)
);
comment on table public.instalacoes is
  'TÓPICO 16, recorte mínimo — cabeçalho de instalação. Um pedido pode ter várias (instalação parcial/revisita, ADR-002 §4.9). Endereço vem de pedidos.obra_id (T3/T2), não duplicado aqui. Sem colunas de quem/quando por transição de execução — isso vive em activity_logs; aceite é exceção porque é um dado de negócio consultado, não só auditoria.';
create index instalacoes_pedido_id_idx on public.instalacoes (pedido_id);
create index instalacoes_equipe_id_idx on public.instalacoes (equipe_id);
create index instalacoes_status_idx on public.instalacoes (status);

create table public.instalacao_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  instalacao_id uuid not null references public.instalacoes(id) on delete cascade,
  pedido_item_id uuid not null references public.pedido_itens(id),
  -- planejado / realizado / pendente do ADR-002 §4.9, literalmente (mesmo
  -- padrão de expedicao_itens, T9).
  quantidade numeric(14, 3) not null check (quantidade > 0),
  quantidade_instalada numeric(14, 3) not null default 0 check (quantidade_instalada >= 0),
  quantidade_pendente numeric(14, 3) generated always as (quantidade - quantidade_instalada) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instalacao_itens_instalada_check check (quantidade_instalada <= quantidade),
  constraint instalacao_itens_instalacao_pedido_item_unique unique (instalacao_id, pedido_item_id)
);
comment on table public.instalacao_itens is
  'TÓPICO 16, recorte mínimo — quantidade não pode exceder o que T9 (Expedição) já entregou pro mesmo pedido_item_id, líquido do que outras instalações ativas já reservaram (checado em adicionar_item_instalacao).';
create index instalacao_itens_instalacao_id_idx on public.instalacao_itens (instalacao_id);
create index instalacao_itens_pedido_item_id_idx on public.instalacao_itens (pedido_item_id);

create table public.ocorrencias_instalacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  instalacao_id uuid not null references public.instalacoes(id) on delete cascade,
  descricao text not null,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now()
);
comment on table public.ocorrencias_instalacao is
  'TÓPICO 16, recorte mínimo — descrição livre, sem tipo/tratamento/status configurável (mesmo padrão de ocorrencias_expedicao, T9).';
create index ocorrencias_instalacao_instalacao_id_idx on public.ocorrencias_instalacao (instalacao_id);

create table public.danos_instalacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  instalacao_item_id uuid not null references public.instalacao_itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  causa text not null check (causa in ('fabricacao', 'transporte', 'instalacao', 'cliente', 'indeterminada')),
  descricao text,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now()
);
comment on table public.danos_instalacao is
  'TÓPICO 16 §8, recorte mínimo — quebra/dano em obra. "causa" já carrega a responsabilidade atribuída (fabricação/transporte/instalação/cliente/indeterminada), sem um campo de responsabilidade separado.';
create index danos_instalacao_instalacao_item_id_idx on public.danos_instalacao (instalacao_item_id);

create table public.solicitacoes_nova_fabricacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  dano_id uuid not null references public.danos_instalacao(id),
  motivo text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  solicitado_por uuid not null references public.profiles(id),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  motivo_decisao text
);
comment on table public.solicitacoes_nova_fabricacao is
  'TÓPICO 16 §8, recorte mínimo — só a decisão de autorizar (pendente/aprovada/rejeitada), gerida por instalacao.decidir_dano (separado de instalacao.manage, quem registra o dano não decide sozinho). Não abre ordens_producao automaticamente — ver cabeçalho da migration.';
create index solicitacoes_nova_fabricacao_dano_id_idx on public.solicitacoes_nova_fabricacao (dano_id);

create trigger set_updated_at before update on public.equipes_instalacao
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.instalacoes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.instalacao_itens
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. RLS — mesmo padrão de expedicoes/itens_producao: SELECT aberto a
--    qualquer autenticado da empresa, sem exigir instalacao.view. Nenhuma
--    policy de INSERT/UPDATE/DELETE para authenticated — só as funções
--    abaixo escrevem.
-- =========================================================================

alter table public.equipes_instalacao enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.instalacoes enable row level security;
alter table public.instalacao_itens enable row level security;
alter table public.ocorrencias_instalacao enable row level security;
alter table public.danos_instalacao enable row level security;
alter table public.solicitacoes_nova_fabricacao enable row level security;

create policy equipes_instalacao_select on public.equipes_instalacao for select
  using (company_id = (select public.current_company_id()));
create policy equipe_membros_select on public.equipe_membros for select
  using (company_id = (select public.current_company_id()));
create policy instalacoes_select on public.instalacoes for select
  using (company_id = (select public.current_company_id()));
create policy instalacao_itens_select on public.instalacao_itens for select
  using (company_id = (select public.current_company_id()));
create policy ocorrencias_instalacao_select on public.ocorrencias_instalacao for select
  using (company_id = (select public.current_company_id()));
create policy danos_instalacao_select on public.danos_instalacao for select
  using (company_id = (select public.current_company_id()));
create policy solicitacoes_nova_fabricacao_select on public.solicitacoes_nova_fabricacao for select
  using (company_id = (select public.current_company_id()));

grant select on public.equipes_instalacao to authenticated;
grant select on public.equipe_membros to authenticated;
grant select on public.instalacoes to authenticated;
grant select on public.instalacao_itens to authenticated;
grant select on public.ocorrencias_instalacao to authenticated;
grant select on public.danos_instalacao to authenticated;
grant select on public.solicitacoes_nova_fabricacao to authenticated;

-- =========================================================================
-- 3. Equipes — CRUD mínimo, gerido por instalacao.manage (sem recurso RH
--    próprio ainda — ver cabeçalho da migration).
-- =========================================================================

create or replace function public.criar_equipe_instalacao(p_nome text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da equipe é obrigatório.';
  end if;

  insert into public.equipes_instalacao (company_id, nome)
  values (v_company_id, p_nome)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.equipe_criada', 'equipe_instalacao', v_id, p_nome, null);

  return v_id;
end;
$$;

grant execute on function public.criar_equipe_instalacao(text) to authenticated;

create or replace function public.definir_ativo_equipe_instalacao(p_equipe_id uuid, p_ativo boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
begin
  update public.equipes_instalacao set ativo = p_ativo
  where id = p_equipe_id and company_id = v_company_id;
  if not found then
    raise exception 'Equipe não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.equipe_ativo_alterado', 'equipe_instalacao', p_equipe_id, null, jsonb_build_object('ativo', p_ativo));

  return p_equipe_id;
end;
$$;

grant execute on function public.definir_ativo_equipe_instalacao(uuid, boolean) to authenticated;

create or replace function public.adicionar_membro_equipe(p_equipe_id uuid, p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.equipes_instalacao where id = p_equipe_id and company_id = v_company_id) then
    raise exception 'Equipe não encontrada nesta empresa.';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  insert into public.equipe_membros (company_id, equipe_id, profile_id)
  values (v_company_id, p_equipe_id, p_profile_id)
  on conflict (equipe_id, profile_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.equipe_membros where equipe_id = p_equipe_id and profile_id = p_profile_id;
  else
    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (v_company_id, auth.uid(), 'instalacao.membro_adicionado', 'equipe_instalacao', p_equipe_id, null, jsonb_build_object('profile_id', p_profile_id));
  end if;

  return v_id;
end;
$$;

grant execute on function public.adicionar_membro_equipe(uuid, uuid) to authenticated;

create or replace function public.remover_membro_equipe(p_equipe_membro_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_equipe_id uuid;
begin
  select equipe_id into v_equipe_id from public.equipe_membros
  where id = p_equipe_membro_id and company_id = v_company_id;
  if not found then
    raise exception 'Membro de equipe não encontrado nesta empresa.';
  end if;

  delete from public.equipe_membros where id = p_equipe_membro_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.membro_removido', 'equipe_instalacao', v_equipe_id, null, jsonb_build_object('equipe_membro_id', p_equipe_membro_id));

  return p_equipe_membro_id;
end;
$$;

grant execute on function public.remover_membro_equipe(uuid) to authenticated;

-- =========================================================================
-- 4. criar_instalacao() — só a partir de pedido liberado, com obra
--    definida. Ordem de lock (evita deadlock com adicionar_item_
--    instalacao concorrente): sempre instalacoes antes de pedido_itens.
-- =========================================================================

create or replace function public.criar_instalacao(
  p_pedido_id uuid,
  p_equipe_id uuid,
  p_data_agendada date,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_pedido public.pedidos;
  v_numero text;
  v_id uuid;
begin
  select * into v_pedido from public.pedidos
  where id = p_pedido_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível agendar instalação de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if v_pedido.obra_id is null then
    raise exception 'Pedido sem obra associada — instalação exige obra definida.';
  end if;
  if not exists (select 1 from public.equipes_instalacao where id = p_equipe_id and company_id = v_company_id and ativo) then
    raise exception 'Equipe não encontrada ou inativa nesta empresa.';
  end if;
  if p_data_agendada is null then
    raise exception 'Data agendada é obrigatória.';
  end if;

  v_numero := public.next_document_number('instalacao');

  insert into public.instalacoes (company_id, pedido_id, equipe_id, numero, data_agendada, observacoes)
  values (v_company_id, p_pedido_id, p_equipe_id, v_numero, p_data_agendada, p_observacoes)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.criada', 'instalacao', v_id, v_numero, jsonb_build_object('pedido_id', p_pedido_id, 'equipe_id', p_equipe_id));

  return v_id;
end;
$$;

grant execute on function public.criar_instalacao(uuid, uuid, date, text) to authenticated;

-- =========================================================================
-- 5. adicionar_item_instalacao() — exige quantidade já entregue por T9 e
--    ainda não reservada por outra instalação ativa do mesmo pedido_item.
--    Lock em pedido_itens (não num único "cap row" como T9 faz com
--    ordens_producao, porque aqui a capacidade é uma soma de vários
--    expedicao_itens) serializa concorrência no mesmo item.
-- =========================================================================

create or replace function public.adicionar_item_instalacao(
  p_instalacao_id uuid,
  p_pedido_item_id uuid,
  p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_pedido_item public.pedido_itens;
  v_entregue numeric;
  v_ja_usado numeric;
  v_disponivel numeric;
  v_id uuid;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'agendada' then
    raise exception 'Só é possível adicionar item com a instalação agendada (status atual: %).', v_instalacao.status;
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;

  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id
  for update of pi;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;
  if v_pedido_item.pedido_id <> v_instalacao.pedido_id then
    raise exception 'Este item de pedido não pertence ao pedido desta instalação.';
  end if;

  select coalesce(sum(ei.quantidade_entregue), 0) into v_entregue
  from public.expedicao_itens ei
  join public.expedicoes e on e.id = ei.expedicao_id
  where ei.pedido_item_id = p_pedido_item_id and e.status = 'expedida';

  select coalesce(sum(ii.quantidade), 0) into v_ja_usado
  from public.instalacao_itens ii
  join public.instalacoes i on i.id = ii.instalacao_id
  where ii.pedido_item_id = p_pedido_item_id and i.status <> 'cancelada';

  v_disponivel := v_entregue - v_ja_usado;
  if p_quantidade > v_disponivel then
    raise exception 'Quantidade solicitada (%) excede o disponível para instalação (%).', p_quantidade, v_disponivel;
  end if;

  insert into public.instalacao_itens (company_id, instalacao_id, pedido_item_id, quantidade)
  values (v_company_id, p_instalacao_id, p_pedido_item_id, p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'instalacao.item_adicionado', 'instalacao', p_instalacao_id, null,
    jsonb_build_object('instalacao_item_id', v_id, 'pedido_item_id', p_pedido_item_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_item_instalacao(uuid, uuid, numeric) to authenticated;

create or replace function public.remover_item_instalacao(p_instalacao_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao_status text;
begin
  select i.status into v_instalacao_status
  from public.instalacao_itens ii
  join public.instalacoes i on i.id = ii.instalacao_id
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id
  for update of ii;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;
  if v_instalacao_status <> 'agendada' then
    raise exception 'Só é possível remover item com a instalação agendada (status atual: %).', v_instalacao_status;
  end if;

  delete from public.instalacao_itens where id = p_instalacao_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.item_removido', 'instalacao_item', p_instalacao_item_id, null, null);

  return p_instalacao_item_id;
end;
$$;

grant execute on function public.remover_item_instalacao(uuid) to authenticated;

-- =========================================================================
-- 6. iniciar_execucao_instalacao() / registrar_execucao_item_instalacao()
--    — execução com suporte a parcial (soma, nunca substitui, mesmo padrão
--    de confirmar_entrega_item_expedicao, T9).
-- =========================================================================

create or replace function public.iniciar_execucao_instalacao(p_instalacao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_total_itens int;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'agendada' then
    raise exception 'Só é possível iniciar execução de instalação agendada (status atual: %).', v_instalacao.status;
  end if;

  select count(*) into v_total_itens from public.instalacao_itens where instalacao_id = p_instalacao_id;
  if v_total_itens = 0 then
    raise exception 'Instalação sem itens não pode iniciar execução.';
  end if;

  update public.instalacoes set status = 'em_execucao' where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.execucao_iniciada', 'instalacao', p_instalacao_id, v_instalacao.numero, null);

  return p_instalacao_id;
end;
$$;

grant execute on function public.iniciar_execucao_instalacao(uuid) to authenticated;

create or replace function public.registrar_execucao_item_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade_instalada numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
begin
  select ii.* into v_item
  from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id;
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

  return p_instalacao_item_id;
end;
$$;

grant execute on function public.registrar_execucao_item_instalacao(uuid, numeric) to authenticated;

-- =========================================================================
-- 7. concluir_instalacao() / registrar_aceite_instalacao() /
--    cancelar_instalacao() — transições de estado do cabeçalho.
--    concluir_instalacao() aceita quantidade_pendente > 0 (instalação
--    parcial é exceção operacional básica exigida pelo PLANO §4).
-- =========================================================================

create or replace function public.concluir_instalacao(p_instalacao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'em_execucao' then
    raise exception 'Só é possível concluir instalação em execução (status atual: %).', v_instalacao.status;
  end if;

  update public.instalacoes set status = 'concluida' where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.concluida', 'instalacao', p_instalacao_id, v_instalacao.numero, null);

  return p_instalacao_id;
end;
$$;

grant execute on function public.concluir_instalacao(uuid) to authenticated;

create or replace function public.registrar_aceite_instalacao(p_instalacao_id uuid, p_nome_cliente text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'aceite');
  v_instalacao public.instalacoes;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status <> 'concluida' then
    raise exception 'Só é possível registrar aceite de instalação concluída (status atual: %).', v_instalacao.status;
  end if;
  if p_nome_cliente is null or btrim(p_nome_cliente) = '' then
    raise exception 'Nome de quem aceitou é obrigatório.';
  end if;

  update public.instalacoes
  set status = 'aceita', aceite_por = auth.uid(), aceite_nome_cliente = p_nome_cliente, aceite_em = now()
  where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.aceite_registrado', 'instalacao', p_instalacao_id, p_nome_cliente, null);

  return p_instalacao_id;
end;
$$;

grant execute on function public.registrar_aceite_instalacao(uuid, text) to authenticated;

create or replace function public.cancelar_instalacao(p_instalacao_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status in ('concluida', 'aceita') then
    raise exception 'Instalação concluída ou aceita não pode ser cancelada — use o fluxo de revisita.';
  end if;
  if v_instalacao.status = 'cancelada' then
    raise exception 'Instalação já cancelada.';
  end if;

  update public.instalacoes set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_instalacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.cancelada', 'instalacao', p_instalacao_id, p_motivo, null);

  return p_instalacao_id;
end;
$$;

grant execute on function public.cancelar_instalacao(uuid, text) to authenticated;

-- =========================================================================
-- 8. registrar_ocorrencia_instalacao() — registro livre (mesmo padrão de
--    registrar_ocorrencia_expedicao, T9).
-- =========================================================================

create or replace function public.registrar_ocorrencia_instalacao(p_instalacao_id uuid, p_descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_instalacao public.instalacoes;
  v_id uuid;
begin
  select * into v_instalacao from public.instalacoes
  where id = p_instalacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Instalação não encontrada nesta empresa.';
  end if;
  if v_instalacao.status = 'cancelada' then
    raise exception 'Não é possível registrar ocorrência em instalação cancelada.';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da ocorrência é obrigatória.';
  end if;

  insert into public.ocorrencias_instalacao (company_id, instalacao_id, descricao, registrado_por)
  values (v_company_id, p_instalacao_id, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.ocorrencia_registrada', 'instalacao', p_instalacao_id, p_descricao, null);

  return v_id;
end;
$$;

grant execute on function public.registrar_ocorrencia_instalacao(uuid, text) to authenticated;

-- =========================================================================
-- 9. registrar_dano_instalacao() / solicitar_nova_fabricacao() /
--    decidir_nova_fabricacao() (TÓPICO 16 §8).
-- =========================================================================

create or replace function public.registrar_dano_instalacao(
  p_instalacao_item_id uuid,
  p_quantidade numeric,
  p_causa text,
  p_descricao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_item public.instalacao_itens;
  v_instalacao_status text;
  v_id uuid;
begin
  select ii.* into v_item from public.instalacao_itens ii
  where ii.id = p_instalacao_item_id and ii.company_id = v_company_id;
  if not found then
    raise exception 'Item de instalação não encontrado nesta empresa.';
  end if;

  select status into v_instalacao_status from public.instalacoes where id = v_item.instalacao_id;
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

  return v_id;
end;
$$;

grant execute on function public.registrar_dano_instalacao(uuid, numeric, text, text) to authenticated;

create or replace function public.solicitar_nova_fabricacao(p_dano_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.danos_instalacao where id = p_dano_id and company_id = v_company_id) then
    raise exception 'Dano não encontrado nesta empresa.';
  end if;

  insert into public.solicitacoes_nova_fabricacao (company_id, dano_id, motivo, solicitado_por)
  values (v_company_id, p_dano_id, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.nova_fabricacao_solicitada', 'dano_instalacao', p_dano_id, p_motivo, jsonb_build_object('solicitacao_id', v_id));

  return v_id;
end;
$$;

grant execute on function public.solicitar_nova_fabricacao(uuid, text) to authenticated;

create or replace function public.decidir_nova_fabricacao(p_solicitacao_id uuid, p_decisao text, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('instalacao', 'decidir_dano');
  v_solicitacao public.solicitacoes_nova_fabricacao;
begin
  if p_decisao not in ('aprovada', 'rejeitada') then
    raise exception 'Decisão inválida: "%" (use aprovada ou rejeitada).', p_decisao;
  end if;

  select * into v_solicitacao from public.solicitacoes_nova_fabricacao
  where id = p_solicitacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Solicitação de nova fabricação não encontrada nesta empresa.';
  end if;
  if v_solicitacao.status <> 'pendente' then
    raise exception 'Só é possível decidir solicitação pendente (status atual: %).', v_solicitacao.status;
  end if;

  update public.solicitacoes_nova_fabricacao
  set status = p_decisao, decidido_por = auth.uid(), decidido_em = now(), motivo_decisao = p_motivo
  where id = p_solicitacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'instalacao.nova_fabricacao_decidida', 'dano_instalacao', v_solicitacao.dano_id, p_motivo, jsonb_build_object('solicitacao_id', p_solicitacao_id, 'decisao', p_decisao));

  return p_solicitacao_id;
end;
$$;

grant execute on function public.decidir_nova_fabricacao(uuid, text, text) to authenticated;
