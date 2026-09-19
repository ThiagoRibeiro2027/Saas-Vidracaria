**ROTEIRO — DESENVOLVIMENTO DOS TÓPICOS RESTANTES**

**Status:** PROPOSTO — aguardando aprovação explícita do responsável do
produto (Thiago), conforme regra do CLAUDE.md ("não avançar de fase sem
aprovação explícita")\
**Versão:** 1.0\
**Data:** 19/09/2026\
**Base documental:** PLANO DE ENTREGA — MVP DO PILOTO v1.0 (§6), ADR-002,
ADR-004, ADR-007, Prompt TÓPICO 12/13/17/18

**1. Por que este roteiro existe**

O PLANO DE ENTREGA já define a ordem macro (M1 → M2 → M3 → M4). Este
documento não substitui aquele plano — ele detalha, para os tópicos que
ainda não têm recorte de código definido, o que falta e em que ordem
atacar, para que o desenvolvimento continue enquanto o teste manual do
que já existe roda em paralelo.

**2. Estado verificado em 19/09/2026 (via histórico de commits)**

O projeto está adiantado em relação ao cronograma do Plano de Entrega
(cujo alvo de M1 é 01/01/2027). Já têm recorte mínimo implementado e
commitado:

T15 Configurações, T2 Cadastros, T10 Comercial, T3 Pedidos, T5
Engenharia, T6 Estoque, T4 Produção (ampliado em várias fases — PCP,
sequenciamento, gargalos, replanejamento, tolerância de perdas), T8
Qualidade, T9 Expedição, T16 Instalação (com PWA de campo e offline),
T14 Usuários/Permissões, T11 Financeiro (mínimo), T7 Suprimentos
(mínimo), T12 BI (mínimo), T17 RH (mínimo), Fiscal (estrutura mínima,
ADR-004 §9.2), ADR-007 Notificações (recorte mínimo), e o levantamento
LGPD de suboperadores.

Isso cobre integralmente o corte de M1 e adianta itens que só eram
esperados até M2 (T7, T11).

**Sem nenhum código ainda:** T13 Integrações, T18 Contratos, campos
personalizados.

**Com recorte mínimo, mas não completos:** T12 BI, T17 RH, Fiscal
(ADR-004).

**3. Frente em andamento não commitada — resolver antes de abrir tópico novo**

Há mudanças não commitadas tocando `layout.tsx`, `globals.css`,
`page.tsx` e as seções de Comercial/Engenharia/Pedidos, mais um novo
diretório `src/components/ui` e `src/components/shell` (Card, Button,
Table, Select, Input, Badge, AppShell, Sidebar, Topbar) e uma migration
de cor de marca por empresa (`cor_primaria`). Isso é uma unificação de
design system/shell ainda em progresso, aplicada só em 3 dos ~19 módulos
de tela.

Recomendação: fechar e commitar essa frente (ou pelo menos os módulos já
tocados) antes de somar tópico de negócio novo por cima, para não
misturar refactor estrutural de UI com lógica nova — e, se fizer
sentido, estender o mesmo AppShell/design system aos demais módulos
(estoque, produção, qualidade, expedição, instalação, financeiro,
suprimentos, BI, RH, fiscal, usuários, configurações) como um passo à
parte, sem regra de negócio nova.

**4. Os "3 pontos ainda a confirmar"**

Não há nada pendente de código bloqueando o MVP, mas o ADR-010 (§15) e o
RUNBOOK-SUBOPERADORES-LGPD listam pendências fora de código que valem
confirmar quais são as 3 que você tem em mente, porque encontrei mais de
3 registradas:

upgrade do Supabase de Free para Pro (bloqueante para backup automático
antes de qualquer go-live real);

fixar a região da Vercel (`regions` no `vercel.json`, hoje não fixada);

confirmar a residência de dados do Resend (região de processamento não
verificada);

inventário de dados pessoais (ainda não preenchido);

publicação formal da relação de suboperadores à empresa-cliente (o
levantamento já existe, falta tornar visível/anexável a ela).

Nenhum desses bloqueia o código dos tópicos abaixo — são itens
jurídicos/infra, não de desenvolvimento. Seguem em paralelo.

**5. Ordem proposta para os tópicos restantes**

Ordem por menor dependência e por já ter (ou não) um recorte mínimo
aprovado como base — quem já tem base mínima e só precisa de extensão
vem primeiro; quem ainda não tem nenhum recorte aprovado (T13) entra por
último porque exige uma decisão de escopo antes de codar, do mesmo jeito
que todo outro tópico passou por essa decisão antes da primeira linha de
código.

**5.1 — T17 RH completo**

Falta além do mínimo (funcionários, vínculo com usuário, desligamento):
o que o Prompt TÓPICO 17 define de cargos, jornada e demais dados de
RH ainda fora do recorte já commitado. Menor risco, é extensão de
schema/tela já existente.

**5.2 — Fiscal completo (ADR-004)**

Hoje só existe a estrutura mínima de documentos fiscais (§9.2). Falta o
restante do ADR-004 (fluxo fiscal completo — o ADR tem seção própria
sobre estratégia fiscal e documentos; verificar no ADR-004 o que ficou
fora do §9.2 antes de codar, já que é o único ADR com arquivo de
permissão restrita — não abri o conteúdo completo aqui).

**5.3 — T12 BI completo**

Hoje só indicadores operacionais básicos (ADR-002 §4.16). Falta o
restante do Prompt TÓPICO 12 — checar quais indicadores/relatórios
ficaram fora do recorte mínimo.

**5.4 — T18 Contratos**

Zero código hoje, mas o próprio Prompt TÓPICO 18 já define o MVP no
§12: estrutura genérica de contrato com os três tipos, vigência, e
ciclo de vida básico (rascunho → vigente → encerrado). Aprovação por
alçada, garantia e vínculo financeiro detalhado ficam para depois — o
doc já autoriza esse corte, então dá para começar sem uma rodada extra
de decisão de escopo. Toca Comercial, Suprimentos, RH e Financeiro
(vínculo), e Notificações (alerta de vencimento) — é o tópico com mais
pontos de integração entre os que faltam.

**5.5 — T13 Integrações**

O maior e o único sem recorte mínimo aprovado ainda. O documento tem 22
seções (central de integrações, catálogo, documentos fiscais avançados,
bancos/boletos/PIX, cartões, ERP externo, APIs, webhooks, filas
assíncronas, retry, idempotência, certificados digitais, etc.) — grande
demais para entrar de uma vez, e sem um "MVP" explícito no próprio doc
como T18 tem.

Antes de codar T13, este roteiro propõe que o responsável do produto
aprove um recorte mínimo, seguindo o mesmo padrão usado em T4, T6, T7 e
outros: por exemplo, começar pela central de integrações (registro,
logs, idempotência, retry, fonte oficial — os princípios das seções 1 e
2) sem ainda plugar nenhum conector real (ERP, banco, cartão,
certificado digital), que ficariam para uma fase seguinte dentro do
próprio T13. Isso é uma sugestão de corte, não uma decisão — precisa da
mesma aprovação explícita que os demais recortes tiveram.

**5.6 — Campos personalizados**

Adiado conscientemente no Plano de Entrega, sem ADR próprio identificado
nos ADR-001 a ADR-010. Antes de codar, confirmar se isso tem definição
em algum ADR ou se precisa de uma decisão nova antes — a regra do
CLAUDE.md é clara: não implementar regra de negócio fora do que está
definido em ADR.

**6. Checklist de segurança obrigatório por tópico novo**

Para cada tabela/função/policy nova criada em qualquer item acima, valem
integralmente as 13 regras da auditoria de 14/09/2026 já incorporadas ao
CLAUDE.md — em especial, para tópicos novos como T13/T18: RLS habilitada
com teste de isolamento cross-tenant, permission gate explícito via
`has_permission()`, `SECURITY DEFINER` com `search_path` controlado, sem
grant a `PUBLIC`/`anon`, teste negativo (deny) na Data API, e validação
de tipo/tamanho real em qualquer upload de anexo (contratos e
integrações fiscais tendem a ter anexo).

**7. Como isso corre em paralelo ao seu teste manual**

Nenhum item de 5.1 a 5.4 depende de você terminar o teste manual — são
módulos diferentes dos que você está validando agora. Se o teste manual
encontrar um achado que mude uma regra já implementada num módulo já
commitado, esse achado tem prioridade sobre continuar um tópico novo,
igual ao padrão já usado neste projeto (ex.: correções de code-review
antes de avançar).

**8. Próxima ação**

Confirmar: (a) se a ordem da seção 5 serve, ou se algum desses tópicos
tem prioridade de negócio diferente para você; (b) os 3 pontos exatos
da seção 4; (c) se resolvemos a frente de design system (seção 3) antes
de abrir T17.
