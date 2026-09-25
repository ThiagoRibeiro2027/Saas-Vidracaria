-- TÓPICO 13 — Integrações, Fase 4 (ADR-002 §4.17, emenda de 25/09/2026):
-- webhooks enviados + motor de automação Evento → Condição → Ação (§14-15).
-- Decisões de recorte (responsável do produto, via chat):
--   - Só níveis Informativo e Assistido (§15). Automático ("detectar →
--     executar" sem decisão humana) fica de fora — o próprio §15 exige
--     autorização própria pra esse nível, que não foi dada agora.
--   - Por isso o modelo trava a combinação: nível informativo só aceita
--     ação "notificar" (nunca efeito externo, mesmo espírito do nível);
--     nível assistido só aceita ação "webhook_saida" (a única com efeito
--     externo, por isso é a única que exige confirmação humana antes de
--     executar). Isso também torna o motor estruturalmente à prova de
--     loop: a única ação que gera uma NOVA linha na fila (webhook_saida)
--     nunca dispara sozinha, sempre depende de confirmar_execucao_regra().
--   - Entrega de fato via Vercel Cron 1x/dia (plano Hobby, mesma
--     limitação já aceita pros crons de security-alerts/notificacoes-
--     email) — aceito conscientemente nesta fase.
--   - Condição da regra suporta MÚLTIPLAS condições combinadas por um
--     único operador E/OU (não agrupamento aninhado — isso cobre o pedido
--     de "já suportar E/OU" sem multiplicar a complexidade de schema/UI).
--
-- "Evento" reaproveita a mesma fila da Fase 1/3 (integracao_operacoes) —
-- não existe um barramento de evento separado: qualquer linha nova ali
-- (de onde vier: webhook recebido, futura sincronização, importação) é um
-- "evento" candidato a regra, casado por tipo. Trigger AFTER INSERT, não
-- uma chamada explícita — assim qualquer origem futura já participa sem
-- precisar lembrar de "avisar o motor de regras".
--
-- Checklist de segurança (CLAUDE.md): RLS habilitada em toda tabela nova
-- com teste de isolamento cross-tenant; integracao_webhooks_saida guarda
-- segredo em claro (mesma justificativa de integracao_webhooks — HMAC
-- exige o valor original, não um hash) e por isso não tem NENHUMA policy
-- de SELECT, só acesso via listar_webhooks_saida() (nunca devolve secret);
-- gates de escrita via assert_tenant_write('integracoes','manage'); as
-- 3 funções sistema_* (chamadas só pelo cron de entrega, sem sessão de
-- usuário) seguem o mesmo padrão já estabelecido em
-- registrar_operacao_webhook — restritas a service_role, nunca
-- authenticated; SECURITY DEFINER com search_path=public em todas.

-- =========================================================================
-- 1. DESTINOS DE WEBHOOK DE SAÍDA
-- =========================================================================

create table public.integracao_webhooks_saida (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  integracao_id uuid not null references public.integracoes(id),
  nome text not null,
  url text not null,
  secret text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.integracao_webhooks_saida is
  'TÓPICO 13 §14, Fase 4 — destino de webhook de saída (URL + segredo de terceiro). secret em claro, nunca exposto por SELECT — mesmo raciocínio de integracao_webhooks (Fase 3): HMAC precisa do valor original, e a proteção é RLS sem policy de leitura, não hash.';
create index integracao_webhooks_saida_company_id_idx on public.integracao_webhooks_saida (company_id);
create index integracao_webhooks_saida_integracao_id_idx on public.integracao_webhooks_saida (integracao_id);

create trigger set_updated_at before update on public.integracao_webhooks_saida
  for each row execute function public.set_updated_at();

alter table public.integracao_webhooks_saida enable row level security;
revoke all on public.integracao_webhooks_saida from anon, authenticated;

create or replace function public.configurar_webhook_saida(
  p_id uuid,
  p_integracao_id uuid,
  p_nome text,
  p_url text,
  p_secret text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_integracao public.integracoes;
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_url is null or p_url !~ '^https://' then
    raise exception 'URL precisa começar com https:// (webhook de saída nunca é enviado sem TLS).';
  end if;
  if p_secret is null or length(p_secret) < 16 then
    raise exception 'Segredo precisa ter ao menos 16 caracteres.';
  end if;

  select * into v_integracao from public.integracoes
  where id = p_integracao_id and company_id = v_company_id;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: ative antes de configurar um webhook de saída.';
  end if;

  if p_id is not null then
    update public.integracao_webhooks_saida
    set integracao_id = p_integracao_id, nome = p_nome, url = p_url, secret = p_secret, ativo = true
    where id = p_id and company_id = v_company_id
    returning id into v_id;
    if not found then
      raise exception 'Webhook de saída não encontrado nesta empresa.';
    end if;
  else
    insert into public.integracao_webhooks_saida (company_id, integracao_id, nome, url, secret)
    values (v_company_id, p_integracao_id, p_nome, p_url, p_secret)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (
    v_company_id, auth.uid(),
    case when p_id is null then 'integracoes.webhook_saida_configurado' else 'integracoes.webhook_saida_reconfigurado' end,
    'integracao_webhook_saida', v_id, p_nome
  );

  return v_id;
end;
$$;

grant execute on function public.configurar_webhook_saida(uuid, uuid, text, text, text) to authenticated;

create or replace function public.desativar_webhook_saida(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
begin
  update public.integracao_webhooks_saida set ativo = false
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Webhook de saída não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.webhook_saida_desativado', 'integracao_webhook_saida', p_id);

  return p_id;
end;
$$;

grant execute on function public.desativar_webhook_saida(uuid) to authenticated;

create or replace function public.ativar_webhook_saida(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
begin
  update public.integracao_webhooks_saida set ativo = true
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Webhook de saída não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.webhook_saida_ativado', 'integracao_webhook_saida', p_id);

  return p_id;
end;
$$;

grant execute on function public.ativar_webhook_saida(uuid) to authenticated;

create or replace function public.listar_webhooks_saida()
returns table (id uuid, integracao_id uuid, nome text, url text, ativo boolean, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.integracao_id, w.nome, w.url, w.ativo, w.created_at, w.updated_at
  from public.integracao_webhooks_saida w
  where w.company_id = (select public.current_company_id())
    and (select public.has_permission('integracoes', 'view'))
  order by w.created_at desc;
$$;

grant execute on function public.listar_webhooks_saida() to authenticated;

-- =========================================================================
-- 2. REGRAS DE AUTOMAÇÃO (Evento → Condição → Ação)
-- =========================================================================

create table public.integracao_regras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  evento_tipo text not null,
  condicao_operador text not null default 'E' check (condicao_operador in ('E', 'OU')),
  condicoes jsonb not null,
  nivel_automacao text not null check (nivel_automacao in ('informativo', 'assistido')),
  acao_tipo text not null check (acao_tipo in ('notificar', 'webhook_saida')),
  acao_config jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.integracao_regras is
  'TÓPICO 13 §14-15, Fase 4 — regra "evento_tipo bate com integracao_operacoes.tipo E as condições avaliam contra o payload → dispara a ação". condicoes é um array de {campo, operador, valor}, combinado por condicao_operador (E/OU, sem agrupamento aninhado nesta fase). Nível "automático" não é permitido (check constraint só aceita informativo/assistido) — exige autorização própria (§15).';
create index integracao_regras_company_evento_idx on public.integracao_regras (company_id, evento_tipo) where ativo;

create trigger set_updated_at before update on public.integracao_regras
  for each row execute function public.set_updated_at();

alter table public.integracao_regras enable row level security;
create policy integracao_regras_select on public.integracao_regras for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('integracoes', 'view')));

grant select on public.integracao_regras to authenticated;

create or replace function public.configurar_regra_automacao(
  p_id uuid,
  p_nome text,
  p_evento_tipo text,
  p_condicao_operador text,
  p_condicoes jsonb,
  p_nivel_automacao text,
  p_acao_tipo text,
  p_acao_config jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_elem jsonb;
  v_webhook_saida_id uuid;
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da regra é obrigatório.';
  end if;
  if p_evento_tipo is null or btrim(p_evento_tipo) = '' then
    raise exception 'Tipo de evento é obrigatório.';
  end if;
  if p_condicao_operador not in ('E', 'OU') then
    raise exception 'Operador entre condições inválido: "%".', p_condicao_operador;
  end if;

  if jsonb_typeof(p_condicoes) is distinct from 'array' then
    raise exception 'Condições precisam ser uma lista.';
  end if;
  if jsonb_array_length(p_condicoes) < 1 then
    raise exception 'Informe ao menos uma condição.';
  end if;
  for v_elem in select * from jsonb_array_elements(p_condicoes) loop
    if not (v_elem ? 'campo' and v_elem ? 'operador' and v_elem ? 'valor') then
      raise exception 'Cada condição precisa de campo, operador e valor.';
    end if;
    if btrim(coalesce(v_elem->>'campo', '')) = '' then
      raise exception 'Campo da condição não pode ser vazio.';
    end if;
    if not (v_elem->>'operador' = any(array['=', '!=', '>', '<', '>=', '<=', 'contem'])) then
      raise exception 'Operador de condição inválido: "%".', v_elem->>'operador';
    end if;
  end loop;

  -- §15: informativo nunca tem efeito externo (só "notificar"); assistido
  -- é reservado pra ação com efeito externo (webhook_saida), que só
  -- executa após confirmar_execucao_regra() — nunca sozinha.
  if p_nivel_automacao = 'informativo' then
    if p_acao_tipo <> 'notificar' then
      raise exception 'Nível informativo só permite a ação "notificar" (nunca executa efeito externo).';
    end if;
  elsif p_nivel_automacao = 'assistido' then
    if p_acao_tipo <> 'webhook_saida' then
      raise exception 'Nível assistido só permite a ação "webhook_saida" (a única com efeito externo, por isso exige confirmação).';
    end if;
    v_webhook_saida_id := nullif(p_acao_config->>'webhook_saida_id', '')::uuid;
    if v_webhook_saida_id is null then
      raise exception 'Informe o destino (webhook_saida_id) para a ação webhook_saida.';
    end if;
    if not exists (
      select 1 from public.integracao_webhooks_saida
      where id = v_webhook_saida_id and company_id = v_company_id and ativo = true
    ) then
      raise exception 'Destino de webhook de saída não encontrado, inativo ou de outra empresa.';
    end if;
  else
    raise exception 'Nível de automação inválido ou não autorizado: "%". Só "informativo" e "assistido" estão liberados nesta fase (§15).', p_nivel_automacao;
  end if;

  if p_id is not null then
    update public.integracao_regras
    set nome = p_nome, evento_tipo = p_evento_tipo, condicao_operador = p_condicao_operador,
        condicoes = p_condicoes, nivel_automacao = p_nivel_automacao, acao_tipo = p_acao_tipo, acao_config = p_acao_config
    where id = p_id and company_id = v_company_id
    returning id into v_id;
    if not found then
      raise exception 'Regra não encontrada nesta empresa.';
    end if;
  else
    insert into public.integracao_regras (
      company_id, nome, evento_tipo, condicao_operador, condicoes, nivel_automacao, acao_tipo, acao_config
    ) values (
      v_company_id, p_nome, p_evento_tipo, p_condicao_operador, p_condicoes, p_nivel_automacao, p_acao_tipo, p_acao_config
    ) returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(),
    case when p_id is null then 'integracoes.regra_configurada' else 'integracoes.regra_reconfigurada' end,
    'integracao_regra', v_id, p_nome, jsonb_build_object('evento_tipo', p_evento_tipo, 'nivel_automacao', p_nivel_automacao)
  );

  return v_id;
end;
$$;

grant execute on function public.configurar_regra_automacao(uuid, text, text, text, jsonb, text, text, jsonb) to authenticated;

create or replace function public.ativar_regra_automacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
begin
  update public.integracao_regras set ativo = true where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Regra não encontrada nesta empresa.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.regra_ativada', 'integracao_regra', p_id);
  return p_id;
end;
$$;

grant execute on function public.ativar_regra_automacao(uuid) to authenticated;

create or replace function public.desativar_regra_automacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
begin
  update public.integracao_regras set ativo = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Regra não encontrada nesta empresa.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.regra_desativada', 'integracao_regra', p_id);
  return p_id;
end;
$$;

grant execute on function public.desativar_regra_automacao(uuid) to authenticated;

-- =========================================================================
-- 3. EXECUÇÕES DE REGRA (histórico + fila de confirmação do nível Assistido)
-- =========================================================================

create table public.integracao_execucoes_regra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  regra_id uuid not null references public.integracao_regras(id),
  operacao_id uuid not null references public.integracao_operacoes(id),
  nivel_automacao text not null,
  status text not null check (status in ('aguardando_confirmacao', 'confirmada', 'rejeitada', 'executada_informativo')),
  resultado jsonb,
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.integracao_execucoes_regra is
  'TÓPICO 13 §14-15, Fase 4 — cada vez que uma regra bate com um evento (integracao_operacoes). Nível informativo já nasce "executada_informativo" (só notificou); nível assistido nasce "aguardando_confirmacao" até confirmar_execucao_regra()/rejeitar_execucao_regra().';
create index integracao_execucoes_regra_company_id_idx on public.integracao_execucoes_regra (company_id);
create index integracao_execucoes_regra_regra_id_idx on public.integracao_execucoes_regra (regra_id);
create index integracao_execucoes_regra_aguardando_idx on public.integracao_execucoes_regra (company_id) where status = 'aguardando_confirmacao';

alter table public.integracao_execucoes_regra enable row level security;
create policy integracao_execucoes_regra_select on public.integracao_execucoes_regra for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('integracoes', 'view')));

grant select on public.integracao_execucoes_regra to authenticated;

-- =========================================================================
-- 4. AVALIAÇÃO DA CONDIÇÃO — helpers internos (sem grant a anon; harmless
--    o suficiente pra authenticated: não tocam tabela nenhuma).
-- =========================================================================

create or replace function public.extrair_campo_payload(p_payload jsonb, p_caminho text)
returns text
language sql immutable as $$
  select p_payload #>> string_to_array(p_caminho, '.');
$$;

revoke all on function public.extrair_campo_payload(jsonb, text) from anon;
grant execute on function public.extrair_campo_payload(jsonb, text) to authenticated, service_role;

create or replace function public.avaliar_condicao(p_valor_real text, p_operador text, p_valor_esperado text)
returns boolean
language plpgsql immutable as $$
declare
  v_real numeric;
  v_esperado numeric;
begin
  if p_valor_real is null then
    return false; -- campo ausente no payload nunca satisfaz condição
  end if;

  if p_operador in ('>', '<', '>=', '<=') then
    begin
      v_real := p_valor_real::numeric;
      v_esperado := p_valor_esperado::numeric;
    exception when others then
      return false; -- não numérico: operador numérico nunca casa
    end;
    return case p_operador
      when '>' then v_real > v_esperado
      when '<' then v_real < v_esperado
      when '>=' then v_real >= v_esperado
      else v_real <= v_esperado
    end;
  elsif p_operador = '=' then
    return p_valor_real = p_valor_esperado;
  elsif p_operador = '!=' then
    return p_valor_real <> p_valor_esperado;
  elsif p_operador = 'contem' then
    return position(lower(coalesce(p_valor_esperado, '')) in lower(p_valor_real)) > 0;
  else
    raise exception 'Operador de condição inválido: %.', p_operador;
  end if;
end;
$$;

revoke all on function public.avaliar_condicao(text, text, text) from anon;
grant execute on function public.avaliar_condicao(text, text, text) to authenticated, service_role;

-- =========================================================================
-- 5. GATILHO — qualquer INSERT em integracao_operacoes é um "evento"
--    candidato. Roda com os mesmos privilégios de quem inseriu a linha
--    (trigger não-SECURITY DEFINER herda o contexto da transação que já
--    está dentro de uma função SECURITY DEFINER — enfileirar_operacao ou
--    registrar_operacao_webhook), mas é marcado SECURITY DEFINER mesmo
--    assim, por consistência com a regra 6 do CLAUDE.md (toda função nova
--    declara search_path controlado).
-- =========================================================================

create or replace function public.avaliar_regras_automacao()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_regra public.integracao_regras;
  v_cond jsonb;
  v_match boolean;
  v_cmp boolean;
  v_execucao_id uuid;
begin
  for v_regra in
    select * from public.integracao_regras
    where company_id = NEW.company_id and evento_tipo = NEW.tipo and ativo = true
  loop
    v_match := (v_regra.condicao_operador = 'E');
    for v_cond in select * from jsonb_array_elements(v_regra.condicoes) loop
      v_cmp := public.avaliar_condicao(
        public.extrair_campo_payload(NEW.payload, v_cond->>'campo'),
        v_cond->>'operador',
        v_cond->>'valor'
      );
      if v_regra.condicao_operador = 'E' then
        v_match := v_match and v_cmp;
      else
        v_match := v_match or v_cmp;
      end if;
    end loop;

    if not v_match then
      continue;
    end if;

    if v_regra.nivel_automacao = 'informativo' then
      insert into public.integracao_execucoes_regra (company_id, regra_id, operacao_id, nivel_automacao, status)
      values (NEW.company_id, v_regra.id, NEW.id, 'informativo', 'executada_informativo')
      returning id into v_execucao_id;

      perform public.notificar_usuarios_com_permissao(
        'integracoes', array['view', 'manage'], 'integracoes.regra_disparada',
        'Regra disparada: ' || v_regra.nome,
        'Evento "' || NEW.tipo || '" atendeu à condição configurada.', 'informativa',
        'integracao_execucao_regra', v_execucao_id, null
      );
    else -- assistido
      insert into public.integracao_execucoes_regra (company_id, regra_id, operacao_id, nivel_automacao, status)
      values (NEW.company_id, v_regra.id, NEW.id, 'assistido', 'aguardando_confirmacao')
      returning id into v_execucao_id;

      perform public.notificar_usuarios_com_permissao(
        'integracoes', array['manage'], 'integracoes.regra_aguardando_confirmacao',
        'Confirmação necessária: ' || v_regra.nome,
        'Evento "' || NEW.tipo || '" atendeu à condição configurada e aguarda confirmação.', 'atencao',
        'integracao_execucao_regra', v_execucao_id, 'Confirmar ou rejeitar em Integrações.'
      );
    end if;

    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (
      NEW.company_id, null, 'integracoes.regra_disparada', 'integracao_execucao_regra', v_execucao_id, v_regra.nome,
      jsonb_build_object('regra_id', v_regra.id, 'operacao_id', NEW.id, 'nivel_automacao', v_regra.nivel_automacao)
    );
  end loop;

  return NEW;
end;
$$;

create trigger avaliar_regras_automacao_trigger
  after insert on public.integracao_operacoes
  for each row execute function public.avaliar_regras_automacao();

-- =========================================================================
-- 6. CONFIRMAR / REJEITAR — o único ponto onde uma ação com efeito
--    externo (webhook_saida) é de fato enfileirada.
-- =========================================================================

create or replace function public.confirmar_execucao_regra(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_execucao public.integracao_execucoes_regra;
  v_regra public.integracao_regras;
  v_webhook_saida_id uuid;
  v_webhook public.integracao_webhooks_saida;
  v_operacao public.integracao_operacoes;
  v_nova_operacao_id uuid;
begin
  select * into v_execucao from public.integracao_execucoes_regra
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Execução não encontrada nesta empresa.';
  end if;
  if v_execucao.status <> 'aguardando_confirmacao' then
    raise exception 'Só é possível confirmar execução aguardando confirmação (status atual: %).', v_execucao.status;
  end if;

  select * into v_regra from public.integracao_regras where id = v_execucao.regra_id;
  select * into v_operacao from public.integracao_operacoes where id = v_execucao.operacao_id;

  v_webhook_saida_id := (v_regra.acao_config->>'webhook_saida_id')::uuid;
  select * into v_webhook from public.integracao_webhooks_saida
  where id = v_webhook_saida_id and company_id = v_company_id and ativo = true;
  if not found then
    raise exception 'Destino de webhook de saída não encontrado ou inativo — ajuste a regra antes de confirmar.';
  end if;

  v_nova_operacao_id := public.enfileirar_operacao(
    v_webhook.integracao_id, 'webhook_saida',
    jsonb_build_object('webhook_saida_id', v_webhook.id, 'evento_tipo', v_operacao.tipo, 'payload_original', v_operacao.payload),
    'automacao:' || p_id::text, 0, 'automacao'
  );

  update public.integracao_execucoes_regra
  set status = 'confirmada', decidido_por = auth.uid(), decidido_em = now(),
      resultado = jsonb_build_object('operacao_saida_id', v_nova_operacao_id)
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.execucao_regra_confirmada', 'integracao_execucao_regra', p_id, v_regra.nome);

  return v_nova_operacao_id;
end;
$$;

grant execute on function public.confirmar_execucao_regra(uuid) to authenticated;

create or replace function public.rejeitar_execucao_regra(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_execucao public.integracao_execucoes_regra;
begin
  select * into v_execucao from public.integracao_execucoes_regra
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Execução não encontrada nesta empresa.';
  end if;
  if v_execucao.status <> 'aguardando_confirmacao' then
    raise exception 'Só é possível rejeitar execução aguardando confirmação (status atual: %).', v_execucao.status;
  end if;

  update public.integracao_execucoes_regra
  set status = 'rejeitada', decidido_por = auth.uid(), decidido_em = now()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.execucao_regra_rejeitada', 'integracao_execucao_regra', p_id);

  return p_id;
end;
$$;

grant execute on function public.rejeitar_execucao_regra(uuid) to authenticated;

-- =========================================================================
-- 7. CAMINHO DE SISTEMA — entrega real do webhook de saída roda num cron
--    (service_role, sem sessão de usuário). iniciar/concluir/falhar
--    tenant-facing (Fase 1) não servem aqui: dependem de
--    assert_tenant_write(), que exige auth.uid(). Mesmo espírito de
--    registrar_operacao_webhook (Fase 3) — company_id vem da própria
--    operação, nunca de parâmetro; execução restrita a service_role.
-- =========================================================================

create or replace function public.sistema_iniciar_processamento_operacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_op public.integracao_operacoes;
  v_integracao public.integracoes;
begin
  select * into v_op from public.integracao_operacoes where id = p_id for update;
  if not found then
    raise exception 'Operação não encontrada.';
  end if;
  if v_op.status <> 'pendente' then
    raise exception 'Só é possível iniciar processamento de operação pendente (status atual: %).', v_op.status;
  end if;

  select * into v_integracao from public.integracoes where id = v_op.integracao_id;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: não é possível iniciar processamento (§2).';
  end if;

  update public.integracao_operacoes
  set status = 'processando', ultima_tentativa_em = now()
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function public.sistema_iniciar_processamento_operacao(uuid) from public, anon, authenticated;
grant execute on function public.sistema_iniciar_processamento_operacao(uuid) to service_role;

create or replace function public.sistema_concluir_operacao(p_id uuid, p_resultado jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_op public.integracao_operacoes;
begin
  select * into v_op from public.integracao_operacoes where id = p_id for update;
  if not found then
    raise exception 'Operação não encontrada.';
  end if;
  if v_op.status <> 'processando' then
    raise exception 'Só é possível concluir operação em processamento (status atual: %).', v_op.status;
  end if;

  update public.integracao_operacoes set status = 'concluido', resultado = p_resultado where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_op.company_id, null, 'integracoes.operacao_concluida', 'integracao_operacao', p_id, v_op.tipo, p_resultado);

  return p_id;
end;
$$;

revoke all on function public.sistema_concluir_operacao(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sistema_concluir_operacao(uuid, jsonb) to service_role;

create or replace function public.sistema_falhar_operacao(p_id uuid, p_erro text, p_permanente boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_op public.integracao_operacoes;
  v_tentativas integer;
  v_status text;
  v_proxima timestamptz;
begin
  select * into v_op from public.integracao_operacoes where id = p_id for update;
  if not found then
    raise exception 'Operação não encontrada.';
  end if;
  if v_op.status <> 'processando' then
    raise exception 'Só é possível marcar falha de operação em processamento (status atual: %).', v_op.status;
  end if;

  v_tentativas := v_op.tentativas + 1;
  if p_permanente or v_tentativas >= v_op.max_tentativas then
    v_status := 'erro_permanente';
    v_proxima := null;
  else
    v_status := 'erro_temporario';
    v_proxima := now() + make_interval(mins => power(2, v_tentativas)::int);
  end if;

  update public.integracao_operacoes
  set status = v_status, tentativas = v_tentativas, erro = p_erro, proxima_tentativa_em = v_proxima
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_op.company_id, null, 'integracoes.operacao_falhou', 'integracao_operacao', p_id, p_erro,
    jsonb_build_object('tentativas', v_tentativas, 'status', v_status)
  );

  if v_status = 'erro_permanente' then
    perform public.log_system_event(
      'integration_failure', p_erro, 'error', v_op.company_id, v_op.correlacao_id,
      jsonb_build_object('integracao_id', v_op.integracao_id, 'operacao_id', p_id, 'tipo', v_op.tipo, 'tentativas', v_tentativas)
    );
  end if;

  return p_id;
end;
$$;

revoke all on function public.sistema_falhar_operacao(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.sistema_falhar_operacao(uuid, text, boolean) to service_role;
