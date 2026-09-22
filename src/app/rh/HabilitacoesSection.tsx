"use client";

import { useState } from "react";
import { removerHabilitacaoAction, upsertHabilitacaoAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Habilitacao = {
  id: string;
  funcionario_id: string;
  recurso_produtivo_id: string;
  data_obtencao: string;
  data_validade: string | null;
  observacoes: string | null;
};

type FuncionarioOpcao = { id: string; nome: string };
type RecursoOpcao = { id: string; codigo: string; nome: string };

function isVencida(dataValidade: string | null) {
  return !!dataValidade && dataValidade < new Date().toISOString().slice(0, 10);
}

export default function HabilitacoesSection({
  rows,
  funcionarios,
  funcionariosAtivos,
  recursos,
  canManage,
}: {
  rows: Habilitacao[];
  funcionarios: FuncionarioOpcao[];
  funcionariosAtivos: FuncionarioOpcao[];
  recursos: RecursoOpcao[];
  canManage: boolean;
}) {
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const recursoPorId = new Map(recursos.map((r) => [r.id, `${r.codigo} — ${r.nome}`]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Habilitações para operar equipamento</h2>
      <p className="mt-1 text-xs text-text-muted">
        Habilitação do colaborador para operar um recurso produtivo específico (T17 §6) — ex.:
        forno de têmpera, mesa de corte de vidro. Só recursos do tipo máquina/equipamento (cadastro
        em Produção → Recursos).
      </p>

      {canManage && (
        <div className="mt-3">
          <HabilitacaoForm row={null} funcionarios={funcionariosAtivos} recursos={recursos} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th>Recurso</Th>
              <Th>Obtenção</Th>
              <Th>Validade</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{funcionarioPorId.get(row.funcionario_id) ?? "—"}</Td>
                <Td>{recursoPorId.get(row.recurso_produtivo_id) ?? "(recurso removido)"}</Td>
                <Td>{row.data_obtencao}</Td>
                <Td>
                  {row.data_validade ?? "—"}
                  {isVencida(row.data_validade) && (
                    <Badge variant="danger" className="ml-1.5">
                      Vencida
                    </Badge>
                  )}
                </Td>
                {canManage && (
                  <Td>
                    <AcoesHabilitacao row={row} funcionarios={funcionarios} recursos={recursos} />
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

function HabilitacaoForm({
  row,
  funcionarios,
  recursos,
  onSubmit,
}: {
  row: Habilitacao | null;
  funcionarios: FuncionarioOpcao[];
  recursos: RecursoOpcao[];
  onSubmit?: () => void;
}) {
  return (
    <form
      action={upsertHabilitacaoAction}
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
      <Select name="recurso_produtivo_id" defaultValue={row?.recurso_produtivo_id ?? ""} required>
        <option value="">recurso (máquina/equipamento)…</option>
        {recursos.map((r) => (
          <option key={r.id} value={r.id}>{r.codigo} — {r.nome}</option>
        ))}
      </Select>
      <Input name="data_obtencao" type="date" defaultValue={row?.data_obtencao ?? ""} required />
      <Input name="data_validade" type="date" defaultValue={row?.data_validade ?? ""} />
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Registrar"}
      </Button>
    </form>
  );
}

function AcoesHabilitacao({
  row,
  funcionarios,
  recursos,
}: {
  row: Habilitacao;
  funcionarios: FuncionarioOpcao[];
  recursos: RecursoOpcao[];
}) {
  const [modo, setModo] = useState<"nenhum" | "editar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <HabilitacaoForm row={row} funcionarios={funcionarios} recursos={recursos} onSubmit={() => setModo("nenhum")} />
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
      <form action={removerHabilitacaoAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="outlineDanger">
          Remover
        </Button>
      </form>
    </div>
  );
}
