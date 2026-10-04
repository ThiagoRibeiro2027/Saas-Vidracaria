"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { calcularPrecoConfiguradorAction, salvarItemConfiguradoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type DefCaracteristica = {
  id: string;
  nome: string;
  tipo: string;
  unidade: string | null;
  opcoes: string[] | null;
  obrigatoria: boolean;
  papel_dimensional: string | null;
};

type ValorSalvo = { peca_caracteristica_id: string; valor_numero: number | null; valor_texto: string | null };

type ItemExistente = { id: string; quantidade: number; preco_unitario: number };

type Componente = {
  item_id: string;
  codigo: string;
  descricao: string;
  quantidade: number | null;
  custo_unitario?: number;
  subtotal?: number;
  comprimento_metros?: number;
};

type Operacao = {
  operacao_id: string;
  sequencia: number;
  descricao: string;
  recurso_nome?: string;
  tempo_previsto_minutos?: number;
  custo_hora?: number;
  custo_operacao?: number;
  motivo?: string;
};

type Calculo = {
  aplica_configurador: boolean;
  custo_completo?: boolean;
  custo_material?: number;
  custo_mao_obra?: number | null;
  custo_total?: number;
  margem_percentual?: number | null;
  preco_sugerido?: number | null;
  motivo_sem_preco?: string | null;
  caracteristicas_pendentes?: string[];
  material?: { componentes?: Componente[]; materiais_sem_custo?: Componente[] };
  mao_obra?: { tem_roteiro: boolean; operacoes?: Operacao[]; operacoes_sem_custo?: Operacao[] };
};

type Valores = Record<string, { n?: number; t?: string }>;

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const MOTIVO_OPERACAO_LABEL: Record<string, string> = {
  sem_tempo_previsto: "sem tempo previsto no roteiro",
  sem_recurso_definido: "sem recurso definido na operação",
  recurso_sem_custo_hora: "recurso sem custo/hora cadastrado",
};

// Por que o sistema não sugeriu preço — sempre dito em voz alta, nunca
// assumindo zero em silêncio (ADR-012).
function mensagemSemPreco(calculo: Calculo): string | null {
  switch (calculo.motivo_sem_preco) {
    case "caracteristicas_pendentes":
      return `Informe: ${(calculo.caracteristicas_pendentes ?? []).join(", ")}.`;
    case "dimensoes_pendentes":
      return "Informe largura e altura para calcular.";
    case "unidade_dimensao_invalida":
      return "A unidade de largura/altura desta peça precisa ser mm, cm ou m (corrija no cadastro da peça) — digite o preço manualmente.";
    case "sem_componentes_custeados":
      return "Nenhum componente da peça tem custo — digite o preço manualmente.";
    case "custo_material_incompleto":
      return "Há material sem histórico de compra (veja acima) — digite o preço manualmente.";
    case "custo_mao_obra_incompleto":
      return "Há operação sem tempo ou custo/hora (veja acima) — digite o preço manualmente.";
    case "margem_nao_configurada":
      return "Margem de preço da empresa não configurada (Configurações → Margem de preço) — digite o preço manualmente.";
    default:
      return null;
  }
}

// Largura e altura primeiro (nessa ordem), depois as demais características.
function ordenarDefinicoes(defs: DefCaracteristica[]): DefCaracteristica[] {
  const posicao = (d: DefCaracteristica) => (d.papel_dimensional === "largura" ? 0 : d.papel_dimensional === "altura" ? 1 : 2);
  return [...defs].sort((a, b) => posicao(a) - posicao(b));
}

function montarValores(defs: DefCaracteristica[], digitado: Record<string, string>): Valores {
  const out: Valores = {};
  for (const d of defs) {
    const raw = (digitado[d.id] ?? "").trim();
    if (!raw) continue;
    if (d.tipo === "numero") {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) continue;
      if (d.papel_dimensional && n <= 0) continue;
      out[d.id] = { n };
    } else {
      out[d.id] = { t: raw };
    }
  }
  return out;
}

export default function ItemConfiguravelForm({
  orcamentoId,
  item,
  itemId,
  definicoes,
  valoresSalvos,
  onSaved,
  onDirtyChange,
}: {
  orcamentoId: string;
  item: ItemExistente | null;
  itemId: string;
  // O <select> de item é renderizado pelo chamador (ItemEditavelExpandido,
  // em OrcamentosSection.tsx), fora deste formulário, numa posição estável
  // da árvore — esse componente é remontado a cada troca de peça (via
  // `key`), e um <select> nativo que fica DENTRO do que acabou de disparar
  // o próprio evento de troca pode "perder" a primeira escolha em alguns
  // navegadores (relatado pelo usuário, 2026-10-04). `itemId` já chega como
  // prop; não precisa do elemento do select aqui.
  definicoes: DefCaracteristica[];
  valoresSalvos: ValorSalvo[];
  onSaved?: () => void;
  // Lista compacta de itens (OrcamentosSection) usa isso pra avisar antes de
  // trocar de item com edição em andamento — dispara junto de todo lugar que
  // já zera `salvo` (mesmos pontos: é exatamente "algo mudou desde o último
  // salvo").
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [quantidade, setQuantidade] = useState(item ? String(item.quantidade) : "1");
  const [digitado, setDigitado] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const v of valoresSalvos) {
      const valor = v.valor_numero ?? v.valor_texto;
      if (valor !== null && valor !== undefined) inicial[v.peca_caracteristica_id] = String(valor);
    }
    return inicial;
  });
  const [precoManual, setPrecoManual] = useState(item ? String(item.preco_unitario) : "");
  // Item novo segue o preço sugerido até o vendedor digitar o dele. Item já
  // gravado só volta a seguir se o preço salvo for igual ao sugerido — assim
  // um preço ajustado antes nunca é sobrescrito sem o vendedor pedir.
  const [seguirSugestao, setSeguirSugestao] = useState(!item);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const requisicao = useRef(0);
  const primeiroResultado = useRef(true);

  const valores = montarValores(definicoes, digitado);
  const valoresKey = JSON.stringify(valores);

  useEffect(() => {
    const id = ++requisicao.current;
    const temporizador = setTimeout(async () => {
      setCalculando(true);
      const r = await calcularPrecoConfiguradorAction(itemId, JSON.parse(valoresKey) as Valores);
      // Server Actions respondem uma de cada vez; só vale a resposta da
      // consulta mais recente, senão um resultado antigo sobrescreve o novo.
      if (id !== requisicao.current) return;
      setCalculando(false);
      if ("error" in r) {
        setErro(r.error);
        setCalculo(null);
        return;
      }
      setErro(null);
      const data = r.data as Calculo;
      setCalculo(data);
      if (primeiroResultado.current) {
        primeiroResultado.current = false;
        if (item && data.preco_sugerido != null && Math.abs(item.preco_unitario - data.preco_sugerido) < 0.005) {
          setSeguirSugestao(true);
        }
      }
    }, 400);
    return () => clearTimeout(temporizador);
  }, [itemId, valoresKey, item]);

  const sugerido = calculo?.preco_sugerido ?? null;
  const precoExibido = seguirSugestao ? (sugerido !== null ? String(sugerido) : "") : precoManual;
  const precoNumero = Number(precoExibido.replace(",", "."));
  const quantidadeNumero = Number(quantidade.replace(",", "."));
  const faltando = definicoes.filter((d) => d.obrigatoria && !(digitado[d.id] ?? "").trim());
  const podeSalvar =
    !salvando &&
    !calculando &&
    precoExibido.trim() !== "" &&
    Number.isFinite(precoNumero) &&
    precoNumero >= 0 &&
    Number.isFinite(quantidadeNumero) &&
    quantidadeNumero > 0 &&
    faltando.length === 0;

  function alterarValor(id: string, valor: string) {
    setDigitado((atual) => ({ ...atual, [id]: valor }));
    setSalvo(false);
    onDirtyChange?.(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    const r = await salvarItemConfiguradoAction({
      id: item?.id ?? null,
      orcamentoId,
      itemId,
      quantidade: quantidadeNumero,
      valores,
      // Seguindo a sugestão, o servidor recalcula o preço (não envia valor).
      precoOverride: seguirSugestao && sugerido !== null ? null : precoNumero,
    });
    setSalvando(false);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setSalvo(true);
    onDirtyChange?.(false);
    onSaved?.();
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
      <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-text">
          Qtd
          <Input
            type="number"
            step="0.001"
            min="0.001"
            value={quantidade}
            onChange={(e) => {
              setQuantidade(e.target.value);
              setSalvo(false);
              onDirtyChange?.(true);
            }}
            required
            className="w-[70px]"
          />
        </label>
      </div>

      {definicoes.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          {ordenarDefinicoes(definicoes).map((d) => (
            <label key={d.id} className="flex flex-col gap-0.5 text-xs text-text">
              <span>
                {d.nome}
                {d.unidade ? ` (${d.unidade})` : ""}
                {d.obrigatoria ? " *" : ""}
              </span>
              {d.tipo === "opcao" ? (
                <Select value={digitado[d.id] ?? ""} onChange={(e) => alterarValor(d.id, e.target.value)} className="min-w-28">
                  <option value="">{d.obrigatoria ? "escolha…" : "—"}</option>
                  {(d.opcoes ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type={d.tipo === "numero" ? "number" : "text"}
                  step={d.tipo === "numero" ? "any" : undefined}
                  value={digitado[d.id] ?? ""}
                  onChange={(e) => alterarValor(d.id, e.target.value)}
                  className="w-28"
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-text">
          Preço unit.
          <Input
            type="number"
            step="0.01"
            min="0"
            value={precoExibido}
            onChange={(e) => {
              setPrecoManual(e.target.value);
              setSeguirSugestao(false);
              setSalvo(false);
              onDirtyChange?.(true);
            }}
            placeholder={sugerido === null ? "digite o preço" : ""}
            required
            className="w-[110px]"
          />
        </label>
        {!seguirSugestao && sugerido !== null && (
          <Button type="button" variant="secondary" onClick={() => setSeguirSugestao(true)}>
            Usar sugerido ({currency(sugerido)})
          </Button>
        )}
        {seguirSugestao && sugerido !== null && <span className="text-xs text-text-muted">sugerido pelo sistema</span>}
        {Number.isFinite(precoNumero) && Number.isFinite(quantidadeNumero) && precoExibido.trim() !== "" && (
          <span className="text-xs text-text-muted">subtotal: {currency(precoNumero * quantidadeNumero)}</span>
        )}
        <Button type="submit" variant="primary" disabled={!podeSalvar}>
          {salvando ? "Salvando..." : item ? "Salvar" : "Adicionar"}
        </Button>
        {salvo && item && <span className="text-xs text-text-muted">salvo</span>}
      </div>

      {faltando.length > 0 && (
        <p className="text-xs text-text-muted">Falta informar: {faltando.map((d) => d.nome).join(", ")}.</p>
      )}
      {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>

      <PainelCalculo calculo={calculo} calculando={calculando} />
    </form>
  );
}

function PainelCalculo({ calculo, calculando }: { calculo: Calculo | null; calculando: boolean }) {
  if (!calculo) {
    return (
      <p className="text-xs text-text-muted">{calculando ? "Calculando…" : "Informe as características para calcular o custo e o preço."}</p>
    );
  }

  const componentes = calculo.material?.componentes ?? [];
  const semCusto = calculo.material?.materiais_sem_custo ?? [];
  const operacoes = calculo.mao_obra?.operacoes ?? [];
  const opsSemCusto = calculo.mao_obra?.operacoes_sem_custo ?? [];
  const aviso = mensagemSemPreco(calculo);

  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-page-bg p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text">Cálculo automático (ADR-012)</span>
        {calculando && <span className="text-text-muted">atualizando…</span>}
      </div>

      {componentes.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-text-muted">Material</span>
          {componentes.map((c, i) => (
            <div key={`${c.item_id}-${i}`} className="flex justify-between gap-2">
              <span>
                {c.codigo} — {c.descricao} (
                {c.comprimento_metros ? `${c.quantidade} barra(s) de ${c.comprimento_metros}m` : c.quantidade}
                {c.custo_unitario !== undefined ? ` × ${currency(c.custo_unitario)}` : ""})
              </span>
              <span>{currency(c.subtotal ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      {semCusto.length > 0 && (
        <p className="text-danger">
          Sem custo cadastrado: {semCusto.map((m) => `${m.codigo}${m.quantidade != null ? ` (${m.quantidade})` : ""}`).join(", ")} — não entram no total.
        </p>
      )}

      {operacoes.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-text-muted">Mão de obra</span>
          {operacoes.map((o) => (
            <div key={o.operacao_id} className="flex justify-between gap-2">
              <span>
                {o.sequencia}. {o.descricao} ({o.recurso_nome}, {o.tempo_previsto_minutos}min × {currency(o.custo_hora ?? 0)}/h)
              </span>
              <span>{currency(o.custo_operacao ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      {opsSemCusto.length > 0 && (
        <p className="text-danger">
          Operação sem custo calculável:{" "}
          {opsSemCusto.map((o) => `${o.sequencia}. ${o.descricao} (${MOTIVO_OPERACAO_LABEL[o.motivo ?? ""] ?? o.motivo})`).join(", ")} — não entra no total.
        </p>
      )}
      {calculo.mao_obra && !calculo.mao_obra.tem_roteiro && (
        <p className="text-text-muted">Este item não tem roteiro produtivo ativo — mão de obra fora do custo.</p>
      )}

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-border-subtle pt-1 text-text">
        <span>Material: {currency(calculo.custo_material ?? 0)}</span>
        {calculo.custo_mao_obra != null && <span>Mão de obra: {currency(calculo.custo_mao_obra)}</span>}
        <span className="font-medium">Custo total: {currency(calculo.custo_total ?? 0)}</span>
        {calculo.margem_percentual != null && <span>Margem: {calculo.margem_percentual}%</span>}
        {calculo.preco_sugerido != null && (
          <span className="font-medium">Preço sugerido: {currency(calculo.preco_sugerido)}</span>
        )}
      </div>
      {aviso && <p className="text-danger">{aviso}</p>}
    </div>
  );
}
