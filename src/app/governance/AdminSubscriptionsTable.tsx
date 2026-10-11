"use client";

import { useState } from "react";
import { transitionSubscriptionAction, transitionCompanyStatusAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const STATUSES = ["trial", "active", "past_due", "suspended", "canceled", "expired"] as const;

// Ciclo de EXISTÊNCIA do tenant (Prompt Mestre item 30), só pra frente —
// nenhum status tem mais de um próximo válido (transition_company_status()
// recusa qualquer outro no banco; este mapa só evita oferecer um botão
// que o banco vai recusar).
const PROXIMO_STATUS_EMPRESA: Record<string, { status: string; rotulo: string } | null> = {
  active: { status: "cancellation", rotulo: "Iniciar cancelamento" },
  cancellation: { status: "suspended", rotulo: "Suspender" },
  suspended: { status: "retention", rotulo: "Mover para retenção" },
  retention: { status: "deleted", rotulo: "Excluir definitivamente" },
  deleted: null,
};

type Row = {
  companyId: string;
  companyName: string;
  status: string;
  companyStatus: string;
  planName: string | null;
  userCount: number;
  storageBytesUsed: number;
  maxUsers: number | null;
  maxStorageBytes: number | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSubscriptionsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Empresa</Th>
            <Th>Plano</Th>
            <Th>Status (comercial)</Th>
            <Th>Usuários</Th>
            <Th>Storage</Th>
            <Th>Alterar status comercial</Th>
            <Th>Status (existência)</Th>
            <Th>Alterar status de existência</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId}>
              <Td>{row.companyName}</Td>
              <Td>{row.planName ?? "— sem plano —"}</Td>
              <Td className="font-mono">{row.status}</Td>
              <Td>
                {row.userCount}
                {row.maxUsers ? ` / ${row.maxUsers}` : ""}
              </Td>
              <Td>
                {formatBytes(row.storageBytesUsed)}
                {row.maxStorageBytes ? ` / ${formatBytes(row.maxStorageBytes)}` : ""}
              </Td>
              <Td>
                <form action={transitionSubscriptionAction} className="flex gap-1.5">
                  <input type="hidden" name="company_id" value={row.companyId} />
                  <Select name="status" defaultValue={row.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="primary" size="sm">
                    Aplicar
                  </Button>
                </form>
              </Td>
              <Td className="font-mono">{row.companyStatus}</Td>
              <Td>
                <TransicaoStatusEmpresa companyId={row.companyId} companyStatus={row.companyStatus} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// Nunca um <select> livre como o de status comercial acima: o ciclo de
// existência só tem um próximo passo válido por estado (banco recusa
// qualquer outro), então é um botão único — com confirmação e motivo
// obrigatório, dado o peso de cada etapa (a última é exclusão definitiva).
function TransicaoStatusEmpresa({ companyId, companyStatus }: { companyId: string; companyStatus: string }) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const proximo = PROXIMO_STATUS_EMPRESA[companyStatus];

  if (!proximo) return <span className="text-xs text-text-muted">—</span>;

  async function aplicar() {
    const motivo = window.prompt(
      `${proximo!.rotulo} desta empresa (${companyStatus} → ${proximo!.status})? Motivo (obrigatório):`,
    );
    if (!motivo || !motivo.trim()) return;
    setPending(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.set("company_id", companyId);
      fd.set("status", proximo!.status);
      fd.set("reason", motivo.trim());
      await transitionCompanyStatusAction(fd);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível alterar o status.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant={proximo.status === "deleted" ? "danger" : "secondary"} size="sm" onClick={aplicar} disabled={pending}>
        {pending ? "Aplicando..." : proximo.rotulo}
      </Button>
      {erro && <p className="text-xs text-danger">{erro}</p>}
    </div>
  );
}
