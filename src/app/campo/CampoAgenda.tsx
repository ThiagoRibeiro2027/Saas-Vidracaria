"use client";

import Link from "next/link";
import { useCampo } from "./CampoProvider";
import { STATUS_LABEL, type PacoteInstalacao } from "./types";

export default function CampoAgenda() {
  const { pacote, fila } = useCampo();
  const instalacoes = ((pacote?.data as PacoteInstalacao[] | undefined) ?? []).slice().sort((a, b) => a.data_agendada.localeCompare(b.data_agendada));

  return (
    <main style={{ padding: "16px", maxWidth: "640px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "18px", margin: "8px 0" }}>Minhas instalações</h1>
      {pacote === null && <p style={{ fontSize: "13px", color: "#6b7a75" }}>Carregando dados locais…</p>}
      {pacote !== null && instalacoes.length === 0 && (
        <p style={{ fontSize: "13px", color: "#6b7a75" }}>Nenhuma instalação agendada para as suas equipes.</p>
      )}
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
        {instalacoes.map((inst) => {
          const pendenciasFila = fila.filter((f) => f.instalacaoId === inst.id).length;
          return (
            <li key={inst.id}>
              <Link
                href={`/campo/${inst.id}`}
                style={{ display: "block", background: "#fff", borderRadius: "8px", padding: "12px 16px", textDecoration: "none", color: "#1a2e2a", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <strong>{inst.numero}</strong>
                  <span style={{ color: "#1f5d57" }}>{STATUS_LABEL[inst.status]}</span>
                </div>
                <div style={{ fontSize: "12px", color: "#3e4d49", marginTop: "4px" }}>
                  {inst.obra?.nome ?? "Obra não definida"} — {inst.pessoa.nome}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7a75", marginTop: "2px" }}>
                  Agendada para {new Date(`${inst.data_agendada}T00:00:00`).toLocaleDateString("pt-BR")} · Pedido {inst.pedido.numero}
                </div>
                {pendenciasFila > 0 && (
                  <div style={{ fontSize: "12px", color: "#b7791f", marginTop: "4px" }}>{pendenciasFila} ação(ões) local(is) aguardando envio</div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
