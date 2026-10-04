// TÓPICO 13 §29, Fase 8a — registro das entidades importáveis.
//
// Fonte única, consumida pela tela E pelas Server Actions. Antes cada
// entidade tinha bloco próprio na tela e um par de actions só dela; com
// duas entidades isso era aceitável, com vinte e quatro vira um convite a
// divergência (uma ganha validação de tamanho e a outra não, uma revalida
// a rota certa e a outra não).
//
// Acrescentar uma entidade = uma entrada aqui + a função importar_<x> no
// banco. Nada na tela, nada nas actions.
//
// A chave é validada contra este registro em toda action: o cliente manda
// o nome da entidade no formulário, e nome que não está aqui é recusado
// antes de qualquer chamada ao banco. É a mesma disciplina do
// exportar_dados_csv (regra 8 do CLAUDE.md) — "ação" é sempre importar, só
// a entidade varia, e a entidade é sempre conferida contra uma lista fixa.

export type EntidadeImportacao = {
  /** Gravado em importacoes.entidade. Precisa existir no mapa da migration. */
  chave: string;
  /**
   * Recurso de permissão exigido (<recurso>.manage). Espelha o mapa
   * recurso_permissao_importacao() da migration 20261202000000, e serve
   * só para a tela não oferecer um bloco que o usuário não pode usar.
   * Quem decide de fato é o banco: a função de importação carrega o gate
   * de verdade, então divergir aqui esconde ou mostra um bloco, nunca
   * concede acesso.
   */
  recursoPermissao: string;
  rotulo: string;
  modulo: string;
  /** Função SQL importar_<x>(p_linhas, p_dry_run, p_arquivo_nome, p_origem_importacao_id). */
  rpc: string;
  /** Campos que o mapeamento pode escolher como destino. */
  campos: readonly string[];
  /** 2ª e 3ª colunas devolvidas pela função, mostradas na conferência. */
  colunaIdentificador: string;
  colunaRotulo: string;
  /** Rota revalidada após a gravação — a tela do módulo dono do dado. */
  caminhoRevalidar: string;
  /** Aparece abaixo do título do bloco. Diz o pré-requisito, quando há. */
  descricao: string;
};

export const ENTIDADES_IMPORTACAO: readonly EntidadeImportacao[] = [
  {
    chave: "pessoas",
    recursoPermissao: "pessoas",
    rotulo: "Pessoas (clientes/fornecedores)",
    modulo: "Comercial",
    rpc: "importar_pessoas",
    campos: [
      "tipo_documento",
      "documento",
      "nome",
      "nome_fantasia",
      "telefone",
      "email",
      "logradouro",
      "cidade",
      "uf",
      "cep",
    ],
    colunaIdentificador: "documento",
    colunaRotulo: "nome",
    caminhoRevalidar: "/cadastros",
    descricao:
      "Cliente e fornecedor são a mesma pessoa — o papel é definido à parte. O documento é a chave: linha com documento já existente atualiza, não duplica.",
  },
  {
    chave: "itens",
    recursoPermissao: "itens",
    rotulo: "Itens (produtos/materiais)",
    modulo: "Engenharia",
    rpc: "importar_itens",
    campos: ["codigo", "descricao", "tipo", "classificacao", "unidade_principal"],
    colunaIdentificador: "codigo",
    colunaRotulo: "descricao",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Produto e material são o mesmo cadastro, diferenciados pelo tipo. O código é a chave.",
  },
  {
    chave: "pessoa_papeis",
    recursoPermissao: "pessoas",
    rotulo: "Papéis da pessoa (cliente / fornecedor)",
    modulo: "Comercial",
    rpc: "importar_pessoa_papeis",
    campos: ["documento_pessoa", "papel", "ativo"],
    colunaIdentificador: "documento",
    colunaRotulo: "papel",
    caminhoRevalidar: "/cadastros",
    descricao:
      "Define quem é CLIENTE e quem é FORNECEDOR. A mesma pessoa pode ter os dois papéis — nesse caso, uma linha para cada. Importe Pessoas antes.",
  },
  {
    chave: "obras",
    recursoPermissao: "obras",
    rotulo: "Obras",
    modulo: "Comercial",
    rpc: "importar_obras",
    campos: ["documento_cliente", "nome", "logradouro", "cidade", "uf", "cep"],
    colunaIdentificador: "documento",
    colunaRotulo: "nome",
    caminhoRevalidar: "/cadastros",
    descricao:
      "Exige que o cliente já exista e tenha o papel CLIENTE — importe Pessoas antes. A obra é identificada por cliente + nome.",
  },
  {
    chave: "itens_dimensional",
    recursoPermissao: "itens",
    rotulo: "Itens — controle dimensional",
    modulo: "Engenharia",
    rpc: "importar_itens_dimensional",
    campos: ["codigo_item", "dimensao_tipo", "peso_por_unidade_dimensao"],
    colunaIdentificador: "codigo",
    colunaRotulo: "dimensao",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Só para item controlado por peça física: barra e perfil (linear, em metro) ou chapa, bobina e vidro (área, em m²). Não cria item — liga o controle num item que já existe.",
  },
  {
    chave: "pecas",
    recursoPermissao: "pecas",
    rotulo: "Peças",
    modulo: "Engenharia",
    rpc: "importar_pecas",
    campos: ["codigo_item", "descricao_tecnica"],
    colunaIdentificador: "codigo",
    colunaRotulo: "descricao",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Transforma um item existente em peça (a que tem composição e configurador). Importe Itens antes. A descrição técnica não é alterável por importação depois de criada.",
  },
  {
    chave: "peca_composicao",
    recursoPermissao: "pecas",
    rotulo: "Composição da peça (lista de materiais)",
    modulo: "Engenharia",
    rpc: "importar_peca_composicao",
    campos: [
      "codigo_peca",
      "codigo_material",
      "quantidade_por_unidade",
      "tipo_calculo",
      "percentual_perda",
      "observacao",
    ],
    colunaIdentificador: "peca",
    colunaRotulo: "material",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Uma linha por material que entra na peça. tipo_calculo fixo/linear/area define se a quantidade é fixa ou calculada pela dimensão. Importe Peças antes.",
  },
  {
    chave: "peca_caracteristicas",
    recursoPermissao: "pecas",
    rotulo: "Características da peça (configurador)",
    modulo: "Engenharia",
    rpc: "importar_peca_caracteristicas",
    campos: [
      "codigo_peca",
      "nome",
      "tipo",
      "unidade",
      "opcoes",
      "obrigatoria",
      "papel_dimensional",
    ],
    colunaIdentificador: "peca",
    colunaRotulo: "caracteristica",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Campos que o vendedor preenche ao configurar a peça. Em tipo opcao, a coluna opcoes recebe os valores separados por vírgula. O tipo não é alterável depois de criado.",
  },
  {
    chave: "peca_regras",
    recursoPermissao: "pecas",
    rotulo: "Regras da peça (configurador)",
    modulo: "Engenharia",
    rpc: "importar_peca_regras",
    campos: [
      "codigo_peca",
      "nome_caracteristica",
      "operador",
      "valor_comparacao_numero",
      "valor_comparacao_texto",
      "acao",
      "codigo_material_acao",
      "acao_quantidade",
      "motivo",
    ],
    colunaIdentificador: "peca",
    colunaRotulo: "caracteristica",
    caminhoRevalidar: "/engenharia",
    descricao:
      "Regra automática do configurador. Importe Características antes. Reimportar o mesmo arquivo não duplica regra: regra ativa equivalente é reconhecida e mantida.",
  },
  {
    chave: "recursos_produtivos",
    recursoPermissao: "producao",
    rotulo: "Recursos produtivos",
    modulo: "Produção",
    rpc: "importar_recursos_produtivos",
    campos: ["codigo", "nome", "tipo", "setor", "capacidade_horas_dia", "localizacao", "custo_hora"],
    colunaIdentificador: "codigo",
    colunaRotulo: "nome",
    caminhoRevalidar: "/producao",
    descricao:
      "Máquinas, postos, equipes e ferramentas que executam as operações. O custo por hora alimenta a mão de obra automática. O tipo não é alterável depois de criado.",
  },
  {
    chave: "roteiros_produtivos",
    recursoPermissao: "producao",
    rotulo: "Roteiros produtivos",
    modulo: "Produção",
    rpc: "importar_roteiros_produtivos",
    campos: ["codigo_item", "nome", "ativo"],
    colunaIdentificador: "item",
    colunaRotulo: "roteiro",
    caminhoRevalidar: "/producao",
    descricao: "Um roteiro por item fabricado. Importe Itens antes; as operações vêm no bloco seguinte.",
  },
  {
    chave: "roteiro_operacoes",
    recursoPermissao: "producao",
    rotulo: "Operações do roteiro",
    modulo: "Produção",
    rpc: "importar_roteiro_operacoes",
    campos: [
      "codigo_item",
      "nome_roteiro",
      "sequencia",
      "descricao",
      "codigo_recurso",
      "tempo_previsto_minutos",
      "requisitos",
      "criterios_qualidade",
      "perfil",
      "ferramenta",
      "processo",
    ],
    colunaIdentificador: "roteiro",
    colunaRotulo: "operacao",
    caminhoRevalidar: "/producao",
    descricao:
      "Passo a passo da fabricação, na ordem da sequência. Importe Roteiros e Recursos antes. Sequência já ocupada é reportada, nunca sobrescrita.",
  },
  {
    chave: "estoque_saldos",
    recursoPermissao: "estoque",
    rotulo: "Estoque inicial",
    modulo: "Estoque",
    rpc: "importar_estoque_saldos",
    campos: ["codigo_item", "quantidade_fisica"],
    colunaIdentificador: "codigo",
    colunaRotulo: "quantidade",
    caminhoRevalidar: "/estoque",
    descricao:
      "Saldo do dia da virada, na unidade principal do item. A quantidade é o valor final desejado, não um acréscimo: reimportar o mesmo arquivo não soma de novo.",
  },
  {
    chave: "itens_pecas_dimensionais",
    recursoPermissao: "estoque",
    rotulo: "Peças em estoque (dimensional)",
    modulo: "Estoque",
    rpc: "importar_itens_pecas_dimensionais",
    campos: [
      "codigo_item",
      "identificador",
      "quantidade_original",
      "quantidade_disponivel",
      "observacao",
    ],
    colunaIdentificador: "codigo",
    colunaRotulo: "identificacao",
    caminhoRevalidar: "/estoque",
    descricao:
      "Cada barra ou chapa individual. Sem identificador, duas linhas iguais são duas peças distintas — que é o caso legítimo de duas barras iguais. Importe Itens - Controle Dimensional antes.",
  },
  {
    chave: "item_fornecedores",
    recursoPermissao: "compras",
    rotulo: "Fornecedor por item",
    modulo: "Suprimentos",
    rpc: "importar_item_fornecedores",
    campos: [
      "codigo_item",
      "documento_fornecedor",
      "principal",
      "prioridade",
      "homologado",
      "preco_referencia",
      "condicoes",
    ],
    colunaIdentificador: "item",
    colunaRotulo: "fornecedor",
    caminhoRevalidar: "/suprimentos",
    descricao:
      "Quais fornecedores atendem cada item. Marcar principal desmarca os demais do mesmo item. Importe Itens e Pessoas antes.",
  },
  {
    chave: "item_materiais_alternativos",
    recursoPermissao: "compras",
    rotulo: "Materiais alternativos",
    modulo: "Suprimentos",
    rpc: "importar_item_materiais_alternativos",
    campos: [
      "codigo_item_origem",
      "codigo_item_equivalente",
      "exige_aprovacao",
      "regra_substituicao",
    ],
    colunaIdentificador: "origem",
    colunaRotulo: "equivalente",
    caminhoRevalidar: "/suprimentos",
    descricao:
      "Item que pode substituir outro. Coluna exige_aprovacao vazia significa SIM — exigir aprovação é o padrão seguro para troca de material.",
  },
  {
    chave: "fornecedor_dados",
    recursoPermissao: "compras",
    rotulo: "Dados do fornecedor",
    modulo: "Suprimentos",
    rpc: "importar_fornecedor_dados",
    campos: [
      "documento_fornecedor",
      "prazo_pagamento_dias",
      "lead_time_dias",
      "banco",
      "agencia",
      "conta",
      "tipo_conta",
      "chave_pix",
      "condicoes_padrao",
      "homologado",
    ],
    colunaIdentificador: "documento",
    colunaRotulo: "banco",
    caminhoRevalidar: "/suprimentos",
    descricao: "Dados comerciais e bancários de quem tem papel FORNECEDOR. Importe Pessoas antes.",
  },
  {
    chave: "politicas_abastecimento",
    recursoPermissao: "compras",
    rotulo: "Política de abastecimento",
    modulo: "Suprimentos",
    rpc: "importar_politicas_abastecimento",
    campos: [
      "codigo_item",
      "tipo",
      "estoque_minimo",
      "estoque_seguranca",
      "ponto_reposicao",
      "lote_minimo",
      "lote_economico",
      "multiplo",
      "documento_fornecedor_preferencial",
    ],
    colunaIdentificador: "codigo",
    colunaRotulo: "tipo",
    caminhoRevalidar: "/suprimentos",
    descricao:
      "Como cada item é reposto. Sem linha aqui, o item é tratado como sob_demanda. Importe Itens antes.",
  },
  {
    chave: "funcionarios",
    recursoPermissao: "rh",
    rotulo: "Funcionários",
    modulo: "RH",
    rpc: "importar_funcionarios",
    campos: [
      "nome",
      "cargo",
      "funcao",
      "telefone",
      "email",
      "data_admissao",
      "unidade",
      "matricula_usuario",
      "status",
      "observacoes",
    ],
    colunaIdentificador: "nome",
    colunaRotulo: "cargo",
    caminhoRevalidar: "/rh",
    descricao:
      "Quadro de pessoal. Sem chave única no banco: a matrícula do usuário identifica quando informada, senão o nome — e nome repetido é recusado, pedindo a matrícula.",
  },
  {
    chave: "equipes_instalacao",
    recursoPermissao: "instalacao",
    rotulo: "Equipes de instalação",
    modulo: "Instalação",
    rpc: "importar_equipes_instalacao",
    campos: ["nome_equipe", "matricula_membro"],
    colunaIdentificador: "equipe",
    colunaRotulo: "membro",
    caminhoRevalidar: "/instalacao",
    descricao:
      "Uma linha por membro: repita o nome da equipe em cada um. A equipe é criada na primeira linha que a menciona.",
  },
  {
    chave: "contas_bancarias",
    recursoPermissao: "financeiro",
    rotulo: "Contas bancárias",
    modulo: "Financeiro",
    rpc: "importar_contas_bancarias",
    campos: ["banco", "agencia", "conta", "tipo_conta", "pix_chave", "ativa"],
    colunaIdentificador: "banco",
    colunaRotulo: "conta",
    caminhoRevalidar: "/financeiro",
    descricao: "Contas da empresa. Sem chave única no banco: a identificação é banco + agência + conta.",
  },
  {
    chave: "cutting_margin_settings",
    recursoPermissao: "configuracoes",
    rotulo: "Margem de quebra",
    modulo: "Configurações",
    rpc: "importar_cutting_margin_settings",
    campos: ["material_tipo", "processo", "percentual", "ativo"],
    colunaIdentificador: "material",
    colunaRotulo: "processo",
    caminhoRevalidar: "/configuracoes",
    descricao:
      "Perda por tipo de material e processo. material_tipo deve casar com a classificação usada nos itens. Processo vazio vale para qualquer processo — é um valor, não ausência.",
  },
  {
    chave: "measurement_rules",
    recursoPermissao: "configuracoes",
    rotulo: "Regra de medição",
    modulo: "Configurações",
    rpc: "importar_measurement_rules",
    campos: ["tipo_item", "exige_medicao_confirmada", "ativo"],
    colunaIdentificador: "tipo",
    colunaRotulo: "exige",
    caminhoRevalidar: "/configuracoes",
    descricao:
      "Quais tipos de item exigem medição confirmada em obra. Coluna vazia assume NÃO: exigir medição trava produção, então só vale quando dito explicitamente.",
  },
  {
    chave: "calendario_feriados",
    recursoPermissao: "configuracoes",
    rotulo: "Feriados",
    modulo: "Configurações",
    rpc: "importar_calendario_feriados",
    campos: ["data", "descricao"],
    colunaIdentificador: "data_feriado",
    colunaRotulo: "descricao",
    caminhoRevalidar: "/configuracoes",
    descricao: "Dias não úteis, usados no cálculo de prazo e capacidade. Data no formato AAAA-MM-DD.",
  },
];

export function entidadePorChave(chave: string): EntidadeImportacao | undefined {
  return ENTIDADES_IMPORTACAO.find((e) => e.chave === chave);
}

/** Recursos distintos exigidos — o que a página precisa consultar. */
export const RECURSOS_IMPORTACAO: readonly string[] = [
  ...new Set(ENTIDADES_IMPORTACAO.map((e) => e.recursoPermissao)),
];
