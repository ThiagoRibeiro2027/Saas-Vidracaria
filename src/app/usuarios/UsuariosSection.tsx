"use client";

import { Fragment, useState } from "react";
import {
  criarUsuarioAction,
  atribuirPapelAction,
  revogarPapelAction,
  desativarUsuarioAction,
  reativarUsuarioAction,
  resetarSenhaAction,
} from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Profile = {
  id: string;
  login_identifier: string;
  display_name: string;
  contact_email: string | null;
  active: boolean;
  must_change_password: boolean;
};
export type Role = { id: string; key: string; name: string; company_id: string | null };
export type UserRoleRow = { id: string; profile_id: string; role_id: string; valid_until: string | null };

// 2026-10-04: mesmo tratamento de Comercial/Pedidos/Engenharia/Fiscal/RH —
// a lista paginada no servidor e cada linha compacta, clicável pra expandir
// e mostrar papéis atuais + ações (em vez de tudo sempre visível na linha).
export default function UsuariosSection({
  profiles,
  paginacao,
  roles,
  userRolesPorProfile,
  canManage,
}: {
  profiles: Profile[];
  paginacao: PaginacaoInfo;
  roles: Role[];
  userRolesPorProfile: Map<string, UserRoleRow[]>;
  canManage: boolean;
}) {
  const roleNome = (id: string) => roles.find((r) => r.id === id)?.name ?? "(papel removido)";
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Usuários</h2>
      <p className="mt-1 text-xs text-text-muted">
        Convite administrativo — sem cadastro público. O usuário nasce com senha temporária e é
        obrigado a trocá-la no primeiro acesso. Login continua sendo empresa + matrícula. Clique
        num usuário para ver papéis e ações.
      </p>

      {canManage && (
        <form action={criarUsuarioAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Input name="login_identifier" placeholder="matrícula" required className="w-24" />
          <Input name="display_name" placeholder="nome completo" required className="w-40" />
          <Input name="contact_email" type="email" placeholder="e-mail (opcional)" className="w-44" />
          <Input name="password" type="password" placeholder="senha inicial" required minLength={8} className="w-32" />
          <Select name="role_id" defaultValue="">
            <option value="">papel inicial (opcional)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary">
            Criar usuário
          </Button>
        </form>
      )}

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch paramBusca="us_q" paramPagina="us_pagina" placeholder="Buscar por nome ou matrícula..." />
        <FiltroAtivo />
      </div>

      <Paginacao {...paginacao} paramPagina="us_pagina" paramPorPagina="us_por_pagina" posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <SortableTh field="login_identifier" paramOrdenar="us_ordenar" paramPagina="us_pagina">Matrícula</SortableTh>
            <SortableTh field="display_name" paramOrdenar="us_ordenar" paramPagina="us_pagina">Nome</SortableTh>
            <SortableTh field="active" paramOrdenar="us_ordenar" paramPagina="us_pagina">Situação</SortableTh>
            <Th>Papéis</Th>
            <Th className="w-6" />
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {profiles.map((p) => {
              const userRoles = userRolesPorProfile.get(p.id) ?? [];
              const aberto = expandido === p.id;
              return (
                <Fragment key={p.id}>
                  <tr onClick={() => setExpandido((atual) => (atual === p.id ? null : p.id))} className="cursor-pointer hover:bg-page-bg">
                    <Td>
                      <span className="font-mono">{p.login_identifier}</span>
                    </Td>
                    <Td>
                      {p.display_name}
                      {p.must_change_password && (
                        <span className="ml-1.5 text-[11px] text-warning">(troca de senha pendente)</span>
                      )}
                    </Td>
                    <Td>
                      <StatusPill tone={p.active ? "success" : "danger"}>{p.active ? "Ativo" : "Inativo"}</StatusPill>
                    </Td>
                    <Td>{userRoles.length === 0 ? "nenhum" : userRoles.map((ur) => roleNome(ur.role_id)).join(", ")}</Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={5} className="bg-page-bg">
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-medium text-text">Papéis atribuídos</p>
                          {userRoles.map((ur) => (
                            <div key={ur.id} className="flex items-center gap-1.5">
                              <span>{roleNome(ur.role_id)}</span>
                              {canManage && (
                                <form action={revogarPapelAction}>
                                  <input type="hidden" name="user_role_id" value={ur.id} />
                                  <Button type="submit" variant="outlineDanger" size="sm">
                                    revogar
                                  </Button>
                                </form>
                              )}
                            </div>
                          ))}
                          {userRoles.length === 0 && <span className="text-xs text-text-muted">nenhum papel atribuído.</span>}
                          {canManage && (
                            <form action={atribuirPapelAction} className="mt-1 flex gap-1">
                              <input type="hidden" name="profile_id" value={p.id} />
                              <Select name="role_id" required defaultValue="" className="w-40 text-[11px]">
                                <option value="" disabled>
                                  + atribuir papel
                                </option>
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </Select>
                              <Button type="submit" variant="primary" size="sm">
                                ok
                              </Button>
                            </form>
                          )}
                        </div>
                        {canManage && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <form action={p.active ? desativarUsuarioAction : reativarUsuarioAction}>
                              <input type="hidden" name="profile_id" value={p.id} />
                              {p.active && <input type="hidden" name="motivo" value="Desativado via /usuarios" />}
                              <Button type="submit" variant={p.active ? "danger" : "primary"} size="sm">
                                {p.active ? "Desativar" : "Reativar"}
                              </Button>
                            </form>
                            <form action={resetarSenhaAction} className="flex gap-1">
                              <input type="hidden" name="profile_id" value={p.id} />
                              <Input
                                name="nova_senha"
                                type="password"
                                placeholder="nova senha"
                                minLength={8}
                                required
                                className="w-28 text-[11px]"
                              />
                              <Button type="submit" variant="secondary" size="sm">
                                resetar
                              </Button>
                            </form>
                          </div>
                        )}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          {profiles.length === 0 && (
            <tr>
              <Td colSpan={5}>
                <span className="text-text-muted">Nenhum usuário cadastrado ainda.</span>
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}

function FiltroAtivo() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("us_ativo") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("us_ativo", novoValor);
    else p.delete("us_ativo");
    p.delete("us_pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por situação"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Ativos e inativos</option>
      <option value="sim">Ativos</option>
      <option value="nao">Inativos</option>
    </select>
  );
}
