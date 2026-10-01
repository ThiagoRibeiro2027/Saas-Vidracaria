import ExportButton from "./ExportButton";

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <p className="font-mono text-[11px] text-primary">Fase 6 — Governança</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Exportação de dados</h1>
      <p className="mt-1 text-sm text-text">
        Exporta os dados da sua empresa (usuários, arquivos, histórico de auditoria e
        assinatura) em um arquivo JSON estruturado. Nunca inclui o banco de dados interno
        nem a arquitetura do sistema — só os dados da própria empresa.
      </p>

      <div className="mt-4">
        <ExportButton />
      </div>
    </div>
  );
}
