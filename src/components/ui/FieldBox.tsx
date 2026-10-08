// ADR-013 (Identidade D), §2.2 — caixa de campo/resumo. Indicador de
// resumo com borda fina + borda colorida de 4px à esquerda indicando o
// tom do valor (não mais tile com fundo sólido colorido — isso era a
// Identidade C, descontinuada). `teal` reaproveita --color-primary (já
// dinâmico por empresa); `amber`/`rose` usam os tons fixos de ação/alerta
// formalizados em globals.css.
const TONE_BORDER = {
  teal: "border-l-primary",
  amber: "border-l-tone-amber",
  rose: "border-l-tone-rose",
} as const;

const TONE_TEXT = {
  teal: "text-primary",
  amber: "text-tone-amber",
  rose: "text-tone-rose",
} as const;

export type FieldBoxTone = keyof typeof TONE_BORDER;

export function FieldBox({
  label,
  value,
  tone = "teal",
  className = "",
}: {
  label: string;
  value: string;
  tone?: FieldBoxTone;
  className?: string;
}) {
  return (
    <div className={`flex-1 border border-border border-l-4 ${TONE_BORDER[tone]} bg-surface px-3 py-2.5 ${className}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${TONE_TEXT[tone]}`}>{value}</p>
    </div>
  );
}
