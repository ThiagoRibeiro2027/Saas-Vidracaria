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
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**: colunas `itens.item_pai_id` e `itens.cor`, `upsert_item()` e
      `importar_itens()` estendidos, botão "+ Variante de cor" no cadastro
      de itens. Migration `20261017210000_cor_variante_item.sql`.
- [x] Indicadores na Visão Geral de Comercial: valor orçado, valor em aberto,
      taxa de conversão e motivos de não aprovação.
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**. Rejeitar orçamento agora exige o motivo (mesma lista de
      motivos de perda das oportunidades); rejeitados antigos aparecem como
      "Não informado". Migration `20261017220000_comercial_indicadores_motivo_rejeicao.sql`.
- [x] LGPD — manter nome, telefone, e-mail e endereço e mascarar só o CPF.
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**, como AÇÃO SEPARADA da anonimização (decisão do responsável,
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
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**: o menu deixou de ter
      os sub-grupos "Estoque" e "Compras"; as rotinas dos dois ficam numa
      lista única sob Suprimentos (só navegação, sem mudança de banco).
- [x] Apontamento da OP pelo operador, por operação do roteiro, via QR Code no
      celular, com hora de início e fim.
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**: o QR da etiqueta abre `/producao/apontar/<OP>` (tela de uma
      coluna para celular) com as operações da OP; "Iniciar" grava hora e
      operador (`iniciar_operacao_lote`, migration
      `20261018000000_iniciar_operacao_apontamento.sql`); "Finalizar /
      registrar" informa produzido/perdido/retrabalho e a operação conclui,
      com hora de fim e tempo. Leitura do QR é pela câmera do celular (a tela
      não tem leitor embutido) e o operador precisa estar logado.

- [x] Margem de venda por item do orçamento (em vez de um percentual único).
      — Implementado em 17/10/2026 **promovido à main em 18/10/2026**: no formulário do item configurável há o campo "Margem %"
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
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: "Cancelar" pergunta antes; o pedido cancelado ganha "Reabrir
      pedido" (em Pedidos e no bloco "Pedido" do Orçamento), voltando a
      "recebido" com o mesmo número e itens (as pendências já encerradas no
      cancelamento continuam encerradas). Reabertura auditada. Migration
      `20261019000000_excluir_variaveis_e_reabrir_pedido.sql`.
- [x] Variáveis do configurador: excluir e recolher os campos de cadastro.
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: botões "Excluir" (variável) e "Excluir categoria", com
      confirmação; excluir variável em uso é permitido e as peças mantêm o
      campo como avulso. Cadastros ("+ Nova categoria", "+ Nova variável") e
      cada categoria são listas que recolhem. Mesma migration acima.

- [x] Margem de preço com impostos, regime tributário e markup.
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: novo cadastro em Configurações → Margem de preço (regime:
      MEI, Simples, Presumido, Real; percentuais de Simples, ICMS, PIS,
      COFINS, ISS, IPI, comissão, despesas fixas e custo financeiro/frete).
      Preço sugerido = custo ÷ (1 − (encargos + margem de lucro)); o markup
      (multiplicador do **custo**) aparece na configuração e no orçamento.
      Sem encargos cadastrados, o preço é idêntico ao de antes. A margem por
      item continua trocando só o lucro. O sistema não sugere alíquotas (a
      empresa digita; confirmar com o contador). Migration
      `20261019010000_markup_encargos_preco.sql`.

- [x] Recursos e capacidade: horário de funcionamento (1ª etapa).
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: nova aba Configurações → Horário de funcionamento (dias da
      semana, início, fim e intervalo; padrão seg–sex 8 h). A capacidade dos
      recursos passou de "horas/dia × 7 dias" para "horas/dia × dias úteis da
      janela de 7 dias". Migration
      `20261019020000_horario_funcionamento_capacidade.sql`. A capacidade do
      recurso continua valendo nos dias úteis da empresa (sem limitar pelas
      horas da empresa); recurso sem capacidade cadastrada segue valendo 0.

- [x] Capacidade, 2ª etapa: calendário com feriados nacionais e municipais.
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: nova aba Configurações → Calendário de produção, com a grade do
      mês (dias de produção e horas de expediente), feriados nacionais
      calculados (Ano Novo, Sexta-feira Santa, Tiradentes, 1º de maio, 7 de
      setembro, 12 de outubro, Finados, 15 e 20 de novembro, Natal; Carnaval e
      Corpus Christi como pontos facultativos), e cadastro de feriado
      municipal, ponte, folga e dia extra (com horas opcionais). Feriados
      nacionais bloqueiam por padrão; pontos facultativos só bloqueiam se a
      empresa ligar a opção; um dia extra prevalece sobre qualquer feriado. A
      capacidade dos recursos usa o mesmo calendário (`_info_dia_empresa`).
      Migration `20261020000000_calendario_feriados_capacidade.sql`.
      Fora desta entrega: horas disponíveis por recurso no calendário mensal
      (hoje o mês mostra o expediente da empresa).

- [x] Recursos e capacidade abastecidos com as horas do horário de funcionamento.
      — Implementado em 18/10/2026 **promovido à main em 18/10/2026**: a capacidade parte das horas efetivas do horário de
      funcionamento. Recurso SEM horas próprias usa, em cada dia de produção
      da janela, as horas da empresa daquele dia (seg 8 h, sáb 4 h...);
      recurso COM horas próprias (ex.: máquina em 2 turnos) continua usando as
      dele. Dias sem produção (fim de semana, feriado, folga) não contam.
      Empresa sem horário cadastrado e recurso sem horas = 0. Migration
      `20261020010000_capacidade_horas_da_empresa.sql`. O campo "h/dia" no
      cadastro do recurso virou opcional (em branco = expediente da empresa).

## Pendentes

Nenhum item pendente nesta lista.
