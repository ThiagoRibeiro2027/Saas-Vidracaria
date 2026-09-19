import type { HTMLAttributes } from "react";

type Padding = "none" | "xs" | "sm" | "md";

const PADDING_CLASSES: Record<Padding, string> = {
  none: "",
  xs: "p-3",
  sm: "p-4",
  md: "p-5",
};

export function Card({
  padding = "md",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { padding?: Padding }) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${PADDING_CLASSES[padding]} ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-sm font-semibold text-text ${className}`} {...props} />;
}
