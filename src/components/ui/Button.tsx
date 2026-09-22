import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "outlineDanger";

// "outline"/"outlineDanger" existem pra evitar compor `className` com uma
// cor que colide com a mesma propriedade CSS já fixada por outra variante
// (ex.: `variant="secondary" className="text-danger"` — as duas classes
// miram `color`, e qual delas "ganha" depende da ordem em que o Tailwind
// gera as classes no CSS final, não da ordem em que aparecem no atributo
// className. Cada variante abaixo é uma string única e coerente, sem
// depender de sobrepor propriedade already-set de outra).
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-surface text-text border border-border hover:bg-page-bg",
  ghost: "bg-transparent text-text-muted hover:bg-page-bg",
  danger: "bg-danger text-white hover:opacity-90",
  outline: "bg-surface text-primary border border-primary hover:bg-primary-soft",
  outlineDanger: "bg-surface text-danger border border-border hover:bg-danger/5",
};

type Size = "sm" | "md";

// Mesmo raciocínio das variantes acima aplicado a tamanho: várias telas
// (Usuários, Papéis) têm botões de ação bem compactos dentro de tabelas —
// em vez de sobrepor `text-xs`/padding via className (colide com o
// `text-sm`/padding já fixado abaixo), o tamanho vira uma opção própria.
const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
