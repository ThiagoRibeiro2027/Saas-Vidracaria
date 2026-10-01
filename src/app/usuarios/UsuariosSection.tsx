"use client";

import {
  criarUsuarioAction,
  atribuirPapelAction,
  revogarPapelAction,
  desativarUsuarioAction,
  reativarUsuarioAction,
  resetarSenhaAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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

export default function UsuariosSection({
  profiles,
  roles,
  userRolesPorProfile,
  canManage,
}: {
  profiles: Profile[];
  roles: Role[];
  userRolesPorProfile: Map<string, UserRoleRow[]>;
  canManage: boolean;
}) {
  const roleNome = (id: string) => roles.find((r) => r.id === id)?.name ?? "(papel removido)";

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Usuários</h2>
      <p className="mt-1 text-xs text-text-muted">
        Convite administrativo — sem cadastro público. O usuário nasce com senha temporária e é
        obrigado a trocá-la no primeiro acesso. Login continua sendo empresa + matrícula.
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

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Matrícula</Th>
              <Th>Nome</Th>
              <Th>Situação</Th>
              <Th>Papéis</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const userRoles = userRolesPorProfile.get(p.id) ?? [];
              return (
                <tr key={p.id}>
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
                    <Badge variant={p.active ? "success" : "danger"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
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
                      {canManage && (
                        <form action={atribuirPapelAction} className="flex gap-1">
                          <input type="hidden" name="profile_id" value={p.id} />
                          <Select name="role_id" required defaultValue="" className="w-32 text-[11px]">
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
                  </Td>
                  {canManage && (
                    <Td>
                      <div className="flex flex-col gap-1">
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
                            className="w-24 text-[11px]"
                          />
                          <Button type="submit" variant="secondary" size="sm">
                            resetar
                          </Button>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 5 : 4}>
                  <span className="text-text-muted">Nenhum usuário cadastrado ainda.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
