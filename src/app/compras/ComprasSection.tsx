"use client";

import { useActionState, useState } from "react";
import {
  upsertFornecedorDadosAction,
  upsertItemFornecedorAction,
  definirFornecedorPrincipalAction,
  upsertItemMaterialAlternativoAction,
  desativarItemMaterialAlternativoAction,
  upsertPoliticaAbastecimentoAction,
  criarFornecedorAction,
  atualizarIdentidadeFornecedorAction,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

const TIPOS_POLITICA = [
  ["sob_demanda", "Sob demanda"],
  ["estoque_minimo", "Estoque mínimo"],
  ["seguranca", "Estoque de segurança"],
  ["ponto_reposicao", "Ponto de reposição"],
] as const;

type Pessoa = {
  id: string;
  tipo_documento: string | null;
  documento: string | null;
  nome: string;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};
type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type FornecedorDados = {
  id: string;
  pessoa_id: string;
  prazo_pagamento_dias: number | null;
  lead_time_dias: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  chave_pix: string | null;
  condicoes_padrao: string | null;
  homologado: boolean;
};
type ItemFornecedor = {
  id: string;
  item_id: string;
  pessoa_id: string;
  principal: boolean;
  prioridade: number;
  homologado: boolean;
  preco_referencia: number | null;
  condicoes: string | null;
};
type MaterialAlternativo = {
  id: string;
  item_origem_id: string;
  item_equivalente_id: string;
  exige_aprovacao: boolean;
  regra_substituicao: string | null;
};
type PoliticaAbastecimento = {
  id: string;
  item_id: string;
  tipo: string;
  estoque_minimo: number | null;
  estoque_seguranca: number | null;
  ponto_reposicao: number | null;
  lote_minimo: number | null;
  lote_economico: number | null;
  multiplo: number | null;
  fornecedor_preferencial_id: string | null;
};

export default function ComprasSection({
  fornecedores,
  fornecedorDados,
  itens,
  itemFornecedores,
  materiaisAlternativos,
  politicas,
  canManage,
  canManagePessoas,
}: {
  fornecedores: Pessoa[];
  fornecedorDados: FornecedorDados[];
  itens: Item[];
  itemFornecedores: ItemFornecedor[];
  materiaisAlternativos: MaterialAlternativo[];
  politicas: PoliticaAbastecimento[];
  canManage: boolean;
  canManagePessoas: boolean;
}) {
  const pessoaPorId = new Map(fornecedores.map((p) => [p.id, p]));
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const dadosPorPessoa = new Map(fornecedorDados.map((f) => [f.pessoa_id, f]));

  return (
    <div className="flex flex-col gap-7">
      <FornecedoresSubsecao fornecedores={fornecedores} dadosPorPessoa={dadosPorPessoa} canManage={canManage} canManagePessoas={canManagePessoas} />
      <ItemFornecedoresSubsecao
        itens={itens}
        fornecedores={fornecedores}
        rows={itemFornecedores}
        itemPorId={itemPorId}
        pessoaPorId={pessoaPorId}
        canManage={canManage}
      />
      <MateriaisAlternativosSubsecao itens={itens} rows={materiaisAlternativos} itemPorId={itemPorId} canManage={canManage} />
      <PoliticasSubsecao itens={itens} fornecedores={fornecedores} rows={politicas} pessoaPorId={pessoaPorId} canManage={canManage} />
    </div>
  );
}

function FornecedoresSubsecao({
  fornecedores,
  dadosPorPessoa,
  canManage,
  canManagePessoas,
}: {
  fornecedores: Pessoa[];
  dadosPorPessoa: Map<string, FornecedorDados>;
  canManage: boolean;
  canManagePessoas: boolean;
}) {
  const [criando, setCriando] = useState(false);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Fornecedores</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cadastre o fornecedor abaixo — identidade (nome, documento, contato, endereço) e, na
        própria linha, prazo de pagamento, lead time, dados bancários e condições padrão.
      </p>

      {canManagePessoas && (
        <div className="my-3">
          {criando ? (
            <NovoFornecedorForm onSubmit={() => setCriando(false)} onCancel={() => setCriando(false)} />
          ) : (
            <Button type="button" variant="primary" onClick={() => setCriando(true)}>
              + Novo fornecedor
            </Button>
          )}
        </div>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Fornecedor</Th>
            <Th>Prazo pgto.</Th>
            <Th>Lead time</Th>
            <Th>Dados bancários</Th>
            <Th>Homologado</Th>
            {(canManage || canManagePessoas) && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {fornecedores.map((f) => {
            const dados = dadosPorPessoa.get(f.id);
            return <FornecedorRow key={f.id} pessoa={f} dados={dados} canManage={canManage} canManagePessoas={canManagePessoas} />;
          })}
          {fornecedores.length === 0 && (
            <tr>
              <Td colSpan={canManage || canManagePessoas ? 6 : 5} className="text-text-muted">
                Nenhum fornecedor cadastrado ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}

function NovoFornecedorForm({ onSubmit, onCancel }: { onSubmit?: () => void; onCancel?: () => void }) {
  const [state, formAction] = useActionState(criarFornecedorAction, undefined);

  return (
    <div>
      <form action={formAction} onSubmit={onSubmit} className="flex flex-wrap items-center gap-1.5">
        <Select name="tipo_documento" defaultValue="">
          <option value="">—</option>
          <option value="CPF">CPF</option>
          <option value="CNPJ">CNPJ</option>
        </Select>
        <Input name="documento" placeholder="documento" className="w-32" />
        <Input name="nome" placeholder="nome / razão social" required className="w-44" />
        <Input name="nome_fantasia" placeholder="nome fantasia" className="w-32" />
        <Input name="telefone" placeholder="telefone" className="w-28" />
        <Input name="email" placeholder="e-mail" className="w-36" />
        <Input name="logradouro" placeholder="endereço" className="w-40" />
        <Input name="cidade" placeholder="cidade" className="w-28" />
        <Input name="uf" placeholder="UF" className="w-12" />
        <Input name="cep" placeholder="CEP" className="w-24" />
        <Button type="submit" variant="primary">
          Criar fornecedor
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}

function FornecedorRow({
  pessoa,
  dados,
  canManage,
  canManagePessoas,
}: {
  pessoa: Pessoa;
  dados: FornecedorDados | undefined;
  canManage: boolean;
  canManagePessoas: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [editandoIdentidade, setEditandoIdentidade] = useState(false);

  if (editandoIdentidade) {
    return (
      <tr>
        <Td colSpan={canManage || canManagePessoas ? 6 : 5}>
          <form action={atualizarIdentidadeFornecedorAction} onSubmit={() => setEditandoIdentidade(false)} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="id" value={pessoa.id} />
            <Select name="tipo_documento" defaultValue={pessoa.tipo_documento ?? ""}>
              <option value="">—</option>
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </Select>
            <Input name="documento" placeholder="documento" defaultValue={pessoa.documento ?? ""} className="w-32" />
            <Input name="nome" placeholder="nome / razão social" defaultValue={pessoa.nome} required className="w-44" />
            <Input name="nome_fantasia" placeholder="nome fantasia" defaultValue={pessoa.nome_fantasia ?? ""} className="w-32" />
            <Input name="telefone" placeholder="telefone" defaultValue={pessoa.telefone ?? ""} className="w-28" />
            <Input name="email" placeholder="e-mail" defaultValue={pessoa.email ?? ""} className="w-36" />
            <Input name="logradouro" placeholder="endereço" defaultValue={pessoa.logradouro ?? ""} className="w-40" />
            <Input name="cidade" placeholder="cidade" defaultValue={pessoa.cidade ?? ""} className="w-28" />
            <Input name="uf" placeholder="UF" defaultValue={pessoa.uf ?? ""} className="w-12" />
            <Input name="cep" placeholder="CEP" defaultValue={pessoa.cep ?? ""} className="w-24" />
            <Button type="submit" variant="primary">
              Salvar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditandoIdentidade(false)}>
              Cancelar
            </Button>
          </form>
        </Td>
      </tr>
    );
  }

  if (editando) {
    return (
      <tr>
        <Td colSpan={canManage ? 6 : 5}>
          <form action={upsertFornecedorDadosAction} onSubmit={() => setEditando(false)} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="pessoa_id" value={pessoa.id} />
            <span className="text-xs text-text">{pessoa.nome_fantasia || pessoa.nome}</span>
            <Input name="prazo_pagamento_dias" type="number" min="0" step="1" placeholder="prazo (dias)" defaultValue={dados?.prazo_pagamento_dias ?? ""} className="w-[90px]" />
            <Input name="lead_time_dias" type="number" min="0" step="1" placeholder="lead time (dias)" defaultValue={dados?.lead_time_dias ?? ""} className="w-[110px]" />
            <Input name="banco" placeholder="banco" defaultValue={dados?.banco ?? ""} className="w-[90px]" />
            <Input name="agencia" placeholder="agência" defaultValue={dados?.agencia ?? ""} className="w-[70px]" />
            <Input name="conta" placeholder="conta" defaultValue={dados?.conta ?? ""} className="w-[90px]" />
            <Select name="tipo_conta" defaultValue={dados?.tipo_conta ?? ""}>
              <option value="">tipo conta…</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </Select>
            <Input name="chave_pix" placeholder="chave PIX" defaultValue={dados?.chave_pix ?? ""} className="w-[110px]" />
            <Input name="condicoes_padrao" placeholder="condições padrão" defaultValue={dados?.condicoes_padrao ?? ""} className="w-[140px]" />
            <label className="flex items-center gap-1 text-xs text-text-muted">
              <input type="checkbox" name="homologado" defaultChecked={dados?.homologado ?? false} className="accent-primary" /> homologado
            </label>
            <Button type="submit" variant="primary">
              Salvar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </form>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td>{pessoa.nome_fantasia || pessoa.nome}</Td>
      <Td>{dados?.prazo_pagamento_dias != null ? `${dados.prazo_pagamento_dias}d` : "—"}</Td>
      <Td>{dados?.lead_time_dias != null ? `${dados.lead_time_dias}d` : "—"}</Td>
      <Td>{dados?.banco ? `${dados.banco} ag.${dados.agencia ?? "—"} cc.${dados.conta ?? "—"}` : dados?.chave_pix ? `PIX: ${dados.chave_pix}` : "—"}</Td>
      <Td>{dados?.homologado ? "Sim" : "Não"}</Td>
      {(canManage || canManagePessoas) && (
        <Td className="flex gap-1.5">
          {canManage && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
              {dados ? "Editar" : "Cadastrar dados"}
            </Button>
          )}
          {canManagePessoas && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditandoIdentidade(true)}>
              Editar identidade
            </Button>
          )}
        </Td>
      )}
    </tr>
  );
}

function ItemFornecedoresSubsecao({
  itens,
  fornecedores,
  rows,
  itemPorId,
  pessoaPorId,
  canManage,
}: {
  itens: Item[];
  fornecedores: Pessoa[];
  rows: ItemFornecedor[];
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Fornecedores por item</h2>
      <p className="mt-1 text-xs text-text-muted">
        Fornecedor principal e alternativos por material, com prioridade, homologação e preço de
        referência. No máximo um principal por item.
      </p>

      {canManage && (
        <form action={upsertItemFornecedorAction} className="my-3 flex flex-wrap items-center gap-1.5">
          <Select name="item_id" required>
            <option value="">item…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </Select>
          <Select name="pessoa_id" required>
            <option value="">fornecedor…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia || f.nome}
              </option>
            ))}
          </Select>
          <Input name="prioridade" type="number" min="1" step="1" placeholder="prioridade" defaultValue={100} className="w-20" />
          <Input name="preco_referencia" type="number" min="0" step="0.0001" placeholder="preço ref." className="w-24" />
          <Input name="condicoes" placeholder="condições" className="w-[140px]" />
          <label className="flex items-center gap-1 text-xs text-text-muted">
            <input type="checkbox" name="homologado" className="accent-primary" /> homologado
          </label>
          <Button type="submit" variant="primary">
            Associar
          </Button>
        </form>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Item</Th>
            <Th>Fornecedor</Th>
            <Th>Prioridade</Th>
            <Th>Preço ref.</Th>
            <Th>Homologado</Th>
            <Th>Principal</Th>
            {canManage && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = itemPorId.get(row.item_id);
            const pessoa = pessoaPorId.get(row.pessoa_id);
            return (
              <tr key={row.id}>
                <Td>{item ? `${item.codigo} — ${item.descricao}` : row.item_id}</Td>
                <Td>{pessoa ? pessoa.nome_fantasia || pessoa.nome : row.pessoa_id}</Td>
                <Td>{row.prioridade}</Td>
                <Td>{row.preco_referencia ?? "—"}</Td>
                <Td>{row.homologado ? "Sim" : "Não"}</Td>
                <Td>
                  {row.principal ? (
                    "★ Principal"
                  ) : canManage ? (
                    <form action={definirFornecedorPrincipalAction}>
                      <input type="hidden" name="item_id" value={row.item_id} />
                      <input type="hidden" name="pessoa_id" value={row.pessoa_id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Tornar principal
                      </Button>
                    </form>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 7 : 6} className="text-text-muted">
                Nenhum fornecedor associado a item ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}

function MateriaisAlternativosSubsecao({
  itens,
  rows,
  itemPorId,
  canManage,
}: {
  itens: Item[];
  rows: MaterialAlternativo[];
  itemPorId: Map<string, Item>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Materiais alternativos</h2>
      <p className="mt-1 text-xs text-text-muted">
        Equivalência entre dois materiais. &quot;Exige aprovação&quot; marca se o uso do alternativo
        precisa de decisão humana antes de substituir o item de origem numa compra.
      </p>

      {canManage && (
        <form action={upsertItemMaterialAlternativoAction} className="my-3 flex flex-wrap items-center gap-1.5">
          <Select name="item_origem_id" required>
            <option value="">item de origem…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </Select>
          <Select name="item_equivalente_id" required>
            <option value="">item equivalente…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </Select>
          <Input name="regra_substituicao" placeholder="regra (opcional)" className="w-40" />
          <label className="flex items-center gap-1 text-xs text-text-muted">
            <input type="checkbox" name="exige_aprovacao" defaultChecked className="accent-primary" /> exige aprovação
          </label>
          <Button type="submit" variant="primary">
            Registrar
          </Button>
        </form>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Item de origem</Th>
            <Th>Item equivalente</Th>
            <Th>Exige aprovação</Th>
            <Th>Regra</Th>
            {canManage && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => {
            const origem = itemPorId.get(row.item_origem_id);
            const equivalente = itemPorId.get(row.item_equivalente_id);
            return (
              <tr key={row.id}>
                <Td>{origem ? `${origem.codigo} — ${origem.descricao}` : row.item_origem_id}</Td>
                <Td>{equivalente ? `${equivalente.codigo} — ${equivalente.descricao}` : row.item_equivalente_id}</Td>
                <Td>{row.exige_aprovacao ? "Sim" : "Não"}</Td>
                <Td>{row.regra_substituicao ?? "—"}</Td>
                {canManage && (
                  <Td>
                    <form action={desativarItemMaterialAlternativoAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Desativar
                      </Button>
                    </form>
                  </Td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 5 : 4} className="text-text-muted">
                Nenhum material alternativo ativo ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}

function PoliticasSubsecao({
  itens,
  fornecedores,
  rows,
  pessoaPorId,
  canManage,
}: {
  itens: Item[];
  fornecedores: Pessoa[];
  rows: PoliticaAbastecimento[];
  pessoaPorId: Map<string, Pessoa>;
  canManage: boolean;
}) {
  const politicaPorItem = new Map(rows.map((r) => [r.item_id, r]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Políticas de abastecimento</h2>
      <p className="mt-1 text-xs text-text-muted">
        Uma política por item: estoque mínimo, segurança, ponto de reposição, lote mínimo/econômico
        e múltiplo. Consumida pelo Motor de Necessidades (Fase 3 da ADR-011 — ainda não implementada).
      </p>

      {canManage && (
        <form action={upsertPoliticaAbastecimentoAction} className="my-3 flex flex-wrap items-center gap-1.5">
          <Select name="item_id" required>
            <option value="">item…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </Select>
          <Select name="tipo" defaultValue="sob_demanda">
            {TIPOS_POLITICA.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input name="estoque_minimo" type="number" min="0" step="0.0001" placeholder="estoque mín." className="w-[90px]" />
          <Input name="estoque_seguranca" type="number" min="0" step="0.0001" placeholder="segurança" className="w-[90px]" />
          <Input name="ponto_reposicao" type="number" min="0" step="0.0001" placeholder="ponto repos." className="w-[100px]" />
          <Input name="lote_minimo" type="number" min="0" step="0.0001" placeholder="lote mín." className="w-[90px]" />
          <Input name="lote_economico" type="number" min="0" step="0.0001" placeholder="lote econ." className="w-[90px]" />
          <Input name="multiplo" type="number" min="0" step="0.0001" placeholder="múltiplo" className="w-20" />
          <Select name="fornecedor_preferencial_id">
            <option value="">fornecedor preferencial…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia || f.nome}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary">
            Salvar política
          </Button>
        </form>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Item</Th>
            <Th>Tipo</Th>
            <Th>Mín.</Th>
            <Th>Segurança</Th>
            <Th>Reposição</Th>
            <Th>Fornecedor pref.</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {itens
            .filter((i) => politicaPorItem.has(i.id))
            .map((i) => {
              const pol = politicaPorItem.get(i.id)!;
              const pessoa = pol.fornecedor_preferencial_id ? pessoaPorId.get(pol.fornecedor_preferencial_id) : undefined;
              return (
                <tr key={pol.id}>
                  <Td>
                    {i.codigo} — {i.descricao}
                  </Td>
                  <Td>{TIPOS_POLITICA.find(([v]) => v === pol.tipo)?.[1] ?? pol.tipo}</Td>
                  <Td>{pol.estoque_minimo ?? "—"}</Td>
                  <Td>{pol.estoque_seguranca ?? "—"}</Td>
                  <Td>{pol.ponto_reposicao ?? "—"}</Td>
                  <Td>{pessoa ? pessoa.nome_fantasia || pessoa.nome : "—"}</Td>
                </tr>
              );
            })}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-text-muted">
                Nenhuma política de abastecimento configurada ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}
