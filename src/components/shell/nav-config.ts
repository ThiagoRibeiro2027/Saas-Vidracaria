import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: "Qualidade", href: "/qualidade", icon: BadgeCheck },
      { label: "Estoque", href: "/estoque", icon: Boxes },
      { label: "Expedição", href: "/expedicao", icon: Truck },
      { label: "Instalação", href: "/instalacao", icon: Wrench },
      { label: "Instalação — Campo (PWA)", href: "/campo", icon: Smartphone },
      { label: "Suprimentos", href: "/suprimentos", icon: PackageSearch },
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
