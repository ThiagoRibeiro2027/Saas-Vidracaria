"use client";

import { useState } from "react";
import { reabrirPedidoAction } from "./actions";
import { Button } from "@/components/ui/Button";

// Melhorias 18/10/2026, item 1 — usado em Pedidos e em Orçamentos (o
// orçamento aprovado cujo pedido foi cancelado fica "preso" sem este botão).
export default function ReabrirPedidoButton({ pedidoId, numero }: { pedidoId: string; numero: string }) {
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function reabrir() {
    if (!window.confirm(`Reabrir o pedido ${numero}? Ele volta para "recebido", com os mesmos itens, e precisa ser conferido de novo.`)) {
      return;
    }
    setPendente(true);
    setErro(null);
    const res = await reabrirPedidoAction(pedidoId);
    if (res?.error) setErro(res.error);
    setPendente(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={reabrir} disabled={pendente}>
        {pendente ? "Reabrindo..." : "Reabrir pedido"}
      </Button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
