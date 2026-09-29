"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { HOME_ITEM, NAV_GROUPS, type NavChild, type NavItem } from "./nav-config";

function isItemActive(item: NavItem, pathname: string) {
  return item.href === "/" || item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// Só relevante pra filhos endereçados por ?tab= — resolve a aba efetiva do
// módulo (da query string, ou a primeira aba com `tab` quando a URL não tem
// `?tab=` nenhum, mesmo fallback que cada page.tsx já aplica no servidor).
function activeTabSlug(item: NavItem, pathname: string, searchParams: URLSearchParams) {
  if (!item.children || pathname !== item.href) return undefined;
  const fromQuery = searchParams.get("tab");
  if (fromQuery) return fromQuery;
  return item.children.find((c) => c.tab !== undefined)?.tab;
}

function isChildActive(child: NavChild, pathname: string, activeTab: string | undefined) {
  if (child.tab !== undefined) return child.tab === activeTab;
  return child.exact ? pathname === child.href : pathname === child.href || pathname.startsWith(`${child.href}/`);
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

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Módulo cuja rota atual está ativa expande sozinho ao navegar — aditivo
  // (nunca fecha os outros já abertos); só o clique manual no chevron
  // recolhe. A Sidebar não desmonta entre navegações client-side (faz parte
  // do shell persistente), então não precisa de localStorage pra isso.
  const activeModule = NAV_GROUPS.flatMap((g) => g.items).find(
    (item) => item.children && isItemActive(item, pathname),
  );

  const [openSet, setOpenSet] = useState<Set<string>>(() => (activeModule ? new Set([activeModule.href]) : new Set()));
  // Ajuste de estado durante a renderização (não num efeito) pra evitar
  // cascata de re-render — mesmo padrão documentado pelo React pra "estado
  // derivado de uma prop que muda": só dispara quando o módulo ativo muda
  // de verdade, nunca a cada render.
  const [lastActiveHref, setLastActiveHref] = useState(activeModule?.href);
  if (activeModule?.href !== lastActiveHref) {
    setLastActiveHref(activeModule?.href);
    if (activeModule && !openSet.has(activeModule.href)) {
      setOpenSet(new Set(openSet).add(activeModule.href));
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
        <NavLink item={HOME_ITEM} active={isItemActive(HOME_ITEM, pathname)} />

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-fg/60">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const hasChildren = !!item.children?.length;
                const isOpen = hasChildren && openSet.has(item.href);
                const activeTab = activeTabSlug(item, pathname, searchParams);
                return (
                  <div key={item.href}>
                    <div className="flex items-center gap-0.5">
                      <NavLink item={item} active={isItemActive(item, pathname)} />
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggle(item.href)}
                          aria-label={isOpen ? `Recolher ${item.label}` : `Expandir ${item.label}`}
                          aria-expanded={isOpen}
                          className="shrink-0 rounded-md p-1.5 text-sidebar-fg/70 transition-colors hover:bg-white/5 hover:text-sidebar-fg-active"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>
                    {hasChildren && isOpen && (
                      <div className="ml-[27px] mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border/60 pl-2">
                        {item.children!.map((child) => (
                          <NavChildLink
                            key={child.href}
                            child={child}
                            active={isChildActive(child, pathname, activeTab)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
