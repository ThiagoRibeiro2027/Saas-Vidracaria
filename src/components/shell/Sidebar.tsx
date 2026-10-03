"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { HOME_ITEM, NAV_GROUPS, type NavChild, type NavItem } from "./nav-config";

type TreeNode = NavItem | NavChild;

function ownRouteMatches(node: { href: string; exact?: boolean }, pathname: string) {
  return node.href === "/" || node.exact
    ? pathname === node.href
    : pathname === node.href || pathname.startsWith(`${node.href}/`);
}

// Um nó "contém" a rota atual se ele mesmo bate, ou algum descendente (em
// qualquer profundidade) bate — precisa disso pra destacar um pai como
// "Suprimentos" quando a rota ativa é de um filho com href totalmente
// diferente (ex. /estoque, /compras), não só prefixo do próprio href.
function subtreeContainsRoute(node: TreeNode, pathname: string): boolean {
  if (ownRouteMatches(node, pathname)) return true;
  return (node.children ?? []).some((c) => subtreeContainsRoute(c, pathname));
}

// Só relevante pra nós com filhos endereçados por ?tab= — resolve a aba
// efetiva do nó (da query string, ou a primeira aba com `tab` quando a URL
// não tem `?tab=` nenhum, mesmo fallback que cada page.tsx já aplica no
// servidor). Roda por nível: cada pai resolve sua própria aba pros filhos
// diretos, não a do nó lá em cima.
function activeTabSlug(node: TreeNode, pathname: string, searchParams: URLSearchParams) {
  if (!node.children || pathname !== node.href) return undefined;
  const fromQuery = searchParams.get("tab");
  if (fromQuery) return fromQuery;
  return node.children.find((c) => "tab" in c && c.tab !== undefined)?.tab;
}

// Todos os hrefs de nós-com-filhos, em qualquer profundidade, cuja subárvore
// contém a rota atual — usado pra auto-expandir a cadeia inteira (ex.:
// Suprimentos E Estoque ao mesmo tempo ao entrar em /estoque?tab=reserva).
function collectActiveParentHrefs(nodes: TreeNode[], pathname: string): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.children?.length && subtreeContainsRoute(node, pathname)) {
      result.push(node.href);
      result.push(...collectActiveParentHrefs(node.children, pathname));
    }
  }
  return result;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-active-bg text-sidebar-fg-active font-medium"
          : "text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-active"
      }`}
    >
      <Icon size={16} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavChildLink({ child, active }: { child: NavChild; active: boolean }) {
  return (
    <Link
      href={child.href}
      className={`truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-sidebar-active-bg text-sidebar-fg-active font-medium"
          : "text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-active"
      }`}
    >
      {child.label}
    </Link>
  );
}

// Um nó da árvore, recursivo — funciona tanto pro item de topo (com ícone)
// quanto pra qualquer profundidade de filho (ex.: Suprimentos → Estoque →
// Saldo por item). `activeTab` é a aba já resolvida pelo PAI (só importa
// quando este nó é filho endereçado por `?tab=`); cada nível resolve a
// própria `activeTab` pros seus filhos diretos via activeTabSlug.
function NavNode({
  node,
  isTopLevel,
  pathname,
  searchParams,
  openSet,
  toggle,
  activeTab,
}: {
  node: TreeNode;
  isTopLevel: boolean;
  pathname: string;
  searchParams: URLSearchParams;
  openSet: Set<string>;
  toggle: (href: string) => void;
  activeTab: string | undefined;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = hasChildren && openSet.has(node.href);
  const childTab = "tab" in node ? node.tab : undefined;
  const active = childTab !== undefined ? childTab === activeTab : subtreeContainsRoute(node, pathname);
  const ownActiveTab = activeTabSlug(node, pathname, searchParams);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        {isTopLevel ? <NavLink item={node as NavItem} active={active} /> : <NavChildLink child={node as NavChild} active={active} />}
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggle(node.href)}
            aria-label={isOpen ? `Recolher ${node.label}` : `Expandir ${node.label}`}
            aria-expanded={isOpen}
            className="shrink-0 rounded-md p-1.5 text-sidebar-fg/70 transition-colors hover:bg-white/5 hover:text-sidebar-fg-active"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <div className="ml-[27px] mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border/60 pl-2">
          {node.children!.map((child) => (
            <NavNode
              key={child.href}
              node={child}
              isTopLevel={false}
              pathname={pathname}
              searchParams={searchParams}
              openSet={openSet}
              toggle={toggle}
              activeTab={ownActiveTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Toda a cadeia de módulos (em qualquer profundidade) cuja rota atual
  // esteja dentro expande sozinha ao navegar — aditivo (nunca fecha os
  // outros já abertos); só o clique manual no chevron recolhe. A Sidebar
  // não desmonta entre navegações client-side (faz parte do shell
  // persistente), então não precisa de localStorage pra isso.
  const activeParentHrefs = NAV_GROUPS.flatMap((g) => collectActiveParentHrefs(g.items, pathname));
  const activeKey = activeParentHrefs.join("|");

  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(activeParentHrefs));
  // Ajuste de estado durante a renderização (não num efeito) pra evitar
  // cascata de re-render — mesmo padrão documentado pelo React pra "estado
  // derivado de uma prop que muda": só dispara quando a cadeia ativa muda
  // de verdade, nunca a cada render.
  const [lastActiveKey, setLastActiveKey] = useState(activeKey);
  if (activeKey !== lastActiveKey) {
    setLastActiveKey(activeKey);
    const missing = activeParentHrefs.filter((href) => !openSet.has(href));
    if (missing.length > 0) {
      const next = new Set(openSet);
      missing.forEach((href) => next.add(href));
      setOpenSet(next);
    }
  }

  function toggle(href: string) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar-bg px-3 py-4 md:flex">
      <div className="mb-4 px-3">
        <span className="text-sm font-semibold text-sidebar-fg-active">Vidraçaria</span>
      </div>

      <nav className="flex flex-col gap-4">
        <NavLink item={HOME_ITEM} active={ownRouteMatches(HOME_ITEM, pathname)} />

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-fg/60">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavNode
                  key={item.href}
                  node={item}
                  isTopLevel
                  pathname={pathname}
                  searchParams={searchParams}
                  openSet={openSet}
                  toggle={toggle}
                  activeTab={undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
