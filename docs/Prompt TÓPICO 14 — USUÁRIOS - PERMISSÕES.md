**TÓPICO 14 — USUÁRIOS / PERMISSÕES**

**Objetivo**

Implementar o módulo central de **Usuários / Permissões** do SaaS
industrial.

O módulo deverá controlar:

identidade dos usuários;

autenticação;

perfis;

permissões;

escopos de acesso;

contexto de operação;

alçadas;

aprovações;

segregação de funções;

acessos temporários;

substituições;

acessos emergenciais;

administração;

auditoria;

segurança;

integrações de identidade;

relatórios e governança.

O modelo deverá ser **centralizado, configurável, escalável e
reutilizável por todos os módulos atuais e futuros do sistema**.

A arquitetura de autorização deverá seguir o conceito:

**USUÁRIO + PERMISSÃO + ESCOPO + CONTEXTO + LIMITE + VALIDADE +
AUDITORIA**

O sistema deverá sempre ser capaz de determinar:

Quem pode fazer o quê, onde, em qual contexto, até qual limite e durante
qual período.

**1. USUÁRIOS**

**1.1 Identidade individual**

Cada pessoa deverá possuir um usuário individual e único.

Não permitir compartilhamento de credenciais individuais.

O usuário deverá ser a identidade utilizada para rastreabilidade de
todas as operações relevantes.

**1.2 Identificador de acesso**

O e-mail não deverá ser obrigatório.

Cada usuário deverá possuir um identificador único independente do
e-mail, podendo ser:

login;

nome de usuário;

matrícula;

identificador interno;

outro identificador configurável.

Exemplo:

Matrícula 00457 → Login 00457.

Quando houver e-mail, este poderá ser utilizado para:

convite;

recuperação;

notificações;

autenticação;

MFA;

outros serviços.

Para usuários sem e-mail deverá existir mecanismo alternativo seguro de
acesso e recuperação.

**2. CADASTRO DE USUÁRIOS**

Criar área administrativa para cadastro e gestão de usuários.

Campos previstos:

nome completo;

nome de exibição;

login/identificador;

matrícula;

e-mail;

telefone;

empresa;

filial/unidade;

setor/departamento;

cargo/função;

superior hierárquico;

status;

perfis;

permissões individuais;

escopos;

alçadas;

data de criação;

data de ativação;

último acesso.

Permitir que a criação do usuário comece como:

convite pendente;

inativo;

ativo, conforme política.

**3. CICLO DE VIDA DO USUÁRIO**

Suportar os seguintes estados, conforme necessidade:

convite pendente;

ativo;

inativo;

bloqueado;

suspenso.

Permitir:

ativação;

inativação;

bloqueio;

desbloqueio;

suspensão;

reativação.

Ao bloquear, registrar:

responsável;

data/hora;

motivo.

Quando necessário, o bloqueio deverá invalidar sessões ativas.

Nunca apagar o histórico operacional do usuário.

Usuários com histórico não deverão ser fisicamente excluídos.

Exclusão física somente poderá ser permitida para contas que nunca
tiveram utilização/histórico e conforme política da empresa.

**4. PERFIS**

Criar sistema de perfis configuráveis.

Permitir:

criar;

editar;

duplicar;

desativar;

versionar;

revisar.

O sistema poderá possuir perfis padrão, mas a empresa deverá poder criar
seus próprios perfis.

Um usuário poderá possuir múltiplos perfis.

Identificar claramente quais permissões vêm de cada perfil.

**5. PERMISSÕES**

Implementar matriz granular de permissões.

As permissões poderão incluir:

visualizar;

criar;

editar;

executar;

cancelar;

reverter;

aprovar;

rejeitar;

liberar;

exportar;

imprimir;

configurar;

administrar.

Não considerar acesso ao módulo como autorização automática para todas
as suas funções.

Permitir permissões individuais por usuário.

Permitir que uma permissão individual:

conceda;

complemente;

restrinja;

permissões provenientes de perfis.

Suportar permissões restritivas/negativas quando necessário.

**6. PERMISSÕES EFETIVAS**

O sistema deverá calcular e apresentar claramente as permissões efetivas
de cada usuário considerando:

perfis;

permissões individuais;

restrições;

escopos;

contexto;

alçadas;

validade;

regras de segregação.

O administrador deverá conseguir responder:

O que este usuário realmente pode fazer?

Exemplo:

Perfil A → editar pedidos;

Perfil B → aprovar pedidos;

restrição individual → não aprovar;

escopo → Filial 2;

alçada → R\$ 30.000.

Resultado:

Usuário pode editar pedidos da Filial 2 e não pode aprová-los.

**7. HIERARQUIA DE PERMISSÕES**

Diferenciar, quando aplicável:

consulta;

operação;

controle;

aprovação;

administração.

Não assumir que uma permissão superior concede automaticamente todas as
demais.

A aprovação deverá ser uma permissão específica.

**8. ESTRUTURA ORGANIZACIONAL**

Suportar estrutura:

**Ambiente/Conta → Empresa → Filial/Unidade → Setor → Área/Operação**

Diferenciar:

empresa;

filial;

unidade operacional;

fábrica;

depósito;

escritório;

centro de distribuição;

outras estruturas necessárias.

Um usuário poderá atuar em múltiplos setores/unidades sem duplicação de
cadastro.

**9. ESCOPO DE ACESSO**

Separar claramente:

**Permissão = o que pode fazer**

**Escopo = onde pode fazer**

Permitir escopo por:

empresa;

filial;

unidade;

setor;

depósito;

unidade produtiva;

linha de produção;

centro de custo;

carteira comercial;

grupo de produtos;

outros contextos necessários.

Exemplos:

Estoque → por depósito;

Produção → por unidade produtiva;

Comercial → vendedor/equipe/região/filial;

Financeiro → empresa/filial.

Acesso global deverá ser explícito.

**10. RESPONSABILIDADE**

Separar:

**Acesso**

de

**Responsabilidade.**

Um usuário pode possuir acesso a determinado processo sem ser seu
responsável.

Permitir transferência de responsabilidade mantendo todo o histórico.

Aplicar a:

orçamentos;

pedidos;

compras;

engenharia;

qualidade;

PCP;

financeiro;

expedição;

demais processos.

**11. ALÇADAS**

Criar sistema configurável de alçadas.

Uma alçada poderá considerar:

tipo de operação;

valor;

percentual;

empresa;

filial;

setor;

usuário;

perfil;

hierarquia;

condições;

período de validade.

Exemplos:

compra até R\$ 50.000;

desconto até 5%;

ajuste de estoque até determinada quantidade;

pagamento até determinado valor.

Não implementar regras de alçada de forma rígida/hard-coded.

**12. APROVAÇÕES**

Criar mecanismo central de aprovação.

Permitir:

uma etapa;

múltiplas etapas;

aprovação sequencial;

aprovação paralela;

múltiplos aprovadores;

aprovação automática;

aprovação com observação;

retorno para correção;

rejeição definitiva.

Para múltiplos aprovadores:

AND → todos precisam aprovar;

OR → qualquer aprovador autorizado pode aprovar.

Retorno para correção deve ser diferente de rejeição definitiva.

**13. REGRAS CONDICIONAIS DE APROVAÇÃO**

Permitir regras condicionais por:

valor;

percentual;

tipo;

fornecedor;

cliente;

item;

filial;

condição comercial;

combinação de fatores.

Exemplo:

Compra acima de determinado valor OU fornecedor novo OU item crítico →
aprovação adicional.

As regras deverão ser configuráveis pela empresa.

**14. SUBSTITUIÇÃO DE APROVADORES**

Permitir substitutos temporários.

Aplicações:

férias;

afastamento;

viagem;

ausência temporária.

O substituto deverá receber somente as permissões necessárias.

Registrar:

substituído;

substituto;

período;

motivo;

concessor;

aprovador, quando aplicável.

**15. INDISPONIBILIDADE DO APROVADOR**

Caso o aprovador esteja:

inativo;

bloqueado;

suspenso;

sem permissão;

transferido;

indisponível;

permitir redirecionamento para substituto ou responsável alternativo,
conforme regra configurada.

**16. AUTOAPROVAÇÃO E SEGREGAÇÃO**

Permitir configurar regras de autoaprovação.

Como padrão recomendado:

solicitante não deve ser o único aprovador da própria solicitação quando
houver exigência de segregação.

Criar regras configuráveis de segregação de funções.

Exemplos:

solicitante ≠ aprovador;

comprador ≠ aprovador do pagamento;

responsável pelo ajuste ≠ aprovador do próprio ajuste;

criador do orçamento ≠ aprovador de desconto excepcional;

criador de engenharia não ser o único aprovador;

lançador financeiro ≠ único aprovador do pagamento.

Exceções deverão ser explícitas e auditadas.

**17. AUTENTICAÇÃO**

Implementar autenticação nativa.

Preparar arquitetura para:

login + senha;

matrícula + senha;

PIN;

MFA;

OTP;

aplicativo autenticador;

biometria;

crachá;

QR Code;

SSO;

mecanismos futuros.

O e-mail não deverá ser obrigatório.

**18. SENHAS**

Permitir política configurável de:

tamanho mínimo;

complexidade;

reutilização;

expiração;

tentativas;

bloqueio.

Administradores nunca poderão visualizar a senha atual do usuário.

**19. RECUPERAÇÃO DE ACESSO**

Permitir recuperação por meio do superior hierárquico autorizado, como:

coordenador;

gestor;

administrador.

O responsável poderá iniciar/autorizar a redefinição.

Nunca exibir a senha atual.

Utilizar:

credencial temporária;

redefinição obrigatória;

ou mecanismo equivalente seguro.

**20. SESSÕES**

Implementar:

sessões ativas;

encerramento de sessão;

timeout por inatividade;

controle de tentativas;

bloqueio;

dispositivos confiáveis, quando aplicável.

Permitir revogação imediata de sessões.

**21. MFA**

Permitir MFA configurável.

Poderá ser obrigatório para:

administradores;

perfis de alto risco;

operações críticas;

determinados contextos.

A política poderá variar por:

usuário;

perfil;

operação;

contexto;

dispositivo.

**22. AUDITORIA**

Registrar automaticamente as ações relevantes.

Registrar, conforme aplicável:

usuário;

data/hora;

módulo;

função;

documento;

registro;

ação;

resultado;

valores anteriores;

valores posteriores;

contexto;

autorizador;

aprovador.

Auditar:

criação;

alteração;

cancelamento;

aprovação;

rejeição;

liberação;

bloqueio;

desbloqueio;

alteração de status;

transferência de responsabilidade;

alteração de perfil;

alteração de permissão;

alteração de alçada;

alteração de configuração;

autenticação;

tentativa negada;

exportação.

**23. HISTÓRICO**

Cada documento deverá possuir histórico próprio.

Também deverá existir auditoria global.

Permitir reconstruir:

**quem iniciou → quem alterou → quem aprovou → quem executou → quem
cancelou/reverteu → estado final**

**24. PROTEÇÃO DA AUDITORIA**

Registros de auditoria deverão ser protegidos contra:

alteração;

exclusão por usuários comuns.

Manutenções excepcionais deverão ser controladas e auditadas.

Implementar política de retenção configurável.

**25. ADMINISTRADORES**

Permitir diferentes níveis administrativos:

administrador geral;

administrador da empresa;

administrador da filial;

administrador de usuários;

administrador de segurança/permissões.

Administradores também deverão estar sujeitos a escopo.

Ser administrador técnico não deverá conceder automaticamente permissões
operacionais.

**26. PROTEÇÃO ADMINISTRATIVA**

Impedir configurações que deixem a empresa sem administrador válido.

Controlar:

remoção da própria administração;

desativação de todos os administradores;

criação de privilégios indevidos;

configurações que bloqueiem o acesso geral.

Permitir dupla validação configurável para alterações críticas, como:

criação de administrador;

acesso global;

alteração de alçada crítica;

alteração de política de segurança;

alteração de segregação.

**27. PERMISSÕES TEMPORÁRIAS**

Permitir definir:

início;

término;

motivo;

concessor;

aprovador.

Ao atingir o vencimento, retirar automaticamente a permissão.

Preservar histórico.

**28. REVISÃO PERIÓDICA**

Permitir revisão dos acessos.

Identificar:

usuários sem acesso recente;

excesso de permissões;

conflitos;

administradores;

acessos globais;

permissões temporárias;

usuários transferidos;

permissões próximas do vencimento.

Permitir periodicidade configurável.

**29. USUÁRIOS INATIVOS**

Identificar usuários sem acesso por determinado período.

Permitir política configurável:

alertar;

solicitar revisão;

bloquear;

inativar.

Não apagar histórico.

**30. ACESSOS ESPECIAIS**

Suportar:

acesso temporário;

substituição;

transferência;

acesso emergencial;

terceiros;

dispositivos;

contingência;

exceções;

revogação imediata.

Toda situação excepcional deverá manter rastreabilidade.

**31. USUÁRIOS TERCEIROS**

Permitir usuários individuais para:

consultores;

auditores;

técnicos;

prestadores;

parceiros.

Exigir:

identidade individual;

escopo;

permissões;

validade;

auditoria.

Não criar usuários genéricos.

**32. TERMINAIS INDUSTRIAIS**

Preparar suporte para:

PIN;

crachá;

QR Code;

leitores;

terminais;

tablets;

coletores.

Priorizar identificação individual do operador, inclusive em terminais
compartilhados.

**33. ACESSO EMERGENCIAL**

Permitir acesso emergencial excepcional.

Exigir:

justificativa;

responsável;

validade;

escopo;

auditoria;

aprovação adicional quando aplicável.

Permitir revisão posterior.

**34. CONTROLE POR DISPOSITIVO/AMBIENTE**

Permitir políticas relacionadas a:

dispositivo;

terminal;

rede;

ambiente;

horário;

acesso externo.

Poderá exigir validação adicional em situações de risco.

**35. CONTINGÊNCIA**

Preparar arquitetura para situações de:

indisponibilidade de serviços;

falha de comunicação;

indisponibilidade de autenticação externa;

interrupção parcial.

Operações permitidas em contingência deverão ser identificadas,
registradas e posteriormente reconciliadas quando necessário.

**36. REVOGAÇÃO IMEDIATA**

Administradores autorizados deverão conseguir revogar acessos
imediatamente.

A revogação poderá:

bloquear novas autenticações;

encerrar sessões;

remover permissões temporárias;

cancelar acessos emergenciais;

invalidar dispositivos confiáveis.

**37. EXCEÇÕES**

Permitir exceções controladas às regras.

Toda exceção deverá possuir:

responsável;

justificativa;

autorização;

validade, quando aplicável;

auditoria.

A exceção não poderá alterar silenciosamente a regra padrão.

**38. INTEGRAÇÕES DE IDENTIDADE**

O SaaS deverá funcionar sem dependência de provedores externos.

Preparar integração futura com:

Microsoft Entra ID;

Google Workspace;

outros provedores;

diretórios corporativos;

APIs;

webhooks.

Permitir, quando integrado:

criação;

atualização;

ativação;

desativação;

sincronização.

**39. SSO**

Preparar suporte a Single Sign-On.

A autenticação externa deverá determinar:

Quem é o usuário.

O SaaS deverá continuar determinando:

O que ele pode fazer.

Manter internamente:

perfis;

permissões;

escopos;

alçadas;

segregação;

auditoria.

**40. AUTOMAÇÕES E INTEGRAÇÕES**

Distinguir claramente:

ação humana;

ação automática;

ação originada de integração;

processo agendado.

Operações automáticas deverão possuir origem identificável.

Exemplo:

**NF-e recebida → integração automática → processamento → validação pelo
operador → confirmação/rejeição.**

O usuário que validar a operação deverá ser identificado separadamente
da origem automática.

**41. AUTORIZAÇÃO CENTRALIZADA**

Todos os módulos deverão utilizar o mesmo mecanismo central de
autorização.

Isso deverá ser aplicado a:

Cadastros;

Pedidos;

PCP;

Produção;

Engenharia;

Estoque;

Suprimentos/Compras;

Qualidade;

Expedição/Logística;

Comercial/Orçamentos;

Financeiro;

BI;

Integrações;

demais módulos futuros.

Não criar sistemas independentes de permissões por módulo.

**42. SEGURANÇA NO BACKEND**

A autorização deverá obrigatoriamente ser validada no backend/servidor.

Ocultar ou desabilitar um botão não será considerado mecanismo
suficiente de segurança.

Toda operação deverá validar:

**Usuário + Permissão + Escopo + Contexto + Limite + Validade**

**43. DADOS SENSÍVEIS**

Controlar separadamente informações como:

custos;

margens;

preços de compra;

preços de venda;

informações financeiras;

condições comerciais;

informações estratégicas.

Um usuário poderá executar uma operação sem necessariamente visualizar
todos os dados sensíveis relacionados.

**44. CONTROLE POR REGISTRO**

Quando necessário, aplicar autorização ao registro.

Exemplo:

Um vendedor poderá acessar seus próprios orçamentos sem necessariamente
acessar os de toda a equipe.

**45. REAVALIAÇÃO DINÂMICA**

Sempre que o contexto da operação mudar, reavaliar a autorização.

Exemplo:

Uma operação inicialmente dentro da alçada do usuário sofre alteração de
valor e ultrapassa seu limite.

A autorização deverá ser recalculada.

**46. MUDANÇAS DE STATUS**

Mudanças críticas deverão possuir permissões específicas.

Exemplos:

aprovar pedido;

cancelar pedido;

liberar compra;

rejeitar material;

liberar OP;

aprovar inspeção;

autorizar pagamento.

Não criar uma permissão genérica para alteração indiscriminada de
status.

**47. ALTERAÇÃO DE PERMISSÕES DURANTE SESSÃO**

Quando uma permissão for alterada:

novas ações deverão respeitar a nova configuração;

alterações críticas poderão encerrar sessões imediatamente;

operações concluídas permanecerão válidas;

histórico não poderá ser alterado retroativamente.

**48. EFEITO DAS ALTERAÇÕES DE ACESSO**

Alterações de:

perfil;

permissão;

alçada;

escopo;

status;

poderão possuir:

efeito imediato;

início programado.

Para alterações críticas de segurança, utilizar efeito imediato como
padrão recomendado.

**49. PROTEÇÃO CONTRA ESCALONAMENTO DE PRIVILÉGIO**

Impedir que usuários:

alterem suas próprias permissões;

concedam permissões a si mesmos;

aumentem sua própria alçada;

ampliem seu próprio escopo;

criem perfis privilegiados para benefício próprio.

Tentativas relevantes deverão ser bloqueadas e auditadas.

**50. RELATÓRIOS**

Criar consultas e relatórios para:

usuários;

perfis;

permissões;

acessos;

alçadas;

auditoria;

usuários inativos;

alterações administrativas;

conflitos;

acessos temporários.

Permitir consulta inversa:

Quais usuários possuem determinada permissão?

E:

Quais perfis concedem determinada permissão?

**51. FICHA COMPLETA DO USUÁRIO**

Apresentar:

dados;

status;

estrutura organizacional;

perfis;

permissões;

permissões efetivas;

escopos;

alçadas;

substituições;

acessos temporários;

dispositivos;

último acesso;

sessões;

histórico.

**52. RELATÓRIOS DE ALÇADA**

Permitir visualizar:

usuário;

perfil;

operação;

limite;

percentual;

empresa;

filial;

validade;

condição.

**53. AUDITORIA ADMINISTRATIVA**

Permitir consultar alterações de:

usuários;

perfis;

permissões;

alçadas;

escopos;

regras de aprovação;

políticas de segurança.

Exibir:

quem alterou;

quando;

valor anterior;

novo valor;

motivo;

aprovação, quando aplicável.

**54. EXPORTAÇÕES**

Permitir exportação, conforme autorização, para:

Excel;

CSV;

PDF.

A exportação deverá respeitar as permissões do usuário e também ser
registrada na auditoria.

**55. DASHBOARD ADMINISTRATIVO**

Criar painel com indicadores como:

usuários ativos;

bloqueados;

inativos;

sem acesso recente;

administradores;

permissões temporárias;

acessos globais;

conflitos;

alterações recentes;

tentativas negadas;

sessões ativas.

**56. ALERTAS**

Permitir alertas configuráveis para:

usuário sem acesso recente;

permissão temporária próxima do vencimento;

novo administrador;

acesso global concedido;

alteração de alçada;

conflito de segregação;

excesso de permissões;

tentativas repetidas de acesso negado.

A empresa deverá decidir quais notificações deseja utilizar.

**57. HISTÓRICO DE EVOLUÇÃO**

Permitir consultar a evolução histórica do usuário:

função;

setor;

filial;

perfil;

permissões;

responsabilidades;

alçadas.

Preservar o histórico correspondente a cada período.

**58. AUDITORIA PARA INVESTIGAÇÃO**

O sistema deverá conseguir responder:

Quem estava autorizado?

Qual era a alçada?

Qual era o escopo?

Qual perfil concedia a autorização?

Existia exceção?

Quem concedeu?

Quem aprovou?

Quem executou?

Quando?

Qual foi o resultado?

**59. REGRA PARA NOVOS MÓDULOS**

Todo módulo ou funcionalidade futura deverá obrigatoriamente utilizar a
arquitetura central de autorização.

Modelo:

**Usuário → Permissão → Escopo → Contexto → Limite → Validade →
Auditoria**

Nenhum módulo deverá criar lógica paralela de autorização.

**60. PRINCÍPIOS FUNDAMENTAIS**

Implementar o módulo observando:

1.  **Identidade individual**

2.  **Menor privilégio**

3.  **Permissões granulares**

4.  **Separação entre acesso e autorização**

5.  **Separação entre autorização e alçada**

6.  **Segregação de funções**

7.  **Rastreabilidade integral**

8.  **Segurança no backend**

9.  **Exceções controladas**

10. **Histórico permanente**

11. **Administração segregada da operação**

12. **Governança centralizada**

13. **Escalabilidade**

14. **Configuração pela empresa**

**61. CRITÉRIO FINAL DE AUTORIZAÇÃO**

Para qualquer operação relevante, o sistema deverá avaliar:

**1. Quem é o usuário?**

**2. Qual permissão ele possui?**

**3. Em qual escopo essa permissão é válida?**

**4. Qual é o contexto do registro/operação?**

**5. Qual é o limite/alçada?**

**6. A autorização está válida neste momento?**

**7. Existe alguma regra de segregação ou restrição?**

**8. É necessária aprovação?**

**9. Quem autorizou?**

**10. Como a operação será registrada na auditoria?**

**62. RESULTADO ESPERADO**

Ao finalizar a implementação, o SaaS deverá possuir um **motor central
de identidade e autorização**, capaz de controlar usuários e acessos de
forma granular e configurável, sem depender de e-mail obrigatório e sem
criar usuários compartilhados.

O sistema deverá permitir desde estruturas simples, com poucos usuários
e uma única empresa, até estruturas com múltiplas empresas, filiais,
unidades, setores e centenas de usuários.

A solução deverá ser preparada para crescimento futuro e para integração
com os demais módulos do SaaS.

A segurança deverá ser aplicada no backend, enquanto a interface deverá
refletir as permissões efetivas do usuário.

Toda operação relevante deverá possuir rastreabilidade suficiente para
reconstruir sua origem, autorização, execução e resultado.

**Não simplificar o modelo de autorização para um simples sistema de
<span dir="rtl">“</span>perfil de usuário”. O objetivo é implementar uma
estrutura completa de identidade, autorização, escopo, alçada,
aprovação, segregação e auditoria.**
