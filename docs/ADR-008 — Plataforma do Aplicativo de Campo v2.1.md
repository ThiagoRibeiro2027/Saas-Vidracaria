**ADR-008 — Plataforma do Aplicativo de Campo**

**Status:** APROVADO\
**Versão:** 2.1\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-09\
**Decisão:** Definição da plataforma do aplicativo utilizado em campo\
**Decisão vinculada:** ADR-002, ADR-005 e ADR-007

**1. Contexto**

O SaaS deverá possuir uma experiência adequada para usuários que
trabalham em campo, especialmente nas atividades relacionadas a:

obra;

instalação;

montagem;

execução;

conferência;

ocorrências;

pendências;

evidências;

aceite e conclusão.

O ambiente de campo possui características diferentes do ambiente
administrativo, incluindo:

conectividade instável;

utilização em dispositivos móveis;

necessidade de operação em ambientes externos;

necessidade de acesso rápido;

possibilidade de períodos sem conexão;

necessidade de registro de evidências;

necessidade de sincronização posterior.

A plataforma escolhida deverá estar alinhada à estratégia de operação
offline definida no ADR-005.

**2. Problema**

É necessário definir uma plataforma de campo que:

funcione adequadamente em dispositivos móveis;

permita operação responsiva;

suporte o funcionamento offline controlado;

permita acesso à câmera e recursos necessários do dispositivo;

possibilite sincronização;

mantenha segurança e isolamento entre empresas;

reduza custo e complexidade inicial;

permita evolução futura;

não obrigue o projeto a manter duas plataformas completas desde o MVP.

Também é necessário considerar as limitações específicas de plataformas
móveis, especialmente no iOS.

**3. Decisão**

Será utilizada uma **PWA — Progressive Web App** como plataforma de
campo no MVP.

A PWA será construída como parte integrada do SaaS, compartilhando:

autenticação;

autorização;

backend;

banco de dados;

regras de negócio;

APIs;

auditoria;

sincronização;

estrutura de multiempresa;

armazenamento;

demais componentes do sistema.

A PWA não será tratada como um sistema independente.

**4. Motivos da decisão**

A PWA foi escolhida por proporcionar:

menor complexidade de desenvolvimento;

menor custo inicial;

utilização em diferentes dispositivos;

atualização centralizada;

integração natural com o SaaS;

menor necessidade de distribuição e manutenção de aplicativos separados;

possibilidade de instalação no dispositivo;

capacidade de utilizar recursos móveis necessários ao processo;

alinhamento com a estratégia de MVP.

A decisão também reduz o risco de desenvolver prematuramente um
aplicativo nativo antes de comprovar que ele é realmente necessário.

**5. Escopo da PWA no MVP**

A PWA deverá suportar principalmente:

consulta de obra;

consulta de instalação;

agenda;

equipe;

responsáveis;

tarefas;

materiais;

execução;

apontamentos;

pendências;

ocorrências;

evidências;

fotos;

observações;

conferências;

aceite;

conclusão;

sincronização;

acompanhamento do estado offline/online.

O escopo funcional permanece subordinado ao MVP definido no ADR-002.

**6. Integração com o Offline**

A PWA deverá implementar a estratégia de operação offline definida no
ADR-005.

A operação offline será:

seletiva;

controlada;

orientada ao processo;

limitada às funcionalidades autorizadas;

dependente dos dados sincronizados;

sujeita à validade operacional;

sujeita à revalidação no servidor.

A PWA não deverá possuir um banco independente que funcione como segunda
fonte oficial de dados.

**7. Fonte oficial dos dados**

O servidor permanece como **fonte única da verdade**.

Os dados armazenados localmente no dispositivo destinam-se
exclusivamente à continuidade operacional controlada.

Dados locais:

não substituem o servidor;

não constituem backup;

não possuem autoridade definitiva;

podem ser descartados;

podem exigir sincronização posterior;

estão sujeitos às regras de validade e revalidação.

**8. Validade dos dados offline**

A validade operacional dos dados sincronizados seguirá o ADR-005:

dados sincronizados possuem validade operacional de até **7 dias**;

após **3 dias sem sincronização confirmada pelo servidor**, a criação de
novos registros offline deverá ser bloqueada;

durante esse período, a consulta dos dados locais e a tentativa de
sincronização continuarão disponíveis;

após 7 dias, os dados serão considerados expirados para operações que
dependam de sua validade.

A PWA deverá comunicar claramente ao usuário o estado de sincronização e
a validade operacional.

**9. Limitação específica do iOS/PWA**

Deverá ser considerada uma limitação relevante do ambiente iOS:

**o armazenamento local utilizado por uma PWA pode ser descartado pelo
sistema após períodos prolongados sem utilização.**

Essa possibilidade representa risco principalmente para operações ainda
não sincronizadas.

Portanto, a arquitetura não poderá considerar o armazenamento local da
PWA como mecanismo permanente de retenção.

**10. Mitigações para o armazenamento local**

A PWA deverá implementar mecanismos para reduzir o risco de perda de
operações pendentes, incluindo:

aviso de operações pendentes;

alerta preventivo de necessidade de sincronização;

prioridade para sincronização de registros pendentes;

indicação clara do estado da fila;

incentivo à sincronização antes de períodos prolongados sem utilização;

janela de operação offline deliberadamente curta;

comunicação ao usuário sobre o risco de permanência prolongada sem
sincronização.

A perda do armazenamento local não poderá ser tratada como substituto de
backup ou mecanismo oficial de recuperação.

**11. Sincronização**

A PWA deverá utilizar mecanismo controlado de sincronização.

O processo deverá contemplar:

**Registro local → Fila → Envio → Revalidação → Processamento →
Confirmação → Atualização do estado local.**

Deverá existir suporte a:

identificadores únicos;

idempotência;

tentativas;

retry;

processamento parcial;

identificação de erro;

preservação do histórico;

resolução controlada de conflitos.

As regras detalhadas seguem o ADR-005.

**12. Conflitos**

Conflitos de sincronização não poderão resultar em sobrescrita
silenciosa.

Quando houver divergência entre:

informação local;

informação enviada;

informação existente no servidor;

o sistema deverá aplicar as regras definidas pelo backend.

A decisão final deverá permanecer no servidor.

A tentativa realizada no dispositivo deverá ser preservada para fins de
rastreabilidade quando aplicável.

**13. Autorização**

A PWA não poderá confiar exclusivamente em controles realizados no
dispositivo.

Toda operação sincronizada deverá ser submetida às validações do
backend, incluindo:

empresa;

usuário;

permissões;

processo;

registro;

regras de negócio;

estado atual;

validade;

autorização da operação.

Uma permissão revogada no servidor não poderá permanecer indefinidamente
válida no dispositivo.

**14. Segurança**

A PWA deverá respeitar integralmente a arquitetura de segurança do SaaS.

Deverá ser garantido:

isolamento entre empresas;

autenticação;

autorização no backend;

proteção de dados locais;

proteção das sessões;

controle de acesso;

auditoria;

proteção das evidências;

controle de sincronização.

O dispositivo do usuário não poderá ser considerado ambiente confiável
por padrão.

**15. Evidências de campo**

A PWA deverá permitir o registro de evidências necessárias à operação,
especialmente:

fotos;

documentos;

observações;

ocorrências;

registros de execução;

aceite.

As evidências deverão possuir vínculo com o contexto operacional
correspondente.

Quando registradas offline, deverão seguir a mesma estratégia de
sincronização e controle definida no ADR-005.

**16. Experiência de instalação**

A PWA deverá possuir orientação clara para instalação no dispositivo
quando isso melhorar a experiência de campo.

No iPhone, a instalação da PWA na **Tela de Início** será especialmente
relevante para determinados recursos do dispositivo.

O onboarding deverá orientar o usuário sobre:

instalação;

acesso;

permissões necessárias;

funcionamento offline;

sincronização;

importância de sincronizar antes de permanecer longos períodos sem
utilizar o aplicativo.

**17. Push no iPhone**

A integração com notificações push seguirá conjuntamente o ADR-007.

No iPhone, o recebimento de push pela PWA depende da instalação da
aplicação na **Tela de Início**.

Portanto:

o onboarding deverá orientar essa instalação;

o sistema deverá informar quando o recurso estiver condicionado à
instalação;

push será tratado como canal complementar;

nenhum processo operacional crítico poderá depender exclusivamente de
push.

A ausência de push não poderá impedir:

execução;

sincronização;

consulta;

registro;

conclusão;

tratamento de ocorrências;

demais operações críticas.

**18. Operações críticas**

Operações críticas deverão permanecer disponíveis por mecanismos
próprios do sistema.

Push, notificações ou outros mecanismos assíncronos não poderão ser
utilizados como única forma de garantir que uma atividade operacional
aconteça.

O usuário deverá conseguir identificar dentro da própria aplicação:

tarefas;

pendências;

ocorrências;

bloqueios;

alterações;

necessidade de sincronização;

situações críticas.

**19. Compatibilidade**

A PWA deverá ser desenvolvida considerando os principais dispositivos
móveis utilizados pelo público-alvo.

A implementação deverá priorizar:

responsividade;

usabilidade por toque;

telas pequenas;

utilização em ambientes externos;

desempenho;

baixo consumo de dados;

comportamento previsível com conectividade instável.

Recursos específicos de cada plataforma deverão ser utilizados somente
quando forem compatíveis com a estratégia geral do produto.

**20. Aplicativo nativo**

Um aplicativo nativo não fará parte do MVP.

A adoção futura de aplicativo nativo somente poderá ocorrer caso exista
necessidade essencial comprovada que não possa ser adequadamente
atendida pela PWA.

Exemplos de justificativas possíveis em uma decisão futura:

limitação técnica comprovada;

necessidade de recurso nativo indisponível ou inadequado na PWA;

requisito operacional crítico;

necessidade de desempenho;

necessidade de integração profunda com hardware;

limitações comprovadas de operação offline;

necessidade comprovada do produto.

A simples preferência de usuários por um aplicativo nativo não será
suficiente para alterar a decisão arquitetural.

**21. Alternativas consideradas**

**Alternativa A — Aplicativo nativo desde o MVP**

**Rejeitada.**

Aumentaria custo, complexidade e esforço de manutenção antes de
comprovar necessidade.

**Alternativa B — PWA para o MVP e aplicativo nativo posteriormente, se
necessário**

**APROVADA.**

Permite validar a operação de campo com menor complexidade e manter uma
possibilidade de evolução futura baseada em evidências.

**Alternativa C — Aplicativo nativo e PWA simultaneamente**

**Rejeitada para o MVP.**

Criaria duplicação de esforço, testes, manutenção e evolução.

**22. Consequências aceitas**

A decisão aceita:

limitações específicas de recursos móveis;

dependência das capacidades do navegador;

necessidade de instalação da PWA para determinados recursos no iPhone;

necessidade de orientação ao usuário;

operação offline limitada;

necessidade de sincronização frequente;

impossibilidade de tratar armazenamento local como permanente;

possibilidade futura de adoção de aplicativo nativo.

**23. Consequências não aceitas**

Não será aceito:

tratar a PWA como segunda aplicação independente;

criar banco local como fonte oficial;

considerar dados locais como backup;

permitir operações críticas sem revalidação;

confiar exclusivamente em autorização local;

depender exclusivamente de push;

considerar push obrigatório para funcionamento do campo;

perder silenciosamente registros pendentes;

sobrescrever dados silenciosamente durante sincronização;

permitir acesso entre empresas;

transformar limitações da PWA em justificativa automática para
aplicativo nativo.

**24. MVP**

Para o MVP, a decisão definitiva é:

**PWA como plataforma de campo.**

A implementação deverá contemplar:

experiência móvel;

operação online;

offline seletivo;

sincronização;

fila;

idempotência;

revalidação;

evidências;

tarefas;

execução;

ocorrências;

pendências;

aceite;

conclusão;

controle de estado;

indicação de sincronização;

alertas preventivos;

orientação de instalação;

tratamento da limitação do iOS.

**25. Dependências**

Esta decisão possui dependência direta com:

**ADR-001 — Usuários / Permissões**

Define autenticação, autorização, perfis, permissões e controles de
acesso.

**ADR-002 — MVP**

Define o limite funcional do aplicativo de campo.

**ADR-005 — Offline**

Define a estratégia de funcionamento offline, sincronização, validade,
conflitos e fonte oficial dos dados.

**ADR-007 — Notificações**

Define canais, prioridades, push e regras de dependência de
notificações.

**26. Governança**

Esta ADR representa a decisão oficial sobre a plataforma de campo do
MVP.

Nenhum módulo poderá assumir a existência de aplicativo nativo no MVP
por interpretação.

Qualquer alteração deverá registrar:

decisão anterior;

nova decisão;

motivo;

evidência;

impacto funcional;

impacto técnico;

impacto financeiro;

impacto no cronograma;

impacto no suporte;

impacto na manutenção;

consequências;

responsável;

data;

versão.

A decisão deverá ser revisada somente quando houver evidência concreta
de que a PWA não atende uma necessidade essencial do produto.

**27. Critérios de aceitação**

A decisão será considerada corretamente implementada quando:

a PWA funcionar como plataforma oficial de campo do MVP;

o usuário conseguir executar as atividades previstas;

o offline funcionar conforme ADR-005;

o servidor permanecer como fonte única da verdade;

operações offline forem revalidadas;

conflitos não forem sobrescritos silenciosamente;

dados locais não forem tratados como backup;

o risco de descarte do armazenamento no iOS for comunicado e mitigado;

houver alerta para operações pendentes;

houver prioridade de sincronização;

push não for requisito para execução do processo;

o onboarding orientar a instalação da PWA no iPhone quando necessário;

houver isolamento entre empresas;

permissões forem revalidadas no backend;

evidências de campo forem vinculadas aos respectivos processos;

não exista dependência de aplicativo nativo no MVP.

**28. Resultado esperado**

A PWA deverá permitir que o usuário de campo execute o trabalho
necessário com uma experiência adequada para dispositivos móveis,
inclusive durante períodos controlados de ausência de conectividade.

A arquitetura deverá preservar:

segurança;

integridade;

rastreabilidade;

sincronização;

continuidade operacional;

simplicidade;

baixo custo;

capacidade de evolução.

**29. Princípio final**

**O MVP utilizará PWA como plataforma de campo, com offline seletivo e
controlado. O servidor permanecerá como fonte única da verdade. O
armazenamento local não será considerado backup ou fonte oficial, e as
limitações do iOS deverão ser tratadas por sincronização preventiva,
alertas e janela curta de operação offline. Aplicativo nativo somente
será considerado no futuro se uma necessidade essencial comprovada não
puder ser atendida adequadamente pela PWA.**

**Status final: APROVADO**
