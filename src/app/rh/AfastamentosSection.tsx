"use client";

import { useState } from "react";
import { removerAfastamentoAction, upsertAfastamentoAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const TIPO_LABEL: Record<string, string> = {
  ferias: "Férias",
  afastamento: "Afastamento",
};

type Afastamento = {
  id: string;
  funcionario_id: string;
  tipo: "ferias" | "afastamento";
  data_inicio: string;
  data_fim: string | null;
  motivo: string | null;
  observacoes: string | null;
};

type FuncionarioOpcao = { id: string; nome: string };

export default function AfastamentosSection({
  rows,
  funcionarios,
  funcionariosAtivos,
  canManage,
}: {
  rows: Afastamento[];
  funcionarios: FuncionarioOpcao[];
  funcionariosAtivos: FuncionarioOpcao[];
  canManage: boolean;
}) {
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Afastamentos e férias</h2>
      <p className="mt-1 text-xs text-text-muted">
        Registro simples de períodos (T17 §7) — datas e motivo, sem cálculo de valores ou encargos.
      </p>

      {canManage && (
        <div className="mt-3">
          <AfastamentoForm row={null} funcionarios={funcionariosAtivos} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th>Tipo</Th>
              <Th>Início</Th>
              <Th>Fim</Th>
              <Th>Motivo</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{funcionarioPorId.get(row.funcionario_id) ?? "—"}</Td>
                <Td>{TIPO_LABEL[row.tipo]}</Td>
                <Td>{row.data_inicio}</Td>
                <Td>
                  {row.data_fim ?? <Badge variant="warning">em curso</Badge>}
                </Td>
                <Td>{row.motivo ?? "—"}</Td>
                {canManage && (
                  <Td>
                    <AcoesAfastamento row={row} funcionarios={funcionarios} />
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

function AfastamentoForm({
  row,
  funcionarios,
  onSubmit,
}: {
  row: Afastamento | null;
  funcionarios: FuncionarioOpcao[];
  onSubmit?: () => void;
}) {
  return (
    <form
      action={upsertAfastamentoAction}
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
      <Select name="tipo" defaultValue={row?.tipo ?? "ferias"} required>
        <option value="ferias">Férias</option>
        <option value="afastamento">Afastamento</option>
      </Select>
      <Input name="data_inicio" type="date" defaultValue={row?.data_inicio ?? ""} required />
      <Input name="data_fim" type="date" defaultValue={row?.data_fim ?? ""} />
      <Input name="motivo" placeholder="motivo (opcional)" defaultValue={row?.motivo ?? ""} className="w-32" />
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Registrar"}
      </Button>
    </form>
  );
}

function AcoesAfastamento({ row, funcionarios }: { row: Afastamento; funcionarios: FuncionarioOpcao[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <AfastamentoForm row={row} funcionarios={funcionarios} onSubmit={() => setModo("nenhum")} />
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
      <form action={removerAfastamentoAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="outlineDanger">
          Remover
        </Button>
      </form>
    </div>
  );
}
