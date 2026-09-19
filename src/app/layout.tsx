import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SaaS Vidraçaria",
  description: "Gestão de vidraçaria — comercial, produção, estoque, financeiro e mais.",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Mesma leitura que src/app/page.tsx já faz para a home — repetida aqui só
  // para alimentar o shell (empresa/usuário/notificações no topbar). RLS
  // continua sendo a única fronteira real; isto é leitura, não autorização.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, companies(name, cor_primaria)")
    .eq("id", user?.id ?? "")
    .single();

  const { data: notificacoes } = await supabase
    .from("notificacoes")
    .select("id, titulo, mensagem, prioridade")
    .eq("lida", false)
    .order("created_at", { ascending: false })
    .limit(5);

  // @ts-expect-error -- relação aninhada tipada como array pelo supabase-js
  const companyName: string | undefined = profile?.companies?.name;
  // @ts-expect-error -- relação aninhada tipada como array pelo supabase-js
  const corPrimariaRaw: string | null | undefined = profile?.companies?.cor_primaria;
  const corPrimaria = corPrimariaRaw && HEX_COLOR.test(corPrimariaRaw) ? corPrimariaRaw : null;

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={corPrimaria ? ({ "--color-primary": corPrimaria } as CSSProperties) : undefined}
    >
      <body className="h-full">
        <AppShell
          displayName={profile?.display_name ?? "usuário"}
          companyName={companyName ?? null}
          notificacoes={notificacoes ?? []}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
