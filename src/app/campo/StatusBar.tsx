"use client";

import { useCampo } from "./CampoProvider";
import { JANELA_BLOQUEIO_DIAS, JANELA_EXPIRACAO_DIAS } from "@/lib/offline/sync";
import { Button } from "@/components/ui/Button";

// ADR-005 §27 — "o usuário não deve precisar descobrir sozinho que está
// operando com dados antigos": online/offline, última sincronização,
// registros pendentes e o bloqueio de 3/7 dias sempre visíveis.
export default function StatusBar() {
  const { online, pacote, fila, sincronizando, ultimoErro, validade, sincronizar } = useCampo();
  const pendentes = fila.filter((f) => f.status === "pendente").length;
  const comErro = fila.filter((f) => f.status === "erro").length;

  const corFundo = validade.expirado ? "bg-danger/10" : validade.bloqueadoParaCriar ? "bg-warning/10" : online ? "bg-success/10" : "bg-warning/10";
  const corTexto = validade.expirado ? "text-danger" : "text-text";

  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs ${corFundo} ${corTexto}`}>
      <span>{online ? "● Online" : "○ Offline"}</span>
      <span>
        {pacote?.syncedAt
          ? `Última sincronização: ${new Date(pacote.syncedAt).toLocaleString("pt-BR")} (${validade.diasSemSync!.toFixed(1)}d)`
          : "Nunca sincronizado — conecte-se antes de operar offline"}
      </span>
      {pendentes > 0 && <span>{pendentes} pendente(s) de envio</span>}
      {comErro > 0 && <span className="text-danger">{comErro} com erro</span>}
      {validade.bloqueadoParaCriar && !validade.expirado && (
        <span>Sem sincronizar há {JANELA_BLOQUEIO_DIAS}+ dias — novos registros offline bloqueados</span>
      )}
      {validade.expirado && <span>Dados expirados ({JANELA_EXPIRACAO_DIAS}+ dias) — sincronize antes de continuar</span>}
      {ultimoErro && <span className="text-danger">{ultimoErro}</span>}
      <Button type="button" variant="secondary" size="sm" onClick={() => sincronizar()} disabled={sincronizando || !online}>
        {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
      </Button>
    </div>
  );
}
