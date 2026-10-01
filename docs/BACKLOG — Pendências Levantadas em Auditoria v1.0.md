# BACKLOG — Pendências levantadas em auditoria (27/09/2026)

Status: registrado, aguardando priorização do responsável do produto. Nenhum
item aqui tem aprovação para implementação — é só o registro do que foi
encontrado, pra não se perder entre sessões. Antes de implementar qualquer um,
seguir a governança normal do projeto (CLAUDE.md): confirmar escopo com o
responsável e, se envolver regra de negócio nova, abrir ADR.

## 1. Funcionalidade no banco sem tela na UI

Achados no audit "mapear o que está embutido" de 27/09/2026 — a função/tabela
existe e funciona via RPC/Data API, mas não tem como o usuário acionar pela
interface:

- **Estoque dimensional (ADR-011 Fase 2)** — schema e funções existem, zero
  tela.
- **`romaneio_expedicao()`** — a página de Expedição menciona o recurso mas
  não tem botão/formulário que chame a função.
- **Editar característica de peça** — só existe "remover" na tela de Peças;
  editar uma característica já cadastrada não tem UI (precisa remover e
  recriar).
- **Editar recurso produtivo / manutenção preventiva** — mesmo padrão: só
  cadastro e remoção, sem edição.

## 2. Lacuna de segurança pré-existente, mais ampla que o corrigido — RESOLVIDO (27/09/2026)

Ao corrigir `orcamento_item_caracteristicas` (ADR-012 Fase 1) para chamar
`assert_company_not_suspended()`, o comentário da migration registrou a
suspeita de que **o módulo de Orçamentos como um todo** tinha funções de
mutação mais antigas sem essa checagem. Feito o levantamento função a
função (migration `20261105020000_fix_orcamento_suspensao_gaps.sql`):
a suspeita era só parcialmente verdadeira — das 9 funções de mutação do
módulo, 7 já estavam corretas (5 delas retrofitadas com
`assert_tenant_write()` em 15/09, antes mesmo do comentário que levantou a
suspeita). Só 2 tinham o gap de fato:

- `upsert_orcamento_item()` — tinha `assert_tenant_write()` em 15/09, mas
  regrediu em 02/10 ao ganhar o parâmetro `custo_unitario` (a reescrita
  voltou ao guard manual antigo, sem a checagem de suspensão).
- `vincular_oportunidade_orcamento()` — nunca teve a checagem, desde que foi
  criada em 01/10.

Ambas corrigidas, com teste negativo em `scripts/test-governance.mjs` (regra
9 do CLAUDE.md) e validação manual do caminho feliz.

## 3. ADR-012 — todas as 4 fases entregues (27/09/2026)

A ADR-012 (Precificação Dimensional do Configurador) está com as 4 fases em
produção, cada uma liberada com "pode seguir" explícito do responsável do
produto (cláusula de governança da própria ADR):

- **Fase 1** — cálculo de custo dimensional (perfil/vidro/acessório).
- **Fase 2** — combinação de barras de menor custo total.
- **Fase 3** — composição do orçamento vira BOM sugerida do pedido
  automaticamente na conversão; preço já aprovado/faturado fica sempre
  congelado, com sugestão de atualização quando a BOM definitiva da
  Engenharia diverge (decisão explícita do operador, nunca automática).
- **Fase 4** — mão de obra automática a partir do roteiro produtivo e do
  novo `recursos_produtivos.custo_hora`.

Telas das Fases 3/4 entregues (27/09/2026): campo + calculadora de mão de
obra no item de orçamento (Comercial), campo `custo_hora` no cadastro de
recurso produtivo — com a edição estreita que faltava pra atualizar
depois de criado (Produção), e a seção de divergência de preço com
"Aplicar sugerido"/"Manter atual" por item de pedido (Pedidos). Validado
com `typecheck`/`eslint`/`next build`; não testado interativamente no
browser — o tenant de desenvolvimento (jrbox) já tem usuários reais e a
sessão não tinha como logar sem adivinhar/resetar credencial de alguém.

Achado de passagem ao construir a tela: `criar_recurso_produtivo()`/
`editar_recurso_produtivo()` ganharam `p_localizacao` (17/09) e depois o
gate `assert_tenant_write_any('producao', ['configurar','manage'])`
(25/09) — a migration da Fase 4 baseou o `drop function` numa assinatura
mais antiga (sem `localizacao`) e criou uma segunda sobrecarga em
paralelo em vez de substituir a função real, deixando `p_localizacao`
inacessível junto de `p_custo_hora` e regredindo o gate pra só 'manage'
nessa sobrecarga nova. Corrigido na mesma sessão
(`20261105050000_fix_recurso_produtivo_custo_hora_localizacao.sql`).
