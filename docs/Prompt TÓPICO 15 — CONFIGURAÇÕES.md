**TÓPICO 15 — CONFIGURAÇÕES**

**Status:** APROVADO\
**Versão:** 1.1 (consolidada)\
**Data:** 12/09/2026

**Nota de consolidação**

Este documento consolida o "PROMPT DE DESENVOLVIMENTO — TÓPICO 15 —
CONFIGURAÇÕES" original (movido para o Histórico) com complementos
aprovados em 12/09/2026.

As seções 1 a 30 são o texto original, com numeração preservada — o
código já implementado referencia essa numeração. A seção 31 reúne os
complementos, decorrentes de decisões tomadas depois que o documento
original foi escrito.

**1. Objetivo**

Desenvolver o módulo Configurações do SaaS industrial como uma camada transversal de parametrização do sistema.

O módulo deverá permitir que cada empresa adapte o comportamento do sistema à sua realidade operacional sem necessidade de desenvolvimento, mantendo obrigatoriamente:

segurança;
permissões;
rastreabilidade;
integridade dos dados;
histórico;
consistência entre módulos;
isolamento entre empresas.

O módulo não deve substituir os módulos operacionais, cadastros ou permissões.

**2. Princípios arquiteturais**

O sistema deverá diferenciar claramente:

Configuração
Define como o sistema deve se comportar.

Cadastro
Contém os dados operacionais utilizados pelo sistema.

Permissão
Define o que determinado usuário pode visualizar ou executar.

Regra de negócio
Define como determinado processo funciona.

O Tópico 15 deve ser utilizado para parametrizar comportamentos, e não para duplicar funcionalidades dos demais módulos.

**3. Arquitetura das configurações**

Criar uma área central de Configurações, organizada por categorias:

Gerais
Segurança
Numeração
Aprovações
Processos
Estoque
Produção
Compras
Financeiro
Comercial
Qualidade
Notificações
Integrações
Documentos e Templates
Auditoria
Parâmetros Avançados
Experiência e Preferências

A interface deve evitar uma lista única e excessivamente extensa.

Implementar:

busca;
filtros;
agrupamento;
descrição dos parâmetros;
indicação de impacto;
valores padrão;
validação;
identificação de dependências;
histórico quando aplicável.

**4. Hierarquia das configurações**

Permitir diferentes níveis somente quando fizer sentido para o parâmetro:

Sistema → Empresa → Filial/Unidade → Contexto específico → Usuário

Nem todo parâmetro deverá suportar todos os níveis.

Cada configuração deverá definir explicitamente quais níveis são permitidos.

Quando existirem várias configurações aplicáveis:

A configuração mais específica prevalece sobre a mais geral.

Porém, nenhuma configuração específica poderá violar regras corporativas obrigatórias, segurança, permissões ou integridade do sistema.

**5. Configurações gerais da empresa**

Permitir parametrizar:

idioma;
região;
fuso horário;
formato de data;
formato de hora;
separadores numéricos;
moeda;
casas decimais;
arredondamentos;
unidades de medida;
calendário corporativo;
dias úteis;
feriados;
períodos fechados;
padrões gerais de documentos;
identidade visual;
preferências gerais.

Dados cadastrais da empresa devem permanecer nos cadastros apropriados.

**6. Usuários, perfis e segurança**

Criar configurações gerais de segurança para:

política de senha;
quantidade de tentativas;
bloqueio;
sessão;
inatividade;
MFA/2FA, quando disponível;
usuários inativos;
encerramento de acesso;
controle de sessões/dispositivos;
ações críticas.

A definição de permissões individuais deve permanecer no módulo Usuários/Permissões — Tópico 14.

Respeitar também a regra de redefinição de senha por usuário autorizado, conforme hierarquia e permissões estabelecidas.

Alterações de segurança devem possuir auditoria apropriada.

**7. Numeração, códigos e sequências**

Implementar configuração de numeração para documentos e processos.

Permitir:

sequência inicial;
quantidade de dígitos;
prefixo;
sufixo;
separador;
ano;
mês;
empresa;
filial;
reinício anual;
reinício mensal;
outras periodicidades suportadas;
sequência global ou específica.

Aplicável, entre outros, a:

propostas;
pedidos;
OPs;
requisições;
pedidos de compra;
inspeções;
inventários;
documentos financeiros.

Regras obrigatórias:

números utilizados nunca devem ser reutilizados automaticamente;
cancelamento não libera número;
exclusão não deve causar reutilização automática;
concorrência não pode gerar duplicidade;
importações devem preservar identificadores externos;
identificadores técnicos devem ser independentes da numeração apresentada ao usuário.

**8. Aprovações e alçadas**

Criar mecanismo transversal de aprovação configurável.

Permitir configurar:

processos que exigem aprovação;
valor;
percentual;
departamento;
centro de custo;
tipo;
grupo;
cliente;
fornecedor;
operação;
hierarquia;
múltiplos níveis;
aprovação sequencial;
aprovação paralela;
delegação;
substituto;
prazo;
escalonamento;
rejeição;
retorno para correção;
justificativa;
reaprovação após alteração.

Permitir aprovador por:

usuário;
perfil;
função;
grupo;
superior hierárquico;
responsável.

Impedir ciclos, conflitos ou ausência de aprovadores válidos.

Processos específicos utilizarão esse mecanismo conforme suas próprias regras.

**9. Processos e regras operacionais**

Criar estrutura para parametrização transversal de:

ativação/desativação de funcionalidades;
campos obrigatórios;
campos condicionais;
transições;
bloqueios;
tolerâncias;
prazos;
exceções;
automações;
cancelamentos;
reaberturas;
encerramentos;
operações parciais.

Não utilizar este bloco para substituir as regras específicas dos módulos.

**10. Estoque, materiais e unidades**

Permitir configurar:

estoque negativo;
reservas;
bloqueios;
lotes;
séries;
localizações;
unidades;
conversões;
múltiplos;
arredondamentos;
estoque mínimo;
estoque máximo;
estoque de segurança;
inventário;
ajustes;
perdas;
sucatas;
tolerâncias.

Permitir regras específicas por item, grupo, localização ou processo quando suportado.

Manter a possibilidade de regras gerais serem complementadas ou restringidas por configurações mais específicas.

**11. Produção e PCP**

Permitir configurar:

geração de OP;
liberação;
aprovação;
produção parcial;
múltiplas OPs;
etapas;
operações;
retrabalho;
perdas;
consumo;
tolerâncias;
máquinas;
recursos;
turnos;
calendário;
capacidade;
prioridades;
reprogramação;
condições de liberação;
condições de encerramento.

A configuração não poderá criar inconsistências com Engenharia, Estoque, PCP ou Qualidade.

**12. Compras e Suprimentos**

Permitir configurar:

necessidade de requisição;
aprovação;
cotação;
quantidade mínima de fornecedores;
prazos;
pedidos;
alterações;
cancelamentos;
recebimentos parciais;
tolerâncias;
inspeções;
bloqueios;
compras emergenciais;
condições de pagamento;
integração com estoque;
integração com produção.

Entradas automáticas devem permanecer visíveis e rastreáveis.

O sistema deve permitir identificar:

origem;
data/hora;
status;
necessidade de conferência;
pendência;
parcialidade;
rejeição;
inconsistência.

**13. Financeiro**

Permitir configurar:

formas de pagamento;
condições de pagamento;
vencimentos;
dias úteis;
tolerâncias;
juros;
multas;
descontos;
aprovações;
bloqueios;
recorrências;
fluxo de caixa;
conciliação;
fechamento;
alterações retroativas;
classificação automática;
integração com Comercial;
integração com Compras;
integração fiscal.

Períodos fechados devem impedir alterações indevidas.

**14. Comercial**

Permitir configurar:

validade de propostas;
preços;
descontos;
margens;
limites;
condições de pagamento;
aprovações;
comissões;
bloqueios;
conversão de propostas;
pedidos;
condições excepcionais;
canais;
origens;
integração financeira.

Permitir regras específicas para:

cliente;
grupo;
operação;
produto;
vendedor, quando aplicável.

Exceções poderão exigir:

justificativa;
aprovação;
permissão específica;
auditoria.

**15. Qualidade**

Permitir configurar:

tipos de inspeção;
necessidade de inspeção;
amostragem;
tolerâncias;
critérios de aprovação;
bloqueio;
liberação;
não conformidades;
retrabalho;
reprocessamento;
inspeções obrigatórias;
liberações excepcionais.

Integrar as configurações com:

Compras;
Estoque;
Produção;
Expedição;
Engenharia.

**16. Notificações e Alertas**

As notificações devem ser opcionais.

Permitir configurar:

ativação por módulo;
ativação por evento;
canal;
destinatário;
prioridade;
frequência;
agrupamento;
horário;
escalonamento;
resumo;
notificações de integração;
falhas de envio.

Eventos poderão gerar notificações para:

aprovações;
vencimentos;
atrasos;
pendências;
materiais;
pedidos;
OPs;
qualidade;
estoque;
financeiro;
integrações.

Destinatários poderão ser definidos por:

usuário;
perfil;
função;
responsável;
departamento;
aprovador;
superior;
grupo;
delegado/substituto.

Regra fundamental:

Desativar uma notificação não elimina uma obrigação operacional.

**17. Integrações**

Permitir configurar:

ativação;
frequência;
execução automática/manual;
horários;
importação;
exportação;
mapeamento;
identificadores;
duplicidades;
tentativas;
erros;
reprocessamento;
status;
credenciais;
ambiente.

Suportar configuração para documentos fiscais e demais integrações previstas no Tópico 13.

Toda entrada integrada com impacto operacional deve ser:

identificada como integrada;
rastreável;
visível;
validável quando necessário.

Automação não elimina controle operacional.

**18. E-mails, documentos e templates**

Implementar configuração de:

identidade visual;
templates;
cabeçalhos;
rodapés;
textos;
campos dinâmicos;
assuntos;
assinaturas;
anexos;
idiomas;
formatos.

Permitir templates diferentes por:

empresa;
filial;
tipo de documento;
operação;
cliente;
fornecedor;
idioma;
canal.

Implementar versionamento quando aplicável.

Documentos já emitidos não podem sofrer alteração retroativa devido à mudança posterior de template.

**19. Auditoria e histórico**

Registrar alterações relevantes de configuração contendo:

configuração;
valor anterior;
novo valor;
usuário;
data/hora;
empresa;
origem;
justificativa, quando exigida;
vigência.

Classificar configurações por impacto:

Baixo impacto
Histórico conforme necessidade.

Relevante
Histórico obrigatório.

Crítico
Histórico obrigatório + proteção adicional + justificativa/aprovação quando aplicável.

Nunca apagar o histórico simplesmente porque uma configuração foi alterada novamente.

Permitir consulta e filtros por:

módulo;
configuração;
usuário;
período;
empresa;
tipo;
criticidade.

Quando aplicável, permitir exportação por usuários autorizados.

**20. Parâmetros avançados**

Criar área separada para parâmetros avançados.

Permitir, quando necessário:

processamento automático;
filas;
tentativas;
limites;
processamento em lote;
recursos opcionais;
comportamentos sistêmicos;
parâmetros técnicos.

Esses parâmetros devem possuir:

acesso restrito;
validação;
valores seguros;
aviso de impacto;
auditoria.

Não utilizar parâmetros avançados para compensar ausência de funcionalidades de negócio.

**21. Experiência e preferências**

Permitir configurar:

aparência;
dashboard;
página inicial;
menus;
atalhos;
visualizações;
filtros;
ordenação;
quantidade de registros;
terminologia de apresentação;
idioma;
navegação;
acessibilidade;
funcionalidades opcionais.

Separar:

Empresa → Perfil → Usuário

Preferências individuais nunca poderão ultrapassar regras corporativas, permissões ou segurança.

**22. Dependências**

Implementar mecanismo de validação de dependências.

Exemplos:

aprovação exige aprovador/alçada válida;
integração exige configuração mínima;
comissão exige estrutura para cálculo;
funcionalidade dependente não pode ser ativada sem seu pré-requisito.

Quando possível, apresentar ao usuário o motivo da impossibilidade.

**23. Vigência**

Permitir definir, quando aplicável:

aplicação imediata;
aplicação futura;
aplicação somente para novos registros.

Processos já iniciados deverão preservar a regra/configuração vigente no momento de sua criação quando a alteração puder afetar sua integridade.

**24. Exceções**

Operações fora do padrão poderão ser permitidas somente conforme:

permissão;
alçada;
justificativa;
aprovação;
limite;
auditoria.

A exceção não deve apagar ou modificar a regra original.

**25. Segurança e integridade**

Nenhuma configuração poderá permitir:

burlar permissões;
eliminar rastreabilidade;
apagar histórico obrigatório;
gerar numeração duplicada;
comprometer integridade financeira;
ignorar controles obrigatórios;
comprometer dados históricos;
quebrar o isolamento entre empresas.

**26. Multiempresa**

Todas as configurações deverão respeitar o isolamento entre empresas.

Cada empresa deve possuir suas próprias:

configurações;
políticas;
sequências;
templates;
integrações;
notificações;
parâmetros;
históricos.

Uma empresa não poderá visualizar ou alterar configurações de outra sem autorização estrutural específica.

**27. Interface**

A interface de Configurações deve apresentar:

categorias;
busca;
filtros;
descrição;
valor atual;
valor padrão;
nível da configuração;
dependências;
impacto;
histórico;
indicação de configuração herdada;
indicação de sobrescrita;
botão para restaurar padrão quando aplicável.

Configurações críticas devem apresentar alerta antes da alteração.

**28. Regras de restauração**

Quando aplicável, permitir:

restaurar padrão;
restaurar valor anterior;
desativar configuração;
recuperar configuração anterior.

Toda restauração deve gerar novo registro no histórico.

Restaurar uma configuração não significa apagar os registros históricos anteriores.

**29. Requisitos de desenvolvimento**

O desenvolvimento deverá priorizar:

arquitetura modular;
escalabilidade;
multiempresa;
segurança;
rastreabilidade;
facilidade de manutenção;
consistência entre módulos;
validações;
controle de dependências;
versionamento;
auditoria;
experiência de uso simples.

Evitar criar dezenas de parâmetros isolados sem justificativa funcional.

Cada novo parâmetro deve possuir:

finalidade clara;
valor padrão seguro;
descrição;
impacto;
tipo de dado;
validação;
nível permitido;
dependências;
comportamento esperado.

**30. Regra arquitetural final**

O Tópico 15 deve funcionar como a camada central de parametrização do SaaS.

A relação entre os componentes deverá ser:

Módulo
→ define e executa o processo.

Configuração
→ adapta o comportamento do processo.

Permissão
→ determina quem pode executar.

Aprovação
→ determina quem precisa autorizar.

Notificação
→ comunica eventos.

Integração
→ conecta sistemas.

Auditoria
→ registra alterações e ações.

Regra máxima

Quanto maior o impacto de uma configuração, maior deverá ser o nível de proteção, validação, permissão e auditoria exigido.

O sistema deve ser altamente configurável, porém sem permitir configurações que comprometam segurança, rastreabilidade, integridade ou coerência dos processos.

**31. Complementos aprovados em 12/09/2026**

Os itens abaixo decorrem de decisões posteriores ao texto original e
integram este tópico.

**31.1 Os três níveis (Arquitetura Mestre, item 16.1)**

O sistema distingue:

**Regra fixa** — estrutural, não configurável (ex.: isolamento entre
empresas, obrigatoriedade de auditoria, sequência estrutural dos
processos);

**Regra configurável** — comportamento previsto pelo sistema, que pode
ser ligado, desligado ou ajustado;

**Parâmetro** — o valor utilizado pela regra.

Vale o princípio P13: configuração parametriza comportamentos previstos
e não substitui regra de negócio. O T15 fornece o parâmetro; o módulo de
domínio interpreta e decide (item 6.2 da Arquitetura Mestre).

**31.2 Fronteira com contratação e entitlements (ADR-006)**

Configuração **não pode liberar recurso que a empresa não contratou**.

O entitlement decide **se** o recurso pode ser usado; a configuração
decide **como** ele se comporta dentro do que já é permitido.

Na gravação, deverá ser impedida qualquer configuração que conceda,
direta ou indiretamente, recurso não contratado. O administrador do
tenant não poderá, por parametrização, ampliar os próprios direitos
comerciais ou de acesso.

Feature flag permanece controle técnico de disponibilização, distinto de
configuração, conforme o ADR-006.

**31.3 Estados configuráveis — limite**

A empresa poderá **apenas renomear o rótulo exibido** de um estado (ex.:
exibir "Liberado" como "Aprovado").

A criação de estados próprios e a alteração da sequência estrutural dos
processos **não são permitidas**, por afetarem regras, permissões,
relatórios e indicadores.

**31.4 Margem de quebra (Arquitetura Mestre, item 6.3)**

Percentual técnico planejado, parametrizado por **combinação de tipo de
material e processo** (ex.: vidro temperado na têmpera, alumínio no
corte).

Deverá existir valor padrão por material, sobreposto pelo valor
específico da combinação material + processo quando houver.

A margem é quantidade planejada (ex.: 2.000 mm × 1,05 = 2.100 mm) e
**não se confunde com a perda real**, que é registrada na produção.

**31.5 Regra de medição em obra (TÓPICO 16)**

A exigência de medida confirmada antes da liberação para produção é
configurável por tipo de pedido/item:

itens sob medida (vidro temperado, esquadrias e demais itens fabricados
conforme medida de obra): a liberação para produção deverá ser
**impedida** enquanto não houver medida confirmada;

itens padrão/catálogo, para os quais a medição em obra não se aplica: o
sistema deverá apenas **sinalizar**, sem impedir.

Também é parametrizada aqui a alçada de aprovação da solicitação de nova
fabricação decorrente de quebra ou dano em obra (TÓPICO 16), utilizando
o mecanismo de aprovações da seção 8.

**31.6 Listas de domínio — inativação (Arquitetura Mestre, item 16.5)**

Quando houver histórico associado a um item de lista, deverá ser
preferida a **inativação** em vez da exclusão.

Um item inativado deixa de ser oferecido para novos registros, mas
permanece visível nos registros históricos que o utilizaram.

Aplica-se, entre outras, às listas de motivos de ocorrência, tipos de
pendência, causas de quebra e responsabilidades atribuíveis (TÓPICO 16).

**31.7 Campos personalizados — fora do MVP**

O item 4.11 do ADR-002 não inclui campos personalizados no MVP. O módulo
prevê a capacidade (Escopo do Projeto, item 4.15; Arquitetura Mestre,
item 16.4), que será habilitada em etapa posterior e não deverá
substituir campos estruturais.

**31.8 Nível "unidade" no MVP**

A estrutura de dados deverá comportar configuração por unidade/filial,
mas a interface do MVP exporá apenas os níveis plataforma, empresa e
usuário — evitando complexidade desnecessária no piloto sem exigir
remodelagem quando surgir o primeiro cliente com filiais.
