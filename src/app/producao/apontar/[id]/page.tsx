import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import OperacaoApontamento, { type OperacaoApontamentoData } from "./OperacaoApontamento";

// Melhorias 17/10/2026, item 10 — tela do operador, aberta pelo QR da
// etiqueta da OP (EtiquetaOP). Pensada pro celular: uma coluna, botões
// grandes. O QR é só atalho de navegação (quem abre precisa estar logado);
// toda regra de verdade (permissão, sequência, bloqueio da OP) vive nas
// funções iniciar_operacao_lote()/apontar_producao() no banco.
export default async function ApontarOpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "producao", p_action: "view" });
  if (!canView) {
    return (
      <main className="p-4">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Produção desta empresa." />
      </main>
    );
  }
  const { data: canManage } = await supabase.rpc("has_permission", { p_resource: "producao", p_action: "manage" });

  const { data: op } = await supabase
    .from("ordens_producao")
    .select("id, numero, status, situacao, quantidade_planejada, quantidade_produzida, pedido_item_id")
    .eq("id", id)
    .maybeSingle();
  if (!op) notFound();

  const [{ data: lotes }, { data: operacoes }, { data: pedidoItem }] = await Promise.all([
    supabase.from("op_lotes").select("id, numero").eq("ordem_producao_id", id).order("numero"),
    supabase
      .from("op_lote_operacoes")
      .select("id, op_lote_id, sequencia, descricao, status, quantidade_planejada, quantidade_produzida, iniciada_em, concluida_em, iniciada_por")
      .eq("ordem_producao_id", id)
      .order("sequencia"),
    supabase.from("pedido_itens").select("item_id").eq("id", op.pedido_item_id).maybeSingle(),
  ]);
  const { data: item } = pedidoItem
    ? await supabase.from("itens").select("codigo, descricao").eq("id", pedidoItem.item_id).maybeSingle()
    : { data: null };

  const iniciadores = [...new Set((operacoes ?? []).map((o) => o.iniciada_por).filter((v): v is string => !!v))];
  const { data: perfis } = iniciadores.length
    ? await supabase.from("profiles").select("id, display_name").in("id", iniciadores)
    : { data: [] as { id: string; display_name: string }[] };
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p.display_name]));
  const numeroLote = new Map((lotes ?? []).map((l) => [l.id, l.numero]));

  const dados: OperacaoApontamentoData[] = (operacoes ?? [])
    .map((o) => ({
      id: o.id,
      lote: numeroLote.get(o.op_lote_id) ?? 1,
      sequencia: o.sequencia,
      descricao: o.descricao,
      status: o.status as OperacaoApontamentoData["status"],
      planejada: Number(o.quantidade_planejada),
      produzida: Number(o.quantidade_produzida),
      iniciadaEm: o.iniciada_em,
      concluidaEm: o.concluida_em,
      iniciadaPor: o.iniciada_por ? (nomePorId.get(o.iniciada_por) ?? null) : null,
    }))
    .sort((a, b) => a.lote - b.lote || a.sequencia - b.sequencia);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header>
        <p className="text-xs text-text-muted">Apontamento de produção</p>
        <h1 className="text-lg font-semibold text-text">OP {op.numero}</h1>
        {item && (
          <p className="text-sm text-text-muted">
            {item.codigo} — {item.descricao}
          </p>
        )}
        <p className="text-xs text-text-muted">
          Produzido {Number(op.quantidade_produzida)} de {Number(op.quantidade_planejada)}
        </p>
      </header>

      {op.status !== "planejada" && op.status !== "em_producao" && (
        <p className="rounded-md border border-border bg-surface p-3 text-sm text-text">
          Esta OP está {op.status === "concluida" ? "concluída" : "cancelada"} — não aceita novos apontamentos.
        </p>
      )}
      {op.situacao === "bloqueada" && (
        <p className="rounded-md border border-danger/40 bg-surface p-3 text-sm text-danger">
          Esta OP está bloqueada. Procure o PCP antes de iniciar ou apontar.
        </p>
      )}

      {dados.length === 0 && <p className="text-sm text-text-muted">Esta OP ainda não tem operações liberadas.</p>}
      {dados.map((o) => (
        <OperacaoApontamento key={o.id} operacao={o} canManage={!!canManage && (op.status === "planejada" || op.status === "em_producao")} />
      ))}
    </main>
  );
}
