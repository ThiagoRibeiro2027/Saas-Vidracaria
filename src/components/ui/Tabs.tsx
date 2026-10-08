import Link from "next/link";

// ADR-013 (Identidade D), §2.5 — abas em texto + sublinhado de 2px na
// ativa, sem pílula de fundo (diferença chave vs. a Identidade C
// descartada). `active` vem de quem chama (computado no servidor a
// partir de searchParams, mesmo padrão já usado em todo o app pra abas
// via ?tab=) — este componente é só apresentação, não decide rota nem
// guarda estado.
export type TabItem = {
  label: string;
  href: string;
  active: boolean;
};

export function Tabs({ items, className = "" }: { items: TabItem[]; className?: string }) {
  return (
    <div className={`flex gap-5 border-b border-border text-sm ${className}`}>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`-mb-px border-b-2 px-1 pb-2 font-semibold uppercase tracking-wide transition-colors ${
            item.active ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
