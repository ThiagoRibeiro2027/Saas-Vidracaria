"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarData } from "@/lib/formato/data";
import { criarAtualizacaoAction, editarAtualizacaoAction, removerAtualizacaoAction } from "./actions";

export type AtualizacaoRow = {
  id: string;
  titulo: string;
  descricao: string;
  publicado_em: string;
};

const campoClasses =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export default function AtualizacoesSection({
  atualizacoes,
  podeGerenciar,
}: {
  atualizacoes: AtualizacaoRow[];
  podeGerenciar: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function tratarSubmit(acao: (formData: FormData) => Promise<void>, formData: FormData, aoTerminar?: () => void) {
    setErro(null);
    try {
      await acao(formData);
      aoTerminar?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <div>
      {erro && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

      {podeGerenciar && (
        <div className="mb-4">
          {!mostrarForm ? (
            <Button variant="primary" size="sm" onClick={() => setMostrarForm(true)}>
              Nova atualização
            </Button>
          ) : (
            <form
              action={(fd) => tratarSubmit(criarAtualizacaoAction, fd, () => setMostrarForm(false))}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
            >
              <Input name="titulo" placeholder="Título (ex.: Fila de Produção ganhou visão em cards)" required />
              <textarea
                name="descricao"
                placeholder="Descreva em poucas frases o que mudou, em linguagem simples."
                required
                rows={3}
                className={campoClasses}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted" htmlFor="publicado_em-novo">
                  Data de publicação
                </label>
                <Input id="publicado_em-novo" type="date" name="publicado_em" className="w-40" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm">
                  Publicar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {atualizacoes.map((item) =>
          editandoId === item.id ? (
            <form
              key={item.id}
              action={(fd) => tratarSubmit(editarAtualizacaoAction, fd, () => setEditandoId(null))}
              className="flex flex-col gap-2 rounded-xl border border-border-accent bg-surface p-3"
            >
              <input type="hidden" name="id" value={item.id} />
              <Input name="titulo" defaultValue={item.titulo} required />
              <textarea name="descricao" defaultValue={item.descricao} required rows={3} className={campoClasses} />
              <Input type="date" name="publicado_em" defaultValue={item.publicado_em} className="w-40" />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm">
                  Salvar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditandoId(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-text-muted">{formatarData(item.publicado_em)}</p>
                  <h3 className="mt-0.5 text-sm font-semibold text-text">{item.titulo}</h3>
                </div>
                {podeGerenciar && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditandoId(item.id)}
                      className="text-text-muted hover:text-text"
                      aria-label="Editar atualização"
                    >
                      <Pencil size={14} />
                    </button>
                    <form action={(fd) => tratarSubmit(removerAtualizacaoAction, fd)}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="text-text-muted hover:text-danger" aria-label="Remover atualização">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{item.descricao}</p>
            </div>
          ),
        )}

        {atualizacoes.length === 0 && (
          <p className="text-sm text-text-muted">Nenhuma atualização publicada ainda.</p>
        )}
      </div>
    </div>
  );
}
