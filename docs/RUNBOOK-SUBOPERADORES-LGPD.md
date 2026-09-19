# Runbook — Relação de Suboperadores (LGPD, ADR-010 §10)

Este documento **não é um ADR** — é a relação viva de suboperadores exigida
pela ADR-010 §10 ("deverá existir relação mantida e atualizada desses
suboperadores, disponível à controladora") e listada como pendência
bloqueante antes da produção com dados reais na ADR-010 §15. Fecha essa
pendência de conteúdo; a **publicação** formal (torná-la visível/anexável
ao contrato com a empresa-cliente) e a validação jurídica de cada item
continuam decisão do responsável do produto/jurídico, não deste documento.

## 1. Inventário de suboperadores

Levantado a partir do stack técnico realmente em uso (`package.json`,
`vercel.json`, variáveis de ambiente) em 19/09/2026 — não é uma lista
aspiracional, é o que o sistema de fato usa hoje.

| Suboperador | Função | Dado pessoal envolvido | Região confirmada | Observação |
|---|---|---|---|---|
| **Supabase** | Banco de dados (Postgres), autenticação (Auth/GoTrue), armazenamento de arquivos (Storage) | Todo dado pessoal do sistema: perfis, documentos anexados, credenciais de autenticação | **sa-east-1 (São Paulo, Brasil)** — confirmado no provisionamento do projeto (13/09/2026, ver ADR-010 §15) | Projeto atual é **Free**, provisório — não é o ambiente de produção definitivo (ADR-010 §15) |
| **Vercel** | Hospedagem da aplicação (Next.js: páginas, Server Actions, API routes, cron jobs) | Todo dado pessoal em trânsito durante o processamento de cada requisição (a aplicação não persiste nada fora do Supabase, mas processa em memória) | ⚠️ **Não confirmada** — `vercel.json` não fixa `regions`; sem essa configuração, a Vercel escolhe a região de execução por padrão, que pode não ser Brasil | **Pendência**: definir e fixar `regions` (ex.: `gru1`, São Paulo) antes de produção com dado real, ou registrar exceção formal com validação jurídica (ADR-010 §9) |
| **Resend** | Envio de e-mail (alerta de segurança interno e, a partir do ADR-007, notificação crítica de negócio) | Nome/e-mail do destinatário; conteúdo da notificação pode referenciar dado operacional (ex.: número de pedido, descrição de pendência) | ⚠️ **Não confirmada** — nenhuma configuração de região de processamento foi feita; empresa sediada nos EUA | **Pendência**: verificar política de residência de dados do Resend e se atende ADR-010 §9, ou tratar como transferência internacional formalmente registrada |

## 2. Suboperadores previstos, ainda não integrados

Citados no ADR-010 §10 como parte do desenho, mas sem nenhuma integração
no código até 19/09/2026 — não entram no inventário acima porque ainda
não tratam dado real:

- **Push** — nenhuma infraestrutura de push (VAPID/subscription) existe;
  ADR-007 trata push como canal complementar, não implementado neste
  recorte.
- **Gateway de pagamento** — não implementado; ADR-006 (Modelo Comercial)
  prevê isso para fase futura.

## 3. Quando revisar esta lista

- Sempre que uma nova dependência de infraestrutura ou serviço externo for
  adicionada ao projeto (novo provedor de e-mail, push, pagamento, log
  externo, APM).
- Antes de qualquer decisão de produção real (mesmo gatilho da revisão de
  permissões, RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §1).
- Quando um suboperador já listado mudar de subprocessadores próprios
  (ex.: Supabase ou Vercel trocando de provedor de infraestrutura de base)
  — normalmente comunicado pelo próprio fornecedor.

## 4. Pendências abertas (para o responsável do produto/jurídico)

1. Fixar região de execução da Vercel em `gru1` (ou equivalente
   brasileiro) — mudança de configuração, sem impacto funcional esperado.
2. Confirmar política de residência de dados do Resend; se não houver
   opção de região brasileira, registrar a exceção formalmente com
   validação jurídica (ADR-010 §9) em vez de manter a transferência
   internacional implícita por omissão.
3. Publicar esta relação de forma acessível à empresa-cliente (ADR-010
   §10 — "disponível à controladora"), possivelmente como anexo do
   contrato de tratamento de dados (ADR-010 §12, TÓPICO 18 quando esse
   módulo existir).
