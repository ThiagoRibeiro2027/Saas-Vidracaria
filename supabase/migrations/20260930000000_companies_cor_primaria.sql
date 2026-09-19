-- Cor de marca por empresa (tenant). Puramente visual/exibição — não é
-- regra de negócio nem afeta RLS/permissão, por isso não precisa de ADR
-- próprio: cada empresa tem uma cor predominante diferente (vem da própria
-- logo), então a cor primária usada no shell/dashboard passa a ser um dado
-- por empresa em vez de fixa no código. Nullable e sem default: quem não
-- tiver `cor_primaria` definida continua com o verde padrão aplicado no
-- token do design system (fallback no app, não aqui no banco).
alter table public.companies
  add column cor_primaria text
    check (cor_primaria ~ '^#[0-9a-fA-F]{6}$');

comment on column public.companies.cor_primaria is
  'Cor de marca da empresa (hex #rrggbb), usada como cor primária do shell/dashboard. NULL = usa o verde padrão do design system.';

-- Seed: JrBox é azul, não o verde padrão do restante do sistema.
update public.companies
  set cor_primaria = '#2563eb'
  where slug = 'jrbox';
