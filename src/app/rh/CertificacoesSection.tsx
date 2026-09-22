"use client";

import { useState } from "react";
import { removerCertificacaoAction, upsertCertificacaoAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const TIPO_LABEL: Record<string, string> = {
  certificacao: "Certificação",
  treinamento: "Treinamento",
  treinamento_seguranca: "Treinamento de segurança",
};

type Certificacao = {
  id: string;
  funcionario_id: string;
  tipo: "certificacao" | "treinamento" | "treinamento_seguranca";
  nome: string;
  data_conclusao: string;
  data_validade: string | null;
  observacoes: string | null;
};

type FuncionarioOpcao = { id: string; nome: string };

function isVencida(dataValidade: string | null) {
  return !!dataValidade && dataValidade < new Date().toISOString().slice(0, 10);
}

export default function CertificacoesSection({
  rows,
  funcionarios,
  funcionariosAtivos,
  canManage,
}: {
  rows: Certificacao[];
  funcionarios: FuncionarioOpcao[];
  funcionariosAtivos: FuncionarioOpcao[];
  canManage: boolean;
}) {
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Certificações e treinamentos</h2>
      <p className="mt-1 text-xs text-text-muted">
        Inclui treinamentos de segurança (T17 §6). Documento físico, quando houver, é anexado em
        Arquivos com o funcionário como vínculo.
      </p>

      {canManage && (
        <div className="mt-3">
          <CertificacaoForm row={null} funcionarios={funcionariosAtivos} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th>Tipo</Th>
              <Th>Nome</Th>
              <Th>Conclusão</Th>
              <Th>Validade</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{funcionarioPorId.get(row.funcionario_id) ?? "—"}</Td>
                <Td>{TIPO_LABEL[row.tipo]}</Td>
                <Td>{row.nome}</Td>
                <Td>{row.data_conclusao}</Td>
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
                    <AcoesCertificacao row={row} funcionarios={funcionarios} />
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

function CertificacaoForm({
  row,
  funcionarios,
  onSubmit,
}: {
  row: Certificacao | null;
  funcionarios: FuncionarioOpcao[];
  onSubmit?: () => void;
}) {
  return (
    <form
      action={upsertCertificacaoAction}
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
      <Select name="tipo" defaultValue={row?.tipo ?? "treinamento"} required>
        <option value="certificacao">Certificação</option>
        <option value="treinamento">Treinamento</option>
        <option value="treinamento_seguranca">Treinamento de segurança</option>
      </Select>
      <Input name="nome" placeholder="nome" defaultValue={row?.nome ?? ""} required className="w-40" />
      <Input name="data_conclusao" type="date" defaultValue={row?.data_conclusao ?? ""} required />
      <Input name="data_validade" type="date" defaultValue={row?.data_validade ?? ""} />
      <Input name="observacoes" placeholder="observações (opcional)" defaultValue={row?.observacoes ?? ""} className="w-36" />
      <Button type="submit" variant="primary">
        {row ? "Salvar" : "Registrar"}
      </Button>
    </form>
  );
}

function AcoesCertificacao({ row, funcionarios }: { row: Certificacao; funcionarios: FuncionarioOpcao[] }) {
  const [modo, setModo] = useState<"nenhum" | "editar">("nenhum");

  if (modo === "editar") {
    return (
      <div className="flex flex-col gap-1">
        <CertificacaoForm row={row} funcionarios={funcionarios} onSubmit={() => setModo("nenhum")} />
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
      <form action={removerCertificacaoAction}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" variant="outlineDanger">
          Remover
        </Button>
      </form>
    </div>
  );
}
