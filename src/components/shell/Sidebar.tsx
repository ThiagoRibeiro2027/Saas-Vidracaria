"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOME_ITEM, NAV_GROUPS, type NavItem } from "./nav-config";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
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

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar-bg px-3 py-4 md:flex">
      <div className="mb-4 px-3">
        <span className="text-sm font-semibold text-sidebar-fg-active">Vidraçaria</span>
      </div>

      <nav className="flex flex-col gap-4">
        <NavLink item={HOME_ITEM} active={isActive(HOME_ITEM.href)} />

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-fg/60">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
