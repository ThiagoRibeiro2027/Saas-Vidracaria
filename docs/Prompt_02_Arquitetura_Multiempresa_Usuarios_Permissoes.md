**PROMPT 02**

**Arquitetura Multiempresa, Usuários, Perfis, Permissões e Segurança**

*Sistema de Gestão Operacional da Fábrica de Vidraçaria*

# 1. Objetivo

Definir a arquitetura de usuários, empresas, unidades, perfis,
permissões, segurança e auditoria do SaaS. O sistema deverá ser
multiempresa (multi-tenant) e permitir que cada empresa configure sua
própria metodologia de trabalho, sem que o SaaS imponha uma estrutura
operacional única.

# 2. Princípio fundamental

O SaaS deverá separar claramente a estrutura técnica da plataforma das
regras operacionais de cada cliente. A plataforma fornece recursos e
mecanismos de configuração; cada empresa define como deseja utilizá-los.

# 3. Estrutura multiempresa

- Cada empresa será uma organização independente dentro do SaaS.

- Os dados de uma empresa deverão permanecer isolados dos dados das
  demais empresas.

- O sistema deverá ser preparado para grupos empresariais com múltiplas
  unidades/filiais.

- Uma empresa poderá possuir uma ou várias unidades.

- A arquitetura deverá permitir operação independente por unidade.

- Uma empresa poderá possuir visão consolidada de suas unidades quando
  autorizada.

# 4. Estrutura conceitual

Plataforma SaaS → Empresa/Grupo → Unidade/Filial → Usuários e Operação

A arquitetura deverá suportar futuramente estruturas como: Grupo
empresarial → empresas → unidades/filiais → setores → usuários.

# 5. Administradores

## 5.1 Administrador da Plataforma

- Administra o SaaS como produto.

- Poderá futuramente gerenciar empresas/clientes, planos, assinaturas,
  configurações globais e suporte.

- Não deverá ser confundido com o administrador de uma empresa cliente.

## 5.2 Administrador da Empresa

- Administra a própria empresa dentro do SaaS.

- Gerencia usuários, perfis, permissões e configurações conforme os
  recursos disponíveis.

- Não possui acesso administrativo às demais empresas.

# 6. Usuários e autenticação

- O usuário deverá ser tratado como uma identidade global do SaaS.

- A relação do usuário com empresa, unidade, perfil e permissões deverá
  ser independente.

- A arquitetura deverá permitir futuramente que um mesmo usuário tenha
  acesso a mais de uma empresa.

- A arquitetura deverá permitir acesso a uma ou mais unidades conforme
  autorização.

- Após o login, o sistema deverá identificar o contexto de
  empresa/unidade aplicável.

- O contexto ativo deverá ser considerado em todas as operações e
  consultas.

- Usuários poderão ser ativados ou desativados sem perda do histórico.

- A arquitetura deverá estar preparada para recuperação de senha,
  verificação de e-mail, MFA/2FA e controle de sessões.

# 7. Perfis iniciais sugeridos

A plataforma poderá oferecer inicialmente os seguintes perfis como
referência:

- Administrador

- Gerente

- Comercial

- Conferência

- Produção

- Terceirização

- Estoque

- Expedição

- Instalação

Esses perfis são sugestões iniciais e não deverão representar regras
obrigatórias. Cada empresa poderá utilizar, alterar, desativar ou criar
seus próprios perfis.

# 8. Permissões

- Usuário, perfil e permissão deverão ser entidades conceitualmente
  separadas.

- As permissões deverão ser estruturadas por recurso e ação.

- Exemplos de ações: visualizar, criar, editar, excluir, aprovar,
  reprovar, liberar, cancelar, registrar, finalizar, exportar e
  imprimir.

- O conjunto de permissões de cada perfil deverá ser configurável por
  empresa.

- O sistema não deverá assumir que um determinado cargo possui sempre as
  mesmas permissões em todas as empresas.

# 9. Escopo das permissões

A autorização deverá considerar, quando aplicável: Usuário + Empresa +
Unidade + Perfil + Permissão.

- Um usuário poderá ter acesso somente a determinadas unidades.

- Outro usuário poderá ter visão de todas as unidades da empresa.

- As permissões deverão respeitar o escopo autorizado.

- O backend deverá validar autorização independentemente da interface.

# 10. Workflows e metodologia

Os fluxos operacionais não deverão ser rigidamente codificados como uma
sequência única para todas as empresas.

- Cada empresa poderá futuramente configurar suas próprias etapas e
  fluxos.

- Exemplos de etapas possíveis: Pedido, Conferência, Gerência, Produção,
  Qualidade, Terceirização, Expedição e Instalação.

- Uma empresa poderá utilizar somente parte dessas etapas ou criar
  outras.

- O sistema deverá possuir arquitetura preparada para workflows
  configuráveis.

- A mesma plataforma deverá suportar metodologias diferentes entre
  clientes.

# 11. Aprovações

- A arquitetura deverá permitir que determinadas ações ou etapas exijam
  aprovação.

- As regras de aprovação serão definidas posteriormente por cada
  empresa.

- Não implementar regras de aprovação específicas antes de sua
  definição.

# 12. Segurança e isolamento

- Uma empresa jamais poderá acessar, visualizar, alterar ou excluir
  dados de outra empresa.

- O isolamento deverá ser garantido no backend e na camada de dados, não
  apenas pela interface.

- O acesso por URL, API ou requisição direta deverá passar pelas mesmas
  validações de autorização.

- Quando houver unidades, o acesso também deverá respeitar o escopo da
  unidade.

- Aplicar o princípio do menor privilégio.

- Usuários deverão receber somente os acessos necessários à sua
  função/configuração.

# 13. Auditoria e rastreabilidade

Ações relevantes deverão gerar registros de auditoria, incluindo, quando
aplicável:

- Usuário

- Empresa

- Unidade

- Data e hora

- Ação realizada

- Registro afetado

- Valor anterior

- Novo valor

A auditoria deverá permitir identificar quem realizou uma ação, em qual
contexto e quando ela ocorreu.

# 14. Histórico de usuários

- A desativação de um usuário não deverá apagar seu histórico.

- As ações realizadas anteriormente deverão continuar vinculadas ao
  usuário.

- A exclusão definitiva de usuários deverá ser uma operação excepcional,
  sujeita a regras de segurança, auditoria e retenção.

# 15. Diretrizes de banco de dados e arquitetura

- Utilizar relacionamentos consistentes entre usuários, empresas,
  unidades, perfis e permissões.

- Preparar o modelo para multiempresa e multiunidade desde o início.

- Considerar o contexto da empresa/unidade nas consultas e operações.

- Evitar estruturas que prendam o sistema a um único cliente ou
  metodologia.

- Manter mecanismos de auditoria e rastreabilidade.

- Manter integrações e regras desacopladas quando possível.

# 16. O que é definido pela plataforma x o que é definido pelo cliente

| Definido pela plataforma  | Definido por cada empresa  |
|---------------------------|----------------------------|
| Estrutura técnica         | Usuários                   |
| Recursos disponíveis      | Perfis                     |
| Permissões disponíveis    | Permissões atribuídas      |
| Mecanismos de workflow    | Fluxos utilizados          |
| Segurança                 | Aprovações                 |
| Auditoria                 | Metodologia operacional    |
| Multiempresa/multiunidade | Responsabilidades internas |

# 17. Diretriz de desenvolvimento para o Claude Code

Implementar somente a estrutura técnica necessária para suportar estas
diretrizes. Não criar regras operacionais específicas de uma empresa sem
que elas tenham sido previamente definidas no projeto.

- Não assumir permissões definitivas para os perfis.

- Não assumir workflows definitivos.

- Não assumir regras de aprovação.

- Não criar restrições específicas de uma fábrica como regra global do
  SaaS.

- Sempre preservar a capacidade de configuração por empresa.

- Priorizar arquitetura segura, escalável e preparada para evolução.

# 18. Regra de ouro do Tópico 2

O SaaS não deve impor como uma fábrica trabalha. Ele deve fornecer
ferramentas para que cada fábrica configure como deseja trabalhar,
mantendo isolamento, segurança, rastreabilidade e flexibilidade entre
empresas.
