import { createClient } from "@/lib/supabase/server";
import FilaProducaoSection, { type FilaProducaoRow } from "./FilaProducaoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// Fila de Produção — Fase B do plano de 23/09/2026 (fila por pedido de
// cliente, peças fabricadas reutilizáveis e necessidades automáticas de
// suprimentos). Tela nova e separada de /producao (que já tem 9 seções),
// só leitura sobre listar_fila_producao() — nenhuma tabela/coluna/permissão
// nova, reaproveita producao.view já seedada.
//
// 2026-10-04: migrado do sistema de estilo legado (pageStyle/cardStyle
// inline + imports de configuracoes/styles) para os componentes padrão
// (ui/*) e tela larga, mesmo tratamento já aplicado nos outros módulos.
// Continua sem paginação server-side de propósito: é uma única chamada a
// listar_fila_producao() sem filtro real no servidor — os filtros
// (cliente/obra/status) são todos aplicados no cliente sobre o array já
// carregado, então paginar no servidor exigiria reescrever esse filtro
// pra querystring, desproporcional ao pedido. O que virou "sob demanda"
// foi só a exibição: cada pedido agora expande ao clicar, em vez da
// tabela de OPs ficar sempre aberta.
export default async function FilaProducaoPage() {
  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", {
    p_resource: "producao",
    p_action: "view",
  });

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar a produção desta empresa." />
      </div>
    );
  }

  const { data: fila } = await supabase.rpc("listar_fila_producao", {
    p_pessoa_id: null,
    p_obra_id: null,
    p_status_op: null,
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">PRODUÇÃO — FILA POR PEDIDO</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Fila de Produção</h1>
      <p className="mt-1 text-sm text-text">
        Painel de leitura agregando ordens de produção de todos os pedidos, agrupadas por
        cliente/obra/pedido — pensado pro chão de fábrica ver de uma vez só o que está em fila,
        sem abrir cada pedido individualmente. Gestão de OP/lote/roteiro continua em Produção.
      </p>

      <div className="mt-6">
        <FilaProducaoSection linhas={(fila as FilaProducaoRow[]) ?? []} />
      </div>
    </div>
  );
}
