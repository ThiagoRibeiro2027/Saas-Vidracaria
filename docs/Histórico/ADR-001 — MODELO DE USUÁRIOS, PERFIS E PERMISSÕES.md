**ADR-001 — MODELO DE USUÁRIOS, PERFIS E PERMISSÕES**

**Projeto:** SaaS Industrial\
**Versão:** 1.0\
**Status:** Consolidado — aguardando aprovação formal

**1. Objetivo**

Definir o modelo arquitetural de usuários, perfis e permissões do SaaS
Industrial, garantindo segurança, flexibilidade, rastreabilidade,
isolamento entre empresas e capacidade de evolução futura.

O modelo deverá permitir que cada empresa configure seus próprios perfis
de acesso sem depender de papéis fixos previamente determinados pelo
sistema.

**2. Decisão Arquitetural**

O sistema adotará o modelo:

**Usuário → Perfil → Permissões**

Um usuário receberá um ou mais perfis conforme as regras definidas pelo
sistema.

Cada perfil será composto por um conjunto de permissões.

As permissões determinarão quais ações o usuário está autorizado a
executar dentro dos respectivos escopos.

**3. Perfis Dinâmicos**

Os perfis serão configuráveis.

O sistema deverá permitir:

criar perfis;

editar perfis;

ativar perfis;

inativar perfis;

atribuir permissões;

remover permissões;

associar usuários aos perfis;

consultar histórico das alterações.

Não haverá dependência arquitetural de papéis rígidos como:

Administrador;

Gerente;

Coordenador;

Supervisor;

Operador.

Esses nomes poderão existir como perfis sugeridos, mas não representarão
uma limitação estrutural do sistema.

**4. Perfis Sugeridos**

O sistema poderá disponibilizar perfis iniciais sugeridos para facilitar
a implantação.

Esses perfis serão apenas modelos configuráveis.

A empresa poderá:

utilizar o perfil sugerido;

alterar suas permissões;

duplicá-lo;

criar novos perfis;

inativá-lo.

A existência de um perfil sugerido não deverá impedir a criação de
qualquer outro perfil necessário à operação.

**5. Granularidade das Permissões**

As permissões deverão possuir granularidade suficiente para controlar,
conforme aplicável:

módulo;

funcionalidade;

ação;

entidade;

contexto;

status;

empresa;

unidade;

escopo operacional.

Entre as ações possíveis estão:

visualizar;

criar;

editar;

excluir ou inativar;

aprovar;

liberar;

cancelar;

reabrir;

exportar;

executar.

A arquitetura deverá permitir a inclusão de novas ações no futuro sem
necessidade de reconstrução do modelo de autorização.

**6. Escopo das Permissões**

Uma permissão poderá ser limitada a determinado contexto.

Exemplos:

acesso a determinado módulo;

acesso somente a determinadas funcionalidades;

atuação somente em determinada unidade;

acesso somente a determinados registros;

execução de determinada ação somente em determinados estados.

O sistema deverá evitar que um usuário tenha acesso a dados ou operações
fora do escopo autorizado.

**7. Permissão Não Substitui Regra de Negócio**

Este é um princípio obrigatório.

**Permissão determina autorização.**

**Regra de negócio determina validade operacional.**

Ter permissão para executar uma ação não significa que a ação poderá ser
executada em qualquer situação.

Exemplo:

Um usuário pode possuir permissão para aprovar uma Ordem de Produção,
porém a aprovação continuará sujeita às regras do domínio, como
existência de dados obrigatórios, situação do processo e demais
condições estabelecidas pelo sistema.

As regras de negócio não deverão ser implementadas exclusivamente
através do sistema de permissões.

**8. Multi-Tenant**

O modelo deverá ser compatível com a arquitetura multi-tenant desde sua
origem.

Usuários, perfis e permissões deverão estar associados ao respectivo
tenant e obedecer ao isolamento definido pela arquitetura.

Nenhum usuário poderá acessar dados, permissões ou operações
pertencentes a outro tenant.

Quando aplicável, o acesso poderá também ser restringido por empresa,
unidade ou outro escopo organizacional interno.

**9. Usuários**

O sistema deverá contemplar:

criação de usuários;

edição;

ativação;

inativação;

autenticação;

controle de acesso;

associação a perfis;

recuperação/redefinição de acesso;

histórico;

auditoria.

A inativação de um usuário não deverá apagar seu histórico de operações
realizadas anteriormente.

**10. Recuperação e Redefinição de Acesso**

A recuperação ou redefinição de acesso deverá possuir mecanismos
controlados.

A capacidade de realizar ou autorizar uma redefinição poderá ser
atribuída a usuários autorizados, conforme configuração da empresa.

Entre os responsáveis possíveis estão:

superior;

coordenador;

administrador.

Essa capacidade deverá ser tratada como uma autorização controlável e
auditável, não como privilégio estrutural e imutável de determinado
cargo.

**11. Auditoria**

Alterações relacionadas a segurança e autorização deverão ser
rastreáveis.

Sempre que aplicável, deverão ser registrados:

usuário responsável pela alteração;

usuário afetado;

tenant;

data e hora;

perfil;

permissão;

ação;

valor anterior;

novo valor;

origem;

justificativa;

resultado.

O histórico não deverá ser apagado simplesmente porque o usuário ou
perfil foi inativado.

**12. Segurança em Camadas**

O controle de autorização deverá existir em múltiplas camadas.

A interface deverá respeitar as permissões, mas não será considerada
mecanismo suficiente de segurança.

A API e a camada de domínio deverão validar as autorizações antes da
execução das operações protegidas.

Uma tentativa de contornar a interface e acessar diretamente uma API não
poderá permitir uma operação não autorizada.

**13. Perfis e Regras de Negócio**

Perfis e permissões não deverão assumir responsabilidades pertencentes
aos módulos de negócio.

Exemplo:

O perfil poderá determinar que um usuário possui permissão para cancelar
um pedido.

Entretanto, as regras do módulo Pedidos determinarão:

quando o cancelamento é permitido;

quais estados permitem cancelamento;

se é necessária aprovação;

quais efeitos serão gerados;

quais registros deverão permanecer históricos.

**14. Histórico e Rastreabilidade**

Alterações de usuários, perfis e permissões deverão preservar histórico
suficiente para reconstruir a situação anterior quando necessário.

O sistema não deverá utilizar alterações silenciosas ou apagar
informações relevantes de autorização.

Mudanças críticas deverão ser identificáveis e auditáveis.

**15. MVP**

O modelo de usuários e permissões faz parte do MVP.

🟢 **Obrigatório no MVP**

usuários;

autenticação;

recuperação/redefinição de acesso;

perfis dinâmicos;

criação e edição de perfis;

ativação e inativação;

permissões granulares;

escopos de acesso;

isolamento multi-tenant;

auditoria;

histórico;

controle de acesso no backend.

🔵 **Pós-MVP**

Poderão ser incorporados posteriormente:

SSO;

IAM avançado;

MFA avançado;

conditional access;

segregação avançada de funções;

políticas avançadas de segurança;

integrações avançadas com provedores de identidade.

A arquitetura do MVP deverá permitir essas evoluções sem necessidade de
reconstrução do modelo fundamental.

**16. Princípios Obrigatórios**

O desenvolvimento deverá respeitar os seguintes princípios:

Usuário não recebe permissões diretamente como regra geral; o modelo
principal é Usuário → Perfil → Permissões.

Perfis são dinâmicos e configuráveis.

Permissões são granulares.

Permissões não substituem regras de negócio.

O isolamento multi-tenant é obrigatório.

Autorização deve ser validada no backend/domínio.

Alterações críticas devem ser auditáveis.

Inativação não significa exclusão histórica.

Escopos de acesso devem ser respeitados em todas as camadas.

O modelo deve ser extensível para futuras necessidades de segurança e
identidade.

**17. Relação com a Arquitetura Mestre**

Este ADR complementa a Arquitetura Mestre do SaaS Industrial.

A Arquitetura Mestre permanece como referência superior.

Qualquer futura funcionalidade de usuários, perfis ou permissões deverá
respeitar:

este ADR;

os princípios de segurança da Arquitetura Mestre;

o isolamento multi-tenant;

a separação entre autorização e regras de negócio;

os demais contratos arquiteturais do sistema.

**18. Decisão Final**

O SaaS Industrial adotará um **modelo dinâmico, granular, multi-tenant,
auditável e extensível de usuários, perfis e permissões**, baseado em:

**Usuário → Perfil → Permissões**

O sistema não ficará limitado a papéis fixos.

As permissões controlarão a autorização para execução das ações,
enquanto as regras de negócio permanecerão sob responsabilidade dos
respectivos domínios.

Este modelo é obrigatório para a implementação do MVP e deverá ser
considerado referência para todas as futuras funcionalidades
relacionadas a segurança e controle de acesso.

**Status: CONSOLIDADO — AGUARDANDO APROVAÇÃO FORMAL**
