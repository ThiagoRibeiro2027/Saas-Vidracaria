import { createClient } from "@/lib/supabase/server";
import ContratosSection from "./ContratosSection";

// TÓPICO 18 — Contratos completo (§4-6): estrutura genérica única com os
// três tipos (cliente/fornecedor/funcionário), ciclo de vida completo
// (rascunho → em aprovação → vigente → suspenso → encerrado/cancelado)
// com alçada de aprovação, garantia (só cliente) e vínculo financeiro
// detalhado (contrato → título financeiro, só cliente vigente). Anexos e
// alertas de vencimento seguem fora desta fase (ver cabeçalho da migration
// 20261029000000).
export default async function ContratosPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canAprovar }, { data: canGerarTitulos }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "aprovar" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar os contratos desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: contratos }, { data: pessoas }, { data: papeis }, { data: obras }, { data: pedidos }, { data: funcionarios }, { data: titulos }] =
    await Promise.all([
      supabase.from("contratos").select("*").order("created_at", { ascending: false }),
      supabase.from("pessoas").select("id, nome").order("nome"),
      supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
      supabase.from("obras").select("id, nome, pessoa_id").order("nome"),
      supabase.from("pedidos").select("id, numero, pessoa_id").order("numero"),
      supabase.from("funcionarios").select("id, nome").order("nome"),
      supabase.from("titulos_financeiros").select("contrato_id").not("contrato_id", "is", null),
    ]);

  const clienteIds = new Set((papeis ?? []).filter((pp) => pp.papel === "CLIENTE" && pp.ativo).map((pp) => pp.pessoa_id));
  const fornecedorIds = new Set((papeis ?? []).filter((pp) => pp.papel === "FORNECEDOR" && pp.ativo).map((pp) => pp.pessoa_id));
  const clientes = (pessoas ?? []).filter((p) => clienteIds.has(p.id));
  const fornecedores = (pessoas ?? []).filter((p) => fornecedorIds.has(p.id));
  const contratoIdsComTitulo = new Set((titulos ?? []).map((t) => t.contrato_id as string));

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 18 — CONTRATOS</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Contratos</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Estrutura genérica para contratos com cliente, fornecedor e funcionário/prestador. Ciclo
          de vida completo com alçada de aprovação, garantia (só cliente) e vínculo financeiro
          detalhado (título financeiro gerado a partir de contrato vigente com cliente).
        </p>

        <ContratosSection
          rows={contratos ?? []}
          pessoas={pessoas ?? []}
          clientes={clientes}
          fornecedores={fornecedores}
          obras={obras ?? []}
          pedidos={pedidos ?? []}
          funcionarios={funcionarios ?? []}
          contratoIdsComTitulo={contratoIdsComTitulo}
          canManage={!!canManage}
          canAprovar={!!canAprovar}
          canGerarTitulos={!!canGerarTitulos}
        />
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
  width: "1040px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
