"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

// Busca de texto pra lista paginada no servidor: o termo vive na URL (`q`
// por padrão), com debounce de ~350ms pra não disparar uma busca a cada
// tecla. Preserva os demais parâmetros da URL e sempre volta pra página 1
// quando o termo muda (resultado novo, paginação antiga não faz sentido).
export function TableSearch({
  paramBusca = "q",
  paramPagina = "pagina",
  placeholder = "Buscar...",
}: {
  paramBusca?: string;
  paramPagina?: string;
  placeholder?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Estado inicial vem da URL; depois disso o campo só é mutado pela
  // digitação do próprio usuário (nunca sincronizado de volta via efeito —
  // o único jeito do parâmetro `q` mudar enquanto este componente segue
  // montado é através do debounce abaixo).
  const [valor, setValor] = useState(() => searchParams.get(paramBusca) ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function aplicar(termo: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (termo.trim()) p.set(paramBusca, termo.trim());
    else p.delete(paramBusca);
    p.delete(paramPagina);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function onChange(novoValor: string) {
    setValor(novoValor);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => aplicar(novoValor), 350);
  }

  return (
    <label className="flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-text-muted focus-within:ring-2 focus-within:ring-primary/30">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-40 bg-transparent text-text focus:outline-none"
      />
    </label>
  );
}
