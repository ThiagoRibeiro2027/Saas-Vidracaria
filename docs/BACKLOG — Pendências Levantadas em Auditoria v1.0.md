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

## 2. Lacuna de segurança pré-existente, mais ampla que o corrigido

Ao corrigir `orcamento_item_caracteristicas` (ADR-012 Fase 1) para chamar
`assert_company_not_suspended()`, ficou claro que **o módulo de Orçamentos
como um todo** tem funções de mutação mais antigas sem essa checagem — não é
só o que essa fase tocou. Precisa de um levantamento função a função para
saber a extensão real antes de corrigir.

## 3. ADR-012 — próximas fases aprovadas, não iniciadas

A ADR-012 (Precificação Dimensional do Configurador) está aprovada até a
Fase 4, mas cada fase exige "pode seguir" explícito do responsável antes de
começar (cláusula de governança da própria ADR). Fases 1 e 2 estão em
produção. Faltam:

- **Fase 3** — composição do configurador virar BOM sugerida no pedido, para
  conferência da engenharia.
- **Fase 4** — cálculo automático de mão de obra no orçamento (hoje o campo é
  digitação livre, conforme decidido na aprovação da ADR).
