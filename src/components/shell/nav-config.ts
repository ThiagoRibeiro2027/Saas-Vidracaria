import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  ListOrdered,
  Ruler,
  Factory,
  BadgeCheck,
  Truck,
  Wrench,
  Smartphone,
  PackageSearch,
  Wallet,
  Receipt,
  Users,
  BarChart3,
  UserCog,
  ShieldCheck,
  Settings,
  History,
  FileStack,
  Download,
  Upload,
  Plug,
  FileSignature,
  type LucideIcon,
} from "lucide-react";

// Filho endereçado por querystring (`?tab=slug`, ex.: Comercial, Produção)
// carrega `tab` — vários filhos do mesmo módulo compartilham a mesma
// `pathname`, então a Sidebar precisa comparar com searchParams.get("tab")
// pra saber qual está ativo, não só o href. Filho de sub-rota real (ex.:
// Compras, ADR-011) não tem `tab` — cada um já tem pathname próprio.
export type NavChild = {
  label: string;
  href: string;
  tab?: string;
  // Mesmo papel do NavItem.exact, necessário no filho-raiz de módulos com
  // sub-rota real (ex. Compras "/compras") — sem isso o prefix-match da
  // Sidebar marcaria essa raiz como ativa em qualquer sub-rota irmã.
  exact?: boolean;
  // Um filho pode ter seus próprios filhos (ex.: Suprimentos → Estoque →
  // Saldo/Reserva/Sobra) — Estoque e Compras viraram sub-módulos de
  // Suprimentos (2026-09-29, mesma alçada de negócio) sem perder a própria
  // navegação interna que já tinham. Sidebar.tsx renderiza isso
  // recursivamente, não só um nível.
  children?: NavChild[];
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Só pra casos como Compras, onde a rota "raiz" do módulo (/compras)
  // é irmã de outras rotas do mesmo módulo (/compras/solicitacoes...),
  // não uma seção genérica delas — sem isso, o destaque por prefixo
  // (Sidebar.tsx) marcaria a raiz como ativa em qualquer sub-rota.
  exact?: boolean;
  // Sub-rotinas do módulo, mostradas em árvore dentro da própria barra
  // lateral (2026-09-27) — substituem as abas horizontais que existiam
  // dentro da página (`Tabs`/`ComprasTabs`, ambos agora removidos das
  // páginas). A navegação não filtra por permissão (mesmo princípio já
  // documentado abaixo pros itens de topo) — um usuário sem acesso a uma
  // sub-rotina específica só cai no fallback da própria página ao clicar.
  children?: NavChild[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Espelha os módulos que hoje vivem na lista plana de src/app/page.tsx —
// nenhum item é filtrado por permissão aqui (cada página já faz seu próprio
// gate via has_permission()); a navegação não é uma fronteira de autorização.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Comercial",
    items: [
      {
        label: "Comercial",
        href: "/comercial",
        icon: ShoppingCart,
        children: [
          { label: "Visão geral", href: "/comercial", tab: "geral" },
          { label: "Orçamentos", href: "/comercial?tab=orcamentos", tab: "orcamentos" },
          { label: "Oportunidades", href: "/comercial?tab=oportunidades", tab: "oportunidades" },
          { label: "Clientes", href: "/comercial?tab=clientes", tab: "clientes" },
        ],
      },
      // "Propostas" (gerar/enviar/aceite) e "Conversão de orçamentos" deixaram
      // de ser telas à parte — viraram ações dentro do próprio orçamento
      // aprovado (ver OrcamentosSection.tsx), reduzindo 2 telas por uma única
      // (comentário datado: fusão decidida em conversa com o usuário,
      // 2026-10-03).
      {
        label: "Pedidos",
        href: "/pedidos",
        icon: ClipboardList,
      },
      {
        label: "Engenharia",
        href: "/engenharia",
        icon: Ruler,
        children: [
          { label: "Visão geral", href: "/engenharia", tab: "geral" },
          { label: "Itens a fabricar", href: "/engenharia?tab=fabricar", tab: "fabricar" },
          { label: "Cadastro de itens", href: "/engenharia?tab=itens", tab: "itens" },
          { label: "Pré-engenharia", href: "/engenharia?tab=pre-engenharia", tab: "pre-engenharia" },
          { label: "Roteiros", href: "/engenharia?tab=roteiros", tab: "roteiros" },
        ],
      },
    ],
  },
  {
    label: "Operação",
    items: [
      {
        label: "Produção",
        href: "/producao",
        icon: Factory,
        children: [
          { label: "Ordens de produção", href: "/producao", tab: "ordens" },
          { label: "Lotes fabris", href: "/producao?tab=lotes-fabris", tab: "lotes-fabris" },
          { label: "Recursos e capacidade", href: "/producao?tab=recursos", tab: "recursos" },
          { label: "Programação", href: "/producao?tab=programacao", tab: "programacao" },
          { label: "Horizontes", href: "/producao?tab=horizontes", tab: "horizontes" },
          { label: "Replanejamento", href: "/producao?tab=replanejamento", tab: "replanejamento" },
          { label: "Sequenciamento", href: "/producao?tab=sequenciamento", tab: "sequenciamento" },
          { label: "Rótulos de status", href: "/producao?tab=rotulos", tab: "rotulos" },
        ],
      },
      { label: "Fila de Produção", href: "/fila-producao", icon: ListOrdered },
      { label: "Qualidade", href: "/qualidade", icon: BadgeCheck },
      { label: "Expedição", href: "/expedicao", icon: Truck },
      {
        label: "Instalação",
        href: "/instalacao",
        icon: Wrench,
        children: [
          { label: "Visão geral", href: "/instalacao", tab: "geral" },
          { label: "Equipes", href: "/instalacao?tab=equipes", tab: "equipes" },
          { label: "Agenda de instalação", href: "/instalacao?tab=agenda", tab: "agenda" },
          { label: "Danos em obra", href: "/instalacao?tab=danos", tab: "danos" },
        ],
      },
      { label: "Instalação — Campo (PWA)", href: "/campo", icon: Smartphone },
      // Estoque, Compras e Suprimentos são a mesma alçada de negócio
      // (2026-09-29) — unidos num só item de topo, com Suprimentos como
      // principal (é quem abre ao clicar no rótulo); Estoque e Compras
      // entram como sub-módulos, cada um com a navegação interna que já
      // tinha (Compras continua em rotas reais, não ?tab=; ver
      // ComprasTabs.tsx, removido das páginas mas com o comentário do
      // porquê).
      {
        label: "Suprimentos",
        href: "/suprimentos",
        icon: PackageSearch,
        children: [
          {
            label: "Estoque",
            href: "/estoque",
            children: [
              { label: "Visão geral", href: "/estoque", tab: "geral" },
              { label: "Saldo por item", href: "/estoque?tab=saldo", tab: "saldo" },
              { label: "Reserva para pedidos", href: "/estoque?tab=reserva", tab: "reserva" },
              { label: "Registrar sobra", href: "/estoque?tab=sobra", tab: "sobra" },
              { label: "Peças dimensionais", href: "/estoque?tab=dimensional", tab: "dimensional" },
            ],
          },
          {
            label: "Compras",
            href: "/compras",
            children: [
              { label: "Fornecedores e Políticas", href: "/compras", exact: true },
              { label: "Solicitações", href: "/compras/solicitacoes" },
              { label: "Cotações", href: "/compras/cotacoes" },
              { label: "Pedidos", href: "/compras/pedidos" },
              { label: "Recebimentos", href: "/compras/recebimentos" },
              { label: "Avaliação de Fornecedores", href: "/compras/fornecedores" },
              { label: "Mapa de Necessidades", href: "/compras/mapa" },
              { label: "Orçado × Realizado", href: "/compras/orcamento" },
              { label: "Dashboard", href: "/compras/dashboard" },
              { label: "Configurações", href: "/compras/configuracoes" },
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        label: "Financeiro",
        href: "/financeiro",
        icon: Wallet,
        children: [
          { label: "Visão geral", href: "/financeiro", tab: "geral" },
          { label: "Títulos a receber", href: "/financeiro?tab=receber", tab: "receber" },
          { label: "Contas bancárias", href: "/financeiro?tab=contas", tab: "contas" },
          { label: "Alçada", href: "/financeiro?tab=alcada", tab: "alcada" },
          { label: "Confirmações", href: "/financeiro?tab=confirm", tab: "confirm" },
          { label: "Títulos a pagar", href: "/financeiro?tab=pagar", tab: "pagar" },
          { label: "Cobranças", href: "/financeiro?tab=cobranca", tab: "cobranca" },
          { label: "Movimentação", href: "/financeiro?tab=mov", tab: "mov" },
        ],
      },
      { label: "Fiscal", href: "/fiscal", icon: Receipt },
      {
        label: "RH",
        href: "/rh",
        icon: Users,
        children: [
          { label: "Visão geral", href: "/rh", tab: "geral" },
          { label: "Funcionários", href: "/rh?tab=funcionarios", tab: "funcionarios" },
          { label: "Documentos, EPI e habilitações", href: "/rh?tab=documentos", tab: "documentos" },
          { label: "Afastamentos e férias", href: "/rh?tab=afastamentos", tab: "afastamentos" },
        ],
      },
      { label: "Contratos", href: "/contratos", icon: FileSignature },
      { label: "BI (Indicadores)", href: "/bi", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        label: "Usuários e Permissões",
        href: "/usuarios",
        icon: UserCog,
        children: [
          { label: "Usuários", href: "/usuarios", tab: "usuarios" },
          { label: "Papéis e permissões", href: "/usuarios?tab=papeis", tab: "papeis" },
        ],
      },
      { label: "Integrações", href: "/integracoes", icon: Plug },
      { label: "Governança", href: "/governance", icon: ShieldCheck },
      {
        label: "Configurações",
        href: "/configuracoes",
        icon: Settings,
        children: [
          { label: "Numeração", href: "/configuracoes", tab: "numeracao" },
          { label: "Margem de quebra", href: "/configuracoes?tab=quebra", tab: "quebra" },
          { label: "Regra de medição", href: "/configuracoes?tab=medicao", tab: "medicao" },
          { label: "Alçada de aprovação", href: "/configuracoes?tab=alcada", tab: "alcada" },
          { label: "Margem de preço", href: "/configuracoes?tab=preco", tab: "preco" },
          { label: "Variáveis do configurador", href: "/configuracoes?tab=variaveis", tab: "variaveis" },
        ],
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Auditoria", href: "/audit", icon: History },
      { label: "Arquivos", href: "/files", icon: FileStack },
      { label: "Exportar dados", href: "/export", icon: Download },
      { label: "Importação", href: "/importacao", icon: Upload },
    ],
  },
];

export const HOME_ITEM: NavItem = { label: "Início", href: "/", icon: LayoutDashboard };
