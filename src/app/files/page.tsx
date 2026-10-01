import { createClient } from "@/lib/supabase/server";
import FilesList from "./FilesList";
import UploadForm from "./UploadForm";

export default async function FilesPage() {
  const supabase = await createClient();
  const { data: files } = await supabase
    .from("files")
    .select("id, original_name, mime_type, size_bytes, width, height, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <p className="font-mono text-[11px] text-primary">Fase 3 — Storage e arquivos</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Central de arquivos</h1>
      <p className="mt-1 text-sm text-text">
        Arquivos ficam em um bucket privado, isolados por empresa. Imagens são
        redimensionadas e comprimidas antes de salvar; o download usa link
        temporário assinado.
      </p>

      <div className="mt-4">
        <UploadForm />
      </div>
      <div className="mt-4">
        <FilesList files={files ?? []} />
      </div>
    </div>
  );
}
