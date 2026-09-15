-- TÓPICO 4 — Produção (PCP), recorte mínimo do M1 (PLANO DE ENTREGA — MVP
-- DO PILOTO v1.0, novembro: "o que a fábrica faz"). Texto exato do
-- recorte (PLANO §4): "T4 — Produção: ordem de produção, etapas,
-- apontamento, conclusão, perda real e lista de corte (T4 §54). Sem
-- otimização, sem sequenciamento avançado."
--
-- O TÓPICO 4 completo (docs/Prompt TÓPICO 4) é o módulo mais amplo do
-- MVP: sequenciamento inteligente com recomendação/aceite/simulação
-- (§6-8), lote fabril agrupando várias OPs (§14), roteiro produtivo
-- configurável por empresa com acompanhamento operação-a-operação
-- (§15-16), capacidade/recursos/manutenção (§31-37), qualidade integrada
-- e não conformidade (§26-29), custos produtivos (§45), QR Code/etiquetas
-- (§18-19), interfaces por dispositivo (§17). O próprio §49 do TÓPICO 4
-- já reconhece que a primeira versão usa regras simples, não IA autônoma;
-- aqui o corte é ainda mais estreito, mesmo critério de T2/T15/T10/T3/T5/
-- T6: só o que sustenta o fluxo mínimo do piloto.
--
-- Decisões de recorte:
--   - Uma OP = um pedido_item, 1:1 (sem OP parcial/paralela/lote fabril —
--     §11-14 são escopo amplo, não M1).
--   - "Etapas" do recorte mínimo é o próprio status da OP (planejada ->
--     em_producao -> concluida/cancelada) — o acompanhamento operação-a-
--     operação do §16 (Corte/Usinagem/Montagem/Inspeção com quantidade
--     própria) pertence ao roteiro configurável do §15, fora do M1.
--   - "Apontamento" (§38) acumula quantidade produzida/perdida em
--     múltiplos registros (producao_apontamentos) até a OP ser concluída
--     — sem apontar início/pausa/retomada/parada com motivo (isso é
--     tracking de tempo, não de quantidade; fora do recorte mínimo).
--   - Regra de bloqueio por medida (TÓPICO 16 §7): reaproveita
--     pedido_bloqueado_por_medicao(), construída em 20260913220000
--     especificamente à espera deste consumidor.
--   - Encerramento (§43): critério mínimo é quantidade_produzida >=
--     quantidade_planejada — sem inspeção/rejeição/retrabalho integrados
--     (isso é TÓPICO 8 Qualidade, módulo separado de dezembro).
--   - Lista de corte (T4 §54, complemento de 12/09/2026): função de
--     leitura, não entidade armazenada ("não é resultado de otimização
--     matemática... a decisão final de corte permanece com o operador").
--     Reaproveita get_cutting_margin() (T15) e as medidas de
--     itens_producao (T5). Omite "sobra prevista" do §54: calcular sobra
--     a partir da margem de quebra percentual exigiria uma fórmula
--     (aditiva sobre o corte vs. fração da chapa/barra de origem) que não
--     está definida em nenhum ADR nem no TÓPICO 15/4 — revisitar quando o
--     responsável do produto definir a fórmula, em vez de inventar uma
--     agora. "Sequência sugerida de corte" também fica de fora — é
--     otimização/nesting, explicitamente fora de escopo pelo próprio §54.
--
-- Nota (achado, não corrigido nesta migration): SEC-007 (Security Gate
-- Fase 8 P1) aplicou assert_company_not_suspended() em upsert_pessoa/
-- upsert_obra/upsert_item/set_pessoa_papel (T2) porque foram os únicos
-- citados pela auditoria — mas nenhuma função de T3/T5/T6/T10 chama essa
-- guarda (verificado: grep não encontra a chamada em nenhum desses
-- arquivos). É uma lacuna da mesma classe, fora do escopo desta migration
-- (T4 é feature nova, não uma correção de segurança) — as funções novas
-- abaixo já nascem com a guarda; revisitar T3/T5/T6/T10 num pass dedicado.

-- =========================================================================
-- next_document_number() (T15/T10) — SEC-008 residual: "outros document_
-- type (ex.: ordem_producao) continuam sem gate... revisitar quando
-- tiverem consumidor real" (20260913210000). T4 é esse consumidor —
-- estende o gate seguindo o mesmo padrão de orcamento/pedido. Corpo
-- idêntico ao anterior, só acrescentando o ramo de ordem_producao.
-- =========================================================================

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

  if p_document_type = 'orcamento' and not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
  elsif p_document_type = 'pedido' and not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
  elsif p_document_type = 'ordem_producao' and not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.manage).';
  end if;
  -- Outros document_type além destes três continuam sem gate — mesma
  -- decisão original de T15: revisitar quando tiverem consumidor real.

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

create table public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_id uuid not null references public.pedidos(id),
  pedido_item_id uuid not null references public.pedido_itens(id),
  numero text not null,
  quantidade_planejada numeric(14, 3) not null check (quantidade_planejada > 0),
  quantidade_produzida numeric(14, 3) not null default 0 check (quantidade_produzida >= 0),
  quantidade_perdida numeric(14, 3) not null default 0 check (quantidade_perdida >= 0),
  status text not null default 'planejada' check (status in ('planejada', 'em_producao', 'concluida', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ordens_producao_company_numero_unique unique (company_id, numero),
  constraint ordens_producao_pedido_item_unique unique (pedido_item_id)
);
comment on table public.ordens_producao is 'TÓPICO 4, recorte mínimo — uma OP por pedido_item (sem OP parcial/paralela/lote fabril, §11-14 fora do M1). "Etapas" do recorte é o próprio status; acompanhamento operação-a-operação (§16) fica pro roteiro configurável, fora do M1.';
create index ordens_producao_pedido_id_idx on public.ordens_producao (pedido_id);

create table public.producao_apontamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
  quantidade_produzida numeric(14, 3) not null default 0 check (quantidade_produzida >= 0),
  quantidade_perdida numeric(14, 3) not null default 0 check (quantidade_perdida >= 0),
  observacao text,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now(),
  constraint producao_apontamentos_quantidade_check check (quantidade_produzida > 0 or quantidade_perdida > 0)
);
comment on table public.producao_apontamentos is 'TÓPICO 4 §38, recorte mínimo — cada apontamento soma em ordens_producao.quantidade_produzida/quantidade_perdida. Perda real aqui nunca se confunde com a margem de quebra planejada (T15/get_cutting_margin) — Arquitetura Mestre 6.3.';
create index producao_apontamentos_ordem_id_idx on public.producao_apontamentos (ordem_producao_id);

create trigger set_updated_at before update on public.ordens_producao
  for each row execute function public.set_updated_at();

alter table public.ordens_producao enable row level security;
alter table public.producao_apontamentos enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- producao.view — mesmo padrão de T2/T5/T6/T10/T15: T8 (Qualidade) e T9
-- (Expedição), quando existirem, vão precisar ler ordens_producao sem que
-- seu usuário administre Produção.
create policy ordens_producao_select on public.ordens_producao for select
  using (company_id = (select public.current_company_id()));
create policy producao_apontamentos_select on public.producao_apontamentos for select
  using (company_id = (select public.current_company_id()));

grant select on public.ordens_producao to authenticated;
grant select on public.producao_apontamentos to authenticated;

-- =========================================================================
-- criar_ordem_producao() — só a partir de pedido liberado (ADR-002 §6:
-- Liberação -> Engenharia -> Produção), respeitando a regra de bloqueio
-- por medida (TÓPICO 16 §7 / PLANO §4) via pedido_bloqueado_por_medicao().
-- =========================================================================

create or replace function public.criar_ordem_producao(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_numero text;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para gerenciar produção (producao.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if public.pedido_bloqueado_por_medicao(v_pedido.id) then
    raise exception 'Pedido bloqueado para produção: há item com medida em obra não confirmada (TÓPICO 16 §7).';
  end if;
  if exists (select 1 from public.ordens_producao where pedido_item_id = p_pedido_item_id) then
    raise exception 'Este item de pedido já tem ordem de produção.';
  end if;

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (company_id, pedido_id, pedido_item_id, numero, quantidade_planejada)
  values (v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_pedido_item.quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id, 'quantidade_planejada', v_pedido_item.quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_ordem_producao(uuid) to authenticated;

-- =========================================================================
-- apontar_producao() — TÓPICO 4 §38, recorte mínimo: soma quantidade
-- produzida/perdida na OP a cada chamada, sem apontar tempo (início/
-- pausa/retomada/parada). Primeira chamada muda o status pra
-- 'em_producao' automaticamente.
-- =========================================================================

create or replace function public.apontar_producao(
  p_ordem_producao_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_perdida numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para gerenciar produção (producao.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if coalesce(p_quantidade_produzida, 0) < 0 or coalesce(p_quantidade_perdida, 0) < 0 then
    raise exception 'Quantidade produzida e perdida não podem ser negativas.';
  end if;
  if coalesce(p_quantidade_produzida, 0) = 0 and coalesce(p_quantidade_perdida, 0) = 0 then
    raise exception 'Informe quantidade produzida e/ou perdida maior que zero.';
  end if;

  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, quantidade_produzida, quantidade_perdida, observacao, registrado_por
  ) values (
    v_company_id, p_ordem_producao_id, coalesce(p_quantidade_produzida, 0), coalesce(p_quantidade_perdida, 0),
    p_observacao, auth.uid()
  ) returning id into v_id;

  update public.ordens_producao set
    quantidade_produzida = quantidade_produzida + coalesce(p_quantidade_produzida, 0),
    quantidade_perdida = quantidade_perdida + coalesce(p_quantidade_perdida, 0),
    status = 'em_producao'
  where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', p_ordem_producao_id, p_observacao,
    jsonb_build_object('quantidade_produzida', p_quantidade_produzida, 'quantidade_perdida', p_quantidade_perdida)
  );

  return v_id;
end;
$$;

grant execute on function public.apontar_producao(uuid, numeric, numeric, text) to authenticated;

-- =========================================================================
-- concluir_ordem_producao() — TÓPICO 4 §43: critério mínimo de
-- encerramento é quantidade_produzida >= quantidade_planejada. Sem
-- inspeção/rejeição/retrabalho integrados (TÓPICO 8 Qualidade, módulo
-- separado de dezembro) — a OP concluída aqui ainda não passou por
-- controle de qualidade.
-- =========================================================================

create or replace function public.concluir_ordem_producao(p_ordem_producao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para gerenciar produção (producao.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível concluir OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if v_op.quantidade_produzida < v_op.quantidade_planejada then
    raise exception 'Quantidade produzida (%) ainda não atinge a planejada (%).', v_op.quantidade_produzida, v_op.quantidade_planejada;
  end if;

  update public.ordens_producao set status = 'concluida' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_concluida', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('quantidade_produzida', v_op.quantidade_produzida, 'quantidade_perdida', v_op.quantidade_perdida)
  );

  return p_ordem_producao_id;
end;
$$;

grant execute on function public.concluir_ordem_producao(uuid) to authenticated;

-- =========================================================================
-- cancelar_ordem_producao() — mesma simetria de cancelar_pedido()/
-- cancelar_orcamento() (T3/T10): não cancela o que já foi concluído.
-- =========================================================================

create or replace function public.cancelar_ordem_producao(p_ordem_producao_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para gerenciar produção (producao.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status = 'concluida' then
    raise exception 'Ordem de produção já concluída não pode ser cancelada.';
  end if;
  if v_op.status = 'cancelada' then
    raise exception 'Ordem de produção já está cancelada.';
  end if;

  update public.ordens_producao set status = 'cancelada' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_cancelada', 'ordem_producao', p_ordem_producao_id, p_motivo,
    jsonb_build_object('status_anterior', v_op.status)
  );

  return p_ordem_producao_id;
end;
$$;

grant execute on function public.cancelar_ordem_producao(uuid, text) to authenticated;

-- =========================================================================
-- lista_corte() — TÓPICO 4 §54 (complemento de 12/09/2026): saída de
-- leitura, não entidade armazenada. Reaproveita get_cutting_margin()
-- (T15) e as medidas de itens_producao (T5), quando existirem — item sem
-- medição em obra (catálogo/padrão) retorna dimensões nulas, o operador
-- usa a ficha técnica do próprio item nesse caso. Omite "sequência
-- sugerida de corte" (é nesting/otimização, fora de escopo pelo próprio
-- §54) e "sobra prevista" (sem fórmula definida em nenhum ADR — revisitar
-- quando o responsável do produto definir).
-- =========================================================================

create or replace function public.lista_corte(p_ordem_producao_id uuid)
returns table (
  ordem_producao_id uuid,
  numero text,
  pedido_numero text,
  pessoa_nome text,
  obra_nome text,
  ambiente text,
  item_codigo text,
  item_descricao text,
  largura_mm numeric,
  altura_mm numeric,
  quantidade numeric,
  margem_quebra_percentual numeric,
  responsavel text,
  emitido_em timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  return query
  select
    v_op.id,
    v_op.numero,
    p.numero,
    pe.nome,
    o.nome,
    ip.ambiente,
    i.codigo,
    i.descricao,
    ip.largura_mm,
    ip.altura_mm,
    v_op.quantidade_planejada,
    public.get_cutting_margin(i.tipo, ''),
    prof.display_name,
    now()
  from public.pedido_itens pit
  join public.pedidos p on p.id = pit.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  join public.itens i on i.id = pit.item_id
  left join public.itens_producao ip on ip.pedido_item_id = pit.id
  left join public.profiles prof on prof.id = auth.uid()
  where pit.id = v_op.pedido_item_id;
end;
$$;

grant execute on function public.lista_corte(uuid) to authenticated;
