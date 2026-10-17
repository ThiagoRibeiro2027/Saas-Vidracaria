This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Ambientes

- **Main (produção real)** — `.env.local`, aponta pro Supabase remoto (o banco de verdade, com os dados da empresa). `npm run dev` usa esse ambiente, porta 3000.
- **Homologação (Supabase local/Docker)** — `.env.homologacao`, aponta pro Supabase rodando local via Docker (`supabase start`). `npm run dev:homologacao` usa esse ambiente, porta 3001. Nunca tem dado real — só o que os scripts de seed/teste criarem ali.

Scripts de teste (`scripts/test-*.mjs`) e `npm test` só rodam contra o banco local — há uma trava (`scripts/lib/somente-local.mjs`) que recusa rodar contra o banco remoto, por causa de um incidente anterior em que isso poluiu o banco de produção com empresas/usuários de teste.

Fluxo recomendado pra mudança de banco (migration nova): escrever a migration → `supabase db reset --local` (aplica tudo do zero local) → rodar os testes relevantes → só então `npx supabase db push` pro banco remoto (main).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Para rodar contra o ambiente de homologação (Supabase local) em vez do banco real:

```bash
supabase start          # uma vez, sobe o Supabase local via Docker
npm run dev:homologacao # abre em http://localhost:3001
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
