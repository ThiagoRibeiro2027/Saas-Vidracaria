-- Regressão de segurança: 20261010000000_code_review_fixes_2.sql recriou a
-- policy files_select (para adicionar o gate de entity_type =
-- 'funcionario_documento') mas sem querer reverteu duas correções já
-- aplicadas pela auditoria de 15/09/2026 (F03,
-- 20260915030000_auditoria_15092026_p1.sql):
--   1. Perdeu o filtro `deleted_at is null` — arquivo com soft-delete
--      voltava a aparecer em files_select e a permitir signed URL
--      (getSignedUrlAction(), src/app/files/actions.ts).
--   2. Trocou is_platform_admin_mfa_verified() de volta por
--      is_platform_admin() simples — viola a regra 4 do CLAUDE.md
--      (platform_admin exige AAL2 na camada de autorização do banco, não
--      só a sessão do Next.js).
-- Restaura as duas, mantendo o gate de RH adicionado em 20261010000000.

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    deleted_at is null
    and (
      (
        company_id = (select public.current_company_id())
        and (select public.has_permission('files', 'read'))
        and (entity_type <> 'funcionario_documento' or (select public.has_permission('rh', 'view')))
      )
      or (select public.is_platform_admin_mfa_verified())
    )
  );
