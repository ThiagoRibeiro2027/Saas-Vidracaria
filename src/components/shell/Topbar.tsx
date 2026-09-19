"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { signOutAction } from "@/app/login/actions";
import { marcarNotificacaoLidaAction } from "@/app/notificacoes/actions";

type Notificacao = {
  id: string;
  titulo: string;
  mensagem: string;
  prioridade: "informativa" | "atencao" | "importante" | "critica";
};

const PRIORIDADE_TONE: Record<Notificacao["prioridade"], "neutral" | "warning" | "danger"> = {
  informativa: "neutral",
  atencao: "warning",
  importante: "warning",
  critica: "danger",
};

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

export function Topbar({
  displayName,
  companyName,
  notificacoes,
}: {
  displayName: string;
  companyName: string | null;
  notificacoes: Notificacao[];
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useClickOutside(() => setNotifOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="text-sm text-text-muted">{companyName ?? ""}</div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-page-bg"
            aria-label="Notificações"
          >
            <Bell size={18} />
            {notificacoes.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
                {notificacoes.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-border bg-surface p-2 shadow-lg">
              <p className="px-2 py-1 text-xs font-semibold text-text-muted">
                Notificações não lidas
              </p>
              {notificacoes.length === 0 && (
                <p className="px-2 py-2 text-sm text-text-muted">Nenhuma notificação pendente.</p>
              )}
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {notificacoes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border-subtle p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={PRIORIDADE_TONE[n.prioridade]}>{n.titulo}</Badge>
                      <form action={marcarNotificacaoLidaAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="text-primary hover:underline">
                          marcar como lida
                        </button>
                      </form>
                    </div>
                    <p className="mt-1 text-text-muted">{n.mensagem}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-page-bg"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserIcon size={14} />
            </span>
            <span className="max-w-32 truncate">{displayName}</span>
          </button>

          {userOpen && (
            <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-page-bg"
                >
                  <LogOut size={14} />
                  Sair
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
