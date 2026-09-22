"use client";

import { useActionState } from "react";
import {
  previsualizarImportacaoPessoasAction,
  confirmarImportacaoPessoasAction,
  previsualizarImportacaoItensAction,
  confirmarImportacaoItensAction,
  type ImportacaoState,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, Th, Td } from "@/components/ui/Table";

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  atualizacao: "Atualização",
  invalido: "Inválido",
  duplicado_no_arquivo: "Duplicado no arquivo",
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger"> = {
  novo: "success",
  atualizacao: "warning",
  invalido: "danger",
  duplicado_no_arquivo: "danger",
};

function Bloco({
  titulo,
  colunasEsperadas,
  previewAction,
  confirmAction,
}: {
  titulo: string;
  colunasEsperadas: string;
  previewAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
  confirmAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
}) {
  const [previewState, previewFormAction, previewPending] = useActionState<ImportacaoState, FormData>(
    previewAction,
    undefined,
  );
  const [confirmState, confirmFormAction, confirmPending] = useActionState<ImportacaoState, FormData>(
    confirmAction,
    undefined,
  );

  const estadoAtual = confirmState ?? previewState;
  const resultados = estadoAtual && "resultados" in estadoAtual ? estadoAtual.resultados : undefined;
  const linhas = estadoAtual && "linhas" in estadoAtual ? estadoAtual.linhas : undefined;
  const confirmado = estadoAtual && "confirmado" in estadoAtual ? estadoAtual.confirmado : false;
  const erro = estadoAtual?.error;

  const contagens = (resultados ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? "invalido";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mb-5">
      <h3 className="mb-1 text-[13px] font-medium text-text">{titulo}</h3>
      <p className="text-xs text-text-muted">Colunas esperadas no CSV (primeira linha = cabeçalho): {colunasEsperadas}</p>

      {!confirmado && (
        <form action={previewFormAction} className="my-2.5 flex items-center gap-1.5">
          <input type="file" name="arquivo" accept=".csv,text/csv" required className="text-xs" />
          <Button type="submit" variant="primary" disabled={previewPending}>
            {previewPending ? "Lendo..." : "Pré-visualizar"}
          </Button>
        </form>
      )}

      {erro && <p className="text-xs text-danger">{erro}</p>}

      {resultados && resultados.length > 0 && (
        <>
          <p className="text-xs text-text">
            {confirmado ? "Resultado da gravação: " : "Prévia (nada foi gravado ainda): "}
            {Object.entries(contagens)
              .map(([status, n]) => `${n} ${STATUS_LABEL[status] ?? status}`)
              .join(" · ")}
          </p>

          <div className="my-2.5 overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Linha</Th>
                  <Th>Identificador</Th>
                  <Th>Nome/Descrição</Th>
                  <Th>Status</Th>
                  <Th>Detalhe</Th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.linha}>
                    <Td>{r.linha}</Td>
                    <Td>
                      <span className="font-mono">{r.identificador ?? "—"}</span>
                    </Td>
                    <Td>{r.rotulo ?? "—"}</Td>
                    <Td>
                      <Badge variant={STATUS_TONE[r.status ?? ""] ?? "success"}>
                        {STATUS_LABEL[r.status ?? ""] ?? r.status}
                      </Badge>
                    </Td>
                    <Td>
                      {r.erro ?? (r.campos_alterados && r.campos_alterados.length > 0 ? r.campos_alterados.join(", ") : "—")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {!confirmado && linhas && (
            <form action={confirmFormAction}>
              <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
              <Button type="submit" variant="primary" disabled={confirmPending}>
                {confirmPending ? "Gravando..." : `Confirmar importação (${(contagens.novo ?? 0) + (contagens.atualizacao ?? 0)} linha(s) válida(s))`}
              </Button>
            </form>
          )}

          {confirmado && (
            <p className="text-xs text-primary">
              Importação concluída. Recarregue a página pra ver os registros na lista acima.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function ImportacaoSection() {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Importação inicial de dados (TÓPICO 2 §28)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Só CSV nesta fase. Fluxo: ler arquivo → validar → pré-visualizar (nada é gravado) →
        confirmar. Linha inválida nunca é gravada silenciosamente — fica marcada e as demais
        linhas válidas são gravadas normalmente na confirmação.
      </p>
      <div className="mt-3">
        <Bloco
          titulo="Pessoas (clientes/fornecedores)"
          colunasEsperadas="tipo_documento (CPF ou CNPJ), documento, nome, nome_fantasia, telefone, email, logradouro, cidade, uf, cep"
          previewAction={previsualizarImportacaoPessoasAction}
          confirmAction={confirmarImportacaoPessoasAction}
        />
        <Bloco
          titulo="Itens (produtos/materiais)"
          colunasEsperadas="codigo, descricao, tipo (materia_prima, insumo, componente, produto_intermediario, produto_acabado, material_auxiliar, embalagem, servico, outro), classificacao, unidade_principal"
          previewAction={previsualizarImportacaoItensAction}
          confirmAction={confirmarImportacaoItensAction}
        />
      </div>
    </section>
  );
}
