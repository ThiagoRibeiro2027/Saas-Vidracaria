**TÓPICO 18 — CONTRATOS**

*Sistema de Gestão Operacional da Fábrica de Vidraçaria*

**Status:** PROPOSTO PARA APROVAÇÃO\
**Data:** 11/09/2026

**1. Objetivo**

Permitir que cada vidraçaria (tenant) controle os contratos que ela
mesma firma — com clientes, fornecedores e funcionários/prestadores —
incluindo vigência, valores, garantias e aprovação.

**Este módulo é diferente do ADR-006 (Modelo Comercial do SaaS)**: o
ADR-006 trata de como o próprio SaaS é vendido para as vidraçarias; este
módulo é uma ferramenta que a vidraçaria usa para gerenciar os contratos
dela com terceiros.

**2. Tipos de contrato**

O módulo deve suportar, com uma estrutura genérica de contrato e um
"tipo" que determina a qual cadastro ele se vincula:

**Contratos com clientes** — vinculados a Cliente e Obra/Pedido
(módulo Comercial), cobrindo venda, instalação e garantia.

**Contratos com fornecedores** — vinculados ao cadastro de fornecedor
(módulo Suprimentos), cobrindo fornecimento de matéria-prima (vidro,
alumínio, ferragens) e condições comerciais.

**Contratos de funcionários/prestadores** — vinculados ao cadastro de
colaborador (módulo RH), cobrindo relação de trabalho (CLT, PJ,
terceirizados), sem substituir o RH nem calcular folha.

**3. Vigência**

Cada contrato deve registrar:

data de início;

data de fim;

renovação: manual ou automática;

histórico de aditivos e alterações contratuais.

**4. Garantia**

Contratos com clientes devem permitir registrar prazo de garantia da
instalação e/ou do produto (ex.: vidro temperado), tratado como um prazo
independente da vigência do contrato em si — com alerta de vencimento
próprio.

**5. Valores e condições financeiras**

O contrato deve referenciar, quando aplicável:

valor;

forma de pagamento;

parcelas;

reajustes previstos.

Deve existir vínculo rastreável com o Financeiro — **Contrato → Cobrança/
Documento financeiro → Pagamento/Evento financeiro** — no mesmo espírito
da separação de responsabilidades já definida no ADR-006, mas aplicada
aqui aos contratos do tenant com terceiros, e não à contratação do
próprio SaaS.

**6. Ciclo de vida e aprovação**

O contrato deve seguir estados centralizados:

**rascunho → em aprovação → vigente → suspenso → encerrado → cancelado.**

A transição de "em aprovação" para "vigente" deve respeitar alçada de
aprovação — ou seja, apenas usuários com a permissão adequada podem
efetivar essa mudança, conforme o modelo de permissões do ADR-001.

**7. Alertas de vencimento**

Vigência e garantia próximas do vencimento devem poder gerar
notificações, aproveitando o módulo de Notificações (ADR-007), sem que
a notificação seja autoridade sobre o estado do contrato.

**8. Documentos anexos**

O documento assinado (PDF) deve ser anexado e armazenado em storage
privado, seguindo as mesmas regras de segurança já definidas para
arquivos no projeto (upload, validação, autorização, auditoria).

**9. Auditoria**

Toda mudança relevante — criação, alteração, mudança de status,
aditivo, cancelamento — deve ser registrada, usando o mecanismo geral de
auditoria do SaaS.

**10. Fora do escopo (decisão futura, não implementar agora)**

Assinatura eletrônica (ex.: DocuSign, Clicksign): a arquitetura deve
deixar esse gancho previsto (campo para referência externa de
assinatura), sem integrar nenhum provedor específico agora.

**11. Integração com outros módulos**

**Comercial**: contratos com clientes, vinculados a Obra/Pedido.

**Suprimentos**: contratos com fornecedores.

**RH**: contratos de funcionários/prestadores.

**Financeiro**: valores, cobranças e pagamentos vinculados ao contrato.

**Notificações (ADR-007)**: alertas de vencimento de vigência e de
garantia.

**Usuários/Permissões (ADR-001)**: aprovação por alçada.

**12. MVP**

No MVP, priorizar: estrutura genérica de contrato com os três tipos,
vigência, e ciclo de vida básico (rascunho → vigente → encerrado).
Aprovação por alçada, garantia e vínculo financeiro detalhado podem ser
incorporados em etapa seguinte, conforme necessidade validada no piloto.
