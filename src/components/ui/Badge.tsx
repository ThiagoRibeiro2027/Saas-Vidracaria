import type { HTMLAttributes } from "react";

// Tom genérico em vez de nomes de domínio — cada módulo mantém seu próprio
// mapa status/prioridade → tom (mesmo padrão que já mantém pra STATUS_LABEL).
type Variant = "neutral" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral: "bg-page-bg text-text-muted",
  success: "bg-primary-soft text-primary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export function Badge({
  variant = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
