"use client";

import { useState } from "react";
import {
  avaliarDocumentoFiscalAction,
  cancelarDocumentoFiscalAction,
  iniciarConferenciaDocumentoFiscalAction,
  reavaliarDocumentoFiscalAction,
  registrarDocumentoFiscalAction,
  registrarTentativaProcessamentoAction,
  reprocessarDocumentoFiscalAction,
  vincularDocumentoFiscalAction,
} from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TIPOS = [
  ["nfe", "NF-e"],
  ["nfse", "NFS-e"],
  ["outro", "Outro"],
] as const;

// Status = fluxo humano de conferência/aprovação (ADR-004 §6, avaliação).
// Status_processamento = resultado técnico de tentativas de processamento
// (ADR-004 §7-8, reprocessamento) — são dois eixos independentes do mesmo
// documento, não uma substituição um do outro.
const STATUS_LABEL: Record<Documento["status"], string> = {
  recebido: "Recebido",
  em_conferencia: "Em conferência",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  pendente: "Pendente",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<Documento["status"], "neutral" | "success" | "danger"> = {
  recebido: "neutral",
  em_conferencia: "neutral",
  aprovado: "success",
  rejeitado: "danger",
  pendente: "danger",
  cancelado: "danger",
};

const STATUS_PROCESSAMENTO_LABEL: Record<string, string> = {
  nao_processado: "Não processado",
  processado: "Processado",
  com_erro: "Com erro",
};

const STATUS_PROCESSAMENTO_TONE: Record<string, "neutral" | "success" | "danger"> = {
  nao_processado: "neutral",
  processado: "success",
  com_erro: "danger",
};

const RESULTADO_LABEL: Record<string, string> = {
  sucesso: "Sucesso",
  erro: "Erro",
  rejeitado: "Rejeitado",
};

type Documento = {
  id: string;
  tipo: "nfe" | "nfse" | "outro";
  numero: string | null;
  chave_acesso: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "recebido" | "em_conferencia" | "aprovado" | "rejeitado" | "pendente" | "cancelado";
  status_processamento: "nao_processado" | "processado" | "com_erro";
  motivo_cancelamento: string | null;
  motivo_decisao: string | null;
  observacoes: string | null;
};

type Tentativa = {
  id: string;
  documento_fiscal_id: string;
  numero_tentativa: number;
  resultado: "sucesso" | "erro" | "rejeitado";
  mensagem_retorno: string | null;
  provedor: string | null;
  created_at: string;
};

// 2026-10-04: mesmo padrão já aplicado em Pedidos/Engenharia/Orçamentos
// — lista compacta e paginada no servidor; clicar expande, na própria
// tabela, o detalhe (chave de acesso, ações e histórico de tentativas),
// em vez de cada linha já vir com todas as ações e sem paginação.
export default function FiscalSection({
  rows,
  paginacao,
  tentativas,
  canManage,
}: {
  rows: Documento[];
  paginacao: PaginacaoInfo;
  tentativas: Tentativa[];
  canManage: boolean;
}) {
  const tentativasPorDocumento = new Map<string, Tentativa[]>();
  for (const t of tentativas) {
    const list = tentativasPorDocumento.get(t.documento_fiscal_id) ?? [];
    list.push(t);
    tentativasPorDocumento.set(t.documento_fiscal_id, list);
  }

  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Documentos fiscais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Registro, rastreabilidade, avaliação (conferência/aprovação/rejeição/pendência, ADR-004
        §6) e histórico de tentativas de processamento (§7-8) de documentos fiscais recebidos, com
        vínculo operacional opcional (independente de Pedido de Compra). Sem emissão, cancelamento
        fiscal real, inutilização ou transmissão — durante o piloto, o faturamento permanece no
        sistema atual da empresa (§9.1). Clique num documento para ver detalhes e ações.
      </p>

      {canManage && (
        <div className="mt-3">
          <NovoDocumentoForm />
        </div>
      )}

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch placeholder="Buscar por número..." />
        <FiltroStatusFiscal />
      </div>

      <Paginacao {...paginacao} posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Tipo</Th>
            <SortableTh field="numero">Número</SortableTh>
            <Th>Vínculo</Th>
            <SortableTh field="status">Status</SortableTh>
            <Th>Processamento</Th>
            <Th className="w-6" />
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LinhaDocumento
              key={row.id}
              row={row}
              tentativas={tentativasPorDocumento.get(row.id) ?? []}
              canManage={canManage}
              expandido={expandidoId === row.id}
              onToggle={() => setExpandidoId((atual) => (atual === row.id ? null : row.id))}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-text-muted">
                Nenhum documento fiscal ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}

function LinhaDocumento({
  row,
  tentativas,
  canManage,
  expandido,
  onToggle,
}: {
  row: Documento;
  tentativas: Tentativa[];
  canManage: boolean;
  expandido: boolean;
  onToggle: () => void;
}) {
  const linhaCompacta = (
    <tr onClick={onToggle} className="cursor-pointer hover:bg-page-bg">
      <Td>{TIPOS.find(([v]) => v === row.tipo)?.[1] ?? row.tipo}</Td>
      <Td>{row.numero ?? "—"}</Td>
      <Td>{row.entity_type ? `${row.entity_type} (${row.entity_id?.slice(0, 8)}…)` : "sem vínculo"}</Td>
      <Td>
        <StatusPill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusPill>
      </Td>
      <Td>
        <StatusPill tone={STATUS_PROCESSAMENTO_TONE[row.status_processamento]}>
          {STATUS_PROCESSAMENTO_LABEL[row.status_processamento]}
        </StatusPill>
      </Td>
      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
    </tr>
  );

  if (!expandido) return linhaCompacta;

  return (
    <>
      {linhaCompacta}
      <tr>
        <Td colSpan={6} className="bg-page-bg">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div>
              <dt className="text-text-muted">Chave de acesso</dt>
              <dd className="text-text">{row.chave_acesso ?? "—"}</dd>
            </div>
            {row.status === "cancelado" && row.motivo_cancelamento && (
              <div>
                <dt className="text-text-muted">Motivo do cancelamento</dt>
                <dd className="text-text">{row.motivo_cancelamento}</dd>
              </div>
            )}
            {(row.status === "rejeitado" || row.status === "pendente") && row.motivo_decisao && (
              <div>
                <dt className="text-text-muted">Motivo da decisão</dt>
                <dd className="text-text">{row.motivo_decisao}</dd>
              </div>
            )}
          </dl>

          {canManage && row.status !== "cancelado" && (
            <div className="mt-2">
              <AcoesDocumento row={row} />
            </div>
          )}

          {tentativas.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-text">Histórico de tentativas</p>
              <ul className="mt-0.5 flex flex-col gap-0.5 text-xs text-text-muted">
                {tentativas
                  .slice()
                  .sort((a, b) => b.numero_tentativa - a.numero_tentativa)
                  .map((t) => (
                    <li key={t.id}>
                      #{t.numero_tentativa} — {RESULTADO_LABEL[t.resultado]}
                      {t.provedor && ` (${t.provedor})`}
                      {t.mensagem_retorno && `: ${t.mensagem_retorno}`}
                      {" — "}
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Td>
      </tr>
    </>
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
  const [modo, setModo] = useState<"nenhum" | "vincular" | "cancelar" | "tentativa" | "avaliar">("nenhum");

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

  if (modo === "tentativa") {
    return (
      <form
        action={registrarTentativaProcessamentoAction}
        className="flex items-center gap-1"
        onSubmit={() => setModo("nenhum")}
      >
        <input type="hidden" name="documento_id" value={row.id} />
        <Select name="resultado" defaultValue="erro" required>
          <option value="sucesso">Sucesso</option>
          <option value="erro">Erro</option>
          <option value="rejeitado">Rejeitado</option>
        </Select>
        <Input name="provedor" placeholder="provedor (opcional)" className="w-24" />
        <Input name="mensagem_retorno" placeholder="mensagem (opcional)" className="w-32" />
        <Button type="submit" variant="primary">
          Registrar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "avaliar") {
    return (
      <form action={avaliarDocumentoFiscalAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={row.id} />
        <Select name="decisao" required defaultValue="">
          <option value="">decisão…</option>
          <option value="aprovado">Aprovar</option>
          <option value="rejeitado">Rejeitar</option>
          <option value="pendente">Marcar pendente</option>
        </Select>
        <Input name="motivo" placeholder="motivo/observação (opcional)" className="w-36" />
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  const podeIniciarConferencia = row.status === "recebido";
  const podeAvaliar = row.status === "recebido" || row.status === "em_conferencia";
  const podeReavaliar = row.status === "rejeitado" || row.status === "pendente";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {podeIniciarConferencia && (
        <form action={iniciarConferenciaDocumentoFiscalAction}>
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" variant="secondary">
            Iniciar conferência
          </Button>
        </form>
      )}
      {podeAvaliar && (
        <Button type="button" variant="secondary" onClick={() => setModo("avaliar")}>
          Avaliar
        </Button>
      )}
      {podeReavaliar && (
        <form action={reavaliarDocumentoFiscalAction}>
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" variant="secondary">
            Reavaliar
          </Button>
        </form>
      )}
      <Button type="button" variant="primary" onClick={() => setModo("vincular")}>
        Vincular
      </Button>
      <Button type="button" variant="secondary" onClick={() => setModo("tentativa")}>
        Tentativa
      </Button>
      {row.status_processamento === "com_erro" && (
        <form action={reprocessarDocumentoFiscalAction}>
          <input type="hidden" name="documento_id" value={row.id} />
          <Button type="submit" variant="outline">
            Reprocessar
          </Button>
        </form>
      )}
      <Button type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
        Cancelar
      </Button>
    </div>
  );
}

function FiltroStatusFiscal() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("status") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("status", novoValor);
    else p.delete("status");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por status"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todos os status</option>
      {(Object.entries(STATUS_LABEL) as [string, string][]).map(([valorOpcao, rotulo]) => (
        <option key={valorOpcao} value={valorOpcao}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}
