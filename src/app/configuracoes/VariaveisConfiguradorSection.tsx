"use client";

import { useState } from "react";
import { criarVariavelCategoriaAction, criarVariavelTemplateAction, atualizarVariavelTemplateAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { SectionLabel, Field, CheckboxField, OptionCard } from "@/components/ui/FormField";

type Categoria = { id: string; nome: string };
type Template = {
  id: string;
  categoria_id: string;
  nome: string;
  tipo: "numero" | "texto" | "opcao";
  unidade: string | null;
  opcoes: string[] | null;
  obrigatoria_padrao: boolean;
  ativo: boolean;
};

const TIPO_LABEL: Record<Template["tipo"], string> = {
  numero: "Número",
  texto: "Texto",
  opcao: "Opção (lista)",
};

// Catálogo de variáveis configuráveis (2026-10-04) — pra Pré-engenharia
// não ter que redigitar a mesma variável (ex.: "Cor do perfil") em toda
// peça; aqui a empresa cadastra uma vez, agrupada por categoria, e a peça
// só marca quais usa (ver PecasSection.tsx). Editar uma variável aqui
// propaga pra toda peça que já a usa — fonte única, sem cópias.
export default function VariaveisConfiguradorSection({
  categorias,
  templates,
  canManage,
}: {
  categorias: Categoria[];
  templates: Template[];
  canManage: boolean;
}) {
  const templatesPorCategoria = new Map<string, Template[]>();
  for (const t of templates) {
    const list = templatesPorCategoria.get(t.categoria_id) ?? [];
    list.push(t);
    templatesPorCategoria.set(t.categoria_id, list);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Variáveis do configurador</h2>
      <p className="mt-1 text-xs text-text-muted">
        Catálogo reutilizável de variáveis (ex.: cor do perfil, espessura do vidro) agrupadas por
        categoria (ex.: &quot;Perfil&quot;, &quot;Vidro&quot;). Em Pré-engenharia, cada peça marca
        quais categorias usa e quais destas variáveis se aplicam, em vez de recadastrar do zero.
      </p>

      {canManage && <NovaCategoriaForm />}

      <div className="mt-4 flex flex-col gap-4">
        {categorias.map((cat) => (
          <CategoriaCard
            key={cat.id}
            categoria={cat}
            templates={templatesPorCategoria.get(cat.id) ?? []}
            canManage={canManage}
          />
        ))}
        {categorias.length === 0 && (
          <p className="text-xs text-text-muted">Nenhuma categoria cadastrada ainda.</p>
        )}
      </div>
    </section>
  );
}

function NovaCategoriaForm() {
  return (
    <form action={criarVariavelCategoriaAction} className="mt-3 flex flex-wrap items-center gap-1.5">
      <Input name="nome" placeholder="nova categoria (ex.: Perfil, Vidro)" required className="w-56" />
      <Button type="submit" variant="primary">
        Criar categoria
      </Button>
    </form>
  );
}

function CategoriaCard({
  categoria,
  templates,
  canManage,
}: {
  categoria: Categoria;
  templates: Template[];
  canManage: boolean;
}) {
  return (
    <Card padding="xs">
      <strong className="text-sm text-text">{categoria.nome}</strong>

      <DenseTable className="mt-1.5">
        <thead>
          <DenseTableHeaderRow>
            <Th>Variável</Th>
            <Th>Tipo</Th>
            <Th>Unidade</Th>
            <Th>Opções</Th>
            <Th>Obrigatória (padrão)</Th>
            <Th>Ativa</Th>
            {canManage && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} canManage={canManage} />
          ))}
          {templates.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 7 : 6} className="text-text-muted">
                Nenhuma variável nesta categoria ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>

      {canManage && <NovaVariavelForm categoriaId={categoria.id} />}
    </Card>
  );
}

function TemplateRow({ template, canManage }: { template: Template; canManage: boolean }) {
  const [editando, setEditando] = useState(false);

  if (!canManage) {
    return (
      <tr>
        <Td className="font-medium text-text">{template.nome}</Td>
        <Td className="text-text-muted">{TIPO_LABEL[template.tipo]}</Td>
        <Td className="text-text-muted">{template.unidade ?? "—"}</Td>
        <Td className="text-text-muted">{template.opcoes?.join(", ") ?? "—"}</Td>
        <Td>{template.obrigatoria_padrao ? "Sim" : "Não"}</Td>
        <Td>
          <StatusPill tone={template.ativo ? "success" : "neutral"}>{template.ativo ? "Ativa" : "Inativa"}</StatusPill>
        </Td>
      </tr>
    );
  }

  if (!editando) {
    return (
      <tr>
        <Td className="font-medium text-text">{template.nome}</Td>
        <Td className="text-text-muted">{TIPO_LABEL[template.tipo]}</Td>
        <Td className="text-text-muted">{template.unidade ?? "—"}</Td>
        <Td className="text-text-muted">{template.opcoes?.join(", ") ?? "—"}</Td>
        <Td>{template.obrigatoria_padrao ? "Sim" : "Não"}</Td>
        <Td>
          <StatusPill tone={template.ativo ? "success" : "neutral"}>{template.ativo ? "Ativa" : "Inativa"}</StatusPill>
        </Td>
        <Td>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Editar
          </Button>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td colSpan={7}>
        <form
          action={atualizarVariavelTemplateAction}
          onSubmit={() => setEditando(false)}
          className="my-1.5 rounded-lg border border-border-subtle bg-page-bg p-3"
        >
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="tipo" value={template.tipo} />

          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-text">{template.nome}</span>
            <span className="text-[11px] text-text-muted">({TIPO_LABEL[template.tipo]} — nome e tipo não mudam)</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-4">
            <div className="w-40">
              <Field label="Unidade" hint="Medida, se houver (ex.: mm, kg). Deixe em branco se não se aplica.">
                <Input className="w-full" name="unidade" defaultValue={template.unidade ?? ""} placeholder="mm" />
              </Field>
            </div>
            {template.tipo === "opcao" && (
              <div className="w-72">
                <Field label="Opções da lista" hint="Uma opção por vírgula — é o que o time vai escolher na peça.">
                  <Input
                    className="w-full"
                    name="opcoes"
                    defaultValue={template.opcoes?.join(", ") ?? ""}
                    placeholder="Incolor, Verde, Fumê, Bronze"
                    required
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-4">
            <CheckboxField
              name="obrigatoria_padrao"
              defaultChecked={template.obrigatoria_padrao}
              label="Obrigatória por padrão"
              hint="Toda peça nova dessa categoria já exige essa variável preenchida (pode desmarcar peça a peça depois)."
            />
            <CheckboxField
              name="ativo"
              defaultChecked={template.ativo}
              label="Ativa"
              hint="Se desmarcar, some das opções de peça nova — peças que já usam continuam normais."
            />
          </div>

          <div className="mt-3 flex gap-1.5">
            <Button type="submit" variant="primary" size="sm">
              Salvar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Td>
    </tr>
  );
}

function NovaVariavelForm({ categoriaId }: { categoriaId: string }) {
  const [tipo, setTipo] = useState<Template["tipo"]>("opcao");

  return (
    <form action={criarVariavelTemplateAction} className="mt-1.5 rounded-lg border border-border-subtle bg-page-bg p-4">
      <input type="hidden" name="categoria_id" value={categoriaId} />

      <SectionLabel>Identificação</SectionLabel>
      <div className="mt-2 max-w-xs">
        <Field label="Nome da variável" hint="Como aparece pro time marcar na peça.">
          <Input className="w-full" name="nome" placeholder="Cor do perfil" required />
        </Field>
      </div>

      <SectionLabel className="mt-4">Tipo de valor</SectionLabel>
      <input type="hidden" name="tipo" value={tipo} />
      <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
        <OptionCard
          value="opcao"
          label="Opção (lista)"
          hint="Lista fixa pra escolher, ex.: cores disponíveis."
          selected={tipo === "opcao"}
          onSelect={() => setTipo("opcao")}
        />
        <OptionCard
          value="numero"
          label="Número"
          hint="Valor numérico, ex.: espessura em mm."
          selected={tipo === "numero"}
          onSelect={() => setTipo("numero")}
        />
        <OptionCard
          value="texto"
          label="Texto"
          hint="Texto livre, sem formato fixo."
          selected={tipo === "texto"}
          onSelect={() => setTipo("texto")}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <div className="w-40">
          <Field label="Unidade" hint="Medida, se houver (ex.: mm, kg). Deixe em branco se não se aplica.">
            <Input className="w-full" name="unidade" placeholder="mm" />
          </Field>
        </div>
        {tipo === "opcao" && (
          <div className="w-72">
            <Field label="Opções da lista" hint="Uma opção por vírgula — é o que o time vai escolher na peça.">
              <Input className="w-full" name="opcoes" placeholder="Incolor, Verde, Fumê, Bronze" required />
            </Field>
          </div>
        )}
      </div>

      <SectionLabel className="mt-4">Comportamento</SectionLabel>
      <div className="mt-2">
        <CheckboxField
          name="obrigatoria_padrao"
          defaultChecked
          label="Obrigatória por padrão"
          hint="Toda peça nova dessa categoria já exige essa variável preenchida (pode desmarcar peça a peça depois)."
        />
      </div>

      <Button type="submit" variant="primary" className="mt-4">
        Adicionar variável
      </Button>
    </form>
  );
}

