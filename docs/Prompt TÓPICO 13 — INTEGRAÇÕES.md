**TÓPICO 13 — INTEGRAÇÕES**

**Objetivo**

Implementar a camada de **Integrações** do SaaS industrial, responsável
pela comunicação entre os módulos internos do sistema e sistemas,
serviços e plataformas externas.

A solução deverá ser modular, segura, escalável, auditável e preparada
para a inclusão de novos conectores sem necessidade de alterações
estruturais nos módulos existentes.

A arquitetura não deverá depender de um ERP, banco, provedor fiscal ou
fornecedor específico.

**1. PRINCÍPIOS FUNDAMENTAIS**

Implementar as integrações respeitando obrigatoriamente os seguintes
princípios:

**1.1 Não perder**

Nenhuma informação recebida deverá ser simplesmente descartada por falha
de processamento.

**1.2 Não duplicar**

Uma mesma operação não deverá gerar registros duplicados.

Utilizar mecanismos de identificação e idempotência quando aplicável.

**1.3 Não processar indevidamente**

Receber um dado não significa necessariamente efetivar seus efeitos
operacionais ou financeiros.

O processamento deverá respeitar as regras configuradas.

**1.4 Permitir corrigir**

Erros e inconsistências deverão poder ser identificados e corrigidos.

**1.5 Permitir reprocessar**

Operações que falharem deverão poder ser reprocessadas quando
tecnicamente e funcionalmente aplicável.

**1.6 Registrar tudo**

Operações relevantes deverão possuir histórico e rastreabilidade.

**1.7 Automação não significa autoridade irrestrita**

Uma integração somente poderá executar operações que estejam autorizadas
pelas regras, permissões e configurações da empresa.

**1.8 Decisão humana**

Quando uma operação exigir decisão humana, o fluxo deverá ser
interrompido, o responsável deverá ser informado e o sistema deverá
aguardar sua decisão.

A decisão deverá ser registrada e auditável.

**1.9 Fonte oficial**

Quando dois sistemas possuírem a mesma informação, deverá existir
definição de qual sistema é a fonte oficial daquela informação ou
processo.

O sistema não deverá escolher silenciosamente qual informação prevalece
diante de conflitos.

**2. CENTRAL DE INTEGRAÇÕES**

Criar uma **Central de Integrações** para concentrar a administração e o
monitoramento das integrações da empresa.

Exibir, conforme aplicável:

integrações disponíveis;

integrações configuradas;

integrações ativas;

integrações inativas;

ambiente;

status;

última comunicação;

última sincronização;

último processamento;

operações pendentes;

erros;

filas;

reprocessamentos;

alertas;

dependências;

versão;

histórico.

Permitir:

configurar integração;

ativar;

desativar;

testar conexão;

sincronizar manualmente;

visualizar logs;

consultar erros;

reprocessar operações.

O acesso deverá respeitar as permissões do usuário.

A desativação de uma integração deverá interromper novos processamentos
automáticos sem apagar dados ou históricos existentes.

**3. CATÁLOGO DE INTEGRAÇÕES**

Criar o conceito de **Catálogo de Integrações**.

Organizar as integrações por categorias, como:

ERP;

bancos;

fiscal;

pagamentos;

transportadoras;

logística;

BI;

e-commerce;

marketplaces;

APIs;

outros serviços.

O catálogo deverá permitir identificar:

nome;

finalidade;

disponibilidade;

compatibilidade;

situação;

versão;

requisitos;

ambiente disponível;

necessidade de configuração.

A existência de um conector no catálogo não significa que ele esteja
ativo para determinada empresa.

**4. INTEGRAÇÕES INTERNAS ENTRE MÓDULOS**

Permitir integração entre os módulos do próprio SaaS.

Considerar, entre outros:

Comercial → Pedidos;

Pedidos → PCP/Produção;

Engenharia → PCP/Produção;

Compras → Estoque;

Estoque → Produção;

Produção → Estoque;

Expedição → Financeiro;

Financeiro → Comercial/Pedidos;

Qualidade → Produção/Estoque.

Utilizar eventos internos para desencadear atualizações e automações
quando configurado.

Evitar duplicação de informações.

Manter uma fonte única para os dados compartilhados.

Permitir rastrear a origem e o destino das informações entre módulos.

**5. DOCUMENTOS FISCAIS**

Implementar estrutura para captura e processamento de documentos fiscais
eletrônicos, especialmente **NF-e**.

A solução deverá permitir:

captura automática de NF-e;

importação manual de XML;

identificação do emitente;

identificação de produtos e serviços;

valores;

impostos;

condições de pagamento;

transportadora;

chave fiscal;

identificadores;

eventos fiscais.

Preparar arquitetura para:

NFS-e;

CT-e;

MDF-e;

outros documentos fiscais relevantes.

**5.1 Caixa de entrada fiscal**

Criar uma camada de entrada para documentos fiscais recebidos.

O documento capturado automaticamente deverá ficar visível para o
operador.

Exemplo de fluxo:

**Captura → Notificação → Conferência → Decisão → Processamento**

O sistema não deverá considerar que uma NF-e foi definitivamente
processada apenas porque seu XML foi capturado.

**5.2 Status fiscal**

Implementar status no nível da NF e, quando necessário, no nível do
item.

Exemplos:

Recebida;

Aguardando conferência;

Em conferência;

Aprovada;

Aprovada parcialmente;

Com divergência;

Com material pendente;

Com material rejeitado;

Aguardando fornecedor;

Aguardando correção;

Processamento parcial;

Processada;

Cancelada;

Rejeitada.

Permitir evolução do status conforme o processo.

**5.3 Controle por item**

Controlar, quando aplicável:

quantidade faturada;

quantidade recebida;

quantidade aprovada;

quantidade pendente;

quantidade rejeitada.

Uma NF poderá conter simultaneamente:

itens aprovados;

itens parcialmente recebidos;

itens pendentes;

itens rejeitados.

**5.4 Conferência**

Permitir comparar:

**Pedido de Compra × NF-e × Recebimento**

Comparar:

produtos;

quantidades;

preços;

valores;

condições;

divergências.

Permitir:

aprovação;

aprovação parcial;

bloqueio;

rejeição;

aguardando fornecedor;

correção;

decisão excepcional autorizada.

**5.5 Integração com Estoque**

A entrada no estoque deverá respeitar as regras da empresa.

A captura do XML não deverá obrigatoriamente gerar movimentação de
estoque.

O estoque poderá depender de:

conferência;

recebimento físico;

qualidade;

aprovação;

outras regras.

**5.6 Integração com Financeiro**

Permitir utilização dos dados fiscais para alimentar processos
financeiros.

Considerar:

condições de pagamento;

parcelas;

vencimentos;

contas a pagar;

valores;

fornecedor;

documento fiscal.

O lançamento financeiro deverá respeitar as regras e aprovações
configuradas.

**5.7 Eventos fiscais**

Preparar suporte para eventos como:

cancelamento;

carta de correção;

manifestação;

devolução;

NF complementar;

outros eventos aplicáveis.

A chave fiscal deverá ser utilizada como identificador principal da NF-e
quando aplicável, evitando duplicidade.

**6. BANCOS, BOLETOS E PIX**

Preparar integração com instituições financeiras e serviços bancários.

Permitir, conforme disponibilidade do provedor:

extratos;

movimentações;

cobranças;

boletos;

pagamentos;

liquidações;

PIX;

transferências;

reversões;

conciliação.

Suportar múltiplos bancos e contas.

**6.1 Conciliação bancária**

Relacionar:

**Movimentação bancária ↔ Registro financeiro**

A conciliação poderá ser:

automática;

sugerida;

manual.

Quando não houver segurança suficiente para identificação, solicitar
decisão do operador.

**6.2 Pagamentos**

Operações financeiras sensíveis deverão possuir fluxo de autorização.

Exemplo:

**Título → Solicitação → Aprovação → Envio ao banco → Processamento →
Confirmação**

Controlar permissões para cada etapa.

**7. CARTÕES E MEIOS DE PAGAMENTO**

Preparar integração com:

adquirentes;

subadquirentes;

gateways;

links de pagamento;

PIX;

outros meios eletrônicos.

Relacionar:

**Cliente → Pedido → Documento → Título → Transação → Recebimento**

Controlar:

parcelas;

valores brutos;

taxas;

antecipação;

valores líquidos;

datas previstas;

datas efetivas;

identificadores;

status;

estornos;

chargebacks;

divergências.

Não armazenar dados sensíveis de cartão além do necessário.

**8. ERP E SISTEMAS EXTERNOS**

Criar arquitetura preparada para integração com diferentes ERPs e
sistemas externos.

Permitir, conforme o sistema:

consulta;

envio;

recebimento;

atualização;

sincronização;

processamento bidirecional.

Dados possíveis:

clientes;

fornecedores;

produtos;

estoque;

pedidos;

compras;

produção;

fiscal;

financeiro;

títulos;

pagamentos;

recebimentos.

**9. FONTE OFICIAL DOS DADOS**

Permitir configurar a fonte oficial por tipo de informação ou processo.

Exemplos:

Engenharia → SaaS;

Produção → SaaS;

Clientes → ERP;

Financeiro → ERP.

A definição deverá ser configurável por empresa.

Conflitos entre sistemas deverão ser identificados e não resolvidos
silenciosamente.

**10. MAPEAMENTO E TRANSFORMAÇÃO**

Implementar mecanismo para mapear estruturas externas para estruturas
internas.

Exemplos:

código externo → código interno;

unidade externa → unidade interna;

status externo → status interno;

campos externos → campos internos.

Permitir transformações de:

códigos;

unidades;

status;

datas;

valores;

formatos;

arredondamentos;

composição de campos;

separação de campos.

Permitir salvar modelos de mapeamento.

**11. RECONCILIAÇÃO ENTRE SISTEMAS**

Permitir comparar informações entre sistemas.

Exemplo:

**ERP: estoque = 1.000**

**SaaS: estoque = 998**

O sistema deverá:

identificar a divergência;

informar;

permitir investigação;

respeitar a fonte oficial;

permitir correção/sincronização;

registrar a decisão e o resultado.

**12. APIs**

Disponibilizar API estruturada e documentada para aplicações
autorizadas.

Conforme permissões, permitir:

consultar;

criar;

alterar;

atualizar;

alterar status;

enviar;

receber;

executar operações;

consultar histórico;

trabalhar com eventos.

A API deverá ser versionável e extensível.

**13. APIs DE TERCEIROS**

Permitir consumo de serviços externos, incluindo:

fiscal;

bancário;

pagamentos;

transportadoras;

CEP/endereço;

comunicação;

BI;

e-commerce;

marketplaces;

outros.

Utilizar mecanismos de autenticação apropriados:

API Key;

OAuth;

tokens;

certificados;

credenciais específicas.

**14. WEBHOOKS E EVENTOS**

Implementar suporte a Webhooks recebidos e enviados.

Utilizar estrutura padronizada de eventos.

Modelo de automação:

**Evento → Condição → Ação**

Permitir condições e ações configuráveis.

Exemplo:

**NF-e recebida → valor acima do limite → solicitar aprovação**

Proteger Webhooks contra:

origem inválida;

duplicidade;

reutilização indevida;

eventos inválidos.

**15. NÍVEIS DE AUTOMAÇÃO**

Implementar três níveis conceituais:

**Informativo**

**Detectar → Informar → Registrar**

**Assistido**

**Detectar → Preparar/Sugerir → Aguardar confirmação**

**Automático**

**Detectar → Executar**

O nível automático somente poderá ser utilizado quando autorizado e
quando não houver necessidade de decisão humana.

**16. FILAS E PROCESSAMENTO ASSÍNCRONO**

Utilizar processamento assíncrono para operações demoradas ou volumosas.

Exemplos:

documentos fiscais;

sincronização ERP;

importações;

exportações;

Webhooks;

conciliações;

grandes lotes.

Controlar:

ID;

origem;

tipo;

prioridade;

criação;

status;

tentativas;

última tentativa;

próxima tentativa;

resultado;

erro.

**17. RETRY E REPROCESSAMENTO**

Implementar novas tentativas para falhas temporárias.

Utilizar estratégia adequada de espera entre tentativas.

Quando o erro for permanente:

**Erro → Intervenção necessária**

Permitir reprocessamento manual quando aplicável.

Nunca apagar o processamento original ao reprocessar.

**18. IDEMPOTÊNCIA**

Implementar mecanismos para evitar processamento duplicado.

Considerar especialmente:

pagamentos;

NF-e;

recebimentos;

estoque;

pedidos;

Webhooks;

APIs;

eventos.

**19. LOGS E RASTREABILIDADE**

Registrar operações relevantes contendo, conforme aplicável:

integração;

operação;

origem;

destino;

data/hora;

usuário;

processo automático;

identificador interno;

identificador externo;

documento;

resultado;

erro;

tentativas;

reprocessamentos.

Utilizar identificadores de correlação para acompanhar uma operação
entre diferentes processos e sistemas.

**20. AUDITORIA**

Registrar decisões humanas e alterações relevantes.

Permitir identificar:

quem;

quando;

o que fez;

motivo;

situação anterior;

situação posterior;

resultado.

Diferenciar claramente:

**ação automática**

de

**decisão do operador**.

Preservar registros de auditoria contra alteração ou exclusão indevida.

**21. SEGURANÇA**

Proteger:

senhas;

tokens;

API Keys;

certificados;

chaves privadas;

credenciais bancárias;

segredos de Webhooks.

Aplicar:

controle de acesso;

menor privilégio;

autenticação;

comunicação segura;

proteção de Webhooks;

idempotência;

auditoria.

Nunca expor credenciais ou segredos em logs.

**22. CERTIFICADOS DIGITAIS**

Preparar suporte para certificados digitais quando necessários.

Controlar:

certificado;

empresa;

validade;

situação;

expiração;

substituição;

permissões.

Alertar sobre certificados próximos do vencimento.

**23. MONITORAMENTO**

A Central deverá mostrar a saúde das integrações.

Considerar:

comunicação;

sincronização;

processamento;

filas;

erros;

pendências;

reprocessamentos;

tempo de processamento;

taxa de sucesso.

Uma integração conectada tecnicamente, mas sem processar operações,
deverá ser identificada como problemática.

**24. ALERTAS**

Permitir alertas configuráveis para situações como:

integração indisponível;

NF-e recebida;

divergência;

material pendente;

erro;

fila acumulada;

certificado próximo do vencimento;

operação aguardando decisão;

reprocessamento necessário.

Permitir direcionar alertas aos responsáveis.

Respeitar a configuração geral de notificações da empresa.

**25. CONFIGURAÇÃO POR EMPRESA**

Cada empresa deverá possuir configurações independentes.

Incluindo:

integrações;

credenciais;

regras;

permissões;

ambientes;

fluxos;

alertas;

logs;

fonte oficial;

níveis de automação.

Uma empresa não poderá visualizar ou interferir nas integrações de
outra.

**26. AMBIENTES**

Quando suportado pelo serviço externo, separar:

homologação;

sandbox;

produção.

Identificar claramente o ambiente em uso.

Impedir que configurações de teste atinjam produção acidentalmente.

**27. VERSIONAMENTO**

Controlar versões de:

APIs;

layouts;

XML;

Webhooks;

padrões externos;

conectores.

Permitir evolução controlada:

**Testar → Validar → Atualizar → Monitorar**

Preservar o histórico das versões anteriores.

**28. DEPENDÊNCIAS**

Identificar dependências entre:

integrações;

módulos;

cadastros;

serviços externos;

certificados;

APIs;

configurações.

Quando uma dependência estiver indisponível, informar os processos
potencialmente afetados.

**29. IMPORTAÇÃO**

Permitir importar dados em formatos como:

CSV;

Excel;

XML;

JSON;

outros formatos adequados.

Exemplos:

clientes;

fornecedores;

produtos;

matérias-primas;

componentes;

estruturas;

preços;

pedidos;

estoque inicial;

dados financeiros.

Implementar:

**Prévia → Validação → Identificação de problemas → Processamento**

Permitir:

mapeamento;

detecção de duplicidade;

inserção;

atualização;

importação parcial;

correção;

reprocessamento;

histórico.

**30. EXPORTAÇÃO**

Permitir exportação para:

Excel;

CSV;

JSON;

XML;

PDF quando apropriado.

Permitir filtros e, quando necessário, exportações programadas.

**31. ADMINISTRAÇÃO E SUPORTE**

Criar ferramentas administrativas para:

diagnóstico;

logs;

filas;

erros;

incidentes;

versões;

dependências;

reprocessamentos.

O suporte não deverá possuir acesso irrestrito aos dados da empresa.

Quando houver acesso assistido, registrar:

solicitante;

autorizador;

responsável pelo acesso;

período;

finalidade;

ações realizadas.

**32. INCIDENTES**

Permitir registrar incidentes relevantes.

Informações:

integração;

empresa afetada;

início;

impacto;

causa;

ações;

situação;

solução;

encerramento.

**33. ISOLAMENTO DE FALHAS**

Uma falha em determinada integração ou empresa não deverá comprometer as
demais.

Buscar isolamento entre:

empresas;

integrações;

filas;

processos;

serviços.

**34. RETENÇÃO E HISTÓRICO**

Preservar histórico das operações.

Permitir políticas de:

retenção;

arquivamento;

consulta;

preservação.

Atualização, desativação ou substituição de uma integração não deverá
apagar o histórico anterior.

**35. PRINCÍPIO DE INTERVENÇÃO TÉCNICA**

Toda intervenção técnica deverá seguir:

**Diagnosticar → Corrigir → Registrar → Comunicar → Preservar
histórico**

Não permitir:

**Alterar → ocultar → apagar histórico**

**36. ARQUITETURA PARA EXPANSÃO**

A arquitetura deverá permitir adicionar novos conectores sem remodelar
os módulos existentes.

O modelo deverá permitir evolução de:

**Integrações básicas**

para:

**Ecossistema de integrações**

mantendo:

segurança;

governança;

rastreabilidade;

escalabilidade;

isolamento;

controle humano.

**37. ESCOPO DO MVP**

O MVP deverá priorizar a infraestrutura e os mecanismos necessários para
suportar integrações futuras.

Prioridades:

Central de Integrações;

integrações internas entre módulos;

estrutura de APIs;

filas e processamento assíncrono;

logs;

auditoria;

segurança;

importação/exportação;

estrutura fiscal;

estrutura para ERP;

monitoramento;

alertas;

reprocessamento;

configuração por empresa;

fonte oficial;

mapeamento de dados;

idempotência.

Não é necessário implementar inicialmente todos os conectores externos.

Os conectores específicos deverão ser desenvolvidos conforme prioridade
do produto.

**38. FLUXO GERAL**

A arquitetura deverá suportar o seguinte fluxo:

**Origem**

↓

**Captura / Evento / API / Importação**

↓

**Validação**

↓

**Mapeamento / Transformação**

↓

**Identificação / Associação**

↓

**Regra de negócio**

↓

**Automação ou decisão humana**

↓

**Processamento**

↓

**Integração com módulo ou sistema externo**

↓

**Confirmação**

↓

**Auditoria**

↓

**Monitoramento**

↓

**Reprocessamento, se necessário**

**39. REGRA FINAL**

O desenvolvimento deverá priorizar uma integração que seja:

**segura, modular, configurável, rastreável, auditável, resiliente e
preparada para expansão.**

Nenhuma integração deverá ser tratada apenas como uma conexão técnica.

Ela deverá possuir:

**Conexão + Regras + Permissões + Processamento + Monitoramento +
Auditoria + Controle humano.**

O sistema deverá sempre permitir compreender:

**O que aconteceu?\
De onde veio?\
Para onde foi?\
Quando aconteceu?\
Quem ou qual processo executou?\
Qual regra foi aplicada?\
Houve decisão humana?\
Qual foi o resultado?\
É possível corrigir ou reprocessar?**


**40. OTIMIZADOR DE CORTE EXTERNO — complemento aprovado em 12/09/2026**

Complemento decorrente de revisão posterior ao texto original. Não
altera as seções anteriores.

**Contexto**

O SaaS não fará otimização matemática de corte nem nesting — decisão
registrada no TÓPICO 6 e no ADR-002. Ainda assim, uma vidraçaria pode
utilizar um software otimizador próprio, hoje ou no futuro.

**Decisão**

A arquitetura deverá **prever o gancho de integração com otimizador de
corte externo, sem integrar nenhum provedor agora** — mesmo padrão
adotado para gateways de pagamento no ADR-006.

O gancho deverá contemplar, quando vier a ser implementado:

exportação da lista de peças a produzir (dimensões, quantidades,
material, pedido de origem);

importação do plano de corte gerado pelo otimizador;

vínculo do plano importado à ordem de produção correspondente;

identificação da origem externa do plano;

rastreabilidade e reprocessamento, conforme as regras gerais deste
tópico.

**Limites**

A escolha do otimizador permanece decisão futura.

A ausência ou indisponibilidade do otimizador externo não poderá
impedir a operação: a lista de corte interna (TÓPICO 4, seção 54)
permanece como caminho padrão.

Integração com máquinas de corte (CNC/CAM) continua fora de escopo,
conforme o TÓPICO 6.
