"use client";

import { useState } from "react";
import { criarRegraPecaAction, desativarRegraPecaAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { SectionLabel, Field } from "@/components/ui/FormField";

type Caracteristica = { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean };
type MaterialOpcao = { id: string; label: string };
type Regra = {
  id: string;
  versao: number;
  substitui_regra_id: string | null;
  caracteristica_id: string;
  caracteristica_nome: string;
  operador: string;
  valor_comparacao_numero: number | null;
  valor_comparacao_texto: string | null;
  acao: string;
  acao_material_item_id: string;
  acao_material_codigo: string;
  acao_quantidade: number | null;
  ativo: boolean;
  motivo: string | null;
  created_at: string;
};

const OPERADORES_NUMERO = [">", ">=", "<", "<=", "=", "<>"] as const;
const OPERADORES_TEXTO = ["=", "<>"] as const;
const ACOES = [
  ["ajustar_quantidade", "Ajustar quantidade"],
  ["adicionar_material", "Adicionar material"],
  ["remover_material", "Remover material"],
] as const;
const ACAO_LABEL: Record<string, string> = {
  ajustar_quantidade: "ajusta",
  adicionar_material: "adiciona",
  remover_material: "remove",
};

export default function RegrasPeca({
  pecaId,
  caracteristicas,
  regras,
  materiais,
}: {
  pecaId: string;
  caracteristicas: Caracteristica[];
  regras: Regra[];
  materiais: MaterialOpcao[];
}) {
  const [caracteristicaSelecionadaId, setCaracteristicaSelecionadaId] = useState("");
  const [acaoSelecionada, setAcaoSelecionada] = useState("ajustar_quantidade");
  const [mostrarNovaRegra, setMostrarNovaRegra] = useState(false);

  const caracteristicaSelecionada = caracteristicas.find((c) => c.id === caracteristicaSelecionadaId);
  const operadoresDisponiveis = caracteristicaSelecionada?.tipo === "numero" ? OPERADORES_NUMERO : OPERADORES_TEXTO;

  const materialLabel = (id: string) => materiais.find((m) => m.id === id)?.label ?? id;

  if (caracteristicas.length === 0) {
    return null;
  }

  const regrasAtivas = regras.filter((r) => r.ativo);
  const regrasInativas = regras.filter((r) => !r.ativo);

  return (
    <div className="mt-2.5 border-t border-border-subtle pt-2">
      <p className="mb-1 text-xs font-semibold text-text">
        Regras (motor básico) — &quot;o sistema sugere, a Engenharia decide&quot;
      </p>

      {regrasAtivas.length === 0 ? (
        <p className="text-xs text-text-muted">Nenhuma regra ativa ainda.</p>
      ) : (
        <div className="mb-1.5 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Condição</Th>
                <Th>Ação</Th>
                <Th>Versão</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {regrasAtivas.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {r.caracteristica_nome} {r.operador} {r.valor_comparacao_numero ?? r.valor_comparacao_texto}
                  </Td>
                  <Td>
                    {ACAO_LABEL[r.acao]} {materialLabel(r.acao_material_item_id)}
                    {r.acao_quantidade != null ? ` → ${r.acao_quantidade}` : ""}
                  </Td>
                  <Td>v{r.versao}</Td>
                  <Td>
                    <form action={desativarRegraPecaAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Desativar
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {regrasInativas.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {regrasInativas.length} regra{regrasInativas.length > 1 ? "s" : ""} desativada{regrasInativas.length > 1 ? "s" : ""} (histórico preservado).
        </p>
      )}

      {!mostrarNovaRegra ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarNovaRegra(true)}>
          Nova regra
        </Button>
      ) : (
        <form
          action={criarRegraPecaAction}
          onSubmit={() => setMostrarNovaRegra(false)}
          className="rounded-lg border border-border-subtle bg-page-bg p-3"
        >
          <input type="hidden" name="peca_id" value={pecaId} />
          <input type="hidden" name="tipo" value={caracteristicaSelecionada?.tipo ?? ""} />

          <SectionLabel>Condição (se)</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-4">
            <div className="w-40">
              <Field label="Característica" hint="Qual medida ou opção do pedido dispara a regra.">
                <Select
                  className="w-full"
                  name="caracteristica_id"
                  required
                  value={caracteristicaSelecionadaId}
                  onChange={(e) => setCaracteristicaSelecionadaId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {caracteristicas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-24">
              <Field label="Comparação" hint="Operador usado no teste.">
                <Select className="w-full" name="operador" required>
                  {operadoresDisponiveis.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-32">
              <Field label="Valor" hint="Valor de referência da comparação.">
                {caracteristicaSelecionada?.tipo === "opcao" ? (
                  <Select className="w-full" name="valor_comparacao" required>
                    {(caracteristicaSelecionada.opcoes ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    className="w-full"
                    name="valor_comparacao"
                    type={caracteristicaSelecionada?.tipo === "numero" ? "number" : "text"}
                    step="any"
                    placeholder="valor"
                    required
                  />
                )}
              </Field>
            </div>
          </div>

          <SectionLabel className="mt-4">Ação (então)</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-4">
            <div className="w-48">
              <Field label="O que fazer" hint="O que a regra muda na composição da peça.">
                <Select className="w-full" name="acao" value={acaoSelecionada} onChange={(e) => setAcaoSelecionada(e.target.value)}>
                  {ACOES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-56">
              <Field label="Material" hint="Material afetado pela ação.">
                <Select className="w-full" name="acao_material_item_id" required>
                  <option value="">Selecione...</option>
                  {materiais.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {acaoSelecionada !== "remover_material" && (
              <div className="w-28">
                <Field label="Quantidade" hint="Nova quantidade por unidade da peça.">
                  <Input className="w-full" name="acao_quantidade" type="number" step="0.0001" min="0.0001" placeholder="0,000" required />
                </Field>
              </div>
            )}
          </div>

          <div className="mt-3 w-64">
            <Field label="Motivo" hint="Anotação opcional, fica no histórico da regra.">
              <Input className="w-full" name="motivo" placeholder="Ex.: reforço acima de 1,5m" />
            </Field>
          </div>

          <div className="mt-3 flex gap-1.5">
            <Button type="submit" variant="primary" size="sm">
              Criar regra
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarNovaRegra(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
