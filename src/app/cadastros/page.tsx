import { createClient } from "@/lib/supabase/server";
import PessoasSection from "./PessoasSection";
import ObrasSection from "./ObrasSection";
import ItensSection from "./ItensSection";

// TÓPICO 2 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// outubro: "entrada do pedido"). Pessoa + Papéis (§4-6) em vez de tabelas
// separadas de cliente/fornecedor; Item unificado (§7-10) cobrindo
// produto/material; Obra é registro mínimo (fora do TÓPICO 2 — vem do
// TÓPICO 16/ADR-002 §4.9, dezembro), só o que T3 Pedidos precisa referenciar.
// Cada entidade tem sua própria permissão (pessoas/obras/itens .view/.manage)
// — a seção só aparece pra quem pode vê-la.
export default async function CadastrosPage() {
  const supabase = await createClient();

  const [
    { data: canViewPessoas },
    { data: canManagePessoas },
    { data: canViewObras },
    { data: canManageObras },
    { data: canViewItens },
    { data: canManageItens },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "manage" }),
  ]);

  if (!canViewPessoas && !canViewObras && !canViewItens) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar os cadastros desta empresa.
          </p>
        </div>
      </main>
    );
  }

  // ObrasSection precisa de pessoas + papéis pra montar o <select> de
  // cliente da obra, mesmo quando o papel do usuário só dá obras.view/manage
  // sem pessoas.view — RLS já libera a leitura de pessoas pra qualquer
  // autenticado da empresa (pessoas.view gate é só a exibição da seção
  // Pessoas em si, mais abaixo), então isso não vaza nenhum dado que a
  // policy já não deixasse ler.
  const precisaPessoas = canViewPessoas || canViewObras;
  const [{ data: pessoas }, { data: papeis }, { data: obras }, { data: itens }] = await Promise.all([
    precisaPessoas
      ? supabase.from("pessoas").select("*").order("nome")
      : Promise.resolve({ data: [] }),
    precisaPessoas
      ? supabase.from("pessoa_papeis").select("*")
      : Promise.resolve({ data: [] }),
    canViewObras ? supabase.from("obras").select("*").order("nome") : Promise.resolve({ data: [] }),
    canViewItens ? supabase.from("itens").select("*").order("codigo") : Promise.resolve({ data: [] }),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 2 — Cadastros</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Cadastros da empresa</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: pessoas (clientes e fornecedores são papéis da mesma pessoa),
          obras e itens (produtos e materiais são o mesmo cadastro, diferenciados por tipo).
        </p>

        {canViewPessoas && (
          <PessoasSection
            rows={pessoas ?? []}
            papeis={papeis ?? []}
            canManage={!!canManagePessoas}
          />
        )}
        {canViewObras && (
          <ObrasSection
            rows={obras ?? []}
            todasPessoas={pessoas ?? []}
            clienteIds={
              new Set(
                (papeis ?? [])
                  .filter((pp) => pp.papel === "CLIENTE" && pp.ativo)
                  .map((pp) => pp.pessoa_id),
              )
            }
            canManage={!!canManageObras}
          />
        )}
        {canViewItens && <ItensSection rows={itens ?? []} canManage={!!canManageItens} />}
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
  width: "960px",
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
