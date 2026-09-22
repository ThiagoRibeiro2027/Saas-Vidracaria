"use client";

import { transitionSubscriptionAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const STATUSES = ["trial", "active", "past_due", "suspended", "canceled", "expired"] as const;

type Row = {
  companyId: string;
  companyName: string;
  status: string;
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
            <Th>Status</Th>
            <Th>Usuários</Th>
            <Th>Storage</Th>
            <Th>Alterar status</Th>
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
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
