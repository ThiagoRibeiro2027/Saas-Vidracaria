"use client";

import { useCampo } from "./CampoProvider";
import { JANELA_BLOQUEIO_DIAS, JANELA_EXPIRACAO_DIAS } from "@/lib/offline/sync";

// ADR-005 §27 — "o usuário não deve precisar descobrir sozinho que está
// operando com dados antigos": online/offline, última sincronização,
// registros pendentes e o bloqueio de 3/7 dias sempre visíveis.
export default function StatusBar() {
  const { online, pacote, fila, sincronizando, ultimoErro, validade, sincronizar } = useCampo();
  const pendentes = fila.filter((f) => f.status === "pendente").length;
  const comErro = fila.filter((f) => f.status === "erro").length;

  const corFundo = validade.expirado ? "#fde8e8" : validade.bloqueadoParaCriar ? "#fff3d6" : online ? "#e6f4ea" : "#fff3d6";
  const corTexto = validade.expirado ? "#9b2c2c" : "#3e4d49";

  return (
    <div style={{ background: corFundo, padding: "8px 16px", fontSize: "12px", color: corTexto, display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "center" }}>
      <span>{online ? "● Online" : "○ Offline"}</span>
      <span>
        {pacote?.syncedAt
          ? `Última sincronização: ${new Date(pacote.syncedAt).toLocaleString("pt-BR")} (${validade.diasSemSync!.toFixed(1)}d)`
          : "Nunca sincronizado — conecte-se antes de operar offline"}
      </span>
      {pendentes > 0 && <span>{pendentes} pendente(s) de envio</span>}
      {comErro > 0 && <span style={{ color: "#9b2c2c" }}>{comErro} com erro</span>}
      {validade.bloqueadoParaCriar && !validade.expirado && (
        <span>Sem sincronizar há {JANELA_BLOQUEIO_DIAS}+ dias — novos registros offline bloqueados</span>
      )}
      {validade.expirado && <span>Dados expirados ({JANELA_EXPIRACAO_DIAS}+ dias) — sincronize antes de continuar</span>}
      {ultimoErro && <span style={{ color: "#9b2c2c" }}>{ultimoErro}</span>}
      <button
        onClick={() => sincronizar()}
        disabled={sincronizando || !online}
        style={{ border: "1px solid #c7d3cd", borderRadius: "4px", background: "#fff", padding: "2px 8px", cursor: online ? "pointer" : "not-allowed" }}
      >
        {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </div>
  );
}
