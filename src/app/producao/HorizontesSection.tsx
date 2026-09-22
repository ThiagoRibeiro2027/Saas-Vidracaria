"use client";

import { criarHorizonteProgramacaoAction, removerHorizonteProgramacaoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, Th, Td } from "@/components/ui/Table";

export type HorizonteProgramacao = {
  id: string;
  tipo: "longo_prazo" | "flexivel" | "congelado";
  data_inicio: string;
  data_fim: string;
  motivo: string | null;
};

const TIPO_LABEL: Record<HorizonteProgramacao["tipo"], string> = {
  longo_prazo: "Longo prazo",
  flexivel: "Flexível",
  congelado: "🔒 Congelado",
};

const TIPO_TONE: Record<HorizonteProgramacao["tipo"], "neutral" | "success" | "danger"> = {
  longo_prazo: "neutral",
  flexivel: "success",
  congelado: "danger",
};

const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR");

export default function HorizontesSection({
  horizontes,
  canManage,
}: {
  horizontes: HorizonteProgramacao[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Horizonte e congelamento da programação (TÓPICO 4 §9)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Períodos configurados pela empresa (longo prazo, flexível, congelado). Alterar a data
        planejada de uma operação (programar/decidir sequenciamento) dentro de um período
        congelado exige a permissão producao.reprogramar_congelado, além de producao.manage.
        Períodos podem se sobrepor.
      </p>

      {canManage && (
        <form action={criarHorizonteProgramacaoAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Select name="tipo" required defaultValue="" className="w-32">
            <option value="" disabled>
              Tipo...
            </option>
            <option value="longo_prazo">Longo prazo</option>
            <option value="flexivel">Flexível</option>
            <option value="congelado">Congelado</option>
          </Select>
          <Input name="data_inicio" type="date" required className="w-36" />
          <Input name="data_fim" type="date" required className="w-36" />
          <Input name="motivo" placeholder="motivo (opcional)" className="w-44" />
          <Button type="submit" variant="primary">
            Criar período
          </Button>
        </form>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Período</Th>
              <Th>Motivo</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {horizontes.map((h) => (
              <tr key={h.id}>
                <Td>
                  <Badge variant={TIPO_TONE[h.tipo]}>{TIPO_LABEL[h.tipo]}</Badge>
                </Td>
                <Td>
                  {fmt(h.data_inicio)} – {fmt(h.data_fim)}
                </Td>
                <Td>{h.motivo ?? "—"}</Td>
                {canManage && (
                  <Td>
                    <form action={removerHorizonteProgramacaoAction}>
                      <input type="hidden" name="id" value={h.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Remover
                      </Button>
                    </form>
                  </Td>
                )}
              </tr>
            ))}
            {horizontes.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 4 : 3}>
                  <span className="text-text-muted">Nenhum período configurado ainda.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
