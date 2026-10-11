"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

// ADR-008 §16 ("Experiência de instalação"): "o onboarding deverá
// orientar o usuário sobre: instalação; acesso; permissões necessárias;
// funcionamento offline; sincronização; importância de sincronizar antes
// de permanecer longos períodos sem utilizar o aplicativo" — achado da
// auditoria de gaps ADR-001 a ADR-012 (11/10/2026): a PWA em si (manifest,
// service worker) já existia, mas não havia NENHUMA orientação na tela —
// quem abria /campo no Safari do iPhone nunca era instruído a instalar na
// Tela de Início, especialmente relevante pro iOS (§16/§29: risco de
// despejo de dados do PWA não instalado).
//
// localStorage é conveniência por aparelho (lembrar que já dispensou),
// nunca o único lugar que decide se o aviso aparece — se o navegador já
// reporta display-mode:standalone (instalado de fato), o aviso nunca
// aparece, independente do que está salvo.
const CHAVE_DISPENSADO = "campo_onboarding_dispensado";

function detectarIOSNaoInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const ehIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !("MSStream" in window);
  const navigatorComStandalone = window.navigator as Navigator & { standalone?: boolean };
  const instalado = navigatorComStandalone.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ehIOS && !instalado;
}

export default function InstalacaoOnboarding() {
  const [elegivel, setElegivel] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    // Detecção só existe no navegador (userAgent/matchMedia/localStorage) —
    // calcular isso durante a renderização (inclusive um useState com
    // inicializador preguiçoso) divergiria entre o HTML do servidor (sem
    // "window") e a primeira renderização do cliente, quebrando a
    // hidratação. O efeito roda só depois de montado, sem esse risco; o
    // setState síncrono aqui é o padrão aceito pra detecção client-only
    // (react-hooks/set-state-in-effect, falso positivo neste caso).
    const ehCandidato = detectarIOSNaoInstalado();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElegivel(ehCandidato);
    if (!ehCandidato) return;
    let dispensado = false;
    try {
      dispensado = window.localStorage.getItem(CHAVE_DISPENSADO) === "1";
    } catch {
      // Navegação privada/storage bloqueado — segue mostrando, sem travar.
    }
    setAberto(!dispensado);
  }, []);

  function dispensar() {
    setAberto(false);
    try {
      window.localStorage.setItem(CHAVE_DISPENSADO, "1");
    } catch {
      // Sem storage disponível — só fecha nesta sessão, reaparece na próxima.
    }
  }

  if (!elegivel) return null;

  return (
    <>
      {!aberto && (
        <div className="flex justify-center bg-page-bg px-4 py-1">
          <button type="button" onClick={() => setAberto(true)} className="cursor-pointer text-xs text-primary underline">
            Como instalar este app no iPhone
          </button>
        </div>
      )}
      {aberto && (
        <div className="border-b border-border-subtle bg-primary/5 px-4 py-3 text-xs text-text">
          <p className="font-semibold">Instale este app na Tela de Início do iPhone</p>
          <p className="mt-1 text-text-muted">
            Sem instalar, o Safari pode apagar os dados salvos localmente (fotos, medidas e registros
            ainda não sincronizados) quando o app fica muito tempo sem ser aberto — instalar evita essa
            perda.
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-4">
            <li>
              Toque no ícone de compartilhar <span aria-hidden>⬆️</span> na barra do Safari.
            </li>
            <li>Escolha &quot;Adicionar à Tela de Início&quot;.</li>
            <li>Abra o app sempre pelo ícone criado na tela, não pelo Safari.</li>
          </ol>
          <p className="mt-2 font-semibold">Depois de instalar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-muted">
            <li>Acesso: entre com a mesma matrícula/senha de sempre — a instalação não muda o login.</li>
            <li>Permissões: aceite o acesso à câmera quando pedido, para anexar fotos da instalação.</li>
            <li>Funciona offline: o app guarda localmente o que você registra sem internet.</li>
            <li>
              Sincronize sempre que tiver sinal — registros offline ficam bloqueados depois de alguns dias
              sem sincronizar, e os dados mais antigos podem expirar (avisos aparecem aqui em cima a tempo
              de evitar isso).
            </li>
            <li>Antes de ficar muitos dias sem usar o app, abra-o com internet para sincronizar.</li>
          </ul>
          <div className="mt-2">
            <Button type="button" variant="secondary" size="sm" onClick={dispensar}>
              Entendi
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
