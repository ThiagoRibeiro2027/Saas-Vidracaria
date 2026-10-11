import { Table, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { calcularValidade, JANELA_BLOQUEIO_DIAS, JANELA_EXPIRACAO_DIAS } from "@/lib/offline/validade";

export type SyncStatusRow = {
  profileId: string;
  displayName: string;
  lastSyncedAt: string | null; // null = usuário de campo sem nenhuma sincronização registrada ainda
};

// Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): o escritório
// não tinha nenhum jeito de ver qual celular de campo está atrasado pra
// sincronizar — só o próprio aparelho sabia (ADR-005 §27/§28). Reaproveita
// a MESMA janela/alerta já usada no app de campo (src/lib/offline/
// validade.ts) — o que o instalador vê no celular e o que o escritório vê
// aqui são sempre consistentes, calculados pela mesma função.
export default function SincronizacaoSection({ rows, agoraMs }: { rows: SyncStatusRow[]; agoraMs: number }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Sincronização dos celulares de campo</h2>
      <p className="mt-1 text-xs text-text-muted">
        Última vez que cada usuário do app de Instalação — Campo baixou os dados mais recentes.
        Passado {JANELA_BLOQUEIO_DIAS} dias sem sincronizar, o celular fica impedido de criar
        novos registros offline; passado {JANELA_EXPIRACAO_DIAS} dias, os dados locais expiram.
      </p>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Última sincronização</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const validade = calcularValidade(row.lastSyncedAt, agoraMs);
              return (
                <tr key={row.profileId}>
                  <Td>{row.displayName}</Td>
                  <Td>
                    {row.lastSyncedAt
                      ? `${new Date(row.lastSyncedAt).toLocaleString("pt-BR")} (${validade.diasSemSync!.toFixed(1)}d atrás)`
                      : "—"}
                  </Td>
                  <Td>
                    {validade.expirado && <Badge variant="danger">Dados expirados</Badge>}
                    {!validade.expirado && validade.bloqueadoParaCriar && <Badge variant="warning">Bloqueado p/ novos registros</Badge>}
                    {!validade.expirado && !validade.bloqueadoParaCriar && (validade.aproximandoBloqueio || validade.aproximandoExpiracao) && (
                      <Badge variant="warning">Aproximando do limite</Badge>
                    )}
                    {!validade.expirado && !validade.bloqueadoParaCriar && !validade.aproximandoBloqueio && !validade.aproximandoExpiracao && (
                      <Badge variant="success">Em dia</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={3}>
                  <span className="text-text-muted">Nenhum usuário sincronizou o app de campo ainda.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
