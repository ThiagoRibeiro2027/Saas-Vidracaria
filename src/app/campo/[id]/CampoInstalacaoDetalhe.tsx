"use client";

import { useState } from "react";
import Link from "next/link";
import { useCampo } from "../CampoProvider";
import { uploadEvidenciaAction } from "../actions";
import { CAUSAS_DANO, STATUS_LABEL, STATUS_TONE, type PacoteInstalacao } from "../types";
import { formatarData } from "@/lib/formato/data";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";

export default function CampoInstalacaoDetalhe({ instalacaoId }: { instalacaoId: string }) {
  const { pacote, fila, online, validade, canManage, canAceite, enfileirarAcao, retentar } = useCampo();
  const instalacoes = (pacote?.data as PacoteInstalacao[] | undefined) ?? [];
  const inst = instalacoes.find((i) => i.id === instalacaoId);
  const filaDaInstalacao = fila.filter((f) => f.instalacaoId === instalacaoId);
  const bloqueadoParaNovoRegistro = !online && validade.bloqueadoParaCriar;

  if (!pacote) return <main className="p-4">Carregando…</main>;
  if (!inst) {
    return (
      <main className="p-4">
        <p className="text-sm text-danger">
          Instalação não encontrada nos dados locais. Sincronize (se estiver online) ou volte à agenda.
        </p>
        <Link href="/campo" className="text-sm text-primary">← Agenda</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div>
        <Link href="/campo" className="text-xs text-primary">← Agenda</Link>
        <h1 className="my-1 text-lg font-semibold text-text">{inst.numero}</h1>
        <StatusPill tone={STATUS_TONE[inst.status]}>{STATUS_LABEL[inst.status]}</StatusPill>
        <p className="mt-1 text-xs text-text">
          {inst.obra?.nome ?? "Obra não definida"}
          {inst.obra?.logradouro ? ` — ${inst.obra.logradouro}, ${inst.obra.cidade ?? ""}/${inst.obra.uf ?? ""}` : ""}
        </p>
        <p className="text-xs text-text-muted">
          Cliente: {inst.pessoa.nome} · Pedido {inst.pedido.numero} · Agendada para{" "}
          {formatarData(inst.data_agendada)}
        </p>
        {inst.observacoes && <p className="text-xs text-text-muted">Obs.: {inst.observacoes}</p>}
      </div>

      {bloqueadoParaNovoRegistro && (
        <p className="rounded-md bg-danger/10 p-2 text-xs text-danger">
          Sem sincronizar há 3+ dias — novos registros offline estão bloqueados (ADR-005 §9). Conecte-se à internet.
        </p>
      )}

      {inst.status === "agendada" && canManage && (
        <AcaoSimples
          label="Iniciar execução"
          disabled={bloqueadoParaNovoRegistro}
          onClick={() => enfileirarAcao({ rpc: "iniciar_execucao_instalacao", params: { p_instalacao_id: inst.id }, label: "Iniciar execução", instalacaoId: inst.id })}
        />
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text">Itens</h2>
        <div className="flex flex-col gap-2">
          {inst.itens.map((item) => (
            <ItemCard key={item.id} item={item} instalacaoId={inst.id} podeExecutar={inst.status === "em_execucao" && canManage} bloqueado={bloqueadoParaNovoRegistro} canManage={canManage} />
          ))}
        </div>
      </section>

      {inst.status === "em_execucao" && canManage && (
        <AcaoSimples
          label="Concluir instalação"
          disabled={bloqueadoParaNovoRegistro}
          onClick={() => enfileirarAcao({ rpc: "concluir_instalacao", params: { p_instalacao_id: inst.id }, label: "Concluir instalação", instalacaoId: inst.id })}
        />
      )}

      {inst.status === "concluida" && canAceite && <AceiteForm instalacaoId={inst.id} bloqueado={bloqueadoParaNovoRegistro} />}

      <OcorrenciasSection instalacaoId={inst.id} ocorrencias={inst.ocorrencias} bloqueado={bloqueadoParaNovoRegistro} canManage={canManage} />

      {inst.danos.length > 0 && <DanosSection instalacaoId={inst.id} danos={inst.danos} itens={inst.itens} bloqueado={bloqueadoParaNovoRegistro} canManage={canManage} />}

      <EvidenciasSection instalacaoId={inst.id} online={online} />

      {filaDaInstalacao.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text">Ações locais</h2>
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {filaDaInstalacao.map((op) => (
              <li key={op.id} className={`rounded-md p-2 text-xs ${op.status === "erro" ? "bg-danger/10" : "bg-surface"}`}>
                <div className="text-text">{op.label}</div>
                <div className="text-text-muted">{op.status === "erro" ? `Erro: ${op.erro}` : "Aguardando envio"}</div>
                {op.status === "erro" && (
                  <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => retentar(op.id)}>
                    Tentar de novo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function AcaoSimples({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  // pending local: achado do code-review — um duplo toque (device lento/
  // offline, antes do primeiro clique re-renderizar o botão desabilitado)
  // gerava duas entradas na fila com client_operation_id diferentes; a
  // segunda sempre falhava no servidor com um "erro" confuso, mesmo a
  // ação já tendo sido aplicada pela primeira.
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="primary"
      disabled={disabled || pending}
      onClick={() => {
        setPending(true);
        onClick();
      }}
    >
      {label}
    </Button>
  );
}

function ItemCard({
  item,
  instalacaoId,
  podeExecutar,
  bloqueado,
  canManage,
}: {
  item: PacoteInstalacao["itens"][number];
  instalacaoId: string;
  podeExecutar: boolean;
  bloqueado: boolean;
  canManage: boolean;
}) {
  const { enfileirarAcao } = useCampo();
  const [quantidade, setQuantidade] = useState("");
  const [mostrarDano, setMostrarDano] = useState(false);

  return (
    <Card padding="sm" className="text-sm">
      <div className="flex justify-between">
        <strong>{item.item_codigo}</strong>
        <span>{item.quantidade_instalada}/{item.quantidade}</span>
      </div>
      <div className="text-xs text-text-muted">{item.item_descricao}</div>

      {podeExecutar && item.quantidade_pendente > 0 && (
        <div className="mt-2 flex gap-1.5">
          <Input
            type="number"
            min="0"
            step="0.001"
            max={item.quantidade_pendente}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder={`até ${item.quantidade_pendente}`}
            className="flex-1"
          />
          <Button
            type="button"
            variant="primary"
            disabled={bloqueado || !quantidade || Number(quantidade) <= 0}
            onClick={() => {
              enfileirarAcao({
                rpc: "registrar_execucao_item_instalacao",
                params: { p_instalacao_item_id: item.id, p_quantidade_instalada: Number(quantidade) },
                label: `Execução — ${item.item_codigo} (${quantidade})`,
                instalacaoId,
              });
              setQuantidade("");
            }}
          >
            Registrar
          </Button>
        </div>
      )}

      {canManage && (
        <button type="button" onClick={() => setMostrarDano((v) => !v)} className="mt-2 cursor-pointer border-none bg-transparent p-0 text-[11px] text-danger">
          {mostrarDano ? "Cancelar" : "Registrar dano/quebra"}
        </button>
      )}
      {canManage && mostrarDano && <DanoForm item={item} instalacaoId={instalacaoId} bloqueado={bloqueado} onDone={() => setMostrarDano(false)} />}
    </Card>
  );
}

function DanoForm({ item, instalacaoId, bloqueado, onDone }: { item: PacoteInstalacao["itens"][number]; instalacaoId: string; bloqueado: boolean; onDone: () => void }) {
  const { enfileirarAcao } = useCampo();
  const [quantidade, setQuantidade] = useState("");
  const [causa, setCausa] = useState<(typeof CAUSAS_DANO)[number]["value"]>("transporte");
  const [descricao, setDescricao] = useState("");

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md bg-danger/10 p-2">
      <Input type="number" min="0" step="0.001" placeholder="Quantidade danificada" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      <Select value={causa} onChange={(e) => setCausa(e.target.value as typeof causa)}>
        {CAUSAS_DANO.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </Select>
      <textarea
        placeholder="Descrição (opcional)"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      <Button
        type="button"
        variant="danger"
        className="w-fit"
        disabled={bloqueado || !quantidade || Number(quantidade) <= 0}
        onClick={() => {
          enfileirarAcao({
            rpc: "registrar_dano_instalacao",
            params: { p_instalacao_item_id: item.id, p_quantidade: Number(quantidade), p_causa: causa, p_descricao: descricao || null },
            label: `Dano — ${item.item_codigo} (${quantidade}, ${causa})`,
            instalacaoId,
          });
          onDone();
        }}
      >
        Registrar dano
      </Button>
    </div>
  );
}

function OcorrenciasSection({ instalacaoId, ocorrencias, bloqueado, canManage }: { instalacaoId: string; ocorrencias: PacoteInstalacao["ocorrencias"]; bloqueado: boolean; canManage: boolean }) {
  const { enfileirarAcao } = useCampo();
  const [descricao, setDescricao] = useState("");

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text">Ocorrências</h2>
      <div className="mb-2 flex flex-col gap-1.5">
        {ocorrencias.map((o) => (
          <Card key={o.id} padding="sm" className="text-xs">
            <div className="text-text">{o.descricao}</div>
            <div className="text-text-muted">{new Date(o.registrado_em).toLocaleString("pt-BR")}</div>
          </Card>
        ))}
      </div>
      {canManage && (
        <div className="flex gap-1.5">
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrever ocorrência"
            className="flex-1"
          />
          <Button
            type="button"
            variant="primary"
            disabled={bloqueado || !descricao.trim()}
            onClick={() => {
              enfileirarAcao({ rpc: "registrar_ocorrencia_instalacao", params: { p_instalacao_id: instalacaoId, p_descricao: descricao }, label: `Ocorrência — ${descricao.slice(0, 30)}`, instalacaoId });
              setDescricao("");
            }}
          >
            Registrar
          </Button>
        </div>
      )}
    </section>
  );
}

function DanosSection({
  instalacaoId,
  danos,
  itens,
  bloqueado,
  canManage,
}: {
  instalacaoId: string;
  danos: PacoteInstalacao["danos"];
  itens: PacoteInstalacao["itens"];
  bloqueado: boolean;
  canManage: boolean;
}) {
  const { enfileirarAcao } = useCampo();
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text">Danos registrados</h2>
      <div className="flex flex-col gap-1.5">
        {danos.map((d) => {
          const item = itens.find((i) => i.id === d.instalacao_item_id);
          return (
            <Card key={d.id} padding="sm" className="text-xs">
              <div className="text-text">{item?.item_codigo ?? "item"} — {d.quantidade} un. ({d.causa})</div>
              {d.descricao && <div className="text-text-muted">{d.descricao}</div>}
              {canManage && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-1"
                  disabled={bloqueado}
                  onClick={() => enfileirarAcao({ rpc: "solicitar_nova_fabricacao", params: { p_dano_id: d.id, p_motivo: null }, label: `Solicitar nova fabricação — ${item?.item_codigo ?? ""}`, instalacaoId })}
                >
                  Solicitar nova fabricação
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AceiteForm({ instalacaoId, bloqueado }: { instalacaoId: string; bloqueado: boolean }) {
  const { enfileirarAcao } = useCampo();
  const [nome, setNome] = useState("");

  return (
    <section className="rounded-lg bg-success/10 p-3">
      <h2 className="mb-2 text-sm font-semibold text-text">Aceite do cliente</h2>
      <div className="flex gap-1.5">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem aceitou" className="flex-1" />
        <Button
          type="button"
          variant="primary"
          disabled={bloqueado || !nome.trim()}
          onClick={() => {
            enfileirarAcao({ rpc: "registrar_aceite_instalacao", params: { p_instalacao_id: instalacaoId, p_nome_cliente: nome }, label: `Aceite — ${nome}`, instalacaoId });
            setNome("");
          }}
        >
          Registrar aceite
        </Button>
      </div>
    </section>
  );
}

function EvidenciasSection({ instalacaoId, online }: { instalacaoId: string; online: boolean }) {
  const [pending, setPending] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text">Evidências fotográficas</h2>
      {!online && (
        <p className="text-xs text-text-muted">
          Envio de fotos exige conexão neste recorte — a fila offline de evidências ainda não foi implementada.
        </p>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={!online || pending}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setPending(true);
          setMensagem(null);
          const formData = new FormData();
          formData.set("file", file);
          const result = await uploadEvidenciaAction(formData, instalacaoId);
          setMensagem(result.ok ? "Evidência enviada." : `Falha: ${result.error}`);
          setPending(false);
          e.target.value = "";
        }}
      />
      {mensagem && <p className={`text-xs ${mensagem.startsWith("Falha") ? "text-danger" : "text-primary"}`}>{mensagem}</p>}
    </section>
  );
}
