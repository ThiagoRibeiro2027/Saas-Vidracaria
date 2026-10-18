# Melhorias — Projeto SaaS Vidraçaria

> Convertido de `Melhorias.pages` em 17/10/2026 para que o Claude Code consiga
> gerenciar o status de cada item (arquivos `.pages` são um formato binário da
> Apple, não editável por aqui). O `.pages` original foi mantido na pasta,
> sem alterações, como referência/backup.
>
> Status de cada item confirmado por investigação direta no código
> (migrations + telas), não por suposição.

## Concluídos

- [x] Roteiros devem ficar dentro de Engenharia
- [x] Paginação em cima das tabelas, com ajuste e memória da última posição
      do usuário (hoje ele perdia a referência ao retornar à página)
- [x] Cada tabela com campo de pesquisa, classificação e filtro
- [x] % de quebra atrelado ao cadastro do item (não separado como antes).
      Cada tipo de material pode ter seu próprio percentual de perda, mesmo
      pertencendo ao mesmo grupo de itens.
      — Implementado em 12-13/10/2026: coluna `itens.percentual_quebra`,
      mecanismo antigo (`cutting_margin_settings`, configuração por grupo em
      Configurações Gerais) removido. Ver
      `supabase/migrations/20261012235145_percentual_quebra_no_item.sql` e
      `supabase/migrations/20261013002413_remove_margem_quebra_antiga.sql`.

- [x] Característica de cor no cadastro de itens (item-base + variantes de
      cor, cada variante com seu próprio código).
      — Implementado em 17/10/2026 **só em homologação (não promovido à
      main)**: colunas `itens.item_pai_id` e `itens.cor`, `upsert_item()` e
      `importar_itens()` estendidos, botão "+ Variante de cor" no cadastro
      de itens. Migration `20261017210000_cor_variante_item.sql`.
- [x] Indicadores na Visão Geral de Comercial: valor orçado, valor em aberto,
      taxa de conversão e motivos de não aprovação.
      — Implementado em 17/10/2026 **só em homologação (não promovido à
      main)**. Rejeitar orçamento agora exige o motivo (mesma lista de
      motivos de perda das oportunidades); rejeitados antigos aparecem como
      "Não informado". Migration `20261017220000_comercial_indicadores_motivo_rejeicao.sql`.
- [x] LGPD — manter nome, telefone, e-mail e endereço e mascarar só o CPF.
      — Implementado em 17/10/2026 **só em homologação (não promovido à
      main)**, como AÇÃO SEPARADA da anonimização (decisão do responsável,
      porque manter os dados de contato deixa a pessoa identificável e não
      seria anonimização de fato): botão "Ocultar CPF/CNPJ" apaga o número
      completo e guarda só `034.***.***-00`. A "Anonimizar dados (LGPD)"
      (pedido do titular) continua eliminando tudo e agora também apaga a
      máscara. Migration `20261017230000_ocultar_documento_pessoa.sql`.
- [x] Configurações gerais: unidade de medida padrão por empresa.
      — Já implementado em 12-13/10/2026 (migration
      `20261013000749_unidades_medida_padrao.sql`, aba "Unidades de medida").
- [x] "Fila de Produção" dentro do menu Produção.
      — Já implementado em 12/10/2026 (aba `/producao?tab=fila`).
- [x] Estoque e Compras unificados sob "Suprimentos".
      — Implementado em 17/10/2026 **só em homologação**: o menu deixou de ter
      os sub-grupos "Estoque" e "Compras"; as rotinas dos dois ficam numa
      lista única sob Suprimentos (só navegação, sem mudança de banco).
- [x] Apontamento da OP pelo operador, por operação do roteiro, via QR Code no
      celular, com hora de início e fim.
      — Implementado em 17/10/2026 **só em homologação (não promovido à
      main)**: o QR da etiqueta abre `/producao/apontar/<OP>` (tela de uma
      coluna para celular) com as operações da OP; "Iniciar" grava hora e
      operador (`iniciar_operacao_lote`, migration
      `20261018000000_iniciar_operacao_apontamento.sql`); "Finalizar /
      registrar" informa produzido/perdido/retrabalho e a operação conclui,
      com hora de fim e tempo. Leitura do QR é pela câmera do celular (a tela
      não tem leitor embutido) e o operador precisa estar logado.

- [x] Margem de venda por item do orçamento (em vez de um percentual único).
      — Implementado em 17/10/2026 **só em homologação (não promovido à
      main)**: no formulário do item configurável há o campo "Margem %"
      (em branco = usa a margem da empresa, mostrada como sugestão); o preço
      sugerido usa a margem do item e a margem aplicada fica gravada na linha
      (`orcamento_itens.margem_percentual`). Valor entre 0 e 99,99. Preço
      digitado à mão não grava margem. Migration
      `20261018010000_margem_por_item_orcamento.sql`.
      Pontos em aberto: vale só para itens configuráveis (os que têm custo
      calculado; item comum segue com preço digitado); não há limite de
      alçada/desconto máximo por usuário — qualquer vendedor pode baixar a
      margem; o texto "proposta" do pedido original foi descartado quando
      "Gerar proposta" saiu do sistema.

- [x] Pedidos: aviso de confirmação ao cancelar e opção de reabrir o pedido.
      — Implementado em 18/10/2026 **só em homologação (não promovido à
      main)**: "Cancelar" pergunta antes; o pedido cancelado ganha "Reabrir
      pedido" (em Pedidos e no bloco "Pedido" do Orçamento), voltando a
      "recebido" com o mesmo número e itens (as pendências já encerradas no
      cancelamento continuam encerradas). Reabertura auditada. Migration
      `20261019000000_excluir_variaveis_e_reabrir_pedido.sql`.
- [x] Variáveis do configurador: excluir e recolher os campos de cadastro.
      — Implementado em 18/10/2026 **só em homologação (não promovido à
      main)**: botões "Excluir" (variável) e "Excluir categoria", com
      confirmação; excluir variável em uso é permitido e as peças mantêm o
      campo como avulso. Cadastros ("+ Nova categoria", "+ Nova variável") e
      cada categoria são listas que recolhem. Mesma migration acima.

- [x] Margem de preço com impostos, regime tributário e markup.
      — Implementado em 18/10/2026 **só em homologação (não promovido à
      main)**: novo cadastro em Configurações → Margem de preço (regime:
      MEI, Simples, Presumido, Real; percentuais de Simples, ICMS, PIS,
      COFINS, ISS, IPI, comissão, despesas fixas e custo financeiro/frete).
      Preço sugerido = custo ÷ (1 − (encargos + margem de lucro)); o markup
      (multiplicador do **custo**) aparece na configuração e no orçamento.
      Sem encargos cadastrados, o preço é idêntico ao de antes. A margem por
      item continua trocando só o lucro. O sistema não sugere alíquotas (a
      empresa digita; confirmar com o contador). Migration
      `20261019010000_markup_encargos_preco.sql`.

- [x] Recursos e capacidade: horário de funcionamento (1ª etapa).
      — Implementado em 18/10/2026 **só em homologação (não promovido à
      main)**: nova aba Configurações → Horário de funcionamento (dias da
      semana, início, fim e intervalo; padrão seg–sex 8 h). A capacidade dos
      recursos passou de "horas/dia × 7 dias" para "horas/dia × dias úteis da
      janela de 7 dias". Migration
      `20261019020000_horario_funcionamento_capacidade.sql`. A capacidade do
      recurso continua valendo nos dias úteis da empresa (sem limitar pelas
      horas da empresa); recurso sem capacidade cadastrada segue valendo 0.

## Pendentes

- [ ] Capacidade, 2ª etapa: calendário mensal com feriados nacionais e
      municipais (nacionais pré-carregados; municipais cadastrados pela
      empresa; pontes/dias extras) para prever as horas disponíveis por mês.
      O ponto de encaixe já existe: `_dias_uteis_na_janela()` — a 2ª etapa só
      precisa acrescentar as exceções por data, sem tocar de novo nas funções
      de capacidade.
