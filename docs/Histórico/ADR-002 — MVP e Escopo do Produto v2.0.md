**ADR-002 — MVP e Escopo do Produto**

**Status:** APROVADO\
**Versão:** 2.0\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-09\
**Decisão:** Definição do escopo funcional e dos limites do MVP\
**Decisão vinculada:** ADR-003, ADR-004, ADR-005, ADR-007 e ADR-008

**1. Contexto**

O produto será desenvolvido como um SaaS para gestão operacional de
empresas do segmento de vidraçaria.

O MVP deve ser a menor versão capaz de permitir a validação do produto
em uma operação real, utilizando dados, usuários, pedidos e processos
reais.

O objetivo do MVP não é entregar um ERP completo, mas validar se o
sistema consegue sustentar o fluxo operacional central da empresa.

O critério fundamental adotado é:

**Se o piloto consegue operar um pedido real do orçamento ao
aceite/conclusão sem determinada funcionalidade, essa funcionalidade não
faz parte do MVP.**

O fluxo central considerado para o MVP é:

**Orçamento → Pedido → Conferência → Liberação → Engenharia essencial →
Estoque → Produção → Controle necessário → Expedição → Obra/Instalação →
Aceite/Conclusão.**

O MVP também deverá possuir os recursos transversais necessários para
que esse fluxo seja seguro, rastreável e operacionalmente utilizável.

**2. Definição de pedido real**

Para fins deste ADR:

**Pedido real** é aquele que representa uma operação efetivamente
executada ou destinada à execução pela empresa-piloto, utilizando dados,
regras e condições reais, ainda que determinados processos acessórios
sejam temporariamente executados fora do SaaS.

O uso de dados fictícios isoladamente não será considerado suficiente
para validar o MVP.

**3. Decisão**

Será adotado um **MVP focado no fluxo operacional central**, priorizando
a capacidade de executar e rastrear uma operação real de ponta a ponta.

O MVP não deverá conter todas as funcionalidades dos módulos previstos
para o produto definitivo.

A existência de um módulo no MVP não significa que todas as
funcionalidades desse módulo estejam incluídas.

A classificação adotada será:

**MVP:** necessário para operar e validar o fluxo central;

**Release 1:** necessário para profissionalizar, ampliar e escalar a
operação;

**Futuro:** recursos avançados, otimizações e funcionalidades não
essenciais.

**4. Composição do MVP**

**4.1 Base / Estrutura**

Incluído no MVP:

- estrutura multiempresa;

- isolamento entre empresas;

- identificação única de registros;

- estrutura organizacional necessária;

- usuários e acesso;

- parâmetros estruturais;

- auditoria;

- informações necessárias para rastreabilidade.

**4.2 Cadastros**

Incluído no MVP:

- clientes;

- contatos;

- produtos;

- serviços;

- materiais;

- componentes;

- fornecedores quando necessários;

- unidades;

- categorias;

- estruturas técnicas;

- equipes;

- demais cadastros indispensáveis ao fluxo.

**4.3 Comercial / Orçamentos**

Incluído de forma simplificada:

- criação de orçamento;

- itens;

- quantidades;

- medidas;

- preços;

- descontos;

- condições comerciais básicas;

- validade;

- revisão;

- aprovação;

- histórico;

- conversão em pedido.

Não fazem parte do MVP:

- CRM avançado;

- funil comercial avançado;

- campanhas;

- automações comerciais complexas;

- comissionamento avançado.

**4.4 Pedidos**

Incluído no MVP:

- conversão de orçamento;

- conferência;

- alterações controladas;

- liberação;

- prioridade;

- histórico;

- informações comerciais e técnicas;

- vínculo com engenharia;

- vínculo com estoque;

- vínculo com produção;

- vínculo com expedição;

- vínculo com instalação;

- conclusão;

- rastreabilidade de ponta a ponta.

**4.5 Engenharia**

A Engenharia do MVP deverá contemplar somente o necessário para
transformar o pedido em informação executável.

Incluído:

- especificações técnicas;

- medidas;

- composição;

- componentes;

- materiais;

- quantidades;

- características técnicas;

- necessidades de produção;

- necessidades de materiais;

- validações essenciais;

- revisões;

- histórico.

A modelagem deverá dar atenção especial a:

- barras;

- cantoneiras;

- perfis;

- demais materiais lineares relevantes à operação.

Não fazem parte do MVP:

- otimização avançada de corte;

- simulações complexas;

- algoritmos avançados de aproveitamento;

- otimização matemática avançada.

**4.6 Estoque**

Incluído:

- estoque;

- saldos;

- entradas;

- saídas;

- reservas;

- separação;

- consumo;

- movimentações;

- ajustes controlados;

- inventário;

- rastreabilidade;

- vínculo com pedidos;

- vínculo com produção.

O estoque deverá refletir as necessidades do fluxo operacional e
preservar a integridade das quantidades.

**4.7 PCP / Produção**

Incluído:

- geração de produção;

- ordens/etapas;

- liberação;

- fila básica;

- status;

- apontamentos;

- consumo de materiais;

- quantidade produzida;

- perdas/refugos básicos;

- retrabalho;

- conclusão;

- rastreabilidade.

O MVP deverá suportar **execução parcial**, preservando a relação entre:

- quantidade planejada;

- quantidade realizada;

- quantidade pendente.

Não fazem parte do MVP:

- sequenciamento avançado;

- simulação de capacidade;

- otimização matemática;

- balanceamento avançado;

- programação automática;

- análise avançada de gargalos;

- OEE;

- manutenção.

**4.8 Expedição / Logística**

Incluído:

- preparação;

- separação;

- conferência;

- carregamento;

- despacho;

- entrega;

- ocorrências;

- rastreabilidade.

Deverá também suportar operações parciais, mantendo:

- planejado;

- realizado;

- pendente.

Não fazem parte do MVP:

- otimização de rotas;

- telemetria de frota;

- gestão logística avançada.

**4.9 Obra / Instalação**

Incluído:

- agendamento;

- obra;

- endereço;

- equipe;

- responsável;

- agenda;

- materiais;

- execução;

- observações;

- ocorrências;

- pendências;

- execução parcial;

- conclusão;

- aceite;

- evidências;

- encerramento.

O módulo deverá estar preparado para operação offline conforme definido
no ADR-005.

**4.10 Usuários e Permissões**

Incluído:

- usuário;

- perfil;

- permissões;

- escopo por empresa/unidade;

- acesso por módulo;

- acesso por função;

- acesso por ação;

- permissões individuais quando aplicáveis;

- autoridade;

- validade;

- auditoria;

- autorização no backend.

A arquitetura deverá respeitar a separação entre:

**Usuário → Perfil → Permissões**

conforme ADR-001.

**4.11 Configurações**

Incluído:

- parâmetros da empresa;

- unidades;

- numerações;

- status;

- regras configuráveis;

- parâmetros operacionais;

- notificações;

- configurações de permissões.

Regras de negócio que possam variar entre empresas deverão ser
configuráveis quando necessário, evitando hard-code específico do
cliente-piloto.

**4.12 Notificações**

No MVP:

- notificações internas;

- e-mail;

- push, condicionado à decisão do ADR-008.

WhatsApp e SMS não poderão bloquear o fluxo principal do sistema.

As preferências de comunicação deverão respeitar as regras aplicáveis de
privacidade e LGPD.

**4.13 Qualidade**

Será disponibilizado somente o mínimo necessário para controle
operacional:

- inspeção essencial;

- registro de não conformidade;

- bloqueio;

- aprovação/reprovação;

- retrabalho;

- liberação;

- histórico.

Funcionalidades avançadas de qualidade ficam para Release 1.

**4.14 Financeiro**

O Financeiro do MVP será deliberadamente limitado.

Deverá manter:

- valor do pedido;

- condições de pagamento;

- parcelas planejadas;

- situação financeira básica;

- registro de pagamento/recebimento quando necessário;

- vínculo com o pedido.

Não fazem parte do MVP:

- estrutura completa de contas a receber;

- contas a pagar;

- cobrança;

- conciliação;

- fluxo de caixa completo;

- integração bancária;

- DRE;

- centros de custo avançados;

- relatórios financeiros avançados.

O objetivo é evitar a criação de um <span dir="rtl">“</span>mini módulo
financeiro completo” dentro do MVP.

**4.15 Fiscal**

O escopo fiscal do MVP será condicionado às decisões do ADR-004.

Não deverão ser criadas premissas fiscais não definidas nesse ADR.

**4.16 Indicadores**

O MVP deverá possuir somente indicadores operacionais básicos
necessários para acompanhamento do fluxo.

Não fazem parte do MVP:

- BI avançado;

- dashboards analíticos complexos;

- análises preditivas;

- indicadores avançados de desempenho.

**4.17 Integrações**

Somente integrações indispensáveis ao funcionamento do MVP serão
incluídas.

Integrações não essenciais ficam para fases posteriores.

**4.18 Abastecimento / Compras**

O módulo completo de Compras não fará parte do MVP.

Entretanto, quando houver necessidade de aquisição de material durante o
MVP, o sistema deverá:

- registrar a necessidade;

- identificar o material;

- registrar a quantidade;

- permitir acompanhamento da necessidade.

A efetivação da compra poderá ocorrer fora do SaaS durante o MVP.

**5. Funcionalidades explicitamente fora do MVP**

Ficam fora do MVP:

- Compras completas;

- Qualidade avançada;

- Financeiro completo;

- Fiscal completo além do necessário definido pelo ADR-004;

- PCP avançado;

- sequenciamento avançado;

- simulação de capacidade;

- otimização matemática;

- OEE;

- manutenção;

- BI avançado;

- CRM avançado;

- automações avançadas;

- IA;

- funcionalidades preditivas;

- integrações não essenciais;

- otimizações avançadas de produção e corte.

Nenhuma dessas funcionalidades deverá ser antecipada por interpretação
de outros documentos.

**6. Fluxo mínimo validado**

O MVP será considerado operacionalmente válido quando um pedido real
puder percorrer:

**Orçamento → Aprovação/Conversão → Conferência → Liberação → Engenharia
→ Reserva/Disponibilidade → Produção → Controle necessário → Expedição →
Instalação → Aceite/Conclusão → Encerramento.**

As informações produzidas em uma etapa deverão alimentar a etapa
seguinte, evitando redigitação desnecessária.

O sistema deverá preservar:

- responsável;

- data/hora;

- alterações;

- aprovações;

- histórico de status;

- materiais;

- produção;

- expedição;

- instalação;

- ocorrências;

- conclusão.

O MVP deverá suportar exceções operacionais básicas, incluindo:

- material indisponível;

- necessidade de aquisição;

- produção parcial;

- expedição parcial;

- instalação parcial;

- item reprovado;

- retrabalho;

- pendência;

- atraso;

- ocorrência de expedição;

- ocorrência de instalação;

- retorno;

- cancelamento;

- bloqueio.

**7. Critérios de sucesso do MVP**

O MVP deverá demonstrar que:

o fluxo principal pode ser executado de ponta a ponta;

as informações são preservadas entre as etapas;

os usuários conseguem executar suas responsabilidades;

os principais bloqueios operacionais são tratados;

existe rastreabilidade;

existe integridade de dados;

existe isolamento entre empresas;

não é necessário utilizar planilhas externas para controlar o núcleo do
fluxo;

operações parciais são corretamente representadas;

o sistema pode ser utilizado com dados e usuários reais.

Não é requisito do MVP que todos os módulos estejam completos.

**8. Relação com o cliente-piloto**

O cliente-piloto serve para validar o produto, e não para definir um
produto exclusivo para ele.

Novas necessidades identificadas durante o piloto deverão ser
classificadas como:

- defeito;

- correção necessária;

- necessidade essencial do produto;

- melhoria/backlog;

- necessidade específica do cliente.

Uma necessidade poderá entrar no MVP quando:

- bloquear o fluxo principal;

- comprometer integridade dos dados;

- comprometer segurança;

- representar obrigação legal;

- demonstrar que uma premissa fundamental do produto estava incorreta;

- for indispensável ao propósito do produto.

Solicitações específicas do cliente não entrarão automaticamente no
produto.

Deverá ser avaliado se são:

- configuração;

- funcionalidade padrão;

- melhoria futura;

- customização controlada;

- solicitação não aplicável ao produto.

Qualquer aumento relevante de escopo deverá registrar:

- funcionalidade;

- motivo;

- impacto;

- justificativa;

- impacto no cronograma;

- impacto de desenvolvimento;

- funcionalidade que eventualmente será removida ou postergada.

**9. Consequências aceitas**

A decisão aceita conscientemente:

- MVP incompleto;

- algumas atividades temporariamente executadas fora do SaaS;

- funcionalidades avançadas postergadas;

- ajustes decorrentes do uso real;

- priorização dinâmica baseada em evidências;

- algumas automações manuais durante o piloto.

Não são aceitos:

- perda de dados;

- vazamento entre empresas;

- ausência de rastreabilidade essencial;

- inconsistência de dados;

- impossibilidade de concluir o fluxo principal;

- falhas graves de segurança;

- descumprimento legal aplicável.

A prioridade de desenvolvimento será:

fluxo operacional;

segurança, integridade, rastreabilidade e estabilidade;

usabilidade e produtividade;

suporte;

funcionalidades avançadas.

Estratégia:

**Validar → Aprender → Priorizar → Evoluir.**

**10. Alternativas consideradas**

**Alternativa A — Produto completo antes do piloto**

**Rejeitada.**

Aumentaria custo, prazo e risco antes de obter validação real.

**Alternativa B — Todos os módulos no MVP, porém simplificados**

**Rejeitada.**

Ainda produziria um escopo excessivamente amplo e reduziria o foco.

**Alternativa C — MVP focado no fluxo operacional central**

**APROVADA.**

Permite validar a principal hipótese do produto com menor risco.

**Alternativa D — MVP específico para o cliente-piloto**

**Rejeitada.**

Criaria risco de transformar o piloto em projeto sob medida.

**11. Dependências**

Este ADR possui dependências com:

**ADR-001 — Usuários / Permissões**

Define a arquitetura de acesso e autorização.

**ADR-003 — Cliente-piloto**

Deverá definir formalmente o cliente-piloto, responsabilidades e
critérios de validação.

**ADR-004 — Fiscal**

Define o escopo fiscal efetivamente necessário ao MVP.

**ADR-005 — Offline**

Define o funcionamento offline, especialmente para Obra/Instalação.

**ADR-007 — Notificações**

Define os canais e regras de comunicação.

**ADR-008 — Plataforma do aplicativo de campo**

Será necessária para definir a estratégia definitiva de PWA versus
aplicativo nativo e, consequentemente, o push.

**12. Governança do MVP**

Este ADR representa o limite oficial do MVP.

Nenhum outro documento poderá ampliar esse escopo por interpretação.

Qualquer alteração deverá registrar:

- decisão anterior;

- nova decisão;

- motivo;

- impacto funcional;

- impacto técnico;

- impacto no prazo;

- consequências;

- data;

- responsável pela decisão.

O ADR deverá ser versionado.

Alterações posteriores não deverão apagar silenciosamente decisões
anteriores.

**13. Decisões postergadas**

Ficam para definição posterior:

- planos comerciais;

- preços;

- gateway de pagamento;

- métodos de pagamento da assinatura;

- período de teste;

- onboarding self-service;

- regras de PAST_DUE;

- regras de SUSPENDED;

- roadmap completo da Release 1;

- integrações futuras;

- aprofundamento fiscal;

- aprofundamento financeiro;

- funcionalidades avançadas de BI;

- funcionalidades avançadas de automação e IA.

A arquitetura deverá permanecer preparada para evolução sem exigir
reconstrução do núcleo do produto.

**14. Resultado esperado**

O MVP deverá ser suficientemente pequeno para ser desenvolvido e
validado com rapidez, mas suficientemente completo para permitir uma
operação real do fluxo principal.

A definição final é:

**O MVP não busca ser um ERP completo. Busca provar que o SaaS consegue
controlar, com segurança, rastreabilidade e integridade, o fluxo
operacional central de uma vidraçaria desde o orçamento até a conclusão
do pedido.**

**Status final: APROVADO**
