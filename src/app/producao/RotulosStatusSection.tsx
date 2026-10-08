"use client";

import { definirRotuloStatusProducaoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

export type RotuloStatusRow = {
  campo: "status" | "situacao" | "status_qualidade";
  valor_interno: string;
  rotulo: string;
};

const CAMPO_LABEL: Record<RotuloStatusRow["campo"], string> = {
  status: "Status da OP",
  situacao: "Situação da OP",
  status_qualidade: "Status de qualidade",
};

export default function RotulosStatusSection({
  rotulos,
  canManage,
}: {
  rotulos: RotuloStatusRow[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Rótulos de status (TÓPICO 4 §41)</h2>
      <p className="mt-1 text-xs text-text-muted">
        A empresa pode renomear como cada status aparece na tela. O valor interno (o que
        Qualidade/Expedição de fato leem pra liberar a próxima etapa) nunca muda — só o texto
        exibido. &quot;Pausada&quot; não está na lista porque a OP ainda não registra pausa/retomada
        com motivo (fora deste recorte).
      </p>

      <div className="mt-2">
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Campo</Th>
              <Th>Valor interno</Th>
              <Th>Rótulo</Th>
              {canManage && <Th />}
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {rotulos.map((r) => (
              <tr key={`${r.campo}.${r.valor_interno}`}>
                <Td>{CAMPO_LABEL[r.campo]}</Td>
                <Td>
                  <span className="font-mono text-text-muted">{r.valor_interno}</span>
                </Td>
                <Td>{r.rotulo}</Td>
                {canManage && (
                  <Td>
                    <form action={definirRotuloStatusProducaoAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="campo" value={r.campo} />
                      <input type="hidden" name="valor_interno" value={r.valor_interno} />
                      <Input name="rotulo" defaultValue={r.rotulo} required className="w-44" />
                      <Button type="submit" variant="primary" size="sm">
                        Salvar
                      </Button>
                    </form>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </div>
    </section>
  );
}
