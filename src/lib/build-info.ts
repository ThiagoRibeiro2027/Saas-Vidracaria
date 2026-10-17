import "server-only";
import { execSync } from "node:child_process";

// Selo de ambiente na barra lateral (desenho aprovado 17/10/2026): mostra o
// commit atual e, quando o app está rodando contra o Supabase local
// (homologação, não o banco real), a palavra "Homologação" ao lado — pra
// nunca confundir qual ambiente está na tela. Calculado uma vez só, no
// carregamento do módulo (processo do servidor fica de pé entre requests),
// não a cada request.

function commitCurto(): string | null {
  // Na Vercel, essa env var já vem preenchida automaticamente a cada deploy
  // — não depende do diretório .git estar presente no bundle publicado.
  const doAmbiente = process.env.VERCEL_GIT_COMMIT_SHA;
  if (doAmbiente) return doAmbiente.slice(0, 7);

  // Dev local / homologação: lê direto do git do checkout.
  try {
    return execSync("git rev-parse --short HEAD", { cwd: process.cwd() })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function ehHomologacao(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.includes("127.0.0.1") || url.includes("localhost");
}

const commit = commitCurto();
const homologacao = ehHomologacao();

export function obterInfoBuild() {
  return { commit, homologacao };
}
