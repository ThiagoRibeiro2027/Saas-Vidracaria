import { createClient } from "@/lib/supabase/server";

// TÓPICO 9 — romaneio de expedição como DOCUMENTO, não como tela.
//
// romaneio_expedicao() existia desde 20260915060000 e nunca teve quem a
// chamasse (achado da auditoria de 27/09/2026): a seção de Expedição
// monta a mesma listagem no cliente, a partir dos itens já carregados,
// mas não havia nada para entregar impresso ao motorista ou ao
// conferente — que é para o que serve um romaneio.
//
// É um route handler, não uma página, de propósito: route handler fica
// fora da árvore de layouts, então o documento sai sem sidebar, sem
// topbar e sem depender de CSS de impressão escondendo a aplicação. O
// HTML é autocontido — imprimir a tela viva é frágil (o que você vê não
// é o que sai no papel). A fonte dos dados é a função do banco, que já
// faz o gate de expedicao.view e o filtro por empresa; um erro dela vira
// 403 aqui, sem vazar detalhe interno.
function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numero(valor: unknown): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "—";
}

type LinhaRomaneio = {
  numero: string;
  status: string;
  pedido_numero: string;
  pessoa_nome: string;
  item_codigo: string;
  item_descricao: string;
  quantidade: number;
  quantidade_entregue: number;
  quantidade_pendente: number;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("romaneio_expedicao", { p_expedicao_id: id });
  if (error) {
    return new Response("Sem permissão para consultar este romaneio.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const linhas = (data ?? []) as LinhaRomaneio[];
  if (linhas.length === 0) {
    return new Response("Expedição não encontrada ou sem itens.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const cabecalho = linhas[0];
  const emitidoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const corpo = linhas
    .map(
      (l) => `<tr>
      <td class="mono">${escaparHtml(l.item_codigo)}</td>
      <td>${escaparHtml(l.item_descricao)}</td>
      <td class="num">${numero(l.quantidade)}</td>
      <td class="num">${numero(l.quantidade_entregue)}</td>
      <td class="num">${numero(l.quantidade_pendente)}</td>
    </tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Romaneio ${escaparHtml(cabecalho.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #555; font-size: 11px; margin: 0 0 14px; }
  .campos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; margin-bottom: 14px; }
  .campo b { display: inline-block; min-width: 80px; color: #555; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c8c8c8; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: ui-monospace, "Courier New", monospace; white-space: nowrap; }
  .assinaturas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 48px; }
  .assinatura { border-top: 1px solid #1a1a1a; padding-top: 4px; font-size: 11px; text-align: center; }
  .acoes { margin-bottom: 14px; }
  button { font: inherit; padding: 6px 12px; cursor: pointer; }
  @media print { .acoes { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="acoes"><button onclick="window.print()">Imprimir</button></div>

  <h1>Romaneio de expedição ${escaparHtml(cabecalho.numero)}</h1>
  <p class="sub">Emitido em ${escaparHtml(emitidoEm)}</p>

  <div class="campos">
    <div class="campo"><b>Pedido</b> ${escaparHtml(cabecalho.pedido_numero)}</div>
    <div class="campo"><b>Situação</b> ${escaparHtml(cabecalho.status)}</div>
    <div class="campo"><b>Cliente</b> ${escaparHtml(cabecalho.pessoa_nome)}</div>
    <div class="campo"><b>Itens</b> ${linhas.length}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Descrição</th>
        <th class="num">Qtd.</th>
        <th class="num">Entregue</th>
        <th class="num">Pendente</th>
      </tr>
    </thead>
    <tbody>
${corpo}
    </tbody>
  </table>

  <div class="assinaturas">
    <div class="assinatura">Conferente</div>
    <div class="assinatura">Recebedor — nome, documento e data</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Romaneio reflete o saldo do momento da emissão; cache tornaria
      // possível imprimir um documento já desatualizado.
      "cache-control": "no-store",
    },
  });
}
