-- TÓPICO 10 §9 — captura de características de peça configurável durante
-- o orçamento (decisão do responsável do produto em 26/09/2026). Até
-- aqui o configurador (peca_caracteristicas/pedido_item_caracteristicas,
-- Fase F da BOM leve, 20261016000000) só existia do lado do Pedido, gate
-- engenharia.manage — a justificativa original do ADR-002 §4.3 (19/09)
-- pra deixar "produtos configuráveis" fora do MVP era que a Engenharia
-- ainda não tinha BOM madura; isso deixou de ser verdade com as Fases
-- F-H (configurador, motor de regras, BOM sugerida→definitiva),
-- encerradas em 25/09.
--
-- Recorte, decidido explicitamente: só §9 (informar largura, material,
-- acabamento etc. já no orçamento). Ficam fora, por serem workflow maior
-- e distinto que mereceria sua própria decisão de escopo:
--   - §10 (Comercial solicita à Engenharia uma estrutura nova/especial,
--     com aprovar/reprovar/devolver) — não existe hoje nem do lado do
--     Pedido;
--   - §11 (validação técnica formal com 5 status) — idem.
--
-- Decisão explícita sobre a conversão orçamento→pedido: os valores
-- capturados aqui NÃO são copiados automaticamente pro pedido_item_
-- caracteristicas quando o orçamento vira pedido. converter_orcamento_
-- em_pedido() faz um INSERT...SELECT em lote (sem laço linha a linha),
-- e mudar isso pra preservar a correspondência orçamento_item↔pedido_item
-- seria mexer numa função central já testada — fica pra uma fase
-- seguinte, se comprovado necessário. A Engenharia continua capturando/
-- confirmando no pedido exatamente como já faz hoje; o dado aqui serve
-- de subsídio pra precificação do Comercial durante a cotação.
--
-- Gate: orcamentos.manage (não engenharia.manage) — é o Comercial quem
-- informa isso na cotação, mesma permissão que já governa
-- upsert_orcamento_item(). Só permitido com orçamento em rascunho, mesma
-- regra de upsert_orcamento_item(). Mesma validação de tipo/opção que
-- definir_valor_caracteristica_pedido_item() já usa — nenhuma regra nova
-- inventada, só o mesmo contrato aplicado num estágio anterior.
create table public.orcamento_item_caracteristicas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  orcamento_item_id uuid not null references public.orcamento_itens(id) on delete cascade,
  peca_caracteristica_id uuid not null references public.peca_caracteristicas(id),
  valor_numero numeric(14, 4),
  valor_texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orcamento_item_caracteristicas_unique unique (orcamento_item_id, peca_caracteristica_id),
  constraint orcamento_item_caracteristicas_valor_check check (
    (valor_numero is not null and valor_texto is null) or (valor_numero is null and valor_texto is not null)
  )
);
comment on table public.orcamento_item_caracteristicas is 'TÓPICO 10 §9 — valor de característica de peça configurável, capturado já na cotação (espelho de pedido_item_caracteristicas, gate orcamentos.manage em vez de engenharia.manage). Não é copiado automaticamente ao converter em pedido.';
create index orcamento_item_caracteristicas_company_id_idx on public.orcamento_item_caracteristicas (company_id);
create index orcamento_item_caracteristicas_orcamento_item_id_idx on public.orcamento_item_caracteristicas (orcamento_item_id);

alter table public.orcamento_item_caracteristicas enable row level security;
create policy orcamento_item_caracteristicas_select on public.orcamento_item_caracteristicas for select
  using (company_id = (select public.current_company_id()));
grant select on public.orcamento_item_caracteristicas to authenticated;

create trigger set_updated_at before update on public.orcamento_item_caracteristicas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- definir_valor_caracteristica_orcamento_item() — mesma validação de
-- definir_valor_caracteristica_pedido_item() (tipo numérico/texto,
-- opções permitidas), só que o gate é orcamentos.manage e a checagem de
-- edição é "orçamento em rascunho" em vez de "pedido existe".
-- =========================================================================
create or replace function public.definir_valor_caracteristica_orcamento_item(
  p_orcamento_item_id uuid, p_peca_caracteristica_id uuid,
  p_valor_numero numeric default null, p_valor_texto text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento_item public.orcamento_itens;
  v_orcamento public.orcamentos;
  v_caract public.peca_caracteristicas;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;

  select oi.* into v_orcamento_item from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_orcamento_item_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item de orçamento não encontrado nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos where id = v_orcamento_item.orcamento_id;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível alterar características de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_peca_caracteristica_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if not exists (select 1 from public.pecas where id = v_caract.peca_id and item_id = v_orcamento_item.item_id) then
    raise exception 'Esta característica não pertence à peça deste item de orçamento.';
  end if;

  if v_caract.tipo = 'numero' then
    if p_valor_numero is null or p_valor_texto is not null then
      raise exception 'Característica "%" é numérica — informe só valor_numero.', v_caract.nome;
    end if;
  else
    if p_valor_texto is null or p_valor_numero is not null then
      raise exception 'Característica "%" é de texto/opção — informe só valor_texto.', v_caract.nome;
    end if;
    if v_caract.tipo = 'opcao' and not (p_valor_texto = any(v_caract.opcoes)) then
      raise exception 'Valor "%" não é uma opção permitida para "%" (permitidas: %).', p_valor_texto, v_caract.nome, array_to_string(v_caract.opcoes, ', ');
    end if;
  end if;

  insert into public.orcamento_item_caracteristicas (company_id, orcamento_item_id, peca_caracteristica_id, valor_numero, valor_texto)
  values (v_company_id, p_orcamento_item_id, p_peca_caracteristica_id, p_valor_numero, p_valor_texto)
  on conflict (orcamento_item_id, peca_caracteristica_id)
  do update set valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'orcamentos.caracteristica_valor_definido', 'orcamento_item_caracteristica', v_id, v_caract.nome,
    jsonb_build_object('orcamento_item_id', p_orcamento_item_id, 'valor_numero', p_valor_numero, 'valor_texto', p_valor_texto)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_valor_caracteristica_orcamento_item(uuid, uuid, numeric, text) to authenticated;

-- =========================================================================
-- listar_valores_caracteristicas_orcamento_item() — todas as
-- características da peça do item, com o valor já capturado quando
-- existir (left join, mesmo padrão da versão de pedido_item).
-- =========================================================================
create or replace function public.listar_valores_caracteristicas_orcamento_item(p_orcamento_item_id uuid)
returns table (
  peca_caracteristica_id uuid, nome text, tipo text, unidade text, obrigatoria boolean,
  valor_numero numeric, valor_texto text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;

  select oi.item_id into v_item_id from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_orcamento_item_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item de orçamento não encontrado nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.obrigatoria, v.valor_numero, v.valor_texto
  from public.pecas p
  join public.peca_caracteristicas pc on pc.peca_id = p.id
  left join public.orcamento_item_caracteristicas v
    on v.peca_caracteristica_id = pc.id and v.orcamento_item_id = p_orcamento_item_id
  where p.item_id = v_item_id and p.company_id = v_company_id
  order by pc.nome;
end;
$$;

grant execute on function public.listar_valores_caracteristicas_orcamento_item(uuid) to authenticated;
