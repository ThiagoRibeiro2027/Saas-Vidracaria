"use client";

import { useState } from "react";
import { criarVariavelCategoriaAction, criarVariavelTemplateAction, atualizarVariavelTemplateAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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

      <div className="mt-1.5 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Variável</Th>
              <Th>Tipo</Th>
              <Th>Unidade</Th>
              <Th>Opções</Th>
              <Th>Obrigatória (padrão)</Th>
              <Th>Ativa</Th>
              {canManage && <Th />}
            </tr>
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
        </Table>
      </div>

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
          <Badge variant={template.ativo ? "success" : "neutral"}>{template.ativo ? "Ativa" : "Inativa"}</Badge>
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
          <Badge variant={template.ativo ? "success" : "neutral"}>{template.ativo ? "Ativa" : "Inativa"}</Badge>
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
          className="flex flex-wrap items-center gap-1.5"
        >
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="tipo" value={template.tipo} />
          <span className="font-medium text-text">{template.nome}</span>
          <span className="text-[10px] text-text-muted">({TIPO_LABEL[template.tipo]} — nome e tipo não mudam)</span>
          <Input name="unidade" defaultValue={template.unidade ?? ""} placeholder="unidade (opcional)" className="w-28" />
          {template.tipo === "opcao" && (
            <Input
              name="opcoes"
              defaultValue={template.opcoes?.join(", ") ?? ""}
              placeholder="opções, separadas por vírgula"
              required
              className="w-56"
            />
          )}
          <label className="flex items-center gap-1 text-xs text-text">
            <input type="checkbox" name="obrigatoria_padrao" defaultChecked={template.obrigatoria_padrao} className="accent-primary" />
            obrigatória (padrão)
          </label>
          <label className="flex items-center gap-1 text-xs text-text">
            <input type="checkbox" name="ativo" defaultChecked={template.ativo} className="accent-primary" />
            ativa
          </label>
          <Button type="submit" variant="primary" size="sm">
            Salvar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      </Td>
    </tr>
  );
}

function NovaVariavelForm({ categoriaId }: { categoriaId: string }) {
  const [tipo, setTipo] = useState<Template["tipo"]>("opcao");

  return (
    <form action={criarVariavelTemplateAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="categoria_id" value={categoriaId} />
      <Input name="nome" placeholder="nome (ex.: Cor do perfil)" required className="w-40" />
      <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Template["tipo"])} className="w-36">
        <option value="numero">Número</option>
        <option value="texto">Texto</option>
        <option value="opcao">Opção (lista)</option>
      </Select>
      <Input name="unidade" placeholder="unidade (opcional)" className="w-28" />
      {tipo === "opcao" && (
        <Input name="opcoes" placeholder="opções, separadas por vírgula" required className="w-56" />
      )}
      <label className="flex items-center gap-1 text-xs text-text">
        <input type="checkbox" name="obrigatoria_padrao" defaultChecked className="accent-primary" />
        obrigatória (padrão)
      </label>
      <Button type="submit" variant="primary">
        Adicionar variável
      </Button>
    </form>
  );
}
