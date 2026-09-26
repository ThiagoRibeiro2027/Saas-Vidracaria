-- FIX (26/09/2026): contratos.aprovar (T18) e financeiro.aprovar (T13
-- Fase 5) nunca chegaram ao banco real. Achado ao validar o alerta de
-- vencimento de contrato (T18 §7): aprovar_contrato() falhava pra
-- QUALQUER papel, inclusive ADMIN, com "Sem permissão... (contratos.
-- aprovar)".
--
-- Causa raiz: a convenção documentada nas próprias migrations que
-- introduziram essas permissões ("permissão nova vai em
-- supabase/seed.sql — catálogo de permissões vive lá, não em migration
-- nova", ver cabeçalho de 20261101000000) só funciona em banco LOCAL,
-- onde `supabase db reset` roda o seed a cada setup. Desde que este
-- projeto passou a usar um único banco compartilhado na nuvem (26/09/
-- 2026, CLAUDE.md "Banco e ambiente de trabalho"), `db push` nunca
-- aplica seed.sql — só migration chega no banco real. Toda permissão
-- adicionada a seed.sql depois da carga inicial do projeto na nuvem
-- ficou só no arquivo, nunca no banco, até esta migration.
--
-- Auditoria feita: comparado supabase/seed.sql inteiro (68 linhas) contra
-- o public.permissions ao vivo — só estas duas divergiam. Nenhuma outra
-- permissão do catálogo está faltando.
--
-- Fix, não mudança de regra de negócio: insere exatamente o que
-- seed.sql já declara (mesmo texto de description) e concede ao papel
-- ADMIN global, replicando o `insert...select cross join` que o próprio
-- seed.sql já faz pra ADMIN receber toda permissão do catálogo. Mesma
-- convenção de idempotência (`on conflict do nothing`) do arquivo
-- original — seguro rodar de novo se algum dia rodar por engano.
--
-- Regra nova daqui pra frente (ver também CLAUDE.md): toda permissão
-- adicionada a seed.sql precisa vir com uma migration irmã que a
-- insere de verdade — seed.sql deixa de ser suficiente sozinho no
-- fluxo de duas máquinas contra banco único.
insert into public.permissions (resource, action, description) values
  ('contratos', 'aprovar', 'Aprovar ou reprovar contrato em análise, efetivando a alçada de aprovação — em_aprovação → vigente (TÓPICO 18 §6)'),
  ('financeiro', 'aprovar', 'Decidir etapa de alçada de aprovação de pagamento (título a pagar) — TÓPICO 13 §6.2, Fase 5')
on conflict (resource, action) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is null and r.key = 'ADMIN'
  and (p.resource, p.action) in (('contratos', 'aprovar'), ('financeiro', 'aprovar'))
on conflict do nothing;
