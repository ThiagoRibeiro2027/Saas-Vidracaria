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
    rotulo: "Itens (produtos/materiais)",
    modulo: "Cadastros",
    rpc: "importar_itens",
    campos: ["codigo", "descricao", "tipo", "classificacao", "unidade_principal"],
    colunaIdentificador: "codigo",
    colunaRotulo: "descricao",
    caminhoRevalidar: "/cadastros",
    descricao:
      "Produto e material são o mesmo cadastro, diferenciados pelo tipo. O código é a chave.",
  },
  {
    chave: "pessoa_papeis",
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
    rotulo: "Itens — controle dimensional",
    modulo: "Cadastros",
    rpc: "importar_itens_dimensional",
    campos: ["codigo_item", "dimensao_tipo", "peso_por_unidade_dimensao"],
    colunaIdentificador: "codigo",
    colunaRotulo: "dimensao",
    caminhoRevalidar: "/cadastros",
    descricao:
      "Só para item controlado por peça física: barra e perfil (linear, em metro) ou chapa, bobina e vidro (área, em m²). Não cria item — liga o controle num item que já existe.",
  },
  {
    chave: "pecas",
    rotulo: "Peças",
    modulo: "Engenharia",
    rpc: "importar_pecas",
    campos: ["codigo_item", "descricao_tecnica"],
    colunaIdentificador: "codigo",
    colunaRotulo: "descricao",
    caminhoRevalidar: "/pecas",
    descricao:
      "Transforma um item existente em peça (a que tem composição e configurador). Importe Itens antes. A descrição técnica não é alterável por importação depois de criada.",
  },
  {
    chave: "peca_composicao",
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
    caminhoRevalidar: "/pecas",
    descricao:
      "Uma linha por material que entra na peça. tipo_calculo fixo/linear/area define se a quantidade é fixa ou calculada pela dimensão. Importe Peças antes.",
  },
  {
    chave: "peca_caracteristicas",
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
    caminhoRevalidar: "/pecas",
    descricao:
      "Campos que o vendedor preenche ao configurar a peça. Em tipo opcao, a coluna opcoes recebe os valores separados por vírgula. O tipo não é alterável depois de criado.",
  },
  {
    chave: "peca_regras",
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
    caminhoRevalidar: "/pecas",
    descricao:
      "Regra automática do configurador. Importe Características antes. Reimportar o mesmo arquivo não duplica regra: regra ativa equivalente é reconhecida e mantida.",
  },
];

export function entidadePorChave(chave: string): EntidadeImportacao | undefined {
  return ENTIDADES_IMPORTACAO.find((e) => e.chave === chave);
}
