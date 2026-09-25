// Estilo inline compartilhado por telas que ainda não migraram para o design
// system (@/components/ui/*). Restaurado em 2026-09-25 durante a
// reconciliação do merge origin/main: a migração de design system feita
// localmente (commit 4cdb219) removeu este arquivo, mas os módulos criados
// em paralelo no branch mesclado (Compras, Contratos, Fila de Produção,
// Integrações, Peças, Fiscal, RH, Suprimentos, BI) ainda dependiam dele.
// Restaurar aqui evita quebrar o build; migrar esses módulos para o design
// system é tarefa separada, não parte desta reconciliação.

export const sectionTitleStyle = { fontSize: "14px", margin: "0 0 4px" } as const;
export const hintStyle = { fontSize: "12px", color: "#6b7a75", margin: "0 0 10px" } as const;
export const thStyle = { padding: "6px 8px" } as const;
export const tdStyle = { padding: "6px 8px" } as const;
export const inputStyle = {
  padding: "4px 6px",
  borderRadius: "4px",
  border: "1px solid #dae2de",
  fontSize: "12px",
} as const;
export const labelStyle = { display: "flex", alignItems: "center", gap: "4px", color: "#3e4d49" } as const;
export const buttonStyle = {
  background: "#1f5d57",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "4px 10px",
  fontSize: "12px",
  cursor: "pointer",
} as const;
