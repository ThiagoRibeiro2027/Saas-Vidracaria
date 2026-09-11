**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-001 — Usuários / Permissões**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável pela decisão:** Product Owner

**1. INSTRUÇÃO PRINCIPAL**

Implemente o mecanismo central de **Usuários, Perfis, Permissões,
Escopos, Autoridade, Validade e Auditoria** do SaaS, respeitando
integralmente as decisões definidas na ADR-001 — Versão 2.0.

**Não redesenhe, simplifique ou substitua as decisões arquiteturais
aprovadas.**

A implementação deverá utilizar a ADR-001 como referência normativa para
o modelo de autorização do sistema.

**2. MODELO CENTRAL**

Utilize como estrutura principal:

**Usuário → Perfil → Permissões**

Complementada por:

**Escopo de acesso → Autoridade → Validade → Regras de negócio →
Autorização final no backend**

Permissões, perfis e usuários deverão ser tratados como componentes
distintos.

**3. USUÁRIOS**

Implementar usuários individuais com:

identificação própria;

autenticação;

status ativo/inativo;

associação ao tenant;

associação a perfil ou perfis;

controle de acesso;

auditoria.

Não permitir utilização de uma mesma conta por múltiplas pessoas como
mecanismo normal de operação.

Usuários desativados não poderão executar novas operações autenticadas.

A desativação não poderá apagar seu histórico.

**4. PERFIS**

Implementar perfis reutilizáveis compostos por permissões.

Permitir criação e manutenção de perfis conforme a estrutura de cada
empresa.

Não criar uma lista rígida de perfis obrigatórios.

Exemplos como Administrador, Comercial, Engenharia, Estoque, Produção,
Expedição, Instalação e Financeiro são referências funcionais, não uma
estrutura fixa.

**5. PERMISSÕES**

Implementar permissões granulares por ação e recurso.

Quando aplicável, contemplar ações como:

visualizar;

criar;

editar;

excluir;

aprovar;

liberar;

cancelar;

concluir;

administrar;

consultar.

A exclusão deverá existir somente quando o processo permitir.

Todas as permissões relevantes deverão ser verificadas no backend.

**6. PERMISSÃO NÃO É REGRA DE NEGÓCIO**

Não tratar uma permissão como autorização absoluta.

A autorização deverá seguir:

**Usuário → Perfil → Permissões → Escopo → Estado da operação → Regras
de negócio → Autorização final no backend**

Exemplo:

Ter permissão para cancelar pedido não significa que qualquer pedido
poderá ser cancelado.

O backend deverá verificar todas as condições necessárias antes de
executar a operação.

**7. ESCOPO DE ACESSO**

Implementar controle de escopo conforme a necessidade do recurso.

O escopo poderá considerar:

tenant;

empresa;

estabelecimento;

unidade;

setor;

departamento;

equipe;

registros próprios;

registros sob responsabilidade;

outros escopos definidos pelo produto.

O escopo deverá ser aplicado no backend e na camada de dados.

Não implementar escopo somente como filtro visual.

**8. ISOLAMENTO MULTI-TENANT**

Garantir isolamento obrigatório entre empresas.

Um usuário não poderá acessar ou modificar dados de outro tenant sem
mecanismo administrativo explicitamente previsto pela arquitetura.

A proteção deverá funcionar independentemente da interface.

Tentativas de acesso por:

API;

endpoint;

URL;

parâmetro;

identificador;

chamada direta;

manipulação do frontend;

deverão ser bloqueadas quando estiverem fora do escopo autorizado.

**9. PERMISSÕES INDIVIDUAIS**

Implementar suporte a permissões individuais complementares aos perfis.

Uma permissão individual:

não substitui o perfil;

não elimina o modelo de perfis;

não pode ultrapassar o escopo máximo do usuário;

não pode quebrar isolamento entre tenants;

não pode contornar regras de negócio;

não pode liberar recurso não contratado;

não pode ultrapassar a autoridade de quem concede.

**10. CONFLITOS DE PERMISSÃO**

Definir e implementar comportamento consistente para combinações de:

permissões de perfil;

permissões individuais;

restrições;

permissões temporárias;

escopos diferentes;

estados incompatíveis da operação.

Nenhuma combinação poderá produzir autorização que viole segurança,
escopo, contrato, regras de negócio ou isolamento.

Não deixar conflitos críticos para interpretação futura durante a
execução.

**11. AUTORIDADE ADMINISTRATIVA**

Separar:

**poder de executar uma operação**

de:

**poder de administrar permissões.**

Implementar controle de autoridade para:

criar usuários;

alterar usuários;

criar/alterar perfis;

atribuir perfis;

conceder permissões;

retirar permissões;

definir escopos;

conceder acessos temporários.

Um usuário não poderá conceder a outro uma autorização que não possui
autoridade para administrar.

Também não poderá elevar seu próprio nível de acesso indevidamente.

Todas as validações deverão ocorrer no backend.

**12. VALIDADE**

Permitir permissões:

permanentes;

temporárias.

Permissões temporárias deverão suportar, quando aplicável:

início;

término.

Após o vencimento, a permissão não poderá mais autorizar novas
operações.

O histórico deverá permanecer preservado.

**13. CONTRATO COMERCIAL**

Integrar o mecanismo de autorização ao modelo comercial definido pela
ADR-006.

Respeitar:

**Tenant → Contratação → Plano/Módulos/Recursos contratados →
Funcionalidades habilitadas → Usuário → Permissões**

Regras obrigatórias:

recurso não contratado não poderá ser liberado por permissão;

contratação não concede automaticamente acesso a todos os usuários;

permissão não substitui contratação;

alteração de permissões não poderá funcionar como mecanismo comercial.

Separar claramente:

**Disponibilidade comercial ≠ Autorização do usuário.**

**14. REGRAS DE NEGÓCIO**

Antes de executar uma operação relevante, validar:

permissão;

escopo;

estado do registro;

dependências;

aprovações;

integridade;

autoridade;

regras operacionais;

regras comerciais;

regras fiscais quando aplicáveis;

demais regras específicas do processo.

Não permitir que um administrador utilize permissões para ignorar regras
estruturais.

**15. AUTORIZAÇÃO NO BACKEND**

O backend será a autoridade final.

Nunca considerar:

botão oculto;

tela desabilitada;

rota protegida somente no frontend;

parâmetro escondido;

validação JavaScript;

como mecanismo suficiente de segurança.

Toda operação relevante deverá ser novamente autorizada no servidor.

**16. OPERAÇÃO OFFLINE**

Integrar a autorização com o mecanismo definido pelas ADRs 005 e 008.

Durante o offline, a aplicação poderá registrar operações localmente
dentro das regras estabelecidas.

Na sincronização, o servidor deverá revalidar:

identidade;

autorização;

escopo;

estado;

regras de negócio;

integridade.

Uma operação registrada localmente não deverá ser considerada
definitivamente autorizada apenas por ter sido aceita pelo dispositivo.

**17. AUDITORIA**

Auditar alterações relevantes de:

usuários;

perfis;

permissões;

escopos;

autoridades;

validade.

Registrar, conforme aplicável:

responsável;

usuário afetado;

permissão/perfil;

escopo;

estado anterior;

novo estado;

validade;

data/hora do servidor;

motivo;

origem;

processo relacionado.

Preservar histórico.

Não sobrescrever alterações críticas sem rastreabilidade.

**18. SEGURANÇA**

Implementar os princípios de:

menor privilégio;

separação de responsabilidades;

isolamento entre tenants;

autorização backend;

proteção contra bypass;

auditoria;

autoridade;

validade;

proteção de dados.

Nenhuma camada de frontend deverá ser considerada fonte de segurança.

**19. ADMINISTRAÇÃO**

Criar mecanismos administrativos para gerenciar:

usuários;

perfis;

permissões;

escopos;

autoridades;

validade;

status.

Alterações críticas deverão possuir rastreabilidade adequada.

A interface administrativa deverá apresentar claramente as consequências
das alterações quando necessário.

**20. ADMINISTRADORES**

Usuários administrativos poderão possuir privilégios superiores, desde
que esses privilégios sejam explicitamente definidos.

Privilégios administrativos não deverão permitir:

quebra de isolamento;

bypass de segurança;

eliminação da auditoria;

contorno de regras estruturais.

Privilégios especiais deverão ser deliberadamente definidos e auditados.

**21. NOTIFICAÇÕES**

Integrar com ADR-007 sem misturar comunicação com autorização.

Receber uma notificação não concede permissão.

A notificação somente comunica a existência de um evento ou ação.

A execução da ação continuará dependendo da autorização correspondente.

**22. INTEGRAÇÃO COM MÓDULOS**

Todos os módulos deverão utilizar o mecanismo central.

Não criar mecanismos independentes de autorização para:

Comercial;

Pedidos;

Engenharia;

Estoque;

Produção;

Qualidade;

Expedição;

Instalação;

Financeiro;

Fiscal;

Configurações;

demais módulos.

Cada módulo poderá possuir permissões específicas, mas deverá utilizar a
mesma infraestrutura central.

**23. RELAÇÃO COM AS ADRs**

A implementação deverá permanecer coerente com:

- **ADR-002:** MVP e Escopo do Produto;

- **ADR-003:** Cliente-Piloto;

- **ADR-004:** Estratégia Fiscal;

- **ADR-005:** Operação Offline;

- **ADR-006:** Modelo Comercial;

- **ADR-007:** Notificações;

- **ADR-008:** Plataforma de Campo.

Não criar comportamento que contradiga essas decisões.

**24. MVP**

Para o MVP, implementar o mecanismo necessário para:

usuários;

perfis;

permissões;

escopos;

isolamento;

autorização backend;

permissões individuais quando necessárias;

autoridade;

validade;

auditoria;

integração com módulos;

integração com contrato comercial;

operação offline conforme aplicável.

Funcionalidades avançadas de administração poderão permanecer para
evolução, desde que não comprometam as decisões estruturais desta ADR.

**25. DECISÕES POSTERGADAS**

Não antecipar decisões ainda não definidas sobre:

catálogo definitivo de permissões;

perfis padrão definitivos;

níveis administrativos específicos;

delegação avançada;

políticas avançadas de expiração;

múltiplos níveis de aprovação;

segregação avançada de funções;

mecanismos avançados de autenticação.

Essas decisões deverão ser tratadas posteriormente sem romper a
arquitetura definida.

**26. CRITÉRIOS DE ACEITAÇÃO**

A implementação deverá demonstrar:

usuário individual funcionando;

perfil reutilizável;

permissões granulares;

escopo de acesso;

isolamento entre tenants;

autorização no backend;

impossibilidade de bypass pelo frontend;

permissões individuais controladas;

autoridade administrativa;

permissões temporárias;

auditoria;

integração com contratação comercial;

respeito às regras de negócio;

revalidação em operações offline;

mecanismo central utilizado pelos módulos.

**27. TESTES OBRIGATÓRIOS**

Testar, no mínimo:

**Acesso autorizado**

Usuário com perfil e permissão adequados consegue executar a ação.

**Acesso negado**

Usuário sem permissão não consegue executar a ação.

**Escopo**

Usuário não consegue acessar registro fora do seu escopo.

**Tenant**

Usuário não consegue acessar dados de outro tenant.

**Bypass**

Tentativas diretas via API, URL ou parâmetros são bloqueadas.

**Regra de negócio**

Usuário com permissão não consegue executar ação quando o estado da
operação não permite.

**Permissão individual**

Concessão individual funciona sem romper escopo ou segurança.

**Expiração**

Permissão temporária deixa de funcionar após seu vencimento.

**Autoridade**

Usuário sem autoridade não consegue conceder permissões que não pode
administrar.

**Autopromoção**

Usuário não consegue elevar indevidamente suas próprias permissões.

**Contrato**

Permissão não libera recurso não contratado.

**Offline**

Operação local é revalidada pelo servidor durante sincronização.

**Auditoria**

Alterações de acesso permanecem rastreáveis.

**28. REGRA DE IMPLEMENTAÇÃO**

Não implementar atalhos que reduzam a segurança ou alterem o modelo
definido nesta ADR.

Quando houver dúvida entre:

facilidade de implementação;

segurança;

isolamento;

rastreabilidade;

autorização correta;

deverá prevalecer a decisão arquitetural definida nesta ADR.

**29. ORDEM DE PRIORIDADE**

Durante a implementação, priorizar:

segurança;

isolamento entre tenants;

autorização backend;

integridade;

escopo;

auditoria;

autoridade;

integração comercial;

experiência administrativa;

funcionalidades avançadas.

**30. REGRA FINAL**

**Implementar o modelo Usuário → Perfil → Permissões, complementado por
Escopo → Autoridade → Validade → Regras de Negócio → Autorização Final
no Backend.**

**Permissão não equivale à autorização final para executar uma
operação.**

**Nenhum usuário, administrador, frontend, API ou módulo poderá utilizar
o mecanismo de permissões para contornar regras de negócio, segurança,
isolamento entre empresas ou limitações comerciais.**

**O backend deverá permanecer como autoridade final para autorização e
integridade das operações.**

**FIM DO PROMPT — ADR-001 v2.0**
