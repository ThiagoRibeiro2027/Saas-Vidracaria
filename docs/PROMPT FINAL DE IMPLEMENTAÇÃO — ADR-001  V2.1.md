**PROMPT FINAL DE IMPLEMENTAÇÃO — ADR-001**

**Usuários, Perfis, Permissões, Escopo, Autoridade e Segurança**

**Versão:** 2.1\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Origem:** ADR-001 — Usuários / Permissões — Versão 2.1

**1. Objetivo**

Implementar a fundação de usuários, empresas, unidades, perfis,
permissões, escopos, autoridades, autenticação, autorização e auditoria
do SaaS.

A implementação deverá suportar:

**Identidade → Empresa/Tenant → Perfil → Permissões → Escopo →
Autoridade → Estado da Operação → Regras de Negócio → Autorização
Backend**

A arquitetura deverá separar claramente:

usuários da plataforma;

usuários dos tenants;

administração da plataforma;

administração das empresas clientes.

**2. Regra fundamental**

Não considerar uma permissão isolada como autorização final.

Toda operação protegida deverá passar por autorização no backend.

A interface poderá ocultar ou desabilitar funcionalidades para melhorar
UX, mas isso nunca substituirá a validação de segurança no backend.

**3. Multi-tenancy**

Implementar isolamento rigoroso entre empresas.

Cada empresa deverá possuir contexto próprio.

Nenhum usuário de tenant poderá:

consultar dados de outro tenant;

alterar dados de outro tenant;

excluir dados de outro tenant;

acessar arquivos de outro tenant;

obter informações de outro tenant por API, URL ou requisição direta.

Implementar o isolamento também na camada de dados, utilizando RLS
quando aplicável à arquitetura.

Testar explicitamente tentativas de acesso cruzado.

**4. Estrutura de entidades**

Preparar o modelo para entidades relacionadas a:

usuários;

empresas;

grupos empresariais, quando aplicável;

unidades;

perfis;

permissões;

atribuições de perfil;

permissões individuais;

escopos;

autoridades;

vínculos entre usuário e empresa;

vínculos entre usuário e unidade;

usuários da plataforma;

funções de plataforma;

auditoria.

Evitar estruturas que dependam de cargos fixos.

**5. Usuário**

O usuário deverá representar uma identidade do SaaS.

A arquitetura deverá permitir que uma mesma identidade possa,
futuramente, possuir acesso autorizado a mais de uma empresa.

Usuários poderão ser:

ativos;

inativos.

A desativação não poderá eliminar o histórico.

**6. Usuários de tenant**

O vínculo do usuário com uma empresa deverá ser independente de:

perfil;

permissões;

unidade;

escopo;

autoridade.

Um usuário poderá possuir acesso a uma ou mais unidades conforme
autorização.

O contexto ativo de empresa/unidade deverá ser validado pelo backend.

**7. Usuários da plataforma**

Implementar uma camada distinta para usuários responsáveis pela operação
administrativa do SaaS.

Não modelar administrador da plataforma simplesmente como um perfil de
uma empresa cliente.

A camada de plataforma deverá permitir, conforme autoridade:

administrar tenants;

administrar contratos;

administrar planos;

administrar entitlements;

acompanhar estado comercial;

executar operações administrativas;

executar suporte autorizado;

administrar configurações globais.

**8. Separação Plataforma × Tenant**

Manter arquiteturalmente duas dimensões:

**Plataforma**

Usuário da Plataforma → Função/Autoridade → Recursos da Plataforma

**Tenant**

Empresa → Usuário → Perfil → Permissões → Escopo

Uma permissão de tenant nunca deverá conceder automaticamente
privilégios de plataforma.

Um administrador de empresa não poderá se tornar administrador da
plataforma pela simples alteração de perfil.

**9. Acesso de suporte**

Não conceder acesso irrestrito aos dados dos tenants aos usuários da
plataforma.

Quando houver necessidade de suporte:

exigir autorização adequada;

limitar o escopo;

registrar finalidade quando aplicável;

auditar acesso;

registrar usuário da plataforma;

registrar tenant;

registrar data/hora;

registrar operação executada;

registrar resultado.

O acesso de suporte deverá ser rastreável.

**10. Perfis**

Implementar perfis como agrupadores configuráveis de permissões.

A plataforma poderá possuir perfis de referência, mas não assumir que
eles possuem permissões universais.

Cada empresa deverá poder configurar seus próprios perfis conforme os
recursos disponíveis.

Não codificar permissões definitivas diretamente em cargos.

**11. Permissões**

As permissões deverão ser estruturadas por:

**Recurso + Ação**

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

A arquitetura deverá permitir evolução de novos recursos e ações.

**12. Escopo**

Implementar suporte a escopo de autorização.

O escopo poderá considerar:

empresa;

unidade;

setor;

equipe;

registros específicos;

registros sob responsabilidade;

outros níveis necessários.

O escopo deverá ser validado no backend.

Nunca utilizar filtro visual como mecanismo de segurança.

**13. Permissões individuais**

Permitir permissões individuais como complemento às permissões
provenientes do perfil.

Toda permissão individual deverá:

ser identificável;

possuir origem;

possuir escopo quando aplicável;

possuir validade quando aplicável;

ser auditável.

Permissões individuais não poderão:

romper tenant isolation;

ultrapassar autoridade;

superar restrições explícitas;

liberar funcionalidades não contratadas;

permitir autoelevação.

**14. Regra de conflito**

Implementar obrigatoriamente a regra:

**RESTRIÇÃO PREVALECE SOBRE CONCESSÃO.**

Quando existir conflito entre uma concessão e uma restrição, a restrição
deverá vencer.

Aplicar a regra a:

permissões de perfil;

permissões individuais;

escopo;

autoridade;

segurança;

restrições contratuais/comerciais;

outras restrições explícitas.

O comportamento deverá ser determinístico.

Não permitir que uma concessão posterior simplesmente sobrescreva uma
restrição.

**15. Autoridade**

Separar tecnicamente:

**Permission**

de

**Authority**

Uma permissão representa capacidade funcional.

Autoridade representa até onde determinada operação pode ser executada.

A autorização deverá considerar:

**Usuário → Perfil → Permissão → Escopo → Autoridade → Estado da
Operação → Regras de Negócio → Backend**

**16. Autoridade por valor e percentual**

Preparar o modelo para regras de autoridade baseadas em:

valor monetário;

percentual;

nível hierárquico;

tipo de operação;

combinação de critérios.

Exemplos:

aprovação até determinado valor;

desconto até determinado percentual;

necessidade de aprovação superior acima do limite.

Não definir neste momento valores concretos, percentuais ou níveis
hierárquicos.

A estrutura deverá permitir sua configuração futura sem reconstrução do
modelo.

**17. Validade**

Permitir validade temporal para permissões e autoridades.

Suportar:

início;

término;

ativação;

desativação;

histórico.

Autorizações expiradas não poderão continuar válidas.

**18. Aprovações**

A arquitetura deverá permitir operações que exijam aprovação.

Não criar limites ou regras específicas de aprovação sem definição
formal.

A estrutura deverá estar preparada para:

solicitante;

autoridade requerida;

aprovação;

rejeição;

escalonamento;

histórico.

**19. Estado da operação**

A autorização deverá considerar o estado atual da operação.

Exemplo:

Um usuário pode possuir permissão para editar pedidos, mas não
necessariamente poderá editar um pedido que esteja em estado bloqueado,
liberado ou encerrado.

A regra de estado deverá ser avaliada pelo backend.

**20. Regras de negócio**

Não misturar:

**Permissão**

com

**Regra de negócio.**

A permissão permite que o usuário tente executar determinada ação.

A regra de negócio determina se aquela ação é válida naquele contexto.

Ambas deverão ser avaliadas antes da autorização final.

**21. Autorização no backend**

Criar uma camada centralizada ou mecanismo consistente de autorização.

Toda operação protegida deverá validar, conforme aplicável:

identidade;

autenticação;

usuário ativo;

tenant;

unidade;

perfil;

permissão;

escopo;

autoridade;

estado da operação;

regras de negócio;

entitlements/estado comercial;

restrições de segurança.

A validação deverá ocorrer antes da execução da operação protegida.

**22. Não confiar no frontend**

Nunca considerar como segurança:

botão oculto;

botão desabilitado;

rota escondida;

menu removido;

filtro visual;

parâmetro enviado pelo cliente.

Todas as permissões deverão ser novamente verificadas no backend.

**23. Autoelevação**

Impedir que um usuário:

conceda a si próprio novas permissões;

aumente sua autoridade;

altere seu próprio nível administrativo;

atribua a si mesmo perfil superior;

transforme-se em administrador da plataforma.

Operações de elevação deverão exigir autoridade independente.

**24. MFA da plataforma**

Implementar **MFA obrigatório para administradores da plataforma no
MVP**.

O MFA deverá estar vinculado à camada de autenticação.

Impedir bypass por fluxos alternativos.

Implementar mecanismo seguro de recuperação.

Registrar eventos relevantes de:

ativação;

alteração;

tentativa;

falha;

recuperação;

desativação.

**25. Usuários comuns dos tenants**

Não tornar MFA obrigatório para todos os usuários dos tenants neste MVP
apenas por esta decisão.

A arquitetura deverá permanecer preparada para futura expansão de
autenticação.

**26. Auditoria**

Auditar alterações relevantes de:

usuários;

perfis;

permissões;

permissões individuais;

escopos;

autoridades;

vínculos;

acessos administrativos;

acesso de suporte;

MFA;

operações de plataforma.

Registrar, quando aplicável:

usuário executor;

tipo de usuário;

tenant;

unidade;

ação;

registro afetado;

valor anterior;

novo valor;

data/hora;

resultado;

contexto.

**27. Histórico**

Desativar usuário não significa apagar seu histórico.

Manter as referências necessárias para identificar quem realizou ações
anteriormente.

Exclusões definitivas deverão ser excepcionais e sujeitas a:

segurança;

auditoria;

retenção;

requisitos legais.

**28. Contratos e entitlements**

A autorização deverá respeitar os recursos contratados pelo tenant.

Uma permissão não poderá liberar uma funcionalidade que o tenant não
possui contratualmente.

A camada deverá permitir evolução para:

**Tenant → Contrato → Entitlements → Estado Comercial**

sem misturar isso com:

**Tenant → Usuário → Perfil → Permissões.**

**29. Offline**

Quando uma operação ocorrer offline, a autorização não poderá ser
considerada permanentemente válida apenas porque o usuário possuía
permissão anteriormente.

Ao sincronizar:

revalidar usuário;

tenant;

permissão;

escopo;

autoridade;

estado da operação;

regras de negócio;

restrições.

O servidor será a autoridade final.

**30. Testes obrigatórios**

Implementar testes para:

**Multi-tenant**

usuário acessando próprio tenant;

tentativa de acesso a outro tenant;

tentativa via API;

tentativa via URL;

tentativa de acesso a arquivo.

**Permissões**

usuário autorizado;

usuário não autorizado;

permissão de perfil;

permissão individual;

permissão expirada.

**Conflitos**

Testar explicitamente:

**Grant + Restriction → Restriction vence.**

**Escopo**

unidade autorizada;

unidade não autorizada;

registro próprio;

registro de outro responsável.

**Autoridade**

dentro do limite;

acima do limite;

escalonamento.

**Plataforma**

usuário de tenant tentando acessar plataforma;

administrador de tenant tentando elevar privilégio;

usuário da plataforma com acesso autorizado;

usuário da plataforma sem escopo suficiente.

**MFA**

administrador de plataforma sem MFA;

administrador com MFA;

falha de MFA;

recuperação segura.

**Auditoria**

Verificar se todas as operações administrativas relevantes são
registradas.

**31. Critérios de aceite**

A implementação será considerada aprovada quando:

houver isolamento efetivo entre tenants;

autorização ocorrer no backend;

perfis e permissões forem entidades separadas;

escopos forem aplicáveis;

permissões individuais forem controladas;

restrições sempre prevalecerem sobre concessões;

autoridade estiver estruturalmente separada de permissão;

modelo suportar autoridade por valor/percentual;

valores concretos permanecerem configuráveis/postergados;

usuários da plataforma estiverem separados dos usuários dos tenants;

acesso de suporte for controlado e auditado;

administrador da plataforma exigir MFA;

não existir autoelevação;

operações relevantes forem auditadas;

operações offline forem revalidadas pelo servidor.

**32. Diretrizes de implementação**

Não implementar regras específicas de uma fábrica como regras globais.

Não assumir cargos com permissões fixas.

Não assumir limites de aprovação que ainda não foram definidos.

Não criar atalhos de segurança.

Não confiar no frontend.

Não transformar administrador de tenant em administrador de plataforma.

Não permitir que permissões individuais superem restrições.

Não implementar MFA obrigatório para usuários comuns dos tenants apenas
por este ADR.

Priorizar:

**Segurança → Isolamento → Autorização → Auditoria → Flexibilidade →
Evolução.**

**33. Sequência recomendada de implementação**

Executar em etapas.

**Fase 1 — Identidade e autenticação**

Implementar:

usuários;

autenticação;

sessões;

ativação/desativação;

recuperação de acesso.

**Fase 2 — Multi-tenancy**

Implementar:

empresas;

unidades;

vínculos;

contexto;

RLS;

testes de isolamento.

**Fase 3 — Perfis e permissões**

Implementar:

perfis;

permissões;

atribuições;

permissões individuais;

escopos.

**Fase 4 — Autorização**

Implementar:

camada de autorização;

estado da operação;

regras de negócio;

restrições;

regra Restriction over Grant.

**Fase 5 — Autoridade**

Implementar a estrutura para:

autoridade;

valor;

percentual;

validade;

escalonamento.

Sem definir limites concretos ainda.

**Fase 6 — Plataforma**

Implementar:

usuários da plataforma;

funções administrativas;

separação plataforma × tenant;

acesso de suporte controlado.

**Fase 7 — MFA**

Implementar MFA obrigatório para administradores da plataforma.

**Fase 8 — Auditoria**

Implementar:

logs;

histórico;

acesso de suporte;

alterações administrativas;

MFA;

permissões;

autoridade.

**Fase 9 — Testes**

Executar testes completos de:

autenticação;

autorização;

multi-tenancy;

RLS;

escopo;

autoridade;

conflitos;

MFA;

auditoria;

segurança.

Não avançar para produção enquanto os testes críticos falharem.

**34. Regra para implementação pelo agente de desenvolvimento**

Antes de alterar código estruturalmente:

analisar a arquitetura existente;

identificar tabelas e relacionamentos atuais;

identificar mecanismos de autenticação;

identificar RLS;

identificar autorização existente;

identificar conflitos com esta especificação;

apresentar plano de alteração quando houver risco estrutural.

Não substituir silenciosamente estruturas existentes.

Preservar dados e histórico.

Migrations deverão ser versionadas e reversíveis quando tecnicamente
possível.

**35. Resultado esperado**

Ao final da implementação, o SaaS deverá possuir uma fundação segura e
extensível para:

**Plataforma → Tenants → Usuários → Perfis → Permissões → Escopos →
Autoridades → Operações → Regras de Negócio → Auditoria**

com separação rigorosa entre:

**administração da plataforma**

e

**administração das empresas clientes.**

A autorização final deverá sempre ocorrer no backend.

A regra de segurança fundamental será:

**Nenhuma concessão de acesso poderá superar uma restrição explícita.**

**Restriction over Grant.**

**36. Referência da decisão**

Este prompt é derivado do:

**ADR-001 — Usuários / Permissões — Versão 2.1**

O ADR permanece como documento oficial da decisão, suas alternativas,
justificativas e consequências.

Este documento representa exclusivamente a tradução da decisão aprovada
em requisitos de implementação.

**Status: APROVADO**
