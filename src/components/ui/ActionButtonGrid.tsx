import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

// ADR-013 (Identidade D), §2.4 — ações primárias da tela em grade de
// botões grandes, cor sólida (sem gradiente/sombra). Mapeamento semântico:
// nav = navegação/consulta, create = criar/confirmar, attention = ação de
// atenção, critical = destrutiva (mesmo mapeamento já usado em
// Badge/StatusPill). `critical` reaproveita --color-danger já existente —
// só nav/create/attention precisaram de tom novo (ver globals.css).
const COLOR_CLASSES = {
  nav: "bg-action-nav",
  create: "bg-action-create",
  attention: "bg-tone-amber",
  critical: "bg-danger",
} as const;

export type ActionButtonColor = keyof typeof COLOR_CLASSES;

export type ActionButtonGridItem = {
  label: string;
  color: ActionButtonColor;
  /** Link de navegação — se ausente, vira <button> (ex.: abre modal). */
  href?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">;

export function ActionButtonGrid({ items, className = "" }: { items: ActionButtonGridItem[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2.5 md:grid-cols-4 ${className}`}>
      {items.map(({ label, color, href, ...buttonProps }) => {
        const classes = `rounded px-4 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90 ${COLOR_CLASSES[color]}`;
        return href ? (
          <Link key={label} href={href} className={classes}>
            {label}
          </Link>
        ) : (
          <button key={label} type="button" className={`cursor-pointer ${classes}`} {...buttonProps}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
