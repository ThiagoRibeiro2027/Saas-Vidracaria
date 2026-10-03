-- Storage — a policy de SELECT em storage.objects passa a impor o mesmo RBAC
-- por entidade que public.files já impõe (regra 5 do CLAUDE.md: "Policy de
-- Storage impõe tenant E permissão RBAC, nunca só isolamento por prefixo").
--
-- PROBLEMA. company_files_select (20260914090000) exige só o prefixo do
-- tenant + has_permission('files','read'). Já files_select (public.files)
-- exige, além disso, rh.view pra entity_type='funcionario_documento' e
-- contratos.view pra entity_type='contrato' (20261010000000, 20261209000000).
-- Resultado: quem tem files.read mas não rh.view não enxerga a LINHA do
-- documento de RH, mas, se souber o storage_path, o Storage Data API entrega
-- o binário (download/createSignedUrl) — a barreira real do binário era só o
-- caminho ter UUID aleatório. Hoje as telas de RH e Contratos passam pela
-- linha de files antes de pedir a URL, então a UI não explora isso; a
-- policy em si, porém, não impõe o RBAC.
--
-- DESENHO. O binário passa a ser visível se, e somente se, a linha de
-- public.files correspondente é visível ao chamador. O EXISTS abaixo roda
-- com o RLS do próprio chamador sobre public.files (subconsulta de policy
-- não é SECURITY DEFINER), então files_select já decide tudo: tenant,
-- files.read, soft-delete e o gate por entity_type. Vantagens:
--   * uma única fonte da verdade — todo entity_type sensível novo que
--     ganhar gate em files_select passa a valer automaticamente no binário,
--     sem lembrar de mexer aqui;
--   * nenhuma lista de entity_type duplicada nesta policy.
-- A busca usa a unique (bucket_id, storage_path) de public.files — index
-- scan, sem custo relevante sob o ADR-009.
--
-- MUDANÇAS DE COMPORTAMENTO (intencionais, todas no sentido de negar mais):
--   1. Arquivo com soft-delete (deleted_at) deixa de ser baixável por
--      usuário, mesmo conhecendo o caminho. O objeto físico continua no
--      Storage (purge físico segue decisão futura) e acessível à service
--      role e ao platform_admin com MFA.
--   2. Objeto órfão (enviado pela service role e ainda sem register_file(),
--      janela que find_orphaned_storage_objects() cobre) não é visível ao
--      usuário até ser registrado. Fluxo normal não é afetado:
--      uploadCompanyFiles() registra no mesmo request, e a tela só pede a
--      URL de arquivos que listou a partir de public.files.
--   3. storage.list() do usuário só devolve objetos já registrados e
--      visíveis a ele.
--
-- O ramo de platform_admin com MFA (is_platform_admin_mfa_verified, regra 4)
-- não muda. INSERT/UPDATE/DELETE continuam sem policy para
-- authenticated/anon (20260915040000): escrita é só da service role.

drop policy if exists company_files_select on storage.objects;
create policy company_files_select on storage.objects for select
  using (
    bucket_id = 'company-files'
    and (
      (select public.is_platform_admin_mfa_verified())
      or (
        (storage.foldername(name))[1] = (select public.current_company_id())::text
        and (select public.has_permission('files', 'read'))
        and exists (
          select 1
          from public.files f
          where f.bucket_id = objects.bucket_id
            and f.storage_path = objects.name
        )
      )
    )
  );
