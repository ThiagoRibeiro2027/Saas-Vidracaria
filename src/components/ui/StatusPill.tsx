import type { HTMLAttributes } from "react";

// ADR-013 (Identidade D), §2.3 — status como pílula de texto com ponto
// colorido, não mais badge preenchido. Mesmo vocabulário de tom já usado
// em Badge (neutral/success/warning/danger), pra telas que já calculam
// esse tom pra Badge trocarem de componente sem recalcular nada.
const DOT_TONE = {
  neutral: "bg-text-muted",
  success: "bg-action-create",
  warning: "bg-tone-amber",
  danger: "bg-tone-rose",
} as const;

export type StatusPillTone = keyof typeof DOT_TONE;

export function StatusPill({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusPillTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[tone]}`} />
      <span {...props} />
    </span>
  );
}
