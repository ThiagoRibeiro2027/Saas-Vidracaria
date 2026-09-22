"use client";

import { useState } from "react";
import { cancelarDocumentoFiscalAction, registrarDocumentoFiscalAction, vincularDocumentoFiscalAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const TIPOS = [
  ["nfe", "NF-e"],
  ["nfse", "NFS-e"],
  ["outro", "Outro"],
] as const;

type Documento = {
  id: string;
  tipo: "nfe" | "nfse" | "outro";
  numero: string | null;
  chave_acesso: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "recebido" | "cancelado";
  motivo_cancelamento: string | null;
  observacoes: string | null;
};

export default function FiscalSection({ rows, canManage }: { rows: Documento[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Documentos fiscais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Recorte mínimo do MVP (ADR-004 §9.2): registro e rastreabilidade de documentos fiscais
        recebidos, com vínculo operacional opcional (independente de Pedido de Compra). Sem
        emissão, cancelamento fiscal real, inutilização ou transmissão — durante o piloto, o
        faturamento permanece no sistema atual da empresa (§9.1).
      </p>

      {canManage && (
        <div className="mt-3">
          <NovoDocumentoForm />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Número</Th>
              <Th>Chave de acesso</Th>
              <Th>Vínculo</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{TIPOS.find(([v]) => v === row.tipo)?.[1] ?? row.tipo}</Td>
                <Td>{row.numero ?? "—"}</Td>
                <Td>{row.chave_acesso ?? "—"}</Td>
                <Td>{row.entity_type ? `${row.entity_type} (${row.entity_id?.slice(0, 8)}…)` : "sem vínculo"}</Td>
                <Td>
                  <Badge variant={row.status === "recebido" ? "success" : "danger"}>
                    {row.status === "cancelado" ? `Cancelado — ${row.motivo_cancelamento ?? ""}` : "Recebido"}
                  </Badge>
                </Td>
                {canManage && <Td>{row.status === "recebido" && <AcoesDocumento row={row} />}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function NovoDocumentoForm() {
  return (
    <form action={registrarDocumentoFiscalAction} className="flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Select name="tipo" defaultValue="nfe" required>
        {TIPOS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>
      <Input name="numero" placeholder="número" className="w-28" />
      <Input name="chave_acesso" placeholder="chave de acesso (opcional)" className="w-56" />
      <Input name="entity_type" placeholder="vínculo: tipo (opcional)" className="w-36" />
      <Input name="entity_id" placeholder="vínculo: id (opcional)" className="w-36" />
      <Input name="observacoes" placeholder="observações (opcional)" className="w-40" />
      <Button type="submit" variant="primary">
        Registrar
      </Button>
    </form>
  );
}

function AcoesDocumento({ row }: { row: Documento }) {
  const [modo, setModo] = useState<"nenhum" | "vincular" | "cancelar">("nenhum");

  if (modo === "vincular") {
    return (
      <form action={vincularDocumentoFiscalAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="entity_type" placeholder="tipo" required className="w-20" />
        <Input name="entity_id" placeholder="id" required className="w-20" />
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarDocumentoFiscalAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="primary" onClick={() => setModo("vincular")}>
        Vincular
      </Button>
      <Button type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
        Cancelar
      </Button>
    </div>
  );
}
