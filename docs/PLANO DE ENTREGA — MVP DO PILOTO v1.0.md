**PLANO DE ENTREGA — MVP DO PILOTO**

**Status:** APROVADO\
**Versão:** 1.0\
**Data:** 12/09/2026\
**Marco alvo:** M1 — 01/01/2027 (ADR-003)

**1. Objetivo**

Definir o que precisa estar operacional em 01/01/2027, quando a JR Box
começa a usar o sistema, e distribuir o restante do MVP ao longo dos 12
meses do piloto, usando os marcos que o ADR-003 já estabeleceu.

**2. Base documental**

Este plano não cria escopo novo. Ele organiza no tempo o que já está
aprovado:

**ADR-002 §6** define o fluxo mínimo que torna o MVP operacionalmente
válido;

**ADR-002 §7** afirma explicitamente que **"não é requisito do MVP que
todos os módulos estejam completos"**;

**ADR-003** define M1 (01/01/2027) como início da utilização das
"funcionalidades do MVP que estiverem efetivamente liberadas e
configuradas", com avaliações em 31/03, 30/06 e 30/09;

**Arquitetura Mestre §17** define a ordem de dependência (T1 → T2 →
demais) e o fluxo predominante (T10 → T3 → T5 → T4 → T8 → T9).

A composição ampla do MVP (ADR-002 §4.1 a §4.18) permanece válida como
destino. Este plano define **em que ordem** ela chega.

**3. Estado atual verificado (12/09/2026)**

Implementado: fundação de segurança completa — multi-tenant, RLS,
autenticação, MFA, política de senha, papéis e permissões, storage
privado com validação e compressão, auditoria imutável, governança de
planos e assinaturas, backup com runbook, suíte de scripts de
verificação, correções de performance sob RLS e anonimização LGPD.

O banco possui doze tabelas, **todas de infraestrutura**: companies,
company_units, platform_admins, profiles, permissions, roles,
role_permissions, user_roles, activity_logs, files, plans,
subscriptions.

As telas existentes são login, MFA, troca de senha, auditoria,
exportação, arquivos e governança.

**Nenhum módulo de negócio foi construído.** Não existem tabelas nem
telas de cadastro, orçamento, pedido, engenharia, estoque, produção,
qualidade, expedição ou instalação.

Restam aproximadamente 15 semanas até o M1.

**4. O corte de M1 — o fluxo mínimo**

Em 01/01/2027 o sistema precisa permitir que **um pedido real percorra
o caminho completo**, conforme o ADR-002 §6:

Orçamento → Aprovação/Conversão → Conferência → Liberação → Engenharia →
Reserva/Disponibilidade → Produção → Controle necessário → Expedição →
Instalação → Aceite/Conclusão → Encerramento.

Cada módulo entra com o **mínimo que sustenta esse trânsito**, não com
sua especificação completa:

**T15 — Configurações:** numerações, margem de quebra por material e
processo, regra de medição por tipo de item, alçadas de aprovação.
Entra primeiro por ser pré-requisito declarado dos demais.

**T2 — Cadastros:** cliente, obra, fornecedor, produto/item, material.
Sem enriquecimento, sem campos personalizados.

**T10 — Comercial:** orçamento simples e conversão em pedido,
preservando rastreabilidade. Sem tabela de preços, comissões ou
descontos avançados.

**T3 — Pedidos:** entrada, conferência, pendências, liberação, status e
histórico.

**T5 — Engenharia:** itens a produzir com medidas, vinculados ao pedido
— incluindo o registro de medição em obra e a regra de bloqueio por
medida não confirmada (T16 §7).

**T6 — Estoque:** saldo, reserva para o pedido, consumo e registro de
sobra. Sem inventário completo nem curva avançada.

**T4 — Produção:** ordem de produção, etapas, apontamento, conclusão,
perda real e lista de corte (T4 §54). Sem otimização, sem sequenciamento
avançado.

**T8 — Qualidade:** inspeção simples com aprovação, reprovação e
retrabalho. Sem plano de amostragem nem gestão de instrumentos.

**T9 — Expedição:** separação, conferência, romaneio e saída, com
suporte a expedição parcial.

**T16 — Instalação:** agenda, execução, ocorrências, evidências
fotográficas, conclusão e aceite — na plataforma de campo do ADR-008,
com operação offline conforme ADR-005.

**Exceções operacionais básicas** exigidas pelo ADR-002 §6 e que
atravessam vários módulos: produção parcial, expedição parcial,
instalação parcial, material indisponível, item reprovado, retrabalho,
pendência, ocorrência, cancelamento e bloqueio.

**5. Sequência proposta até o M1**

**Setembro (restante) — habilitadores**

T15 Configurações; suíte de testes com `npm test` e CI (ADR-009 §4);
início da validação jurídica e confirmação da região de hospedagem
(ADR-010 §15). As duas últimas correm fora do código e não disputam
tempo de desenvolvimento.

**Outubro — entrada do pedido**

T2 Cadastros; T10 Comercial mínimo; T3 Pedidos. Ao fim deste mês, um
pedido deve existir no sistema com cliente, obra e itens, e chegar até
a liberação.

**Novembro — o que a fábrica faz**

T5 Engenharia mínima com medição; T6 Estoque mínimo com reserva; T4
Produção com lista de corte. Ao fim deste mês, o pedido liberado deve
virar ordem de produção e ser apontado.

**Dezembro — saída, campo e homologação**

T8 Qualidade mínima; T9 Expedição; T16 Instalação com a plataforma de
campo. As duas últimas semanas reservadas para homologação com a JR Box,
carga de cadastros iniciais, treinamento e ajustes — **não para
desenvolvimento**.

Observabilidade (ADR-009 §5) e contratação dos planos pagos (Nota
Técnica de dimensionamento) precisam estar concluídas antes do dia 1.

**6. Distribuição do restante durante o piloto**

**Até M2 (31/03/2027):** T18 Compras/Suprimentos; T14 Financeiro básico
(títulos vinculados ao pedido); indicadores essenciais de acompanhamento
do piloto; refinamento do que a operação real apontar nos primeiros
meses.

**Até M3 (30/06/2027):** Fiscal (ADR-004); T12 BI; T13 Integrações; T17
RH — sendo que o **cadastro de equipes do RH é antecipado para o M1**,
porque o T16 depende dele para designar quem instala.

**Até M4 (30/09/2027):** T18 Contratos; RH completo; gancho de
otimizador externo (T13 §40); campos personalizados; demais itens
adiados conscientemente.

**7. Se atrasar — ordem de corte**

Caso o cronograma aperte, a sequência de simplificação, do primeiro ao
último a ceder:

**Qualidade** vira um checklist de liberação registrado no pedido, sem
módulo próprio;

**Comercial** é reduzido a pedido direto, sem etapa de orçamento;

**Estoque** opera com saldo informado e reserva manual, sem consumo
automático;

**Expedição** vira registro de saída com romaneio simples.

O que **não pode ceder**, porque descaracteriza o piloto: entrada do
pedido, produção com apontamento, instalação com evidências e aceite,
rastreabilidade e isolamento entre empresas.

**8. Critérios de aceite do M1**

Derivados do ADR-002 §7, verificáveis em operação real:

um pedido real percorre o fluxo de ponta a ponta;

as informações passam de uma etapa à seguinte sem redigitação;

cada usuário consegue executar sua responsabilidade com seu próprio
acesso;

pelo menos três exceções operacionais (parcial, pendência, ocorrência)
são tratadas dentro do sistema;

existe rastreabilidade completa do pedido;

a JR Box não precisa de planilha externa para controlar o núcleo do
fluxo.

**9. Riscos declarados**

O prazo é agressivo: nove módulos, mesmo em recorte mínimo, em quinze
semanas, partindo de zero código de negócio.

A homologação em dezembro é a primeira vez que a operação real toca o
sistema — atrasos anteriores comprimem justamente essa janela, que é a
menos compressível.

A dependência jurídica do ADR-010 é externa e não acelera com esforço
de engenharia.

O piloto tem 12 meses. **Entrar em 01/01 com o fluxo mínimo funcionando
é melhor do que entrar com nove módulos incompletos** — e é
explicitamente o que o ADR-002 §7 e o ADR-003 M1 permitem.

**10. Decisões confirmadas em 12/09/2026**

**Recorte de M1 aprovado** — o corte descrito na seção 4 é o que precisa
estar operacional em 01/01/2027. A composição ampla do ADR-002 §4
permanece como destino, distribuída conforme a seção 6.

**Antecipação do T17 mínimo aprovada** — o cadastro de equipes do módulo
de RH entra no M1, por ser dependência da Instalação (T16). O restante do
RH permanece para o M3/M4.

**Ordem de corte aprovada** — em caso de aperto de prazo, a sequência de
simplificação é a da seção 7: Qualidade, depois Comercial, depois
Estoque, depois Expedição. Os itens listados como inegociáveis não cedem.

**Dezembro é homologação, não desenvolvimento** — as duas últimas
semanas de dezembro são reservadas para carga de cadastros, treinamento e
ajuste com a JR Box. Escopo novo não entra nessa janela; se algo não
estiver pronto até lá, aciona-se a ordem de corte.

**Gatilho de revisão:** se ao fim de outubro a entrada do pedido
(Cadastros, Comercial mínimo e Pedidos) não estiver operacional, a ordem
de corte deve ser acionada imediatamente, e não em dezembro.
