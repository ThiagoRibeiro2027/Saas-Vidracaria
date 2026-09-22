"use client";

import { useState } from "react";
import { removerEpiAction, upsertEpiAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Epi = {
  id: string;
  funcionario_id: string;
  tipo_epi: string;
  ca: string | null;
  data_entrega: string;
  data_validade: string | null;
  observacoes: string | null;
};

type FuncionarioOpcao = { id: string; nome: string };

function isVencido(dataValidade: string | null) {
  return !!dataValidade && dataValidade < new Date().toISOString().slice(0, 10);
}

export default function EpisSection({
  rows,
  funcionarios,
  funcionariosAtivos,
  canManage,
}: {
  rows: Epi[];
  funcionarios: FuncionarioOpcao[];
  funcionariosAtivos: FuncionarioOpcao[];
  canManage: boolean;
}) {
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">EPI — Equipamento de Proteção Individual</h2>
      <p className="mt-1 text-xs text-text-muted">
        Controle de entrega e validade (T17 §6). CA = Certificado de Aprovação do equipamento.
      </p>

      {canManage && (
        <div className="mt-3">
          <EpiForm row={null} funcionarios={funcionariosAtivos} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th>EPI</Th>
              <Th>CA</Th>
              <Th>Entrega</Th>
              <Th>Validade</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{funcionarioPorId.get(row.funcionario_id) ?? "—"}</Td>
                <Td>{row.tipo_epi}</Td>
                <Td>{row.ca ?? "—"}</Td>
                <Td>{row.data_entrega}</Td>
                <Td>
                  {row.data_validade ?? "—"}
                  {isVencido(row.data_validade) && (
                    <Badge variant="danger" className="ml-1.5">
                      Vencido
                    </Badge>
                  )}
                </Td>
                {canManage && (
                  <Td>
                    <AcoesEpi row={row} funcionarios={funcionarios} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function EpiForm({ row, funcionarios, onSubmit }: { row: Epi | null; funcionarios: FuncionarioOpcao[]; onSubmit?: () => void }) {
  return (
    <form
      action={upsertEpiAction}
      onSubmit={onSubmit}
      className={`flex flex-wrap items-center gap-1.5 ${row ? "" : "rounded-md bg-page-bg p-3"}`}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <Select name="funcionario_id" defaultValue={row?.funcionario_id ?? ""} required>
        <option value="">funcionário…</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </Select>
      <Input name="tipo_epi" placeholder="tipo de EPI" defaultValue={row?.tipo_epi ?? ""} required className="w-36" />
      <Input name="ca" placeholder="CA (opcional)" defaultValue={row?.ca ?? ""} className="w-24" />
      <Input name="data_entrega" type="date" defaultValue={row?.data_entrega ?? ""} required />
      <Input name="data_validade" type="date" defaultValue={row?.data_validade ?? ""} />
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Registrar"}
      </Button>
    </form>
  );
}

function AcoesEpi({ row, funcionarios }: { row: Epi; funcionarios: FuncionarioOpcao[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <EpiForm row={row} funcionarios={funcionarios} onSubmit={() => setModo("nenhum")} />
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setModo("nenhum")}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="primary" onClick={() => setModo("editar")}>
        Editar
      </Button>
      <form action={removerEpiAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="outlineDanger">
          Remover
        </Button>
      </form>
    </div>
  );
}
