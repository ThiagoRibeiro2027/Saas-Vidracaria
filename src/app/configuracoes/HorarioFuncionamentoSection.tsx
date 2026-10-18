"use client";

import { useState } from "react";
import { upsertHorarioFuncionamentoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

export type HorarioRow = {
  dia_semana: number;
  trabalha: boolean;
  inicio: string | null;
  fim: string | null;
  almoco_minutos: number;
  horas: number;
};

// Segunda primeiro (como a empresa pensa a semana); dia_semana segue extract(dow): 0 = domingo.
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const NOME: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");

function horasDoDia(inicio: string, fim: string, almoco: string): number | null {
  if (!inicio || !fim) return null;
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const minutos = hf * 60 + mf - (hi * 60 + mi) - (Number(almoco) || 0);
  return minutos > 0 ? Math.round((minutos / 60) * 100) / 100 : null;
}

type Linha = { trabalha: boolean; inicio: string; fim: string; almoco: string };

// Melhorias 18/10/2026, item 2 (1ª etapa) — horário de funcionamento da
// empresa: define em quais dias a produção conta capacidade (antes era
// "horas/dia × 7 dias" fixos). A 2ª etapa acrescenta feriados e o calendário
// mensal.
export default function HorarioFuncionamentoSection({ rows, canManage }: { rows: HorarioRow[]; canManage: boolean }) {
  const [linhas, setLinhas] = useState<Record<number, Linha>>(() => {
    const inicial: Record<number, Linha> = {};
    for (const dia of ORDEM) {
      const r = rows.find((x) => x.dia_semana === dia);
      inicial[dia] = {
        trabalha: r?.trabalha ?? false,
        inicio: hhmm(r?.inicio ?? null),
        fim: hhmm(r?.fim ?? null),
        almoco: String(r?.almoco_minutos ?? 0),
      };
    }
    return inicial;
  });

  const atualizar = (dia: number, parte: Partial<Linha>) => setLinhas((atual) => ({ ...atual, [dia]: { ...atual[dia], ...parte } }));

  const diasUteis = ORDEM.filter((d) => linhas[d].trabalha).length;
  const horasSemana = ORDEM.reduce((soma, d) => soma + (linhas[d].trabalha ? (horasDoDia(linhas[d].inicio, linhas[d].fim, linhas[d].almoco) ?? 0) : 0), 0);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Horário de funcionamento</h2>
      <p className="mt-1 text-xs text-text-muted">
        Dias e horários em que a empresa produz. A capacidade dos recursos (Produção → Recursos e capacidade) conta só os dias
        marcados aqui — sábado e domingo ficam de fora, a menos que você os marque. Feriados, folgas e dias extras ficam em
        Calendário de produção.
      </p>

      <form action={upsertHorarioFuncionamentoAction} className="mt-3">
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Dia</Th>
              <Th>Funciona</Th>
              <Th>Início</Th>
              <Th>Fim</Th>
              <Th>Intervalo (min)</Th>
              <Th>Horas do dia</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {ORDEM.map((dia) => {
              const l = linhas[dia];
              const horas = l.trabalha ? horasDoDia(l.inicio, l.fim, l.almoco) : null;
              return (
                <tr key={dia}>
                  <Td className="font-medium text-text">{NOME[dia]}</Td>
                  <Td>
                    <input
                      type="checkbox"
                      name={`trabalha_${dia}`}
                      checked={l.trabalha}
                      onChange={(e) =>
                        atualizar(dia, {
                          trabalha: e.target.checked,
                          ...(e.target.checked && !l.inicio ? { inicio: "08:00", fim: "17:00", almoco: "60" } : {}),
                        })
                      }
                      disabled={!canManage}
                      aria-label={`${NOME[dia]} funciona`}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="time"
                      name={`inicio_${dia}`}
                      value={l.trabalha ? l.inicio : ""}
                      onChange={(e) => atualizar(dia, { inicio: e.target.value })}
                      disabled={!canManage || !l.trabalha}
                      required={l.trabalha}
                      className="w-28"
                    />
                  </Td>
                  <Td>
                    <Input
                      type="time"
                      name={`fim_${dia}`}
                      value={l.trabalha ? l.fim : ""}
                      onChange={(e) => atualizar(dia, { fim: e.target.value })}
                      disabled={!canManage || !l.trabalha}
                      required={l.trabalha}
                      className="w-28"
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      step={5}
                      name={`almoco_${dia}`}
                      value={l.trabalha ? l.almoco : "0"}
                      onChange={(e) => atualizar(dia, { almoco: e.target.value })}
                      disabled={!canManage || !l.trabalha}
                      className="w-24"
                    />
                  </Td>
                  <Td className="text-text-muted">
                    {l.trabalha ? (horas === null ? "—" : `${horas.toLocaleString("pt-BR")} h`) : "sem expediente"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DenseTable>

        <p className="mt-2 text-xs text-text-muted">
          {diasUteis} dia(s) por semana · {horasSemana.toLocaleString("pt-BR")} h de expediente na semana.
        </p>

        {canManage && (
          <div className="mt-2">
            <Button type="submit" variant="primary">
              Salvar horário
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
