"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card } from "./Card";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

// Estado de aberto/fechado é de quem chama (a Section) — o Modal só cuida
// de portal, backdrop, Escape e foco. Sem focus-trap completo nesta
// primeira versão (simplificação aceita, não lacuna escondida).
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: Size;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} className={`w-full ${SIZE_CLASSES[size]}`}>
        <Card padding="md" className="max-h-[85vh] overflow-y-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded p-1 text-text-muted transition-colors hover:bg-page-bg hover:text-text"
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </Card>
      </div>
    </div>,
    document.body,
  );
}
