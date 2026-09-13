-- Corrige lacuna de segurança identificada no Security Gate da Fase 8:
-- storage.objects (bucket company-files) nunca teve policy de UPDATE — só
-- SELECT, INSERT e DELETE (20260911212521_storage_and_files.sql, mantidas
-- em 20260912140000_adr009_rls_performance.sql). Qualquer upload com
-- upsert:true para um path já existente vira internamente um
-- INSERT ... ON CONFLICT DO UPDATE; sem policy permissiva de UPDATE, esse
-- UPDATE cai no default-deny do RLS e o próprio dono do arquivo é barrado
-- de reenviar/substituir o próprio objeto (reproduzido e confirmado antes
-- desta migration). Mesma regra de isolamento por prefixo já usada nas
-- demais policies do bucket.

drop policy if exists company_files_update on storage.objects;
create policy company_files_update on storage.objects for update
  using (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  )
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );
