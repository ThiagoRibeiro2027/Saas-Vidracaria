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
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>Fase 3 — Storage e arquivos</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Central de arquivos</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Arquivos ficam em um bucket privado, isolados por empresa. Imagens são
          redimensionadas e comprimidas antes de salvar; o download usa link
          temporário assinado.
        </p>

        <UploadForm />
        <FilesList files={files ?? []} />
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "560px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
