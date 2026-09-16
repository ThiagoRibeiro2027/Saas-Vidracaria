"use client";

import { useState } from "react";
import Link from "next/link";
import { useCampo } from "../CampoProvider";
import { uploadEvidenciaAction } from "../actions";
import { CAUSAS_DANO, type PacoteInstalacao } from "../types";

const STATUS_LABEL: Record<PacoteInstalacao["status"], string> = {
  agendada: "Agendada",
  em_execucao: "Em execução",
  concluida: "Concluída — aguardando aceite",
};

export default function CampoInstalacaoDetalhe({ instalacaoId }: { instalacaoId: string }) {
  const { pacote, fila, online, validade, enfileirarAcao, retentar } = useCampo();
  const instalacoes = (pacote?.data as PacoteInstalacao[] | undefined) ?? [];
  const inst = instalacoes.find((i) => i.id === instalacaoId);
  const filaDaInstalacao = fila.filter((f) => f.instalacaoId === instalacaoId);
  const bloqueadoParaNovoRegistro = !online && validade.bloqueadoParaCriar;

  if (!pacote) return <main style={{ padding: "16px" }}>Carregando…</main>;
  if (!inst) {
    return (
      <main style={{ padding: "16px" }}>
        <p style={{ fontSize: "13px", color: "#9b2c2c" }}>
          Instalação não encontrada nos dados locais. Sincronize (se estiver online) ou volte à agenda.
        </p>
        <Link href="/campo" style={{ fontSize: "13px", color: "#1f5d57" }}>← Agenda</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: "16px", maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <Link href="/campo" style={{ fontSize: "12px", color: "#1f5d57" }}>← Agenda</Link>
        <h1 style={{ fontSize: "18px", margin: "4px 0" }}>{inst.numero}</h1>
        <p style={{ fontSize: "13px", color: "#1f5d57", margin: 0 }}>{STATUS_LABEL[inst.status]}</p>
        <p style={{ fontSize: "12px", color: "#3e4d49", marginTop: "4px" }}>
          {inst.obra?.nome ?? "Obra não definida"}
          {inst.obra?.logradouro ? ` — ${inst.obra.logradouro}, ${inst.obra.cidade ?? ""}/${inst.obra.uf ?? ""}` : ""}
        </p>
        <p style={{ fontSize: "12px", color: "#6b7a75" }}>
          Cliente: {inst.pessoa.nome} · Pedido {inst.pedido.numero} · Agendada para{" "}
          {new Date(`${inst.data_agendada}T00:00:00`).toLocaleDateString("pt-BR")}
        </p>
        {inst.observacoes && <p style={{ fontSize: "12px", color: "#6b7a75" }}>Obs.: {inst.observacoes}</p>}
      </div>

      {bloqueadoParaNovoRegistro && (
        <p style={{ fontSize: "12px", color: "#9b2c2c", background: "#fde8e8", padding: "8px", borderRadius: "6px" }}>
          Sem sincronizar há 3+ dias — novos registros offline estão bloqueados (ADR-005 §9). Conecte-se à internet.
        </p>
      )}

      {inst.status === "agendada" && (
        <AcaoSimples
          label="Iniciar execução"
          disabled={bloqueadoParaNovoRegistro}
          onClick={() => enfileirarAcao({ rpc: "iniciar_execucao_instalacao", params: { p_instalacao_id: inst.id }, label: "Iniciar execução", instalacaoId: inst.id })}
        />
      )}

      <section>
        <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Itens</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {inst.itens.map((item) => (
            <ItemCard key={item.id} item={item} instalacaoId={inst.id} podeExecutar={inst.status === "em_execucao"} bloqueado={bloqueadoParaNovoRegistro} />
          ))}
        </div>
      </section>

      {inst.status === "em_execucao" && (
        <AcaoSimples
          label="Concluir instalação"
          disabled={bloqueadoParaNovoRegistro}
          onClick={() => enfileirarAcao({ rpc: "concluir_instalacao", params: { p_instalacao_id: inst.id }, label: "Concluir instalação", instalacaoId: inst.id })}
        />
      )}

      {inst.status === "concluida" && <AceiteForm instalacaoId={inst.id} bloqueado={bloqueadoParaNovoRegistro} />}

      <OcorrenciasSection instalacaoId={inst.id} ocorrencias={inst.ocorrencias} bloqueado={bloqueadoParaNovoRegistro} />

      {inst.danos.length > 0 && <DanosSection instalacaoId={inst.id} danos={inst.danos} itens={inst.itens} bloqueado={bloqueadoParaNovoRegistro} />}

      <EvidenciasSection instalacaoId={inst.id} online={online} />

      {filaDaInstalacao.length > 0 && (
        <section>
          <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Ações locais</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {filaDaInstalacao.map((op) => (
              <li key={op.id} style={{ fontSize: "12px", background: op.status === "erro" ? "#fde8e8" : "#fff", padding: "8px", borderRadius: "6px" }}>
                <div>{op.label}</div>
                <div style={{ color: "#6b7a75" }}>{op.status === "erro" ? `Erro: ${op.erro}` : "Aguardando envio"}</div>
                {op.status === "erro" && (
                  <button onClick={() => retentar(op.id)} style={{ marginTop: "4px", fontSize: "11px", border: "1px solid #c7d3cd", borderRadius: "4px", background: "#fff", padding: "2px 8px", cursor: "pointer" }}>
                    Tentar de novo
                  </button>
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: "#1f5d57", color: "#fff", border: "none", borderRadius: "6px", padding: "10px", fontSize: "14px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}
    >
      {label}
    </button>
  );
}

function ItemCard({
  item,
  instalacaoId,
  podeExecutar,
  bloqueado,
}: {
  item: PacoteInstalacao["itens"][number];
  instalacaoId: string;
  podeExecutar: boolean;
  bloqueado: boolean;
}) {
  const { enfileirarAcao } = useCampo();
  const [quantidade, setQuantidade] = useState("");
  const [mostrarDano, setMostrarDano] = useState(false);

  return (
    <div style={{ background: "#fff", borderRadius: "8px", padding: "12px", fontSize: "13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{item.item_codigo}</strong>
        <span>{item.quantidade_instalada}/{item.quantidade}</span>
      </div>
      <div style={{ color: "#6b7a75", fontSize: "12px" }}>{item.item_descricao}</div>

      {podeExecutar && item.quantidade_pendente > 0 && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
          <input
            type="number"
            min="0"
            step="0.001"
            max={item.quantidade_pendente}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder={`até ${item.quantidade_pendente}`}
            style={{ flex: 1, border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }}
          />
          <button
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
            style={{ border: "none", borderRadius: "4px", background: "#1f5d57", color: "#fff", padding: "6px 12px", cursor: "pointer" }}
          >
            Registrar
          </button>
        </div>
      )}

      <button onClick={() => setMostrarDano((v) => !v)} style={{ marginTop: "8px", fontSize: "11px", background: "none", border: "none", color: "#9b2c2c", cursor: "pointer", padding: 0 }}>
        {mostrarDano ? "Cancelar" : "Registrar dano/quebra"}
      </button>
      {mostrarDano && <DanoForm item={item} instalacaoId={instalacaoId} bloqueado={bloqueado} onDone={() => setMostrarDano(false)} />}
    </div>
  );
}

function DanoForm({ item, instalacaoId, bloqueado, onDone }: { item: PacoteInstalacao["itens"][number]; instalacaoId: string; bloqueado: boolean; onDone: () => void }) {
  const { enfileirarAcao } = useCampo();
  const [quantidade, setQuantidade] = useState("");
  const [causa, setCausa] = useState<(typeof CAUSAS_DANO)[number]["value"]>("transporte");
  const [descricao, setDescricao] = useState("");

  return (
    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px", background: "#fde8e8", padding: "8px", borderRadius: "6px" }}>
      <input type="number" min="0" step="0.001" placeholder="Quantidade danificada" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} style={{ border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }} />
      <select value={causa} onChange={(e) => setCausa(e.target.value as typeof causa)} style={{ border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }}>
        {CAUSAS_DANO.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <textarea placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} style={{ border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }} />
      <button
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
        style={{ border: "none", borderRadius: "4px", background: "#9b2c2c", color: "#fff", padding: "6px 12px", cursor: "pointer", width: "fit-content" }}
      >
        Registrar dano
      </button>
    </div>
  );
}

function OcorrenciasSection({ instalacaoId, ocorrencias, bloqueado }: { instalacaoId: string; ocorrencias: PacoteInstalacao["ocorrencias"]; bloqueado: boolean }) {
  const { enfileirarAcao } = useCampo();
  const [descricao, setDescricao] = useState("");

  return (
    <section>
      <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Ocorrências</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
        {ocorrencias.map((o) => (
          <div key={o.id} style={{ fontSize: "12px", background: "#fff", padding: "8px", borderRadius: "6px" }}>
            <div>{o.descricao}</div>
            <div style={{ color: "#6b7a75" }}>{new Date(o.registrado_em).toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrever ocorrência"
          style={{ flex: 1, border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }}
        />
        <button
          disabled={bloqueado || !descricao.trim()}
          onClick={() => {
            enfileirarAcao({ rpc: "registrar_ocorrencia_instalacao", params: { p_instalacao_id: instalacaoId, p_descricao: descricao }, label: `Ocorrência — ${descricao.slice(0, 30)}`, instalacaoId });
            setDescricao("");
          }}
          style={{ border: "none", borderRadius: "4px", background: "#1f5d57", color: "#fff", padding: "6px 12px", cursor: "pointer" }}
        >
          Registrar
        </button>
      </div>
    </section>
  );
}

function DanosSection({
  instalacaoId,
  danos,
  itens,
  bloqueado,
}: {
  instalacaoId: string;
  danos: PacoteInstalacao["danos"];
  itens: PacoteInstalacao["itens"];
  bloqueado: boolean;
}) {
  const { enfileirarAcao } = useCampo();
  return (
    <section>
      <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Danos registrados</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {danos.map((d) => {
          const item = itens.find((i) => i.id === d.instalacao_item_id);
          return (
            <div key={d.id} style={{ fontSize: "12px", background: "#fff", padding: "8px", borderRadius: "6px" }}>
              <div>{item?.item_codigo ?? "item"} — {d.quantidade} un. ({d.causa})</div>
              {d.descricao && <div style={{ color: "#6b7a75" }}>{d.descricao}</div>}
              <button
                disabled={bloqueado}
                onClick={() => enfileirarAcao({ rpc: "solicitar_nova_fabricacao", params: { p_dano_id: d.id, p_motivo: null }, label: `Solicitar nova fabricação — ${item?.item_codigo ?? ""}`, instalacaoId })}
                style={{ marginTop: "4px", fontSize: "11px", border: "1px solid #c7d3cd", borderRadius: "4px", background: "#fff", padding: "2px 8px", cursor: "pointer" }}
              >
                Solicitar nova fabricação
              </button>
            </div>
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
    <section style={{ background: "#e6f4ea", padding: "12px", borderRadius: "8px" }}>
      <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Aceite do cliente</h2>
      <div style={{ display: "flex", gap: "6px" }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem aceitou" style={{ flex: 1, border: "1px solid #c7d3cd", borderRadius: "4px", padding: "6px" }} />
        <button
          disabled={bloqueado || !nome.trim()}
          onClick={() => {
            enfileirarAcao({ rpc: "registrar_aceite_instalacao", params: { p_instalacao_id: instalacaoId, p_nome_cliente: nome }, label: `Aceite — ${nome}`, instalacaoId });
            setNome("");
          }}
          style={{ border: "none", borderRadius: "4px", background: "#1f5d57", color: "#fff", padding: "6px 12px", cursor: "pointer" }}
        >
          Registrar aceite
        </button>
      </div>
    </section>
  );
}

function EvidenciasSection({ instalacaoId, online }: { instalacaoId: string; online: boolean }) {
  const [pending, setPending] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  return (
    <section>
      <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>Evidências fotográficas</h2>
      {!online && (
        <p style={{ fontSize: "12px", color: "#6b7a75" }}>
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
      {mensagem && <p style={{ fontSize: "12px", color: mensagem.startsWith("Falha") ? "#9b2c2c" : "#1f5d57" }}>{mensagem}</p>}
    </section>
  );
}
