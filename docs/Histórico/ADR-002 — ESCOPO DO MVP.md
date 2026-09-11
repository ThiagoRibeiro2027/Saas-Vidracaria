**ADR-002 — ESCOPO DO MVP**

**Projeto:** SaaS Industrial\
**Versão:** 1.0\
**Status:** Consolidado — aguardando aprovação final

**1. Objetivo**

Definir formalmente o escopo funcional e arquitetural do **MVP — Minimum
Viable Product** do SaaS Industrial.

O MVP deverá constituir uma solução industrial integrada e
operacionalmente utilizável, capaz de suportar os principais processos
da empresa desde a área comercial até a produção, expedição, instalação
e efeitos financeiros.

O MVP não será tratado como um protótipo simplificado ou uma coleção
isolada de módulos.

Deverá existir uma arquitetura integrada, multi-tenant, rastreável,
segura e preparada para evolução.

**2. Princípio Geral do MVP**

O MVP deverá priorizar:

operação industrial real;

integração entre processos;

rastreabilidade;

confiabilidade dos dados;

controle operacional;

chão de fábrica;

PCP;

Engenharia;

Estoque;

capacidade de evolução.

O produto deverá entregar profundidade nos processos industriais
essenciais, evitando concentrar o MVP em funcionalidades periféricas de
baixo impacto operacional.

**3. Estrutura do MVP**

O MVP será composto pelos 15 módulos funcionais:

Base / Estrutura do Sistema

Cadastros / Estrutura Inicial

Pedidos

PCP, Produção e Gestão do Chão de Fábrica

Engenharia

Estoque

Suprimentos / Compras

Qualidade

Expedição / Logística

Comercial / Orçamentos

Financeiro

BI

Integrações

Usuários / Permissões

Configurações

Além desses módulos, **Obra** e **Instalação/Montagem** fazem parte do
escopo funcional do MVP.

**4. Classificação do Escopo**

Será utilizada a seguinte classificação:

🟢 **MVP obrigatório**

Funcionalidade essencial para a operação inicial do produto.

🟡 **MVP controlado**

Funcionalidade presente no MVP, porém com escopo deliberadamente
controlado, sem recursos avançados.

🔵 **Pós-MVP**

Funcionalidade prevista para evolução futura e não necessária para a
primeira versão operacional.

**5. Módulo 1 — Base / Estrutura do Sistema**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

arquitetura multi-tenant;

identificação e isolamento do tenant;

estrutura básica organizacional;

empresa ativa;

autenticação;

sessão;

fundamentos de segurança;

estrutura de banco de dados;

armazenamento de arquivos;

auditoria básica;

histórico;

notificações internas;

infraestrutura de eventos;

processamento assíncrono;

tratamento padronizado de erros;

logs técnicos;

monitoramento básico;

APIs;

serviços transversais.

A arquitetura deverá permitir evolução futura para níveis avançados de:

escalabilidade;

observabilidade;

alta disponibilidade;

disaster recovery;

cache;

infraestrutura distribuída.

**6. Módulo 2 — Cadastros / Estrutura Inicial**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

empresa e estrutura organizacional;

clientes;

fornecedores;

produtos;

itens;

materiais;

componentes;

matérias-primas;

insumos;

unidades;

categorias;

grupos;

características básicas;

endereços;

Obra;

ativação/inativação;

estruturas cadastrais;

características de produtos configuráveis e extensíveis.

Os cadastros estruturais serão a **fonte única de verdade** de seus
respectivos dados.

Funcionalidades avançadas de enriquecimento, importação, catálogo e
detecção automática de duplicidades ficam para evolução futura.

**7. Módulo 3 — Pedidos**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

estrutura do pedido;

cliente;

itens;

quantidades;

medidas;

preços;

descontos;

impostos aplicáveis;

condições comerciais;

vendedor;

datas;

prazo;

Obra;

endereço;

documentos;

observações;

aprovação;

liberação;

acompanhamento;

atendimento parcial;

conclusão;

cancelamento controlado;

reabertura quando permitida;

histórico;

rastreabilidade.

Alterações após a liberação deverão ser controladas.

Não será permitido sobrescrever silenciosamente informações relevantes.

Cancelamentos deverão possuir motivo, autorização quando aplicável e
histórico.

Funcionalidades avançadas, como pedidos recorrentes sofisticados ou
portal avançado do cliente, ficam para pós-MVP.

**8. Módulo 4 — PCP, Produção e Gestão do Chão de Fábrica**

**Classificação:** 🟢 **MVP obrigatório — módulo estratégico**

Este módulo constitui um dos **principais diferenciais e núcleos do
produto**.

O MVP deverá contemplar:

**PCP**

planejamento de necessidades;

planejamento de capacidade;

programação da produção;

priorização;

sequenciamento;

otimização da programação;

otimização automática da carga produtiva;

análise de capacidade;

recursos produtivos;

restrições;

disponibilidade de máquinas;

acompanhamento da programação.

**Produção**

Ordens de Produção;

operações;

recursos;

máquinas;

operadores;

início;

término;

produção parcial;

quantidade produzida;

quantidade boa;

quantidade rejeitada;

retrabalho;

reprocessamento;

perdas;

refugo;

ocorrências;

impedimentos;

paradas;

motivos de parada;

setup;

tempos produtivos e improdutivos.

**Gestão do Chão de Fábrica**

O acompanhamento deverá ser **extremamente granular**, permitindo
rastrear:

máquina;

operação;

OP;

operador;

início;

término;

quantidades;

paradas;

motivos;

setup;

manutenção;

produtividade;

tempo produtivo;

tempo improdutivo.

**OEE**

O MVP deverá contemplar **OEE básico**, com arquitetura preparada para
evolução para OEE avançado.

**Manutenção**

O MVP deverá contemplar:

manutenção preventiva;

programação;

histórico;

indisponibilidade de equipamentos;

ocorrências.

A manutenção preditiva será pós-MVP.

**Evolução futura**

Ficam para pós-MVP:

manutenção preditiva;

OEE avançado;

APS avançado;

MES avançado;

IoT;

sensores;

integração direta com máquinas;

otimizações avançadas baseadas em dados.

**Regra arquitetural**

**Engenharia define o que e como tecnicamente.**

**PCP define quando, em qual recurso, em qual sequência e considerando
qual capacidade.**

**Produção registra o que efetivamente aconteceu.**

**Estoque registra os efeitos físicos dos movimentos.**

**Qualidade controla a conformidade.**

**9. Módulo 5 — Engenharia**

**Classificação:** 🟢 **MVP obrigatório — módulo estratégico**

O MVP deverá contemplar:

estruturas de produtos;

BOM;

componentes;

matérias-primas;

insumos;

subconjuntos;

produtos acabados;

quantidades;

unidades;

dimensões;

materiais;

acabamentos;

características;

informações técnicas;

estruturas vinculadas ao pedido;

validação de medidas;

geração de estrutura;

necessidades;

liberação para produção;

versionamento;

revisão;

aprovação;

alterações controladas;

histórico;

duplicação de produtos;

duplicação de estruturas;

duplicação de componentes;

duplicação de insumos;

duplicação de matérias-primas.

A versão de Engenharia utilizada na fabricação deverá permanecer
registrada.

Uma nova revisão jamais deverá alterar retroativamente a versão
utilizada em uma produção já realizada.

**Materiais lineares**

O módulo deverá possuir forte suporte a:

barras;

perfis;

cantoneiras;

outros materiais lineares;

comprimentos;

quantidades;

aproveitamento;

sobras.

As regras de aproveitamento deverão permitir configuração por item e
metodologia.

Quando aplicável, poderá existir uma regra configurável determinando que
determinada sobra abaixo de um comprimento mínimo seja considerada
inutilizável para aquela metodologia.

O sistema deverá permitir evolução futura para:

otimização de cortes;

rendimento;

aproveitamento avançado;

nesting;

CAD;

3D;

simulações;

integrações avançadas.

**10. Módulo 6 — Estoque**

**Classificação:** 🟢 **MVP obrigatório — robusto**

O MVP deverá contemplar:

empresas;

unidades;

depósitos;

locais;

materiais;

componentes;

produtos;

lotes quando aplicável;

identificação;

entradas;

saídas;

transferências;

ajustes;

devoluções;

consumo;

produção;

perdas;

refugo;

movimentações relacionadas à expedição.

O sistema deverá distinguir:

estoque físico;

disponível;

reservado;

comprometido;

bloqueado;

em inspeção;

em trânsito.

**Reservas**

Toda reserva relevante deverá possuir:

origem;

quantidade;

finalidade;

vínculo;

data;

estado;

possibilidade de liberação controlada.

**Fluxo de materiais**

Deverá ser possível rastrear:

**Necessidade de Engenharia → Planejamento PCP → Reserva → Consumo →
Movimento físico**

Deverão ser diferenciados:

planejado;

reservado;

consumido;

perdido/refugado.

**Inventário**

O MVP deverá contemplar:

inventário;

contagem;

divergência;

ajuste;

justificativa;

aprovação quando aplicável;

histórico.

**Materiais lineares**

O estoque deverá estar preparado para:

barras;

perfis;

cantoneiras;

comprimento;

quantidade;

peso;

sobras;

retalhos.

Funcionalidades avançadas de WMS, RFID, armazenagem automatizada e
otimização avançada ficam para pós-MVP.

**Regra arquitetural**

**Estoque informa o que existe fisicamente, onde está, quanto está
disponível/reservado e quais movimentos ocorreram.**

Estoque não decide:

o que produzir;

quando produzir;

qual versão de Engenharia utilizar;

se o produto está aprovado pela Qualidade;

se determinado pedido deve ser expedido.

**11. Módulo 7 — Suprimentos / Compras**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

fornecedores;

solicitações de compra;

necessidades originadas do PCP;

necessidades originadas do Estoque;

necessidades originadas da Engenharia;

cotações;

propostas;

comparação;

preços;

condições;

frete;

impostos aplicáveis;

pedidos de compra;

aprovação;

recebimento;

recebimento parcial;

divergências;

materiais incorretos;

materiais danificados;

excesso;

falta;

pendências;

reprovações;

devolução ao fornecedor;

rastreabilidade.

Integrações:

**Suprimentos ↔ Estoque ↔ Qualidade ↔ PCP ↔ Financeiro**

Funcionalidades avançadas de SRM, portal de fornecedores, leilão
eletrônico, EDI e automação avançada ficam para pós-MVP.

**Regra arquitetural**

**Suprimentos controla a aquisição e o processo de recebimento.**

**Estoque registra o efeito físico.**

**Qualidade controla a conformidade.**

**Financeiro controla o efeito financeiro.**

**PCP é responsável pela demanda produtiva.**

**12. Módulo 8 — Qualidade**

**Classificação:** 🟡 **MVP controlado**

O MVP deverá contemplar:

inspeção de recebimento;

inspeção durante produção;

inspeção final;

critérios;

medições;

aprovação;

reprovação;

aprovação parcial;

bloqueio;

pendência;

não conformidade;

retrabalho;

reprocessamento;

refugo;

evidências;

fotos;

rastreabilidade;

ocorrências na Obra;

integração com Engenharia;

indicadores básicos.

Funcionalidades avançadas ficam para pós-MVP:

CEP/SPC;

FMEA;

CAPA;

8D;

auditorias avançadas;

calibração;

visão computacional;

IA.

**Regra arquitetural**

**Produção registra o que foi produzido.**

**Qualidade determina a conformidade.**

Qualidade não deverá reescrever a história da produção.

**13. Módulo 9 — Expedição / Logística**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

planejamento;

separação;

conferência;

expedição;

expedição parcial;

romaneio;

carga;

veículo;

motorista;

transportadora;

transporte;

entrega;

entrega parcial;

ocorrências;

evidências;

rastreabilidade;

integração com Obra;

integração com Instalação.

Funcionalidades avançadas de:

roteirização;

otimização de carga;

GPS;

telemetria;

TMS;

integrações avançadas

ficam para pós-MVP.

**Regra fundamental**

**Entrega ≠ Instalação concluída ≠ Aceite do cliente**

**14. Obra e Instalação / Montagem**

**Classificação:** 🟢 **MVP obrigatório — escopo controlado**

Obra e Instalação/Montagem fazem parte do MVP mesmo não constituindo um
dos 15 módulos numerados.

A instalação refere-se à **montagem/instalação física dos produtos
fabricados no local da obra após a expedição**.

O MVP deverá contemplar:

cadastro da Obra;

endereço;

planejamento;

agenda;

equipe;

responsáveis;

materiais;

programação;

rotas;

confirmação;

reagendamento;

histórico;

execução;

conferência;

instalação parcial;

pendências;

peças faltantes;

peças incorretas;

peças danificadas;

ocorrências;

fotos;

observações;

evidências;

conclusão;

revisita;

assinatura;

termo/comprovante de conclusão.

Questões técnicas identificadas na Obra poderão gerar encaminhamento
para Engenharia e, quando necessário, nova revisão.

A versão histórica utilizada na fabricação jamais deverá ser
sobrescrita.

**Regra fundamental**

A conclusão da instalação não significa automaticamente aceite do
cliente.

**15. Módulo 10 — Comercial / Orçamentos**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

orçamento;

cliente;

Obra;

vendedor;

itens;

medidas;

quantidades;

custos;

preços;

margem;

descontos;

condições;

prazo;

validade;

documentos;

negociação;

aprovação;

versionamento;

histórico;

composição de custos;

integração com Engenharia;

conversão em Pedido;

indicadores básicos.

Funcionalidades avançadas de:

CRM;

funil avançado;

portal do cliente;

automação comercial;

marketing;

IA comercial

ficam para pós-MVP.

**Regra arquitetural**

**Comercial é responsável pelo orçamento.**

**Engenharia define a parte técnica.**

**Pedido representa o compromisso comercial/operacional após
conversão.**

**Financeiro registra os efeitos financeiros.**

**16. Módulo 11 — Financeiro**

**Classificação:** 🟡 **MVP controlado — Opção B**

O MVP Financeiro deverá contemplar:

contas a receber;

contas a pagar;

títulos;

parcelas;

vencimentos;

baixas;

baixas parciais;

saldos;

histórico;

rastreabilidade;

efeitos financeiros originados pelos processos comerciais, pedidos,
compras e recebimentos.

Ficam para pós-MVP:

integração bancária;

conciliação automática;

boleto;

PIX;

CNAB;

fluxo de caixa avançado;

DRE;

tesouraria avançada;

cobrança avançada.

**Regra arquitetural**

**Financeiro controla o efeito financeiro.**

Financeiro não é responsável por controlar o processo operacional que
originou esse efeito.

**17. Módulo 12 — BI**

**Classificação:** 🟡 **Básico no MVP /** 🔵 **Avançado pós-MVP**

O MVP deverá oferecer indicadores e dashboards básicos para:

Comercial;

Pedidos;

PCP;

Produção;

Chão de Fábrica;

Estoque;

Suprimentos;

Qualidade;

Expedição;

Financeiro.

Deverá contemplar:

filtros;

drill-down;

permissões;

exportação;

atualização automática/periódica;

processamento assíncrono quando necessário.

Ficam para pós-MVP:

analytics preditivo;

IA/ML;

data warehouse avançado;

lakehouse;

benchmarking;

OEE avançado;

modelos analíticos avançados.

**Regra arquitetural**

**BI consome e analisa informações.**

BI nunca será fonte de verdade nem dependência para a operação.

**18. Módulo 13 — Integrações**

**Classificação:** 🟡 **MVP controlado**

O MVP deverá possuir infraestrutura para:

APIs;

webhooks;

eventos;

filas;

processamento assíncrono;

autenticação;

logs;

rastreabilidade;

retry;

idempotência;

tratamento de erros;

reprocessamento controlado;

importação;

exportação.

A comunicação interna entre módulos deverá respeitar os padrões
arquiteturais:

**Command / Query / Event**

Integrações não deverão transferir responsabilidade de domínio para
sistemas externos.

Também deverá existir preparação arquitetural para **recepção automática
de documentos fiscais**, inclusive para alimentar processos financeiros
e/ou operacionais.

Ficam para pós-MVP:

EDI;

conectores avançados;

integração com máquinas;

IoT;

sensores;

MES;

telemetria;

integrações bancárias avançadas;

marketplace de integrações.

**Regra arquitetural**

**Integração transporta/orquestra informação.**

A fonte de verdade continua sendo o domínio responsável pelo dado.

**19. Módulo 14 — Usuários / Permissões**

**Classificação:** 🟢 **MVP obrigatório**

Conforme definido no ADR-001, o modelo será:

**Usuário → Perfil → Permissões**

O MVP deverá contemplar:

usuários;

autenticação;

recuperação/redefinição de acesso;

perfis dinâmicos;

criação;

edição;

ativação;

inativação;

permissões granulares;

escopos;

módulo;

funcionalidade;

ação;

contexto;

entidade;

status;

empresa/unidade;

auditoria;

histórico;

isolamento multi-tenant;

validação de autorização no backend.

Perfis sugeridos poderão existir, mas não serão papéis rígidos.

Permissão não substituirá regra de negócio.

Funcionalidades avançadas de SSO, IAM, MFA avançado, conditional access
e SoD ficam para pós-MVP.

**20. Módulo 15 — Configurações**

**Classificação:** 🟢 **MVP obrigatório**

O MVP deverá contemplar:

configurações gerais;

parâmetros operacionais;

status;

transições;

motivos;

categorias;

tipos;

parâmetros por módulo;

configurações específicas por item;

validade;

histórico;

auditoria;

preferências de notificações;

configuração de workflows dentro dos limites estruturais do sistema.

Configurações críticas deverão possuir histórico e, quando aplicável,
vigência.

Uma alteração de configuração deverá afetar o futuro conforme sua
vigência e não deverá alterar silenciosamente registros históricos.

Ficam para pós-MVP:

workflow avançado;

rule engine genérico;

scripting;

customização profunda;

automações inteligentes.

**21. Fluxo Macro do MVP**

O MVP deverá suportar o seguinte fluxo principal:

**Comercial / Orçamento**

↓

**Pedido**

↓

**Engenharia / Versão**

↓

**Planejamento / PCP**

↓

**Suprimentos / Estoque**

↓

**Produção / Chão de Fábrica**

↓

**Qualidade**

↓

**Estoque / Produto Acabado**

↓

**Expedição**

↓

**Transporte**

↓

**Obra**

↓

**Instalação / Montagem**

↓

**Conclusão**

↓

**Aceite**

↓

**Efeitos Financeiros**

Esse fluxo representa a cadeia principal, mas não deverá ser
interpretado como sequência rígida.

O sistema deverá suportar:

processos paralelos;

processos parciais;

pendências;

exceções;

reprocessamentos;

bloqueios;

liberações;

cancelamentos;

revisões;

retornos controlados.

**22. Status, Eventos e Histórico**

O MVP deverá respeitar a separação entre:

**Status operacional**

**Evento**

**Histórico**

**Auditoria técnica**

Um status representa o estado atual da entidade.

Um evento representa algo que aconteceu e pode interessar a outros
domínios.

O histórico permite compreender a evolução da entidade.

A auditoria registra alterações e ações relevantes.

Nenhum módulo deverá depender de alteração silenciosa do estado de outro
domínio.

**23. Regras de Integridade do MVP**

São princípios obrigatórios:

Uma entidade possui uma única fonte de verdade.

Cada domínio possui responsabilidade claramente definida.

Nenhum módulo deverá assumir a responsabilidade de outro domínio.

Alterações relevantes deverão ser rastreáveis.

Dados históricos não deverão ser sobrescritos indevidamente.

Processos parciais deverão ser suportados.

Cancelamentos deverão possuir controle e histórico.

Integrações deverão ser idempotentes quando aplicável.

Processamentos pesados deverão utilizar processamento assíncrono quando
necessário.

BI não poderá ser dependência operacional.

Integrações não poderão se tornar fonte de verdade.

O isolamento multi-tenant será obrigatório.

Permissões não substituirão regras de negócio.

Configurações não poderão quebrar regras estruturais.

Instalação, entrega e aceite deverão permanecer conceitualmente
separados.

**24. Escopo Explicitamente Pós-MVP**

O pós-MVP poderá contemplar, entre outros:

CRM avançado;

portal do cliente;

portal de fornecedores;

IA comercial;

CAD avançado;

3D;

nesting avançado;

otimização avançada de cortes;

APS/MES avançado;

IoT;

integração direta com máquinas;

manutenção preditiva;

OEE avançado;

WMS avançado;

RFID;

TMS avançado;

GPS/telemetria;

integrações bancárias avançadas;

conciliação automática;

DRE;

fluxo de caixa avançado;

CEP/SPC;

FMEA;

CAPA;

8D;

auditorias avançadas;

SSO;

IAM avançado;

MFA avançado;

analytics preditivo;

IA/ML;

data warehouse/lakehouse avançado;

workflows avançados;

rule engine genérico;

customização profunda.

A inclusão de determinada funcionalidade no pós-MVP não significa que
ela esteja descartada. Significa apenas que não é requisito da primeira
versão operacional.

**25. Critério para Inclusão de Novas Funcionalidades no MVP**

Uma nova funcionalidade somente deverá ser incorporada ao MVP se:

for essencial para a operação;

possuir impacto significativo sobre o funcionamento do produto;

possuir dependência necessária para outro requisito do MVP;

for necessária para segurança, integridade ou conformidade;

não puder ser adequadamente postergada sem comprometer o produto.

A simples solicitação de uma funcionalidade não deverá ser suficiente
para incluí-la no MVP.

**26. Relação com os Demais ADRs**

O ADR-002 deverá ser interpretado em conjunto com os demais ADRs.

Especialmente:

**ADR-001 — Usuários, Perfis e Permissões**

ADR-003 — Cliente-piloto

ADR-004 — Estratégia fiscal

ADR-005 — Operação offline

ADR-006 — Modelo comercial do SaaS

ADR-007 — Canais de notificação

Nenhum ADR posterior poderá alterar silenciosamente o escopo aqui
estabelecido.

Caso uma decisão posterior exija alteração estrutural do MVP, deverá ser
registrada formalmente.

**27. Relação com a Arquitetura Mestre**

A Arquitetura Mestre permanece como referência arquitetural superior.

O ADR-002 define **o que deverá fazer parte do MVP**.

A Arquitetura Mestre define **como o sistema deverá ser estruturalmente
organizado para suportar essas funcionalidades**.

A especificação técnica, APIs, modelo de dados e implementação deverão
respeitar ambos.

Em caso de conflito, a hierarquia de referência estabelecida na
Arquitetura Mestre deverá ser respeitada.

**28. Hierarquia de Referência**

A implementação deverá seguir:

1.  **Arquitetura Mestre**

2.  **Escopo Geral do Projeto**

3.  **ADRs aprovados**

4.  **Especificações funcionais dos módulos**

5.  **Especificação técnica**

6.  **Contratos de API/Eventos**

7.  **Modelo de dados**

8.  **Implementação**

Decisões de implementação não poderão contrariar decisões arquiteturais
superiores sem revisão formal.

**29. Decisão Final**

O MVP do SaaS Industrial será uma solução integrada, multi-tenant e
operacionalmente completa para os principais processos industriais.

A prioridade estratégica será:

**PCP + Produção + Gestão do Chão de Fábrica + Engenharia**

sustentados por:

**Cadastros + Pedidos + Estoque + Suprimentos + Qualidade + Expedição +
Obra/Instalação + Comercial + Financeiro**

e pelas estruturas transversais:

**Base + BI + Integrações + Usuários/Permissões + Configurações**

O MVP deverá ser suficientemente robusto para uma operação industrial
real, mas arquiteturalmente preparado para a evolução posterior para
recursos avançados.

**30. Status da Decisão**

**ADR-002 — Escopo do MVP**

**Versão:** 1.0

**Status atual:** CONSOLIDADO — AGUARDANDO APROVAÇÃO FINAL

**Decisão proposta:** APROVAR

Após aprovação formal, o ADR-002 será considerado fechado e passará a
integrar oficialmente o conjunto de decisões arquiteturais do projeto.
