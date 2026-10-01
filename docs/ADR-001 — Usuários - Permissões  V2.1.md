**ADR-001 — Usuários / Permissões**

**Status:** APROVADO\
**Versão:** 2.1\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 09/09/2026\
**Decisão:** Arquitetura de usuários, perfis, permissões, escopo,
autoridade e administração da plataforma\
**Versão anterior:** 2.0\
**Alteração:** Consolidação dos ajustes 4 a 7 da revisão geral dos ADRs

**1. Contexto**

O SaaS deverá permitir que diferentes empresas utilizem a mesma
plataforma, mantendo isolamento entre seus dados, flexibilidade
operacional e controle adequado de acesso.

A arquitetura de autorização não poderá depender apenas da interface ou
de perfis fixos.

Deverá existir separação clara entre:

**Usuário → Perfil → Permissões → Escopo → Autoridade → Estado da
operação → Regras de negócio → Autorização final no backend.**

A arquitetura deverá também separar a administração da própria
plataforma SaaS da administração das empresas clientes.

**2. Princípio fundamental**

Permissão não significa autorização automática para executar qualquer
operação.

A autorização efetiva deverá considerar o contexto completo da operação.

Nenhum mecanismo de permissão poderá:

romper o isolamento entre empresas;

ultrapassar o escopo autorizado;

ignorar regras de negócio;

superar autoridade atribuída;

acessar funcionalidades não contratadas;

contornar controles de segurança;

permitir autoelevação de privilégios.

**3. Identidade do usuário**

O usuário deverá ser tratado como uma identidade do SaaS.

A relação entre identidade, empresa, unidade, perfil e permissões deverá
ser independente.

A arquitetura deverá permitir futuramente que uma mesma identidade tenha
acesso autorizado a mais de uma empresa.

O contexto ativo deverá ser identificado e validado pelo backend.

**4. Estrutura multiempresa**

Cada empresa será um tenant independente.

Os dados de uma empresa não poderão ser acessados por outra empresa.

A arquitetura deverá estar preparada para:

empresa;

grupo empresarial;

unidades/filiais;

setores;

equipes;

usuários.

O isolamento deverá existir na camada de dados e backend, não apenas na
interface.

**5. Administrador da empresa**

O administrador da empresa poderá administrar recursos pertencentes ao
seu tenant conforme suas permissões e autoridade.

Poderá, quando autorizado:

administrar usuários;

administrar perfis;

atribuir permissões;

configurar parâmetros;

administrar recursos da própria empresa.

Não poderá:

administrar outra empresa;

acessar dados de outro tenant;

transformar-se em administrador da plataforma;

alterar controles globais do SaaS;

superar restrições de contrato ou segurança.

**6. Usuários da plataforma**

Os usuários responsáveis pela administração do próprio SaaS serão
tratados como **usuários da plataforma**, em camada distinta dos
usuários dos tenants.

Essa camada será utilizada para funções como:

administração da plataforma;

gestão de empresas/tenants;

contratos;

planos;

entitlements;

estado comercial;

suporte;

operações técnicas e administrativas;

controles globais.

Usuários da plataforma não deverão ser modelados simplesmente como um
perfil adicional dentro de uma empresa.

**7. Separação entre plataforma e tenant**

Deverão existir duas dimensões distintas:

**Plataforma:**

**Usuário da Plataforma → Função/Autoridade de Plataforma → Recursos da
Plataforma**

**Tenant:**

**Empresa → Usuário → Perfil → Permissões → Escopo**

Permissões concedidas dentro de um tenant não concedem privilégios de
plataforma.

Um administrador de empresa não poderá ser promovido a administrador da
plataforma simplesmente pela alteração de seu perfil interno.

**8. Acesso da plataforma aos dados do tenant**

O acesso de usuários da plataforma aos dados de um tenant não será
irrestrito por padrão.

Quando necessário para suporte ou operação administrativa, o acesso
deverá:

possuir autorização explícita;

possuir finalidade definida;

respeitar escopo;

ser rastreável;

ser auditado;

permitir identificar usuário, tenant, momento e ação realizada.

A existência de privilégio de plataforma não deverá significar acesso
indiscriminado aos dados dos clientes.

**9. Perfis**

Perfis representam conjuntos configuráveis de permissões.

A plataforma poderá oferecer perfis iniciais como referência, mas eles
não deverão representar regras universais.

Cada empresa poderá:

utilizar perfis disponíveis;

alterar perfis;

criar perfis;

desativar perfis;

atribuir permissões conforme sua metodologia.

**10. Permissões**

Permissões deverão ser estruturadas por recurso e ação.

Exemplos:

visualizar;

criar;

editar;

excluir;

aprovar;

reprovar;

liberar;

cancelar;

registrar;

finalizar;

exportar;

imprimir.

A existência de uma permissão não elimina a necessidade de verificar as
demais condições de autorização.

**11. Escopo das permissões**

As permissões poderão possuir escopo por:

empresa;

unidade;

setor;

equipe;

registro;

responsabilidade;

outros níveis aplicáveis.

O escopo deverá ser validado no backend.

Filtros visuais não poderão ser utilizados como mecanismo de segurança.

**12. Permissões individuais**

O sistema poderá conceder permissões individuais como complemento ao
perfil.

Permissões individuais deverão:

ser auditáveis;

possuir escopo;

poder possuir validade;

não ultrapassar a autoridade máxima permitida;

não romper restrições de segurança;

não liberar funcionalidades não contratadas;

não permitir autoelevação.

Permissões individuais não substituem o modelo de perfis.

**13. Regra de conflito entre concessão e restrição**

Quando houver conflito entre uma concessão e uma restrição, **a
restrição prevalecerá**.

Regra formal:

**Restriction over Grant — Restrição prevalece sobre concessão.**

Isso significa que:

uma permissão de perfil não poderá superar uma restrição explícita;

uma permissão individual não poderá superar uma restrição;

uma concessão não poderá superar restrição de escopo;

uma concessão não poderá superar restrição de autoridade;

uma concessão não poderá superar controles de segurança.

A resolução deverá ser determinística e executada no backend.

**14. Autoridade**

Permissão e autoridade são conceitos distintos.

Uma pessoa poderá possuir determinada permissão funcional e ainda assim
não possuir autoridade suficiente para determinada operação.

A autorização deverá considerar, quando aplicável:

**Usuário → Perfil → Permissão → Escopo → Autoridade → Estado da
Operação → Regras de Negócio → Backend.**

**15. Autoridade por valor ou percentual**

A arquitetura deverá estar preparada para regras de autoridade baseadas
em:

valor monetário;

percentual;

nível hierárquico;

tipo de operação;

combinação desses critérios.

Exemplos conceituais:

aprovação até determinado valor;

desconto até determinado percentual;

necessidade de escalonamento acima de determinado limite.

Os valores, percentuais, níveis e regras concretas **não serão definidos
neste ADR**.

A estrutura deverá existir para suportá-los futuramente sem reconstrução
do modelo de autorização.

**16. Validade**

Permissões e autoridades poderão possuir validade temporal.

Deverão ser suportados, quando aplicável:

início de validade;

término de validade;

condição de ativação;

desativação;

histórico.

Uma autorização expirada não deverá continuar válida.

**17. Administração de usuários**

A administração deverá permitir:

criação;

ativação;

desativação;

alteração de vínculo;

atribuição de perfil;

alteração de permissões;

controle de escopo;

histórico.

A desativação não deverá apagar o histórico das ações realizadas.

**18. Administração de perfis**

A criação e alteração de perfis deverá ser controlada.

Alterações de permissões de um perfil deverão ser auditadas.

O sistema deverá impedir que alterações administrativas sejam utilizadas
para contornar restrições superiores.

**19. Autoelevação**

Nenhum usuário poderá conceder a si próprio autoridade ou acesso
superior ao que já possui.

Uma operação de elevação deverá exigir autoridade independente e
apropriada.

**20. Autorização no backend**

Toda operação protegida deverá ser validada no backend.

A validação deverá considerar, quando aplicável:

identidade;

usuário ativo;

empresa;

unidade;

perfil;

permissão;

escopo;

autoridade;

estado da operação;

regras de negócio;

estado comercial/entitlements;

restrições de segurança.

A interface jamais será considerada fonte suficiente de autorização.

**21. Isolamento entre empresas**

Uma empresa jamais poderá:

consultar dados de outra;

alterar dados de outra;

excluir dados de outra;

acessar arquivos de outra;

descobrir informações indevidas de outra.

O isolamento deverá ser garantido no backend e na camada de dados.

RLS deverá ser utilizado como mecanismo principal de isolamento quando
aplicável à arquitetura escolhida.

**22. Workflows**

A autorização deverá ser compatível com workflows configuráveis.

O SaaS não deverá assumir que todas as empresas possuem o mesmo fluxo.

Determinadas etapas poderão exigir permissões e/ou autoridade
específicas.

**23. Estado da operação**

A permissão não deverá permitir automaticamente qualquer ação em
qualquer estado.

Exemplo conceitual:

Um usuário pode possuir permissão para editar pedidos, mas não poderá
editar um pedido em estado que, pelas regras de negócio, impeça
alterações.

Assim, autorização deverá considerar também o estado atual da operação.

**24. Regras de negócio**

Regras de negócio e permissões são camadas distintas.

Uma permissão indica que o usuário pode tentar executar determinada
ação.

A regra de negócio determina se aquela ação é válida naquele contexto.

O backend deverá avaliar ambas.

**25. Decisões postergadas**

Ficam postergados:

valores concretos dos limites de aprovação;

percentuais concretos de desconto;

níveis hierárquicos definitivos;

regras específicas de autoridade;

mecanismos avançados de autenticação para usuários comuns;

demais regras operacionais específicas de cada empresa.

Essas decisões deverão ser incorporadas quando houver definição
suficiente.

A postergação não deverá impedir a existência da estrutura técnica
necessária para suportá-las.

**26. MFA**

**MFA será obrigatório para administradores da plataforma no MVP.**

O requisito deverá ser implementado na camada de autenticação.

Deverá existir controle seguro de recuperação sem permitir bypass da
exigência de MFA.

Eventos relacionados ao MFA deverão ser auditáveis.

Para usuários comuns dos tenants, mecanismos adicionais de autenticação
poderão ser evoluídos posteriormente conforme decisões futuras.

**27. Auditoria**

Alterações relevantes deverão gerar auditoria.

Quando aplicável, registrar:

usuário;

tipo de usuário: plataforma ou tenant;

empresa;

unidade;

ação;

registro afetado;

valor anterior;

novo valor;

data/hora;

contexto;

origem;

resultado.

Operações de administração de plataforma e acesso de suporte deverão
possuir rastreabilidade específica.

**28. Segurança**

A arquitetura deverá aplicar:

menor privilégio;

separação de responsabilidades;

defesa em profundidade;

autorização no backend;

isolamento por tenant;

RLS quando aplicável;

proteção de sessões;

proteção de credenciais;

auditoria;

MFA para administradores da plataforma.

Nenhum mecanismo de conveniência deverá comprometer segurança.

**29. Banco de dados**

O modelo deverá manter relações consistentes entre:

usuários;

empresas;

unidades;

perfis;

permissões;

escopos;

autoridades;

vínculos de plataforma;

auditoria.

O modelo deverá ser preparado para evolução sem depender de uma
estrutura fixa de cargos.

**30. O que pertence à plataforma e o que pertence ao tenant**

|                             |                                  |
|:---------------------------:|----------------------------------|
|       **Plataforma**        | **Empresa / Tenant**             |
|      Estrutura técnica      | Usuários                         |
|    Recursos disponíveis     | Perfis                           |
|   Permissões disponíveis    | Permissões atribuídas            |
|          Segurança          | Escopos                          |
|          Auditoria          | Metodologia operacional          |
|        Multiempresa         | Fluxos utilizados                |
|          Contratos          | Autoridades internas             |
|        Entitlements         | Responsabilidades                |
| Administração da plataforma | Administração da própria empresa |

A separação deverá ser preservada arquiteturalmente.

**31. Diretrizes de implementação**

A implementação deverá:

preservar a separação plataforma × tenant;

não criar permissões universais por cargo;

não confiar na interface para segurança;

validar autorização no backend;

aplicar a regra de que restrição prevalece sobre concessão;

preparar autoridade por valor/percentual;

impedir autoelevação;

auditar alterações;

preservar histórico;

manter isolamento entre empresas;

exigir MFA para administradores da plataforma no MVP.

Não deverão ser criadas regras específicas de uma fábrica como regras
globais do SaaS.

**32. Alternativas consideradas**

**Alternativa A — Apenas perfis fixos**

**Rejeitada.**

Não oferece granularidade suficiente e não atende diferentes
metodologias operacionais.

**Alternativa B — Permissões somente individuais**

**Rejeitada.**

Aumentaria complexidade administrativa e dificultaria manutenção.

**Alternativa C — Perfil + permissões + escopo + autoridade**

**APROVADA.**

Oferece equilíbrio entre padronização, flexibilidade e segurança.

**Alternativa D — Administrador da plataforma como perfil de tenant**

**Rejeitada.**

Misturaria responsabilidades e aumentaria o risco de acesso indevido.

**Alternativa E — Permissões de perfil sempre prevalecem**

**Rejeitada.**

Criaria possibilidade de concessões superarem restrições de segurança,
escopo ou autoridade.

**Alternativa F — Restrição prevalece sobre concessão**

**APROVADA.**

Produz comportamento determinístico e mais seguro.

**33. Consequências aceitas**

A decisão aumenta a complexidade inicial do modelo de autorização.

Essa complexidade é aceita porque permite:

segurança;

multiempresa;

flexibilidade;

controle de escopo;

autoridade;

auditoria;

evolução;

separação entre plataforma e clientes.

Também fica aceita a existência de estruturas técnicas para recursos que
somente serão configurados posteriormente, como autoridade por
valor/percentual.

**34. Dependências**

Este ADR possui relação direta com:

ADR-002 — MVP e Escopo do Produto;

ADR-003 — Cliente-Piloto;

ADR-005 — Operação Offline;

ADR-007 — Notificações;

ADR-008 — Plataforma de Campo.

A autorização deverá ser respeitada por todos os módulos.

**35. Governança e histórico**

Esta versão não substitui silenciosamente a versão anterior.

**Versão 2.0:** decisão anteriormente aprovada.

**Versão 2.1:** incorpora exclusivamente os quatro ajustes identificados
na revisão geral:

regra de conflito;

autoridade por valor/percentual;

separação plataforma × tenant;

MFA obrigatório para administradores da plataforma no MVP.

As decisões anteriores permanecem válidas quando não conflitarem com os
ajustes desta versão.

Novas alterações deverão ser registradas em nova versão.

**36. Decisão final**

O SaaS adotará o modelo:

**Identidade → Empresa/Tenant → Perfil → Permissões → Escopo →
Autoridade → Estado da Operação → Regras de Negócio → Autorização
Backend**

com:

isolamento obrigatório entre tenants;

permissões configuráveis;

permissões individuais controladas;

restrição prevalecendo sobre concessão;

autoridade preparada para limites por valor/percentual;

separação arquitetural entre plataforma e tenant;

acesso de suporte controlado e auditado;

MFA obrigatório para administradores da plataforma no MVP;

auditoria e rastreabilidade.

**Status final: APROVADO**
