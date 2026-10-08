"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  upsertOrcamentoAction,
  upsertOrcamentoItemAction,
  removeOrcamentoItemAction,
  decidirOrcamentoAction,
  cancelarOrcamentoAction,
  vincularOportunidadeOrcamentoAction,
  calcularMaoObraOrcamentoItemAction,
  gerarPropostaAction,
  marcarPropostaEnviadaAction,
  registrarAceitePropostaAction,
  registrarRecusaPropostaAction,
  cancelarPropostaAction,
} from "./actions";
// "Propostas" e "Conversão de orçamentos" deixaram de ser telas à parte —
// viraram ações aqui dentro do orçamento aprovado (decisão com o usuário,
// 2026-10-03). converterOrcamentoAction é a mesma ação que o módulo Pedidos
// já usava; importar de lá em vez de duplicar segue o precedente já usado
// no projeto pra actions de outro módulo (ex.: Topbar.tsx → login/actions).
import { converterOrcamentoAction } from "@/app/pedidos/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import ItemConfiguravelForm, {
  MOTIVO_OPERACAO_LABEL,
  type DefCaracteristica,
} from "./ItemConfiguravelForm";

type Pessoa = { id: string; nome: string };
type Obra = {
  id: string;
  nome: string;
  pessoa_id: string;
  situacao: "ativo" | "inativo";
};
type Item = {
  id: string;
  codigo: string;
  descricao: string;
  unidade_principal: string;
  situacao: "ativo" | "inativo";
};

type Orcamento = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
  responsavel_id: string;
  data_orcamento: string;
  validade: string | null;
  condicao_comercial: string | null;
  observacoes: string | null;
  status: "rascunho" | "aprovado" | "rejeitado" | "cancelado";
  oportunidade_id: string | null;
};

type OportunidadeResumo = {
  id: string;
  descricao: string | null;
  pessoa_id: string;
};

type OrcamentoItem = {
  id: string;
  orcamento_id: string;
  item_id: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number | null;
  custo_mao_obra: number | null;
};

type Caracteristica = {
  peca_caracteristica_id: string;
  nome: string;
  tipo: string;
  unidade: string | null;
  obrigatoria: boolean;
  valor_numero: number | null;
  valor_texto: string | null;
};

type PropostaStatus =
  "rascunho" | "enviada" | "aceita" | "recusada" | "cancelada";

type PropostaSnapshot = {
  numero_orcamento: string;
  valor_total: number;
  condicao_comercial: string | null;
  itens: {
    codigo: string;
    descricao: string;
    quantidade: number;
    preco_unitario: number;
    subtotal: number;
  }[];
};

type Proposta = {
  id: string;
  orcamento_id: string;
  numero: string;
  status: PropostaStatus;
  validade: string;
  snapshot: PropostaSnapshot;
  canal: string | null;
  destinatario: string | null;
};

type PedidoResumo = { id: string; numero: string; orcamento_id: string };

const STATUS_LABEL: Record<Orcamento["status"], string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<
  Orcamento["status"],
  "neutral" | "success" | "danger"
> = {
  rascunho: "neutral",
  aprovado: "success",
  rejeitado: "danger",
  cancelado: "danger",
};

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrcamentosSection({
  orcamentos,
  itensPorOrcamento,
  totais,
  paginacao,
  clientesElegiveis,
  todasPessoas,
  obras,
  itens,
  caracteristicasPorItemId,
  caracteristicasPorOrcamentoItem,
  oportunidadesAbertas,
  canManage,
  propostasPorOrcamentoId,
  canViewPropostas,
  canManagePropostas,
  pedidoPorOrcamentoId,
  canManagePedidos,
}: {
  orcamentos: Orcamento[];
  itensPorOrcamento: Map<string, OrcamentoItem[]>;
  totais: Map<string, number>;
  paginacao: PaginacaoInfo;
  clientesElegiveis: Pessoa[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
  canManage: boolean;
  // Proposta ao cliente e conversão em pedido — ações do próprio orçamento
  // aprovado (ver comentário no import de converterOrcamentoAction acima).
  propostasPorOrcamentoId: Map<string, Proposta[]>;
  canViewPropostas: boolean;
  canManagePropostas: boolean;
  pedidoPorOrcamentoId: Map<string, PedidoResumo>;
  canManagePedidos: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pessoaNome = (id: string) =>
    todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) =>
    id ? (obras.find((o) => o.id === id)?.nome ?? "(obra removida)") : "—";
  const obrasAtivas = obras.filter((o) => o.situacao === "ativo");
  const itensAtivos = itens.filter((i) => i.situacao === "ativo");

  // 2026-10-04: três níveis, aprovados em desenho — lista paginada de
  // orçamentos; clicar expande, na própria tabela, o cabeçalho/decisão/
  // proposta-pedido e a lista numerada dos itens; clicar num item só
  // então abre o modal com o configurador daquele item. "+ Incluir"
  // continua abrindo um modal à parte, já que ainda não existe linha
  // pra expandir (mesmo fluxo contínuo de criação já em uso).
  const [criandoOpen, setCriandoOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Orçamento novo entra no topo da lista (mais recente primeiro): quem
  // está numa página mais adiante volta pra primeira, senão não o veria
  // assim que a linha expandir mostrando os itens.
  function aoCriar(novoId?: string) {
    setCriandoOpen(false);
    if (!novoId) return;
    setExpandedId(novoId);
    if (paginacao.pagina > 1) {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("pagina");
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Orçamentos</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Recorte mínimo do M1 (TÓPICO 10 §4): orçamento simples e decisão de
        aprovação, sem tabela de preços, descontos, versionamento ou proposta
        formal. Orçamento aprovado fica pronto para o módulo de Pedidos (TÓPICO
        3) converter — ainda não implementado. Um orçamento em rascunho pode ser
        editado livremente; depois de decidido, é terminal (corrigir = cancelar
        e criar outro). Clique numa linha para ver itens e decisão.
      </p>

      {canManage && (
        <div className="mb-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => setCriandoOpen(true)}
          >
            + Incluir
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Número</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Data</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {orcamentos.map((orc) => {
              const expandido = expandedId === orc.id;
              const editavel = canManage && orc.status === "rascunho";
              const podeCancelar =
                canManage &&
                (orc.status === "rascunho" || orc.status === "aprovado");
              return (
                <Fragment key={orc.id}>
                  <tr
                    onClick={() =>
                      setExpandedId((prev) => (prev === orc.id ? null : orc.id))
                    }
                    className="cursor-pointer hover:bg-page-bg"
                  >
                    <Td className="font-medium text-text">{orc.numero}</Td>
                    <Td>{pessoaNome(orc.pessoa_id)}</Td>
                    <Td className="text-text-muted">{obraNome(orc.obra_id)}</Td>
                    <Td className="text-text-muted">{orc.data_orcamento}</Td>
                    <Td>
                      <Badge variant={STATUS_TONE[orc.status]}>
                        {STATUS_LABEL[orc.status]}
                      </Badge>
                    </Td>
                    <Td className="text-right font-semibold text-text">
                      {currency(totais.get(orc.id) ?? 0)}
                    </Td>
                    <Td className="text-text-muted">
                      {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </Td>
                  </tr>
                  {expandido && (
                    <tr>
                      <Td colSpan={7} className="bg-page-bg">
                        <OrcamentoReview
                          orcamento={orc}
                          total={totais.get(orc.id) ?? 0}
                          editavel={editavel}
                          podeCancelar={podeCancelar}
                          canManage={canManage}
                          orcItens={itensPorOrcamento.get(orc.id) ?? []}
                          itensAtivos={itensAtivos}
                          itens={itens}
                          caracteristicasPorItemId={caracteristicasPorItemId}
                          caracteristicasPorOrcamentoItem={caracteristicasPorOrcamentoItem}
                          oportunidadesAbertas={oportunidadesAbertas.filter(
                            (o) => o.pessoa_id === orc.pessoa_id,
                          )}
                          clientesElegiveis={clientesElegiveis}
                          obrasAtivas={obrasAtivas}
                          todasPessoas={todasPessoas}
                          obras={obras}
                          pessoaNome={pessoaNome}
                          obraNome={obraNome}
                          propostas={propostasPorOrcamentoId.get(orc.id) ?? []}
                          canViewPropostas={canViewPropostas}
                          canManagePropostas={canManagePropostas}
                          pedido={pedidoPorOrcamentoId.get(orc.id) ?? null}
                          canManagePedidos={canManagePedidos}
                        />
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {orcamentos.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-text-muted">
                  Nenhum orçamento ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Paginacao {...paginacao} />
      </div>

      <Modal
        open={criandoOpen}
        onClose={() => setCriandoOpen(false)}
        title="Novo orçamento"
        size="xl"
      >
        <OrcamentoForm
          clientesElegiveis={clientesElegiveis}
          obrasAtivas={obrasAtivas}
          todasPessoas={todasPessoas}
          obras={obras}
          onSuccess={aoCriar}
          largo
        />
      </Modal>
    </section>
  );
}

function OrcamentoForm({
  orcamento,
  clientesElegiveis,
  obrasAtivas,
  todasPessoas,
  obras,
  onSuccess,
  onCancel,
  largo = false,
}: {
  orcamento?: Orcamento;
  clientesElegiveis: Pessoa[];
  obrasAtivas: Obra[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  // Chamado com o id só quando o orçamento é criado agora (upsert_orcamento
  // devolve o id) — quem chama usa isso pra, na mesma janela, trocar do
  // formulário de cabeçalho para a revisão com os itens (ver aoCriar em
  // OrcamentosSection). Editar um orçamento existente chama sem argumento.
  onSuccess: (novoId?: string) => void;
  // Só quando o form está dentro da consulta inline (ver OrcamentoReview) —
  // o modal de "Novo orçamento" tem seu próprio fechar, não precisa disso.
  onCancel?: () => void;
  // Na janela larga de revisão os campos do cabeçalho ficam em 2 colunas.
  largo?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    upsertOrcamentoAction,
    undefined,
  );
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !(state && "error" in state)) {
      onSuccess(state && "id" in state ? state.id : undefined);
    }
    wasPending.current = isPending;
  }, [isPending, state, onSuccess]);

  const pessoaNome = (id: string) =>
    todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  // Guard de seleção atual: cliente/obra do orçamento podem ter saído da
  // lista elegível (papel desligado / obra inativada) depois que o
  // orçamento foi criado — sem incluir a opção atual, o <select> cai
  // silenciosamente na primeira opção da lista e salvar reatribui o
  // orçamento por engano.
  const pessoaAtual = orcamento
    ? todasPessoas.find((p) => p.id === orcamento.pessoa_id)
    : undefined;
  const pessoaOpcoes =
    pessoaAtual && !clientesElegiveis.some((p) => p.id === pessoaAtual.id)
      ? [pessoaAtual, ...clientesElegiveis]
      : clientesElegiveis;
  const obraAtual = orcamento?.obra_id
    ? obras.find((o) => o.id === orcamento.obra_id)
    : undefined;
  const obraOpcoes =
    obraAtual && !obrasAtivas.some((o) => o.id === obraAtual.id)
      ? [obraAtual, ...obrasAtivas]
      : obrasAtivas;

  if (!orcamento && clientesElegiveis.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Nenhuma pessoa com papel Cliente ativo — cadastre um em Comercial → Clientes antes.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className={
        largo ? "grid grid-cols-2 gap-x-4 gap-y-2.5" : "flex flex-col gap-2.5"
      }
    >
      {orcamento && <input type="hidden" name="id" value={orcamento.id} />}
      <div>
        <label className="mb-1 block text-xs text-text-muted">Cliente</label>
        <Select
          name="pessoa_id"
          defaultValue={orcamento?.pessoa_id ?? ""}
          required
          className="w-full"
        >
          {!orcamento && (
            // `hidden` em vez de `disabled`: um placeholder desabilitado faz
            // alguns navegadores não disparar o primeiro `onChange` real
            // (a opção escolhida não "gruda" na primeira tentativa, só na
            // segunda) — problema relatado pelo usuário, 2026-10-04.
            <option value="" hidden>
              Selecione...
            </option>
          )}
          {pessoaOpcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {pessoaAtual?.id === p.id &&
              !clientesElegiveis.some((c) => c.id === p.id)
                ? " (papel desligado)"
                : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Obra</label>
        <Select
          name="obra_id"
          defaultValue={orcamento?.obra_id ?? ""}
          className="w-full"
        >
          <option value="">Sem obra</option>
          {obraOpcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} ({pessoaNome(o.pessoa_id)})
              {obraAtual?.id === o.id && !obrasAtivas.some((a) => a.id === o.id)
                ? " (inativa)"
                : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Validade</label>
        <Input
          name="validade"
          type="date"
          defaultValue={orcamento?.validade ?? ""}
          className="w-full"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">
          Condição comercial
        </label>
        <Input
          name="condicao_comercial"
          placeholder="ex.: 30/60/90 dias"
          defaultValue={orcamento?.condicao_comercial ?? ""}
          className="w-full"
        />
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-text-muted">
          Observações
        </label>
        <Input
          name="observacoes"
          placeholder="observações"
          defaultValue={orcamento?.observacoes ?? ""}
          className="w-full"
        />
      </div>
      {state && "error" in state && (
        <p className="col-span-2 text-xs text-danger">{state.error}</p>
      )}
      <div className="col-span-2 mt-1 flex gap-1.5">
        <Button type="submit" variant="primary" disabled={isPending} className="w-fit">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} className="w-fit">
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

// Modal de revisão aberto ao clicar numa linha da lista — cabeçalho
// (editável só em rascunho), itens e decisão, tudo num só lugar em vez de
// espalhado pela página. Fica aberto depois de Aprovar/Rejeitar/Cancelar
// (o conteúdo se atualiza sozinho com o novo status, já que `orcamento`
// vem de `orcamentos.find(...)` no componente pai) — quem revisa decide
// quando fechar.
function OrcamentoReview({
  orcamento,
  total,
  editavel,
  podeCancelar,
  canManage,
  orcItens,
  itensAtivos,
  itens,
  caracteristicasPorItemId,
  caracteristicasPorOrcamentoItem,
  oportunidadesAbertas,
  clientesElegiveis,
  obrasAtivas,
  todasPessoas,
  obras,
  pessoaNome,
  obraNome,
  propostas,
  canViewPropostas,
  canManagePropostas,
  pedido,
  canManagePedidos,
}: {
  orcamento: Orcamento;
  total: number;
  editavel: boolean;
  podeCancelar: boolean;
  canManage: boolean;
  orcItens: OrcamentoItem[];
  itensAtivos: Item[];
  itens: Item[];
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
  clientesElegiveis: Pessoa[];
  obrasAtivas: Obra[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  pessoaNome: (id: string) => string;
  obraNome: (id: string | null) => string;
  propostas: Proposta[];
  canViewPropostas: boolean;
  canManagePropostas: boolean;
  pedido: PedidoResumo | null;
  canManagePedidos: boolean;
}) {
  const origemOportunidade = orcamento.oportunidade_id
    ? (oportunidadesAbertas.find((o) => o.id === orcamento.oportunidade_id)
        ?.descricao ?? orcamento.oportunidade_id)
    : null;
  // 2026-10-04: expandir o orçamento abre em consulta — o cabeçalho
  // (cliente/obra/validade/condição/observações) só vira formulário depois
  // de "Editar cabeçalho", mesmo padrão já aplicado em Clientes/RH/
  // Contratos. `editavel` continua sendo a regra de negócio (só rascunho
  // pode editar) — isso só controla SE o botão aparece, não o formulário em
  // si.
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={STATUS_TONE[orcamento.status]}>
          {STATUS_LABEL[orcamento.status]}
        </Badge>
        <span className="text-text-muted">{orcamento.data_orcamento}</span>
        <span className="ml-auto text-sm font-semibold text-text">
          {currency(total)}
        </span>
      </div>

      {editavel && editandoCabecalho ? (
        <OrcamentoForm
          orcamento={orcamento}
          clientesElegiveis={clientesElegiveis}
          obrasAtivas={obrasAtivas}
          todasPessoas={todasPessoas}
          obras={obras}
          onSuccess={() => setEditandoCabecalho(false)}
          onCancel={() => setEditandoCabecalho(false)}
          largo
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <dt className="text-text-muted">Cliente</dt>
              <dd className="text-text">{pessoaNome(orcamento.pessoa_id)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Obra</dt>
              <dd className="text-text">{obraNome(orcamento.obra_id)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Validade</dt>
              <dd className="text-text">{orcamento.validade ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Condição comercial</dt>
              <dd className="text-text">{orcamento.condicao_comercial ?? "—"}</dd>
            </div>
            {orcamento.observacoes && (
              <div className="col-span-2">
                <dt className="text-text-muted">Observações</dt>
                <dd className="text-text">{orcamento.observacoes}</dd>
              </div>
            )}
          </dl>
          {editavel && (
            <Button type="button" variant="secondary" size="sm" className="mt-1.5" onClick={() => setEditandoCabecalho(true)}>
              Editar cabeçalho
            </Button>
          )}
        </>
      )}

      {editavel && !editandoCabecalho && (
        <OportunidadeVinculoForm
          orcamentoId={orcamento.id}
          oportunidadeAtualId={orcamento.oportunidade_id}
          oportunidades={oportunidadesAbertas}
        />
      )}
      {!editavel && origemOportunidade && (
        <p className="text-xs text-text-muted">
          Origem: oportunidade {origemOportunidade}
        </p>
      )}

      <OrcamentoItensLista
        orcamentoId={orcamento.id}
        orcItens={orcItens}
        itensAtivos={itensAtivos}
        itens={itens}
        editavel={editavel}
        canManage={canManage}
        caracteristicasPorItemId={caracteristicasPorItemId}
        caracteristicasPorOrcamentoItem={caracteristicasPorOrcamentoItem}
      />

      {orcamento.status === "aprovado" &&
        (canViewPropostas || canManagePedidos) && (
          <PropostaEPedido
            orcamento={orcamento}
            propostas={propostas}
            canViewPropostas={canViewPropostas}
            canManagePropostas={canManagePropostas}
            pedido={pedido}
            canManagePedidos={canManagePedidos}
          />
        )}

      {canManage && orcamento.status === "rascunho" && (
        <div className="flex gap-1.5">
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <input type="hidden" name="decisao" value="aprovado" />
            <Button type="submit" variant="primary">
              Aprovar
            </Button>
          </form>
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <input type="hidden" name="decisao" value="rejeitado" />
            <Button type="submit" variant="danger">
              Rejeitar
            </Button>
          </form>
          <form action={cancelarOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <Button type="submit" variant="danger">
              Cancelar
            </Button>
          </form>
        </div>
      )}
      {canManage && !editavel && podeCancelar && (
        <div className="flex gap-1.5">
          <form action={cancelarOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <Button type="submit" variant="danger">
              Cancelar
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

const PROPOSTA_STATUS_LABEL: Record<PropostaStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const PROPOSTA_STATUS_TONE: Record<
  PropostaStatus,
  "neutral" | "success" | "danger" | "warning"
> = {
  rascunho: "neutral",
  enviada: "warning",
  aceita: "success",
  recusada: "danger",
  cancelada: "danger",
};

function propostaVencida(proposta: Proposta) {
  return (
    proposta.status === "enviada" &&
    proposta.validade < new Date().toISOString().slice(0, 10)
  );
}

// Proposta ao cliente e conversão em pedido do orçamento aprovado — ex-telas
// "Propostas" (Comercial) e "Conversão de orçamentos" (Pedidos), fundidas
// aqui dentro do próprio orçamento (decisão com o usuário, 2026-10-03): nada
// de custo/margem aparece neste bloco, só o que já era visível nas telas
// antigas.
function PropostaEPedido({
  orcamento,
  propostas,
  canViewPropostas,
  canManagePropostas,
  pedido,
  canManagePedidos,
}: {
  orcamento: Orcamento;
  propostas: Proposta[];
  canViewPropostas: boolean;
  canManagePropostas: boolean;
  pedido: PedidoResumo | null;
  canManagePedidos: boolean;
}) {
  // Uma proposta "ativa" (não cancelada/recusada) bloqueia gerar outra —
  // mesma regra que já existia na tela separada.
  const propostaAtiva = propostas.some(
    (p) => p.status !== "cancelada" && p.status !== "recusada",
  );

  return (
    <div className="flex flex-col gap-3 rounded border border-border-subtle bg-page-bg p-3">
      {canViewPropostas && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-text">
            Proposta ao cliente
          </h3>
          {propostas.length === 0 && (
            <p className="text-xs text-text-muted">
              Nenhuma proposta gerada ainda.
            </p>
          )}
          {propostas.map((p) => (
            <PropostaCard
              key={p.id}
              proposta={p}
              canManage={canManagePropostas}
            />
          ))}
          {canManagePropostas && !propostaAtiva && (
            <form
              action={gerarPropostaAction}
              className="flex flex-wrap items-center gap-1.5"
            >
              <input type="hidden" name="orcamento_id" value={orcamento.id} />
              <label className="flex items-center gap-1 text-xs text-text">
                Validade
                <Input name="validade" type="date" required />
              </label>
              <Button type="submit" variant="primary">
                Gerar proposta
              </Button>
            </form>
          )}
        </div>
      )}

      {canManagePedidos && (
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
          <h3 className="text-xs font-semibold text-text">Pedido</h3>
          {pedido ? (
            <p className="text-xs text-text">
              Convertido em{" "}
              <a
                href={`/pedidos?pedido=${pedido.id}`}
                className="font-medium text-primary underline"
              >
                pedido {pedido.numero}
              </a>
              .
            </p>
          ) : (
            <form action={converterOrcamentoAction}>
              <input type="hidden" name="orcamento_id" value={orcamento.id} />
              <Button type="submit" variant="primary">
                Converter em pedido
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PropostaCard({
  proposta,
  canManage,
}: {
  proposta: Proposta;
  canManage: boolean;
}) {
  const vencida = propostaVencida(proposta);
  return (
    <Card padding="xs">
      <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
        <strong className="text-[13px] text-text">{proposta.numero}</strong>
        <Badge variant={PROPOSTA_STATUS_TONE[proposta.status]}>
          {PROPOSTA_STATUS_LABEL[proposta.status]}
        </Badge>
        {vencida && <Badge variant="danger">Vencida</Badge>}
        <span className="text-text-muted">validade: {proposta.validade}</span>
        <span className="ml-auto font-semibold text-text">
          {currency(proposta.snapshot.valor_total)}
        </span>
      </div>

      <ul className="mt-1.5 text-xs text-text-muted">
        {proposta.snapshot.itens.map((it) => (
          <li key={it.codigo}>
            {it.codigo} — {it.descricao}: {it.quantidade} ×{" "}
            {currency(it.preco_unitario)} = {currency(it.subtotal)}
          </li>
        ))}
      </ul>

      {canManage && proposta.status === "rascunho" && (
        <form
          action={marcarPropostaEnviadaAction}
          className="mt-2 flex flex-wrap items-center gap-1.5"
        >
          <input type="hidden" name="id" value={proposta.id} />
          <Input
            name="canal"
            placeholder="canal (e-mail, portal...)"
            className="w-40"
          />
          <Input
            name="destinatario"
            placeholder="destinatário"
            className="w-44"
          />
          <Button type="submit" variant="primary">
            Marcar como enviada
          </Button>
        </form>
      )}

      {canManage && proposta.status === "enviada" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <form action={registrarAceitePropostaAction}>
            <input type="hidden" name="id" value={proposta.id} />
            <input type="hidden" name="forcar" value="false" />
            <Button type="submit" variant="primary" disabled={vencida}>
              Registrar aceite
            </Button>
          </form>
          {vencida && (
            <form action={registrarAceitePropostaAction}>
              <input type="hidden" name="id" value={proposta.id} />
              <input type="hidden" name="forcar" value="true" />
              <Button type="submit" variant="secondary">
                Aceitar mesmo vencida
              </Button>
            </form>
          )}
          <form
            action={registrarRecusaPropostaAction}
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="id" value={proposta.id} />
            <Input
              name="observacao"
              placeholder="motivo da recusa"
              className="w-40"
            />
            <Button type="submit" variant="danger">
              Registrar recusa
            </Button>
          </form>
        </div>
      )}

      {canManage &&
        (proposta.status === "rascunho" || proposta.status === "enviada") && (
          <form action={cancelarPropostaAction} className="mt-1.5">
            <input type="hidden" name="id" value={proposta.id} />
            <Button type="submit" variant="danger">
              Cancelar proposta
            </Button>
          </form>
        )}
    </Card>
  );
}

function OportunidadeVinculoForm({
  orcamentoId,
  oportunidadeAtualId,
  oportunidades,
}: {
  orcamentoId: string;
  oportunidadeAtualId: string | null;
  oportunidades: OportunidadeResumo[];
}) {
  if (oportunidadeAtualId) {
    const op = oportunidades.find((o) => o.id === oportunidadeAtualId);
    return (
      <p className="text-xs text-text-muted">
        Origem: oportunidade {op?.descricao ?? oportunidadeAtualId}
      </p>
    );
  }
  if (oportunidades.length === 0) return null;

  return (
    <form
      action={vincularOportunidadeOrcamentoAction}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="orcamento_id" value={orcamentoId} />
      <Select
        name="oportunidade_id"
        defaultValue=""
        required
        className="min-w-40"
      >
        <option value="" hidden>
          Vincular a oportunidade
        </option>
        {oportunidades.map((o) => (
          <option key={o.id} value={o.id}>
            {o.descricao ?? o.id}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary">
        Vincular
      </Button>
    </form>
  );
}

function itemLabel(itens: Item[], id: string) {
  const it = itens.find((i) => i.id === id);
  return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
}

// Margem/markup nunca ficam persistidos (ver comentário da migration) —
// só derivados aqui, na hora de exibir, a partir de preço e custo.
function margemPercentual(preco: number, custo: number | null) {
  if (custo === null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

// Resumo de uma linha fechada ("Largura: 0.9 m · Altura: 2.1 m") — mesma
// informação que já aparecia sempre visível, agora só no resumo da lista
// compacta; o detalhe completo mora no painel que abre ao clicar na linha.
function resumoCaracteristicas(caracteristicas: Caracteristica[]): string {
  if (caracteristicas.length === 0) return "—";
  return caracteristicas
    .map(
      (c) =>
        `${c.nome}: ${c.valor_numero ?? c.valor_texto ?? "—"}${c.unidade ? ` ${c.unidade}` : ""}`,
    )
    .join(" · ");
}

// Itens do orçamento aparecem como lista compacta (posição, item, resumo,
// qtd, preço, subtotal) — abrir um item (clique na linha) troca a linha
// pelo formulário completo (configurador ou campos simples) no lugar só
// daquele item; só um fica aberto por vez, pra tela não crescer sem
// controle. Trocar de item com alteração não salva pede confirmação; salvar
// ou remover fecha o item de volta pra forma compacta.
function OrcamentoItensLista({
  orcamentoId,
  orcItens,
  itensAtivos,
  itens,
  editavel,
  canManage,
  caracteristicasPorItemId,
  caracteristicasPorOrcamentoItem,
}: {
  orcamentoId: string;
  orcItens: OrcamentoItem[];
  itensAtivos: Item[];
  itens: Item[];
  editavel: boolean;
  canManage: boolean;
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
}) {
  // 2026-10-04: nível 3 do desenho aprovado — a linha do item não
  // expande mais inline; clicar abre o modal com o configurador (ou o
  // detalhe, se não editável). "Alterações não salvas" agora só precisa
  // guardar contra o fechamento do modal, não mais contra trocar de
  // item (só um fica aberto por vez de qualquer forma).
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [itemAlterado, setItemAlterado] = useState(false);

  function abrir(chave: string) {
    setViewItemId(chave);
    setItemAlterado(false);
  }

  function fechar() {
    if (
      itemAlterado &&
      !window.confirm("Há alterações não salvas neste item. Fechar mesmo assim?")
    )
      return;
    setViewItemId(null);
    setItemAlterado(false);
  }

  function aoSalvarOuRemover() {
    setViewItemId(null);
    setItemAlterado(false);
  }

  const criandoItem = viewItemId === "novo";
  const itemViewing = !criandoItem
    ? (orcItens.find((oi) => oi.id === viewItemId) ?? null)
    : null;
  const custoTotalViewing =
    itemViewing && itemViewing.custo_unitario !== null
      ? itemViewing.custo_unitario + (itemViewing.custo_mao_obra ?? 0)
      : null;

  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th className="w-10">Pos.</Th>
            <Th>Item</Th>
            <Th>Resumo</Th>
            <Th>Qtd</Th>
            <Th>Preço unit.</Th>
            <Th>Subtotal</Th>
          </tr>
        </thead>
        <tbody>
          {orcItens.map((oi, idx) => {
            const caracteristicas = caracteristicasPorOrcamentoItem.get(oi.id) ?? [];
            return (
              <tr
                key={oi.id}
                onClick={() => abrir(oi.id)}
                className="cursor-pointer hover:bg-page-bg"
              >
                <Td className="text-text-muted">{idx + 1}</Td>
                <Td className="font-medium text-text">{itemLabel(itens, oi.item_id)}</Td>
                <Td
                  className="max-w-[260px] truncate text-text-muted"
                  title={resumoCaracteristicas(caracteristicas)}
                >
                  {resumoCaracteristicas(caracteristicas)}
                </Td>
                <Td>{oi.quantidade}</Td>
                <Td>{currency(oi.preco_unitario)}</Td>
                <Td>{currency(oi.quantidade * oi.preco_unitario)}</Td>
              </tr>
            );
          })}
          {editavel && (
            <tr onClick={() => abrir("novo")} className="cursor-pointer text-primary hover:bg-page-bg">
              <Td colSpan={6}>+ Adicionar item (posição {orcItens.length + 1})</Td>
            </tr>
          )}
          {!editavel && orcItens.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-text-muted">
                Nenhum item.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      <Modal
        open={criandoItem || itemViewing !== null}
        onClose={fechar}
        title={
          criandoItem
            ? "Novo item"
            : itemViewing
              ? itemLabel(itens, itemViewing.item_id)
              : "Item"
        }
        size="lg"
      >
        {editavel ? (
          (criandoItem || itemViewing) && (
            <ItemEditavelExpandido
              item={itemViewing}
              orcamentoId={orcamentoId}
              itensAtivos={itensAtivos}
              itemAtualFallback={
                itemViewing ? itens.find((i) => i.id === itemViewing.item_id) : undefined
              }
              canManage={canManage}
              caracteristicasPorItemId={caracteristicasPorItemId}
              caracteristicas={
                itemViewing ? caracteristicasPorOrcamentoItem.get(itemViewing.id) ?? [] : []
              }
              onSaved={aoSalvarOuRemover}
              onDirtyChange={setItemAlterado}
            />
          )
        ) : (
          itemViewing && (
            <ItemDetalhesSomenteLeitura
              item={itemViewing}
              canManage={canManage}
              caracteristicas={caracteristicasPorOrcamentoItem.get(itemViewing.id) ?? []}
              custoTotal={custoTotalViewing}
              margem={margemPercentual(itemViewing.preco_unitario, custoTotalViewing)}
            />
          )
        )}
      </Modal>
    </div>
  );
}

// Corpo do item aberto para edição — mesma decisão de sempre entre peça
// configurável (ItemConfiguravelForm, características + cálculo automático)
// e item simples (ItemSimplesForm). O select de item continua trocável
// mesmo num item já salvo (permite corrigir o item escolhido).
function ItemEditavelExpandido({
  item,
  orcamentoId,
  itensAtivos,
  itemAtualFallback,
  canManage,
  caracteristicasPorItemId,
  caracteristicas,
  onSaved,
  onDirtyChange,
}: {
  item: OrcamentoItem | null;
  orcamentoId: string;
  itensAtivos: Item[];
  itemAtualFallback?: Item;
  canManage: boolean;
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicas: Caracteristica[];
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [itemSel, setItemSel] = useState(item?.item_id ?? "");
  // Mesmo guard de seleção atual do cabeçalho: sem isso, editar um item cujo
  // cadastro foi desativado troca silenciosamente o item da linha ao salvar.
  const itemOpcoes =
    itemAtualFallback && !itensAtivos.some((i) => i.id === itemAtualFallback.id)
      ? [itemAtualFallback, ...itensAtivos]
      : itensAtivos;

  // O <select> fica numa posição ESTÁVEL da árvore (direto aqui, fora de
  // ItemConfiguravelForm/ItemSimplesForm) de propósito: escolher uma peça
  // pode trocar qual dos dois formulários está montado (a característica
  // determina configurável x simples), e esses dois são remontados via
  // `key`/troca de tipo. Um <select> nativo que vive DENTRO do que acabou
  // de ser destruído e recriado pelo seu próprio evento de troca perde a
  // primeira escolha em alguns navegadores — só a segunda "gruda"
  // (problema relatado pelo usuário, 2026-10-04). Com o select fora dessa
  // troca, o nó do DOM nunca é destruído por causa da própria seleção.
  const itemSelectEl = (
    <Select
      name="item_id"
      value={itemSel}
      onChange={(e) => {
        setItemSel(e.target.value);
        onDirtyChange(true);
      }}
      required
      className="min-w-40"
    >
      <option value="" hidden>
        Item
      </option>
      {itemOpcoes.map((it) => (
        <option key={it.id} value={it.id}>
          {it.codigo} — {it.descricao}
          {itemAtualFallback?.id === it.id &&
          !itensAtivos.some((a) => a.id === it.id)
            ? " (inativo)"
            : ""}
        </option>
      ))}
    </Select>
  );

  const removerForm = item && (
    <RemoverItemForm itemId={item.id} onSaved={onSaved} />
  );

  // Peça configurável: as características aparecem assim que o item é
  // escolhido, e custo + mão de obra + preço se calculam sozinhos (ADR-012
  // v1.1) — sem item gravado antes e sem preço digitado antes.
  const definicoes = caracteristicasPorItemId.get(itemSel);
  return (
    <div className="flex flex-col gap-2">
      <div>{itemSelectEl}</div>
      {definicoes ? (
        <ItemConfiguravelForm
          key={`${item?.id ?? "novo"}:${itemSel}`}
          orcamentoId={item?.orcamento_id ?? orcamentoId}
          item={
            item
              ? {
                  id: item.id,
                  quantidade: item.quantidade,
                  preco_unitario: item.preco_unitario,
                }
              : null
          }
          itemId={itemSel}
          definicoes={definicoes}
          valoresSalvos={
            item && item.item_id === itemSel ? caracteristicas : []
          }
          onSaved={onSaved}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <ItemSimplesForm
          item={item}
          orcamentoId={orcamentoId}
          itemSel={itemSel}
          canManage={canManage}
          onSaved={onSaved}
          onDirtyChange={onDirtyChange}
        />
      )}
      {removerForm}
      {!definicoes && item && canManage && (
        <CalculadoraMaoDeObraConfigurador orcamentoItemId={item.id} />
      )}
    </div>
  );
}

// Item simples (sem configurador): mesmos campos de sempre. Chama a action
// diretamente (em vez de `action={...}` no form) pra saber quando terminou
// e poder fechar o item de volta pra lista compacta.
function ItemSimplesForm({
  item,
  orcamentoId,
  itemSel,
  canManage,
  onSaved,
  onDirtyChange,
}: {
  item: OrcamentoItem | null;
  orcamentoId: string;
  // O <select> de item é renderizado pelo chamador (fora deste form, numa
  // posição estável — ver comentário em ItemEditavelExpandido); aqui só
  // precisamos do valor já escolhido, pra mandar junto no FormData.
  itemSel: string;
  canManage: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const subtotal = item ? item.quantidade * item.preco_unitario : 0;

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // O <select> de item mora fora deste form (ver comentário acima), então
    // perdeu a validação nativa `required` do navegador — repõe aqui.
    if (!itemSel) {
      setErro("Escolha um item.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await upsertOrcamentoItemAction(new FormData(e.currentTarget));
      onDirtyChange(false);
      onSaved();
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : "Não foi possível salvar o item.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      onInput={() => onDirtyChange(true)}
      className="flex flex-wrap items-center gap-1.5"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <input
        type="hidden"
        name="orcamento_id"
        value={item?.orcamento_id ?? orcamentoId}
      />
      <input type="hidden" name="item_id" value={itemSel} />
      <Input
        name="quantidade"
        type="number"
        step="0.001"
        min="0.001"
        placeholder="qtd"
        defaultValue={item?.quantidade ?? ""}
        required
        className="w-[70px]"
      />
      <Input
        name="preco_unitario"
        type="number"
        step="0.01"
        min="0"
        placeholder="preço unit."
        defaultValue={item?.preco_unitario ?? ""}
        required
        className="w-[90px]"
      />
      {canManage && (
        <Input
          id={item ? `custo-unitario-${item.id}` : undefined}
          name="custo_unitario"
          type="number"
          step="0.01"
          min="0"
          placeholder="custo (interno)"
          defaultValue={item?.custo_unitario ?? ""}
          className="w-[110px]"
        />
      )}
      {canManage && (
        <Input
          id={item ? `custo-mao-obra-${item.id}` : undefined}
          name="custo_mao_obra"
          type="number"
          step="0.01"
          min="0"
          placeholder="mão de obra"
          defaultValue={item?.custo_mao_obra ?? ""}
          className="w-[110px]"
        />
      )}
      <Button type="submit" variant="primary" disabled={enviando}>
        {enviando ? "Salvando..." : item ? "Salvar" : "Adicionar"}
      </Button>
      {item && (
        <span className="text-text-muted">subtotal: {currency(subtotal)}</span>
      )}
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </form>
  );
}

function RemoverItemForm({
  itemId,
  onSaved,
}: {
  itemId: string;
  onSaved: () => void;
}) {
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (!window.confirm("Remover este item do orçamento?")) return;
    setRemovendo(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.set("id", itemId);
      await removeOrcamentoItemAction(fd);
      onSaved();
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : "Não foi possível remover o item.",
      );
      setRemovendo(false);
    }
  }

  return (
    <div className="mt-1">
      <Button
        type="button"
        variant="danger"
        onClick={remover}
        disabled={removendo}
      >
        {removendo ? "Removendo..." : "Remover"}
      </Button>
      {erro && <p className="mt-1 text-xs text-danger">{erro}</p>}
    </div>
  );
}

// Painel só de leitura de uma linha aberta num orçamento já decidido — as
// mesmas informações que antes ficavam sempre visíveis, agora só quando o
// vendedor clica pra conferir. Custo/margem continuam restritos a quem já
// podia vê-los antes (canManage).
function ItemDetalhesSomenteLeitura({
  item,
  canManage,
  caracteristicas,
  custoTotal,
  margem,
}: {
  item: OrcamentoItem;
  canManage: boolean;
  caracteristicas: Caracteristica[];
  custoTotal: number | null;
  margem: number | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
      {caracteristicas.length > 0 && (
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-text-muted">Características (configurador)</dt>
          <dd className="text-text">
            {resumoCaracteristicas(caracteristicas)}
          </dd>
        </div>
      )}
      {canManage && (
        <div>
          <dt className="text-text-muted">Custo</dt>
          <dd className="text-text">
            {item.custo_unitario !== null ? currency(item.custo_unitario) : "—"}
            {item.custo_mao_obra !== null && (
              <> + MO {currency(item.custo_mao_obra)}</>
            )}
          </dd>
        </div>
      )}
      {canManage && (
        <div>
          <dt className="text-text-muted">Custo total</dt>
          <dd className="text-text">
            {custoTotal !== null ? currency(custoTotal) : "—"}
          </dd>
        </div>
      )}
      {canManage && (
        <div>
          <dt className="text-text-muted">Margem</dt>
          <dd className="text-text">
            {margem !== null ? `${margem.toFixed(1)}%` : "—"}
          </dd>
        </div>
      )}
    </dl>
  );
}

type OperacaoMaoObra = {
  operacao_id: string;
  sequencia: number;
  descricao: string;
  recurso_nome?: string;
  tempo_previsto_minutos?: number;
  custo_hora?: number;
  custo_operacao?: number;
  motivo?: string;
};
type CalculoMaoObraResultado = {
  tem_roteiro: boolean;
  custo_total?: number;
  operacoes?: OperacaoMaoObra[];
  operacoes_sem_custo?: OperacaoMaoObra[];
};

// ADR-012 Fase 4 — leitura pura, o vendedor decide se aplica o resultado
// (nunca autoridade cega). Só para itens que NÃO são peça configurável: nas
// peças, a mão de obra já entra no cálculo automático (ADR-012 v1.1).
function CalculadoraMaoDeObraConfigurador({
  orcamentoItemId,
}: {
  orcamentoItemId: string;
}) {
  const [resultado, setResultado] = useState<CalculoMaoObraResultado | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setPending(true);
    setError(null);
    const r = await calcularMaoObraOrcamentoItemAction(orcamentoItemId);
    setPending(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setResultado(r.data as CalculoMaoObraResultado);
  }

  function usarCusto() {
    if (resultado?.custo_total === undefined) return;
    const campo = document.getElementById(
      `custo-mao-obra-${orcamentoItemId}`,
    ) as HTMLInputElement | null;
    if (campo) campo.value = String(resultado.custo_total);
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-page-bg p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">
          Mão de obra (roteiro produtivo, ADR-012):
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={calcular}
          disabled={pending}
        >
          {pending ? "Calculando..." : "Calcular"}
        </Button>
        {resultado?.custo_total !== undefined && (
          <Button type="button" variant="primary" onClick={usarCusto}>
            Usar este custo ({currency(resultado.custo_total)})
          </Button>
        )}
      </div>
      {error && <p className="text-danger">{error}</p>}
      {resultado && !resultado.tem_roteiro && (
        <p className="text-text-muted">
          Este item não tem roteiro produtivo ativo cadastrado — mão de obra
          continua manual.
        </p>
      )}
      {resultado?.tem_roteiro && (
        <div className="flex flex-col gap-0.5">
          {(resultado.operacoes ?? []).map((o) => (
            <div key={o.operacao_id} className="flex justify-between">
              <span>
                {o.sequencia}. {o.descricao} ({o.recurso_nome},{" "}
                {o.tempo_previsto_minutos}min × {currency(o.custo_hora ?? 0)}/h)
              </span>
              <span>{currency(o.custo_operacao ?? 0)}</span>
            </div>
          ))}
          {(resultado.operacoes_sem_custo ?? []).length > 0 && (
            <p className="text-danger">
              Sem custo calculável:{" "}
              {(resultado.operacoes_sem_custo ?? [])
                .map(
                  (o) =>
                    `${o.sequencia}. ${o.descricao} (${MOTIVO_OPERACAO_LABEL[o.motivo ?? ""] ?? o.motivo})`,
                )
                .join(", ")}{" "}
              — não entram no total acima.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
