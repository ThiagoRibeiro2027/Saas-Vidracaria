import type { ReactNode } from "react";

// Rótulo + ajuda abaixo de cada campo (ADR-013) — pra formulário de cadastro
// não depender só de placeholder (que some ao digitar) pra explicar o que
// preencher. Extraído de VariaveisConfiguradorSection.tsx pra reaproveitar
// em qualquer formulário denso do produto (ex.: PecasSection.tsx).
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-wide text-text-muted ${className}`}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text">{label}</span>
      <div className="mt-1">{children}</div>
      <span className="mt-0.5 block text-[11px] text-text-muted">{hint}</span>
    </label>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`flex max-w-xs items-start gap-2 text-xs text-text ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 accent-primary"
      />
      <span>
        <span className="font-medium text-text">{label}</span>
        <br />
        <span className="text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

// Cartão de opção única (radio escondido) — usado onde um <select> sozinho
// não explica o que cada valor significa (ex.: tipo de variável, tipo de
// cálculo de composição).
export function OptionCard<T extends string>({
  value,
  label,
  hint,
  selected,
  onSelect,
}: {
  value: T;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-md border p-2 transition-colors ${
        selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-page-bg"
      }`}
    >
      <input type="radio" value={value} checked={selected} onChange={onSelect} className="sr-only" />
      <div className={`text-xs font-semibold ${selected ? "text-primary" : "text-text"}`}>{label}</div>
      <div className="mt-0.5 text-[11px] text-text-muted">{hint}</div>
    </label>
  );
}
