"use client";

import { useActionState, useState } from "react";
import {
  previsualizarImportacaoPessoasAction,
  confirmarImportacaoPessoasAction,
  previsualizarImportacaoItensAction,
  confirmarImportacaoItensAction,
  reprocessarImportacaoAction,
  type ImportacaoState,
} from "./actions";
import { CAMPOS_PESSOAS, CAMPOS_ITENS } from "./importacao-campos";
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

export type ImportacaoHistorico = {
  id: string;
  entidade: "pessoas" | "itens";
  arquivo_nome: string | null;
  total_linhas: number;
  novos: number;
  atualizados: number;
  invalidos: number;
  duplicados: number;
  origem_importacao_id: string | null;
  created_at: string;
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Estado do mapeamento vive aqui, não no Bloco, para que a troca de
// arquivo o reinicie via `key` (as colunas mudam) em vez de um useEffect
// sincronizando prop com estado — o que geraria render em cascata. Efeito
// colateral desejado: re-prévia do MESMO arquivo preserva o que o usuário
// ajustou, porque a key não muda.
function MapeamentoColunas({
  colunas,
  sugerido,
  campos,
}: {
  colunas: string[];
  sugerido: Record<string, string>;
  campos: readonly string[];
}) {
  const [mapeamento, setMapeamento] = useState<Record<string, string>>(sugerido);
  const camposJaUsados = new Set(Object.values(mapeamento).filter(Boolean));

  return (
    <div className="mt-2.5 rounded border border-border p-2.5">
      <p className="mb-1.5 text-xs font-medium text-text">Mapeamento de colunas</p>
      <p className="mb-2 text-xs text-text-muted">
        Cada coluna do arquivo vai para um campo do sistema. Coluna marcada como
        &quot;(ignorar)&quot; não é enviada. Depois de ajustar, clique em &quot;Pré-visualizar
        novamente&quot; — nada é gravado nesse passo.
      </p>
      <input type="hidden" name="mapeamento" value={JSON.stringify(mapeamento)} />
      <div className="grid gap-1.5 sm:grid-cols-2">
        {colunas.map((coluna) => (
          <label key={coluna} className="flex items-center gap-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-text-muted" title={coluna}>
              {coluna}
            </span>
            <span aria-hidden className="text-text-muted">
              →
            </span>
            <select
              className="flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text"
              value={mapeamento[coluna] ?? ""}
              onChange={(e) => setMapeamento((atual) => ({ ...atual, [coluna]: e.target.value }))}
            >
              <option value="">(ignorar)</option>
              {campos.map((campo) => (
                <option
                  key={campo}
                  value={campo}
                  // Um campo do sistema só pode receber uma coluna: duas
                  // colunas no mesmo destino silenciariam uma delas.
                  disabled={campo !== mapeamento[coluna] && camposJaUsados.has(campo)}
                >
                  {campo}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function Bloco({
  titulo,
  entidade,
  campos,
  previewAction,
  confirmAction,
  historico,
}: {
  titulo: string;
  entidade: "pessoas" | "itens";
  campos: readonly string[];
  previewAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
  confirmAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
  historico: ImportacaoHistorico[];
}) {
  const [previewState, previewFormAction, previewPending] = useActionState<ImportacaoState, FormData>(
    previewAction,
    undefined,
  );
  const [confirmState, confirmFormAction, confirmPending] = useActionState<ImportacaoState, FormData>(
    confirmAction,
    undefined,
  );
  const [reprocessState, reprocessFormAction, reprocessPending] = useActionState<ImportacaoState, FormData>(
    reprocessarImportacaoAction,
    undefined,
  );

  const estadoAtual = confirmState ?? reprocessState ?? previewState;
  const resultados = estadoAtual && "resultados" in estadoAtual ? estadoAtual.resultados : undefined;
  const linhas = estadoAtual && "linhas" in estadoAtual ? estadoAtual.linhas : undefined;
  const confirmado = estadoAtual && "confirmado" in estadoAtual ? estadoAtual.confirmado : false;
  const erro = estadoAtual?.error;
  const arquivoNome = estadoAtual && "arquivoNome" in estadoAtual ? estadoAtual.arquivoNome : null;
  const origemImportacaoId =
    estadoAtual && "origemImportacaoId" in estadoAtual ? estadoAtual.origemImportacaoId : null;

  // O mapeamento sugerido vem do servidor a cada prévia; a edição do
  // usuário vive dentro de MapeamentoColunas.
  const colunasArquivo = previewState && "colunasArquivo" in previewState ? previewState.colunasArquivo : undefined;
  const mapeamentoSugerido = previewState && "mapeamento" in previewState ? previewState.mapeamento : undefined;

  const contagens = (resultados ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? "invalido";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-[13px] font-medium text-text">{titulo}</h3>
      <p className="text-xs text-text-muted">
        Campos do sistema: {campos.join(", ")}. A primeira linha do CSV é o cabeçalho — se os nomes
        das colunas forem diferentes, ajuste o destino de cada uma abaixo da prévia.
      </p>

      {!confirmado && (
        <form action={previewFormAction} className="my-2.5">
          <div className="flex items-center gap-1.5">
            <input type="file" name="arquivo" accept=".csv,text/csv" required className="text-xs" />
            <Button type="submit" variant="primary" disabled={previewPending}>
              {previewPending ? "Lendo..." : colunasArquivo ? "Pré-visualizar novamente" : "Pré-visualizar"}
            </Button>
          </div>

          {colunasArquivo && colunasArquivo.length > 0 && mapeamentoSugerido && (
            <MapeamentoColunas
              key={colunasArquivo.join("|")}
              colunas={colunasArquivo}
              sugerido={mapeamentoSugerido}
              campos={campos}
            />
          )}
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
            {origemImportacaoId && !confirmado && " — reprocessamento de uma importação anterior"}
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
              <input type="hidden" name="arquivo_nome" value={arquivoNome ?? ""} />
              <input type="hidden" name="origem_importacao_id" value={origemImportacaoId ?? ""} />
              <Button type="submit" variant="primary" disabled={confirmPending}>
                {confirmPending ? "Gravando..." : `Confirmar importação (${(contagens.novo ?? 0) + (contagens.atualizacao ?? 0)} linha(s) válida(s))`}
              </Button>
            </form>
          )}

          {confirmado && (
            <p className="text-xs text-primary">
              Importação concluída. Recarregue a página pra ver os registros na lista acima e a
              execução no histórico.
            </p>
          )}
        </>
      )}

      {historico.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-text">Histórico de importações</p>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Arquivo</Th>
                  <Th>Linhas</Th>
                  <Th>Resultado</Th>
                  <Th>Ação</Th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => {
                  const comErro = h.invalidos + h.duplicados;
                  return (
                    <tr key={h.id}>
                      <Td>{dataHora(h.created_at)}</Td>
                      <Td>
                        {h.arquivo_nome ?? "—"}
                        {h.origem_importacao_id && (
                          <span className="ml-1 text-text-muted">(reprocessamento)</span>
                        )}
                      </Td>
                      <Td>{h.total_linhas}</Td>
                      <Td>
                        {h.novos} novo(s) · {h.atualizados} atualizado(s)
                        {comErro > 0 && ` · ${comErro} com erro`}
                      </Td>
                      <Td>
                        {comErro > 0 ? (
                          <form action={reprocessFormAction}>
                            <input type="hidden" name="importacao_id" value={h.id} />
                            <input type="hidden" name="entidade" value={entidade} />
                            <Button type="submit" variant="secondary" disabled={reprocessPending}>
                              {reprocessPending ? "Carregando..." : `Reprocessar ${comErro} linha(s)`}
                            </Button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportacaoSection({ historico = [] }: { historico?: ImportacaoHistorico[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Importação inicial de dados (TÓPICO 2 §28)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Só CSV nesta fase. Fluxo: ler arquivo → mapear colunas → validar → pré-visualizar (nada é
        gravado) → confirmar. Linha inválida nunca é gravada silenciosamente — fica marcada, as
        demais são gravadas normalmente, e as que falharam podem ser reprocessadas depois pelo
        histórico.
      </p>
      <div className="mt-3">
        <Bloco
          titulo="Pessoas (clientes/fornecedores)"
          entidade="pessoas"
          campos={CAMPOS_PESSOAS}
          previewAction={previsualizarImportacaoPessoasAction}
          confirmAction={confirmarImportacaoPessoasAction}
          historico={historico.filter((h) => h.entidade === "pessoas")}
        />
        <Bloco
          titulo="Itens (produtos/materiais)"
          entidade="itens"
          campos={CAMPOS_ITENS}
          previewAction={previsualizarImportacaoItensAction}
          confirmAction={confirmarImportacaoItensAction}
          historico={historico.filter((h) => h.entidade === "itens")}
        />
      </div>
    </section>
  );
}
