import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  ListOrdered,
  Puzzle,
  Ruler,
  Factory,
  BadgeCheck,
  Boxes,
  Truck,
  Wrench,
  Smartphone,
  PackageSearch,
  Wallet,
  Receipt,
  Users,
  BarChart3,
  UserCog,
  BookUser,
  ShieldCheck,
  Settings,
  History,
  FileStack,
  Download,
  Plug,
  FileSignature,
  Handshake,
  Scale,
  PackageCheck,
  Inbox,
  Award,
  Map,
  Calculator,
  Gauge,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Só pra casos como Compras, onde a rota "raiz" do módulo (/compras)
  // é irmã de outras rotas do mesmo módulo (/compras/solicitacoes...),
  // não uma seção genérica delas — sem isso, o destaque por prefixo
  // (Sidebar.tsx) marcaria a raiz como ativa em qualquer sub-rota.
  exact?: boolean;
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
      { label: "Comercial", href: "/comercial", icon: ShoppingCart },
      { label: "Pedidos", href: "/pedidos", icon: ClipboardList },
      { label: "Engenharia", href: "/engenharia", icon: Ruler },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Produção", href: "/producao", icon: Factory },
      { label: "Fila de Produção", href: "/fila-producao", icon: ListOrdered },
      { label: "Peças Fabricadas", href: "/pecas", icon: Puzzle },
      { label: "Qualidade", href: "/qualidade", icon: BadgeCheck },
      { label: "Estoque", href: "/estoque", icon: Boxes },
      { label: "Expedição", href: "/expedicao", icon: Truck },
      { label: "Instalação", href: "/instalacao", icon: Wrench },
      { label: "Instalação — Campo (PWA)", href: "/campo", icon: Smartphone },
      { label: "Suprimentos", href: "/suprimentos", icon: PackageSearch },
      // Compras (ADR-011, 9 fases) mora em rotas separadas, não em abas
      // ?tab= — sem uma entrada própria por fase, as fases além da 1ª só
      // eram alcançáveis por um link dentro do texto de /compras (achado
      // de teste manual, 27/09/2026).
      { label: "Compras — Fornecedores e Políticas", href: "/compras", icon: Handshake, exact: true },
      { label: "Compras — Solicitações", href: "/compras/solicitacoes", icon: ClipboardList },
      { label: "Compras — Cotações", href: "/compras/cotacoes", icon: Scale },
      { label: "Compras — Pedidos", href: "/compras/pedidos", icon: PackageCheck },
      { label: "Compras — Recebimentos", href: "/compras/recebimentos", icon: Inbox },
      { label: "Compras — Avaliação de Fornecedores", href: "/compras/fornecedores", icon: Award },
      { label: "Compras — Mapa de Necessidades", href: "/compras/mapa", icon: Map },
      { label: "Compras — Orçado × Realizado", href: "/compras/orcamento", icon: Calculator },
      { label: "Compras — Dashboard", href: "/compras/dashboard", icon: Gauge },
      { label: "Compras — Configurações", href: "/compras/configuracoes", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Gestão",
    items: [
      { label: "Financeiro", href: "/financeiro", icon: Wallet },
      { label: "Fiscal", href: "/fiscal", icon: Receipt },
      { label: "RH", href: "/rh", icon: Users },
      { label: "Contratos", href: "/contratos", icon: FileSignature },
      { label: "BI (Indicadores)", href: "/bi", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Usuários e Permissões", href: "/usuarios", icon: UserCog },
      { label: "Cadastros", href: "/cadastros", icon: BookUser },
      { label: "Integrações", href: "/integracoes", icon: Plug },
      { label: "Governança", href: "/governance", icon: ShieldCheck },
      { label: "Configurações", href: "/configuracoes", icon: Settings },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Auditoria", href: "/audit", icon: History },
      { label: "Arquivos", href: "/files", icon: FileStack },
      { label: "Exportar dados", href: "/export", icon: Download },
    ],
  },
];

export const HOME_ITEM: NavItem = { label: "Início", href: "/", icon: LayoutDashboard };
