-- Seed das fases de segurança (Fase 2 fundação, Fase 3 storage) — catálogo
-- de permissões e templates de papel necessários para a própria plataforma
-- funcionar (empresa, usuários, papéis, auditoria, arquivos). Nenhuma
-- permissão de módulo operacional (Tópicos 2-14) é inventada aqui — isso
-- pertence às fases futuras, quando cada módulo for implementado.

insert into public.permissions (resource, action, description) values
  ('company', 'view', 'Visualizar dados da própria empresa'),
  ('company', 'manage', 'Editar configurações da própria empresa'),
  ('users', 'view', 'Visualizar usuários da empresa'),
  ('users', 'manage', 'Criar, editar e desativar usuários da empresa'),
  ('roles', 'view', 'Visualizar papéis e permissões da empresa'),
  ('roles', 'manage', 'Criar/editar papéis e atribuir permissões'),
  ('activity_logs', 'read', 'Consultar o log de auditoria da empresa'),
  ('files', 'read', 'Consultar arquivos anexados da empresa'),
  ('files', 'upload', 'Enviar novos arquivos para a empresa'),
  ('files', 'delete', 'Remover (soft delete) arquivos da empresa'),
  ('export', 'company_data', 'Exportar os dados da própria empresa'),
  ('configuracoes', 'view', 'Visualizar as configurações da empresa (TÓPICO 15)'),
  ('configuracoes', 'manage', 'Editar numeração, margem de quebra, regra de medição e alçadas (TÓPICO 15)'),
  ('pessoas', 'view', 'Visualizar clientes e fornecedores da empresa (TÓPICO 2)'),
  ('pessoas', 'manage', 'Criar/editar pessoas e seus papéis (TÓPICO 2)'),
  ('obras', 'view', 'Visualizar obras da empresa (TÓPICO 2)'),
  ('obras', 'manage', 'Criar/editar obras (TÓPICO 2)'),
  ('itens', 'view', 'Visualizar itens (produtos/materiais) da empresa (TÓPICO 2)'),
  ('itens', 'manage', 'Criar/editar itens (TÓPICO 2)'),
  ('orcamentos', 'view', 'Visualizar orçamentos da empresa (TÓPICO 10)'),
  ('orcamentos', 'manage', 'Criar/editar itens, aprovar, rejeitar e cancelar orçamentos (TÓPICO 10)'),
  ('pedidos', 'view', 'Visualizar pedidos da empresa (TÓPICO 3)'),
  ('pedidos', 'manage', 'Converter orçamento em pedido, conferir, abrir/resolver pendência, liberar e cancelar pedidos (TÓPICO 3)'),
  ('engenharia', 'view', 'Visualizar itens de produção e medidas da empresa (TÓPICO 5)'),
  ('engenharia', 'manage', 'Criar item de produção, registrar e confirmar medida em obra (TÓPICO 5)'),
  ('estoque', 'view', 'Visualizar saldo, reservas e movimentações de estoque da empresa (TÓPICO 6)'),
  ('estoque', 'manage', 'Ajustar saldo, reservar/liberar/consumir e registrar sobra de estoque (TÓPICO 6)'),
  ('producao', 'view', 'Visualizar ordens de produção e lista de corte da empresa (TÓPICO 4)'),
  ('producao', 'manage', 'Criar ordem de produção, apontar, concluir e cancelar (TÓPICO 4)'),
  ('qualidade', 'view', 'Visualizar inspeções e não conformidades da empresa (TÓPICO 8)'),
  ('qualidade', 'manage', 'Registrar inspeção, executar retrabalho e reinspecionar (TÓPICO 8)'),
  ('expedicao', 'view', 'Visualizar expedições, itens e ocorrências da empresa (TÓPICO 9)'),
  ('expedicao', 'manage', 'Criar expedição, adicionar/remover item, conferir, registrar saída, cancelar, confirmar entrega e registrar ocorrência (TÓPICO 9)'),
  ('instalacao', 'view', 'Visualizar instalações, itens, ocorrências e danos da empresa (TÓPICO 16)'),
  ('instalacao', 'manage', 'Criar/agendar instalação, gerir equipes, adicionar/remover item, iniciar execução, registrar execução, concluir, cancelar, registrar ocorrência e dano, solicitar nova fabricação (TÓPICO 16)'),
  ('instalacao', 'aceite', 'Registrar o aceite do cliente numa instalação concluída (TÓPICO 16)'),
  ('instalacao', 'decidir_dano', 'Aprovar ou rejeitar solicitação de nova fabricação por dano em instalação (TÓPICO 16 §8)'),
  ('suprimentos', 'view', 'Visualizar necessidades de compra da empresa (TÓPICO 7)'),
  ('suprimentos', 'manage', 'Registrar, atender e cancelar necessidades de compra (TÓPICO 7)'),
  ('financeiro', 'view', 'Visualizar títulos financeiros e recebimentos da empresa (TÓPICO 11)'),
  ('financeiro', 'manage', 'Gerar títulos financeiros a partir de pedido e cancelar título sem recebimento (TÓPICO 11)'),
  ('financeiro', 'receber', 'Registrar recebimento (integral ou parcial) de título financeiro (TÓPICO 11)'),
  ('rh', 'view', 'Visualizar funcionários da empresa — dado pessoal sensível, LGPD (TÓPICO 17)'),
  ('rh', 'manage', 'Admitir, editar e desligar funcionários, incluindo revogar o acesso do usuário vinculado (TÓPICO 17)')
on conflict (resource, action) do nothing;

-- Templates de papel por tenant (company_id nulo = seed reutilizável).
-- Nomenclatura alinhada ao Prompt Mestre de Segurança, mas SUPER_ADMIN fica
-- reservado à tabela platform_admins (separação exigida pelo ADR-001) — o
-- papel de maior autoridade dentro de um tenant é ADMIN.
insert into public.roles (company_id, key, name, is_system_template) values
  (null, 'ADMIN', 'Administrador da Empresa', true),
  (null, 'COMERCIAL', 'Comercial', true),
  (null, 'PRODUCAO', 'Produção', true),
  (null, 'QUALIDADE', 'Qualidade', true),
  (null, 'EXPEDICAO', 'Expedição', true),
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
