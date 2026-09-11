-- Seed da Fase 2 — apenas o catálogo de permissões e os templates de papel
-- necessários para a própria fundação de segurança funcionar (gestão de
-- empresa, usuários, papéis e auditoria). Nenhuma permissão de módulo
-- operacional (Tópicos 2-14) é inventada aqui — isso pertence às fases
-- futuras, quando cada módulo for implementado.

insert into public.permissions (resource, action, description) values
  ('company', 'view', 'Visualizar dados da própria empresa'),
  ('company', 'manage', 'Editar configurações da própria empresa'),
  ('users', 'view', 'Visualizar usuários da empresa'),
  ('users', 'manage', 'Criar, editar e desativar usuários da empresa'),
  ('roles', 'view', 'Visualizar papéis e permissões da empresa'),
  ('roles', 'manage', 'Criar/editar papéis e atribuir permissões'),
  ('activity_logs', 'read', 'Consultar o log de auditoria da empresa')
on conflict (resource, action) do nothing;

-- Templates de papel por tenant (company_id nulo = seed reutilizável).
-- Nomenclatura alinhada ao Prompt Mestre de Segurança, mas SUPER_ADMIN fica
-- reservado à tabela platform_admins (separação exigida pelo ADR-001) — o
-- papel de maior autoridade dentro de um tenant é ADMIN.
insert into public.roles (company_id, key, name, is_system_template) values
  (null, 'ADMIN', 'Administrador da Empresa', true),
  (null, 'COMERCIAL', 'Comercial', true),
  (null, 'PRODUCAO', 'Produção', true),
  (null, 'INSTALACAO', 'Instalação', true)
on conflict (key) where company_id is null do nothing;

-- ADMIN (template) recebe todas as permissões de fundação; os demais
-- templates ficam sem permissão de fundação atribuída por padrão — cada
-- empresa decide o que conceder ao copiar os templates (RBAC configurável).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is null and r.key = 'ADMIN'
on conflict do nothing;
