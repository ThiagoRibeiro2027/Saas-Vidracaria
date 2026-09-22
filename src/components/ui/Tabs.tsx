import Link from "next/link";

export type TabItem = { slug: string; label: string };

// Guiado pela URL (?tab=slug), não por estado de clique — a aba fica
// linkável, sobrevive a um F5, e permite no futuro buscar do banco só os
// dados da aba ativa (relevante pra módulos com fetch pesado, ex. Produção).
// A primeira aba da lista é a rota "limpa" (sem query string).
export function Tabs({
  tabs,
  active,
  basePath,
}: {
  tabs: TabItem[];
  active: string;
  basePath: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.slug === active;
        const href = tab.slug === tabs[0]?.slug ? basePath : `${basePath}?tab=${tab.slug}`;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
