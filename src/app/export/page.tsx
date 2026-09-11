import ExportButton from "./ExportButton";

export default function ExportPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>Fase 6 — Governança</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Exportação de dados</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Exporta os dados da sua empresa (usuários, arquivos, histórico de auditoria e
          assinatura) em um arquivo JSON estruturado. Nunca inclui o banco de dados interno
          nem a arquitetura do sistema — só os dados da própria empresa.
        </p>

        <ExportButton />
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
