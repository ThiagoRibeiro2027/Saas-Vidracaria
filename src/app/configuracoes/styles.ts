// Estilo inline compartilhado pelas seções de /configuracoes — mesmo padrão
// de src/app/governance/ (sem Tailwind, sem shell/nav compartilhado), só
// que fatorado aqui porque as 4 seções desta tela são partes do mesmo
// módulo, ao contrário de governance/files/audit, que são páginas
// independentes.

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
