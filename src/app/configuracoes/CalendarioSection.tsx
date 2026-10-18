"use client";

import Link from "next/link";
import { useState } from "react";
import { upsertCalendarSettingsAction, upsertCalendarExceptionAction, removeCalendarExceptionAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type DiaCalendario = {
  data: string;
  dia_semana: number;
  trabalha: boolean;
  horas: number | null;
  origem: string;
  descricao: string | null;
};

export type ExcecaoCalendario = {
  data: string;
  tipo: "feriado_municipal" | "ponte" | "folga" | "dia_extra";
  descricao: string;
  horas: number | null;
};

export type OpcoesCalendario = {
  considerar_feriados_nacionais: boolean;
  considerar_pontos_facultativos: boolean;
} | null;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const TIPO_ROTULO: Record<string, string> = {
  feriado_municipal: "Feriado municipal",
  ponte: "Ponte",
  folga: "Folga",
  dia_extra: "Dia extra (com produção)",
};

const ORIGEM_ROTULO: Record<string, string> = {
  feriado_nacional: "Feriado nacional",
  ponto_facultativo: "Ponto facultativo",
  feriado_municipal: "Feriado municipal",
  ponte: "Ponte",
  folga: "Folga",
  dia_extra: "Dia extra",
};

const fmtData = (iso: string) => iso.split("-").reverse().join("/");

function classeDia(d: DiaCalendario) {
  if (d.origem === "dia_extra") return "border-primary bg-primary/10";
  if (d.origem !== "semana" && d.origem !== "sem_horario") return "border-danger/40 bg-danger/5";
  return d.trabalha ? "border-border bg-surface" : "border-border-subtle bg-page-bg text-text-muted";
}

function mesVizinho(ano: number, mes: number, delta: number) {
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Melhorias 18/10/2026, item "Recursos e capacidade", 2ª etapa — calendário da
// empresa: feriados nacionais (calculados), municipais/pontes/folgas/dias extras
// (cadastrados aqui) e as horas disponíveis por mês. É o mesmo cálculo que a
// capacidade dos recursos usa (função _info_dia_empresa no banco).
export default function CalendarioSection({
  ano,
  mes,
  dias,
  excecoes,
  opcoes,
  canManage,
}: {
  ano: number;
  mes: number;
  dias: DiaCalendario[];
  excecoes: ExcecaoCalendario[];
  opcoes: OpcoesCalendario;
  canManage: boolean;
}) {
  const [tipo, setTipo] = useState<ExcecaoCalendario["tipo"]>("feriado_municipal");
  const [erro, setErro] = useState<string | null>(null);

  const diasUteis = dias.filter((d) => d.trabalha).length;
  const horasMes = dias.reduce((soma, d) => soma + (d.trabalha ? Number(d.horas ?? 0) : 0), 0);
  const ocorrencias = dias.filter((d) => d.origem !== "semana" && d.origem !== "sem_horario");

  // Segunda como primeiro dia da grade; dia_semana segue extract(dow) (0 = domingo).
  const deslocamento = (dias[0]?.dia_semana ?? 1) === 0 ? 6 : (dias[0]?.dia_semana ?? 1) - 1;
  const celulas: (DiaCalendario | null)[] = [...Array(deslocamento).fill(null), ...dias];
  while (celulas.length % 7 !== 0) celulas.push(null);

  async function remover(data: string) {
    if (!window.confirm(`Remover a exceção de ${fmtData(data)}?`)) return;
    setErro(null);
    const r = await removeCalendarExceptionAction(data);
    if (r?.error) setErro(r.error);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Calendário de produção</h2>
      <p className="mt-1 text-xs text-text-muted">
        Mostra os dias em que a empresa produz, a partir do horário de funcionamento, dos feriados nacionais e das exceções
        cadastradas aqui. A capacidade dos recursos (Produção → Recursos e capacidade) usa exatamente este calendário.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/configuracoes?tab=calendario&mes=${mesVizinho(ano, mes, -1)}`} className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-page-bg">
          ← anterior
        </Link>
        <strong className="min-w-36 text-center text-sm capitalize text-text">
          {MESES[mes - 1]} de {ano}
        </strong>
        <Link href={`/configuracoes?tab=calendario&mes=${mesVizinho(ano, mes, 1)}`} className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-page-bg">
          próximo →
        </Link>
        <span className="text-xs text-text-muted">
          {diasUteis} dia(s) de produção · {horasMes.toLocaleString("pt-BR")} h de expediente no mês
        </span>
      </div>

      <div className="mt-2 grid max-w-3xl grid-cols-7 gap-1">
        {SEMANA.map((s) => (
          <div key={s} className="px-1 text-center text-[11px] font-semibold uppercase text-text-muted">
            {s}
          </div>
        ))}
        {celulas.map((d, i) =>
          d ? (
            <div key={d.data} title={d.descricao ?? ""} className={`min-h-14 rounded border p-1 text-xs ${classeDia(d)}`}>
              <div className="font-medium">{Number(d.data.slice(8))}</div>
              {d.origem !== "semana" && d.origem !== "sem_horario" ? (
                <div className="mt-0.5 text-[10px] leading-tight">{d.descricao ?? ORIGEM_ROTULO[d.origem]}</div>
              ) : (
                <div className="mt-0.5 text-[10px] text-text-muted">{d.trabalha ? `${Number(d.horas ?? 0).toLocaleString("pt-BR")} h` : "—"}</div>
              )}
            </div>
          ) : (
            <div key={`vazio-${i}`} />
          ),
        )}
      </div>

      {ocorrencias.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-text-muted">
          {ocorrencias.map((d) => (
            <li key={d.data}>
              <strong className="text-text">{fmtData(d.data)}</strong> — {ORIGEM_ROTULO[d.origem] ?? d.origem}
              {d.descricao ? `: ${d.descricao}` : ""}
              {d.origem === "dia_extra" ? ` (${Number(d.horas ?? 0).toLocaleString("pt-BR")} h)` : ""}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <>
          <h3 className="mt-5 text-xs font-semibold text-text">Feriados que bloqueiam a produção</h3>
          <form action={upsertCalendarSettingsAction} className="mt-1.5 flex flex-col gap-1.5 text-xs text-text">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="feriados_nacionais" defaultChecked={opcoes?.considerar_feriados_nacionais ?? true} />
              Feriados nacionais (Ano Novo, Sexta-feira Santa, Tiradentes, 1º de maio, 7 de setembro, 12 de outubro, Finados, 15 e 20 de novembro, Natal)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="pontos_facultativos" defaultChecked={opcoes?.considerar_pontos_facultativos ?? false} />
              Pontos facultativos (Carnaval e Corpus Christi)
            </label>
            <div>
              <Button type="submit" variant="secondary" size="sm">
                Salvar opções
              </Button>
            </div>
          </form>

          <h3 className="mt-5 text-xs font-semibold text-text">Adicionar exceção ao calendário</h3>
          <p className="mt-1 text-xs text-text-muted">
            Feriado municipal, ponte e folga bloqueiam o dia. Dia extra libera a produção num dia que normalmente não funciona
            (sábado, domingo ou feriado). Uma exceção na mesma data substitui a anterior.
          </p>
          <form action={upsertCalendarExceptionAction} className="mt-1.5 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs text-text">
              Data
              <Input type="date" name="data" required className="w-40" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-text">
              Tipo
              <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as ExcecaoCalendario["tipo"])}>
                {Object.entries(TIPO_ROTULO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-text">
              Descrição
              <Input name="descricao" required placeholder="ex.: Aniversário da cidade" className="w-64" />
            </label>
            {tipo === "dia_extra" && (
              <label className="flex flex-col gap-0.5 text-xs text-text">
                Horas (opcional)
                <Input type="number" name="horas" step="0.25" min={0.25} max={24} placeholder="padrão do dia" className="w-32" />
              </label>
            )}
            <Button type="submit" variant="primary">
              Adicionar
            </Button>
          </form>

          {excecoes.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold text-text">Exceções cadastradas</h3>
              <ul className="mt-1 flex max-w-2xl flex-col gap-1">
                {excecoes.map((e) => (
                  <li key={e.data} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-2 py-1 text-xs">
                    <span>
                      <strong className="text-text">{fmtData(e.data)}</strong> — {TIPO_ROTULO[e.tipo]}: {e.descricao}
                      {e.tipo === "dia_extra" && e.horas ? ` (${Number(e.horas).toLocaleString("pt-BR")} h)` : ""}
                    </span>
                    <Button type="button" variant="danger" size="sm" onClick={() => remover(e.data)}>
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
        </>
      )}
    </section>
  );
}
