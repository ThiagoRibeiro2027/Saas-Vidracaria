import type { SelectHTMLAttributes } from "react";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
