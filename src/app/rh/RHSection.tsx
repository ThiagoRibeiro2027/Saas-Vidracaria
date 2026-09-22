"use client";

import { useState } from "react";
import { desligarFuncionarioAction, upsertFuncionarioAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning"> = {
  ativo: "success",
  afastado: "warning",
  desligado: "neutral",
};

type Funcionario = {
  id: string;
  nome: string;
  cargo: string | null;
  funcao: string | null;
  unidade_id: string | null;
  profile_id: string | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  status: "ativo" | "afastado" | "desligado";
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  observacoes: string | null;
};

type Unidade = { id: string; name: string };
type Profile = { id: string; display_name: string; login_identifier: string };

export default function RHSection({
  rows,
  unidades,
  profiles,
  canManage,
}: {
  rows: Funcionario[];
  unidades: Unidade[];
  profiles: Profile[];
  canManage: boolean;
}) {
  const unidadePorId = new Map(unidades.map((u) => [u.id, u.name]));
  const profilePorId = new Map(profiles.map((p) => [p.id, `${p.display_name} (${p.login_identifier})`]));
  const profileIdsEmUso = new Set(rows.filter((r) => r.status !== "desligado" && r.profile_id).map((r) => r.profile_id));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Funcionários</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cadastro de funcionários, vínculo com usuário do sistema e desligamento (que revoga o
        acesso do usuário vinculado). Certificações, EPI, habilitações e afastamentos ficam nas
        abas ao lado. Sem folha de pagamento, escala ou ponto.
      </p>

      {canManage && (
        <div className="mt-3">
          <FuncionarioForm row={null} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id))} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Cargo/Função</Th>
              <Th>Unidade</Th>
              <Th>Usuário vinculado</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{row.nome}</Td>
                <Td>{[row.cargo, row.funcao].filter(Boolean).join(" — ") || "—"}</Td>
                <Td>{row.unidade_id ? unidadePorId.get(row.unidade_id) ?? "—" : "—"}</Td>
                <Td>{row.profile_id ? profilePorId.get(row.profile_id) ?? "—" : "—"}</Td>
                <Td>
                  <Badge variant={STATUS_TONE[row.status]}>
                    {STATUS_LABEL[row.status]}
                    {row.status === "desligado" && row.motivo_desligamento && ` — ${row.motivo_desligamento}`}
                  </Badge>
                </Td>
                {canManage && (
                  <Td>
                    {row.status !== "desligado" && (
                      <AcoesFuncionario row={row} unidades={unidades} profiles={profiles.filter((p) => !profileIdsEmUso.has(p.id) || p.id === row.profile_id)} />
                    )}
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

function FuncionarioForm({ row, unidades, profiles, onSubmit }: { row: Funcionario | null; unidades: Unidade[]; profiles: Profile[]; onSubmit?: () => void }) {
  return (
    <form
      action={upsertFuncionarioAction}
      onSubmit={onSubmit}
      className={`flex flex-wrap items-center gap-1.5 ${row ? "" : "rounded-md bg-page-bg p-3"}`}
    >
      {row && <input type="hidden" name="id" value={row.id} />}
      <Input name="nome" placeholder="nome" defaultValue={row?.nome ?? ""} required className="w-40" />
      <Input name="cargo" placeholder="cargo" defaultValue={row?.cargo ?? ""} className="w-28" />
      <Input name="funcao" placeholder="função" defaultValue={row?.funcao ?? ""} className="w-28" />
      <Select name="unidade_id" defaultValue={row?.unidade_id ?? ""}>
        <option value="">unidade…</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </Select>
      <Input name="data_admissao" type="date" defaultValue={row?.data_admissao ?? ""} />
      <Input name="telefone" placeholder="telefone" defaultValue={row?.telefone ?? ""} className="w-28" />
      <Select name="profile_id" defaultValue={row?.profile_id ?? ""}>
        <option value="">sem usuário vinculado</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name} ({p.login_identifier})</option>
        ))}
      </Select>
      <Select name="status" defaultValue={row?.status ?? "ativo"}>
        <option value="ativo">Ativo</option>
        <option value="afastado">Afastado</option>
      </Select>
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Admitir"}
      </Button>
    </form>
  );
}

function AcoesFuncionario({ row, unidades, profiles }: { row: Funcionario; unidades: Unidade[]; profiles: Profile[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar" | "desligar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <FuncionarioForm row={row} unidades={unidades} profiles={profiles} onSubmit={() => setModo("nenhum")} />
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setModo("nenhum")}>
          Fechar
        </Button>
      </div>
    );
  }

  if (modo === "desligar") {
    return (
      <form action={desligarFuncionarioAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Input name="data_desligamento" type="date" />
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
      <Button type="button" variant="primary" onClick={() => setModo("editar")}>
        Editar
      </Button>
      <Button type="button" variant="outlineDanger" onClick={() => setModo("desligar")}>
        Desligar
      </Button>
    </div>
  );
}
