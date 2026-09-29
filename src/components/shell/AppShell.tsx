"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type Notificacao = {
  id: string;
  titulo: string;
  mensagem: string;
  prioridade: "informativa" | "atencao" | "importante" | "critica";
};

// Mesmos prefixos usados para redirecionamento em
// src/lib/supabase/middleware.ts (login/mfa/change-password) + /campo, que
// já tem seu próprio shell PWA (src/app/campo/layout.tsx) — mexer numa lista
// exige checar a outra.
const BARE_PREFIXES = ["/login", "/mfa/", "/change-password", "/campo"];

export function AppShell({
  children,
  displayName,
  companyName,
  notificacoes,
}: {
  children: ReactNode;
  displayName: string;
  companyName: string | null;
  notificacoes: Notificacao[];
}) {
  const pathname = usePathname();
  const isBare = BARE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isBare) return <>{children}</>;

  return (
    <div className="flex h-full min-h-dvh">
      <Suspense fallback={<aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar-bg md:flex" />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar displayName={displayName} companyName={companyName} notificacoes={notificacoes} />
        <main className="flex-1 overflow-y-auto bg-page-bg">{children}</main>
      </div>
    </div>
  );
}
