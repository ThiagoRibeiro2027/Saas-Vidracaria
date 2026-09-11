**PROMPT 01**

**Contexto, Objetivo e Diretrizes do Sistema**

*Sistema de Gestão Operacional da Fábrica de Vidraçaria*

# 1. Contexto do projeto

Estamos desenvolvendo um SaaS para gestão operacional de uma fábrica de
vidraçaria. O sistema deverá centralizar e integrar as principais
operações da fábrica, proporcionando maior controle, rastreabilidade,
padronização dos processos, redução de erros e acompanhamento dos
prazos. O foco principal não é um sistema comercial de elaboração de
orçamentos, mas a gestão operacional da fábrica, desde o recebimento do
pedido até sua conclusão.

# 2. Fluxo principal do sistema

O fluxo operacional principal deverá ser estruturado em:

Pedido → Conferência → Liberação → Produção → Controle de Qualidade →
Expedição → Instalação → Conclusão

O estoque deverá estar integrado a esse fluxo:

Pedido → Reserva de materiais → Produção → Consumo de materiais →
Reposição

O sistema deverá permitir rastrear o pedido durante todo o processo.

# 3. Principais módulos previstos

## Gestão

- Dashboard

- Usuários

- Perfis

- Permissões

- Configurações

- Parâmetros do sistema

## Pedidos

- Entrada de pedidos

- Conferência

- Pendências

- Liberação

- Histórico

- Rastreabilidade

- Status do pedido

## Produção

- Programação

- Ordens de produção

- Etapas produtivas

- Apontamentos

- Controle de qualidade

- Retrabalho

- Identificação de gargalos

- Histórico da produção

## Estoque

- Cadastro de materiais

- Entradas

- Saídas

- Reservas

- Consumo

- Inventário

- Estoque mínimo

- Necessidade de compra

- Histórico de movimentações

## Expedição

- Pedidos liberados

- Conferência

- Separação

- Carregamento

- Romaneio

- Expedição

- Histórico

## Instalação

- Obras

- Endereço da obra

- Programação

- Agenda

- Equipes

- Materiais necessários

- Execução

- Pendências

- Registro fotográfico

- Conclusão da instalação

## Indicadores

- Pedidos em andamento

- Pedidos atrasados

- Produção

- Produtividade

- Estoque

- Instalações

- Cumprimento de prazos

- Retrabalho

- Backlog

- Gargalos

# 4. Rastreabilidade

A rastreabilidade deverá ser um dos conceitos fundamentais do sistema.
Cada pedido deverá possuir um histórico/timeline permitindo identificar,
quando aplicável:

- Data de entrada

- Conferência

- Pendências encontradas

- Liberação

- Início da produção

- Etapas realizadas

- Controle de qualidade

- Retrabalho

- Expedição

- Instalação

- Conclusão

O sistema deverá registrar também os responsáveis pelas principais ações
e as respectivas datas e horários.

# 5. Integração entre módulos

Os módulos não deverão funcionar como sistemas isolados.

As informações deverão estar relacionadas.

Exemplo: Cliente → Obra → Pedido → Itens → Materiais → Produção →
Estoque → Expedição → Instalação → Faturamento

Uma alteração relevante em uma etapa deverá refletir nas etapas
relacionadas quando houver regra de negócio definida para isso.

# 6. Arquitetura preparada para Faturamento e Financeiro

Embora o foco inicial seja a gestão operacional da fábrica, a
arquitetura deverá ser preparada desde o início para futura
implementação de um módulo de Faturamento e Financeiro.

- Faturamento

- Emissão de documentos fiscais

- Notas fiscais

- Contas a receber

- Cobranças

- Boletos

- Pix

- Parcelamentos

- Baixas de recebimentos

- Controle de vencimentos

- Inadimplência

- Histórico financeiro

- Conciliação

Essas funcionalidades poderão ser adicionadas posteriormente sem
necessidade de reconstrução estrutural do sistema.

# 7. Integrações fiscais e financeiras

O sistema deverá ser projetado para permitir futuras integrações via API
com provedores externos de serviços fiscais e financeiros.

- Emissão de documentos fiscais

- Consulta do status dos documentos fiscais

- Cancelamento/inutilização quando aplicável

- Geração de cobranças

- Emissão de boletos

- Pix

- Consulta de pagamentos

- Atualização automática de status

- Webhooks de eventos financeiros e fiscais

As integrações deverão ser desenvolvidas de forma desacoplada do núcleo
operacional. O sistema não deverá depender diretamente de um único
fornecedor.

# 8. Relacionamento entre operação e financeiro

O sistema deverá ser preparado para permitir que uma operação gere
consequências financeiras.

Exemplo: Pedido → Produção → Expedição → Instalação → Faturamento →
Documento Fiscal → Cobrança → Recebimento

- Valor faturado

- Documento fiscal

- Parcelas

- Vencimentos

- Boletos

- Pix

- Valores recebidos

- Valores em aberto

- Situação financeira

# 9. Arquitetura e banco de dados

- Relacionamentos consistentes

- IDs únicos

- Histórico

- Auditoria

- Status bem definidos

- Controle de usuários

- Controle de permissões

- Rastreabilidade

- Separação adequada entre módulos

- Preparação para integrações externas

# 10. Diretriz de desenvolvimento

Não implementar todos os módulos neste momento.

Antes da implementação de cada módulo deverão ser definidos:

- Regras de negócio

- Perfis de usuários

- Fluxos

- Estados/status

- Banco de dados

- Relacionamentos

- Permissões

- Critérios de aceite

Não assumir regras de negócio que ainda não foram definidas. Quando
houver informação faltante, sinalizar a necessidade de definição antes
de implementar uma regra definitiva.

# 11. Prioridade do projeto

- 1º Gestão operacional da fábrica

- 2º Produção

- 3º Estoque

- 4º Expedição

- 5º Instalação

- 6º Indicadores

- 7º Faturamento/Fiscal/Financeiro — futuro

O desenvolvimento deverá respeitar essa prioridade, sem antecipar
funcionalidades financeiras que ainda não tenham suas regras de negócio
definidas.

# 12. Objetivo final

Construir um SaaS capaz de acompanhar toda a operação da fábrica de
vidraçaria, proporcionando:

- Controle

- Organização

- Rastreabilidade

- Padronização

- Redução de erros

- Visibilidade da produção

- Controle de estoque

- Controle das instalações

- Gestão de prazos

- Indicadores gerenciais

- Base preparada para integração fiscal e financeira
