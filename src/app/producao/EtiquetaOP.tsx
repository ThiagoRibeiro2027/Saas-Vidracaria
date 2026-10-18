"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/Button";

// TÓPICO 4 §18-19 (Prompt TÓPICO 4 — PCP e Produção), achado da auditoria
// de gaps ADR-001 a ADR-012 (11/10/2026): "estava aprovado, nunca foi
// feito". §18 define o fluxo "escanear → identificar → iniciar/apontar →
// informar resultado" — por isso o QR aponta pra URL da própria tela de
// Ordens de produção, com o parâmetro que a destaca (ver ProducaoSection),
// não um texto estático: o operador cai direto nos botões de apontamento
// já existentes, sempre com a situação/operação atual (dado vivo, não
// o que estava congelado no momento da impressão da etiqueta).
//
// §18 também deixa explícito que "o identificador interno único da OP
// deverá permanecer independente do código visual" — o QR nunca é tratado
// como chave primária, só como atalho de navegação para quem já está
// autenticado no sistema.
//
// Escopo: só QR Code, não código de barras 1D — §18 escreve "QR Code/
// código de barras" (uma opção, não as duas) e §19 lista os dois como o
// que a etiqueta "poderá conter", não como obrigação dupla. Gerar os dois
// formatos adicionaria uma biblioteca e complexidade sem pedido explícito
// de que ambos coexistam na mesma etiqueta.
export type EtiquetaOPData = {
  opNumero: string;
  quantidadePlanejada: number;
  pedidoNumero: string;
  clienteNome: string;
  obraNome: string | null;
  itemLabel: string;
  lotes: { numero: number; status: string }[];
  urlDestino: string;
};

export default function EtiquetaOP({ dados, onFechar }: { dados: EtiquetaOPData; onFechar: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(dados.urlDestino, { margin: 1, width: 200 }).then((url) => {
      if (!cancelado) setQrDataUrl(url);
    });
    return () => {
      cancelado = true;
    };
  }, [dados.urlDestino]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:static print:bg-transparent print:p-0"
      onClick={onFechar}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #etiqueta-op-imprimir, #etiqueta-op-imprimir * { visibility: visible; }
          #etiqueta-op-imprimir { position: fixed; inset: 0; margin: auto; }
        }
      `}</style>
      <div
        id="etiqueta-op-imprimir"
        className="w-80 rounded-md border border-border bg-page-bg p-4 text-xs text-text shadow-lg print:w-full print:max-w-sm print:border-black print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">OP {dados.opNumero}</p>
            <p className="text-text-muted">Pedido {dados.pedidoNumero}</p>
          </div>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data URI gerado no cliente, não é um asset do Next/Image
            <img src={qrDataUrl} alt={`QR Code da OP ${dados.opNumero}`} width={90} height={90} />
          )}
        </div>

        <dl className="mt-2 flex flex-col gap-0.5">
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Cliente</dt>
            <dd className="text-right">{dados.clienteNome}</dd>
          </div>
          {dados.obraNome && (
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Obra</dt>
              <dd className="text-right">{dados.obraNome}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Produto</dt>
            <dd className="text-right">{dados.itemLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Quantidade</dt>
            <dd className="text-right">{dados.quantidadePlanejada}</dd>
          </div>
          {dados.lotes.length > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Lote(s)</dt>
              <dd className="text-right">{dados.lotes.map((l) => `${l.numero} (${l.status})`).join(", ")}</dd>
            </div>
          )}
        </dl>

        <p className="mt-2 text-[10px] text-text-muted">Escaneie o código para ver a situação atual e apontar produção.</p>
        <p className="mt-1 break-all font-mono text-[9px] text-text-muted">{dados.urlDestino}</p>
        {/^https?:\/\/(localhost|127\.|\[::1\])/.test(dados.urlDestino) && (
          <p className="mt-1 text-[10px] text-danger print:hidden">
            Este QR aponta para este computador (localhost) e não abre em outro aparelho. Abra o sistema pelo
            endereço da rede (ex.: http://192.168.x.x:3001) e gere a etiqueta de lá.
          </p>
        )}

        <div className="mt-3 flex gap-2 print:hidden">
          <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
