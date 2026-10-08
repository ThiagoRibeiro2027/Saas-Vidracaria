"use client";

import { Fragment, useState } from "react";
import { criarPapelAction, concederPermissaoAction, revogarPermissaoAction } from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

export type Permission = { id: string; resource: string; action: string; description: string | null };
type Role = { id: string; key: string; name: string; company_id: string | null };

// 2026-10-04: linha compacta (papel + quantidade de permissões), clicável
// pra expandir e mostrar os chips de permissão + o formulário de conceder —
// mesmo padrão de Usuários/RH/Financeiro. Sem paginação aqui: papéis são um
// catálogo de configuração (poucas dezenas no máximo por empresa), não uma
// lista que cresce por operação do dia a dia.
export default function PapeisSection({
  roles,
  permissions,
  permissoesPorPapel,
  canManage,
}: {
  roles: Role[];
  permissions: Permission[];
  permissoesPorPapel: Map<string, Set<string>>;
  canManage: boolean;
}) {
  const papeisDaEmpresa = roles.filter((r) => r.company_id !== null);
  const papeisModelo = roles.filter((r) => r.company_id === null);
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Papéis e permissões</h2>
      <p className="mt-1 text-xs text-text-muted">
        Papéis-modelo do sistema (abaixo) não podem ter permissão alterada aqui — servem só de
        referência de nomenclatura. Crie um papel próprio da empresa para conceder/revogar
        permissão de fato. Clique num papel para ver e alterar as permissões concedidas.
      </p>

      {canManage && (
        <form action={criarPapelAction} className="mt-3 flex gap-1.5">
          <Input name="key" placeholder="chave (ex.: SUPERVISOR_PRODUCAO)" required className="w-56" />
          <Input name="name" placeholder="nome de exibição" required className="w-44" />
          <Button type="submit" variant="primary">
            Criar papel
          </Button>
        </form>
      )}

      <p className="mt-3 text-xs text-text-muted">Papéis da empresa:</p>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Papel</Th>
              <Th>Permissões concedidas</Th>
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {papeisDaEmpresa.map((r) => {
              const concedidas = permissoesPorPapel.get(r.id) ?? new Set<string>();
              const aberto = expandido === r.id;
              return (
                <Fragment key={r.id}>
                  <tr onClick={() => setExpandido((atual) => (atual === r.id ? null : r.id))} className="cursor-pointer hover:bg-page-bg">
                    <Td>{r.name}</Td>
                    <Td>{concedidas.size === 0 ? "nenhuma" : `${concedidas.size} permissão(ões)`}</Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={3} className="bg-page-bg">
                        <div className="flex flex-wrap gap-1">
                          {permissions
                            .filter((p) => concedidas.has(p.id))
                            .map((p) => (
                              <span key={p.id} className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5">
                                {p.resource}.{p.action}
                                {canManage && (
                                  <form action={revogarPermissaoAction}>
                                    <input type="hidden" name="role_id" value={r.id} />
                                    <input type="hidden" name="permission_id" value={p.id} />
                                    <button type="submit" className="cursor-pointer text-[11px] text-danger">
                                      ×
                                    </button>
                                  </form>
                                )}
                              </span>
                            ))}
                          {concedidas.size === 0 && <span className="text-text-muted">nenhuma</span>}
                        </div>
                        {canManage && (
                          <form action={concederPermissaoAction} className="mt-2 flex gap-1">
                            <input type="hidden" name="role_id" value={r.id} />
                            <Select name="permission_id" required defaultValue="" className="w-44">
                              <option value="" disabled>
                                selecionar...
                              </option>
                              {permissions
                                .filter((p) => !concedidas.has(p.id))
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.resource}.{p.action}
                                  </option>
                                ))}
                            </Select>
                            <Button type="submit" variant="primary" size="sm">
                              Conceder
                            </Button>
                          </form>
                        )}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {papeisDaEmpresa.length === 0 && (
              <tr>
                <Td colSpan={3}>
                  <span className="text-text-muted">Nenhum papel próprio criado ainda.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-text-muted">Papéis-modelo do sistema (referência, sem permissão própria por padrão):</p>
      <ul className="text-xs text-text">
        {papeisModelo.map((r) => (
          <li key={r.id}>
            {r.name} ({r.key})
          </li>
        ))}
      </ul>
    </section>
  );
}
