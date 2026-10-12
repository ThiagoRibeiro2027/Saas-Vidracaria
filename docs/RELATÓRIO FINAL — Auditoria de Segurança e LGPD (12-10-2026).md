# Relatório final — Auditoria de Segurança e LGPD do TR Systems

**Data:** 12/10/2026 · **Escopo:** `auditoria-seguranca-tr-systems.md` · **Banco da nuvem:** `kisjfapdbyhgszvxyugc`
**Registro detalhado, achado a achado:** `docs/BACKLOG — Pendências Levantadas em Auditoria v1.0.md`, seção 5.

**Metodologia.** Os controles foram testados na camada de dados (Data API, RLS, funções `SECURITY DEFINER`, Storage) e não só pela aplicação. Cada correção foi provada em dois tempos: teste vermelho antes e verde depois, no banco local recriado por `supabase db reset`. A nuvem foi inspecionada só em leitura (`migration list`, `db query --linked`, `config diff`, `backups list`). Nenhum teste de comportamento foi rodado contra a nuvem, porque eles criam tenants e só rodam no banco local.

---

## 1. Resumo executivo

**Situação: auditoria encerrada com ressalvas conhecidas (12/10/2026).** Não há falha técnica de segurança aberta que tenha sido identificada e não corrigida. Restam duas pendências que dependem de contrato e de decisão jurídica, e o sistema só deve receber dados reais de cliente depois de resolvê-las ou de aceitá-las formalmente.

O que mudou nesta auditoria é substancial. As funções do banco estavam executáveis por usuário sem login (`anon`), e agora estão fechadas. Nove funções de escrita ignoravam a suspensão de empresa. Um usuário de um tenant conseguia gravar evento de auditoria em outro. O LGPD tinha duas lacunas reais: a anonimização deixava cópias do titular para trás e a trilha de auditoria imutável guardava nome e e-mail. O banco de produção estava cheio de contas de teste com senha fixa pública (achado 12), e a redefinição de senha da tela Usuários permitia trocar a senha de usuário de outra empresa (achado 13). Tudo isso foi corrigido, com teste automatizado e conferência na nuvem. A suíte completa passa (47/47 no estado anterior ao achado 12; a trava `somente-local` entrou depois e tem teste próprio).

**O que continua aberto, de propósito:**

| # | Pendência | Natureza | Situação |
|---|---|---|---|
| 1 | **Não existe backup automático da produção** (achado 10, P0 operacional) | Plano Supabase Pro, previsto na assinatura do contrato | **Risco aceito até o contrato.** Só existe o dump manual de 12/10/2026 |
| 2 | **Itens jurídicos da LGPD** (ADR-010 §15, validação do inventário, suboperadores) | Decisão humana | Aguardando informação do responsável |

**Ações operacionais, concluídas em 12/10/2026:** platform_admin criado com MFA verificado e e-mail pessoal separado do usuário de empresa; usuário `0001` da `jrbox` com senha redefinida e desativado; `CRON_SECRET` presente na Vercel (Production); teste manual no site publicado (login, upload, download, exclusão de arquivo, mensagem de senha fraca na tela de Usuários).

---|---|---|
| 1 | **Não existe backup da produção** (achado 10, P0 operacional). Nenhum backup gerenciado e nenhum dump da nuvem. | Plano pago ou ação manual |
| 2 | **Parte das correções está só no código, sem deploy:** headers de segurança (CSP, anti-clickjacking), correção do cron de storage e validação de senha forte. Em produção os headers continuam ausentes. | `git push` |
| 3 | **Itens jurídicos da LGPD em aberto** (ADR-010 §15, validação do inventário, suboperadores). | Decisão humana |

Com os itens 1 e 2 resolvidos e os itens jurídicos encaminhados, a recomendação passa a **sim, com as limitações da seção 4**.

---

## 2. Controles: antes, depois e evidência

Legenda de evidência: **V** = teste automatizado vermelho antes e verde depois. **R** = reconfirmado por teste que já existia, sem mudança de código. **E** = só inspeção ou leitura, sem teste que prove a correção.

### 2.1 Pendências conhecidas, reconfirmadas primeiro

| Controle | Antes | Depois | Evidência | Prio. |
|---|---|---|---|---|
| MFA de `platform_admin` imposto no banco | Imposto, com exceção em 3 funções de alçada | 3 funções passaram a exigir AAL2 (achado 1) | **V** `test-comercial` (88 passam, 3 falham com o comportamento antigo emulado; 91/91 com a correção), `test-compras` (293/2 e 295/0) e caso positivo AAL2 no comercial | P2 |
| Storage com RBAC (`files.read`/`files.upload`) | Já imposto | Sem mudança | **R** | P0 |
| Funções RPC com EXECUTE aberto | **325 de 387 executáveis por `anon`** | `anon` 0 de 388 (na nuvem); `authenticated` 353; `service_role` 388 | **V** `test-execute-grants-varredura` (12 falhas antes, verde depois) + conferência no catálogo da nuvem | P0 |
| `log_activity` forjável por usuário | Não era forjável (já fechada pela SEC-005) | Sem mudança | **R**. Minha suspeita inicial estava errada e foi retratada | P1 |
| `assert_company_not_suspended` uniforme | **9 funções de escrita sem a guarda** | Guarda nas 9; varredura deixa só 9 exceções justificadas | **V** `test-suspensao-varredura` + `test-governance` seção 3 | P1 |
| `next_document_number` exposto | Gate por permissão presente; `anon` aberto pelo default global | `anon` fechado pelo achado 4 | **V** indireto, pela varredura de grants | P1 |
| RBAC cross-tenant de papel | Já recusado | Sem mudança | **R** (SEC-009) | P0 |
| Rate limiting e signup público | Não conferido | Signup **fechado** na nuvem; limites de Auth no padrão | **E** `config diff`. Não testável localmente | P1 |
| Quota de storage | Já aplicada | Sem mudança | **R** (SEC-012) | P1 |

### 2.2 Achados novos

| ID | Achado | Antes | Depois | Evidência | Prio. | Nuvem |
|---|---|---|---|---|---|---|
| 1 | Alçada dispensada por `is_platform_admin()` sem checar AAL | Defesa em profundidade ausente, sem exploração conhecida | `is_platform_admin_mfa_verified()` | **V** parcial (ver 2.1) | P2 | Aplicado |
| 2 | Sem CSP, `X-Frame-Options` nem `nosniff` (clickjacking) | Nenhum header | CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS | **V** `test-security-headers`: 45 falhas antes, 53/53 no `next dev` e 54/54 no build de produção (`HEADERS_MODE=prod`, sem `unsafe-eval`). No Chrome, o build de produção hidrata sob a CSP sem erro | P1 | **Não implantado** |
| 3 | 9 funções sem guarda de suspensão | Empresa suspensa conseguia escrever | Guarda em todas | **V** | P1 | Aplicado |
| 4 | EXECUTE aberto a `PUBLIC`/`anon` | `anon` chamava `log_system_event` com empresa alheia | `anon` 0 | **V** | **P0** | Aplicado |
| 5 | `log_system_event` confiava em `p_company_id` do cliente | Usuário gravava evento em outro tenant | Valida a empresa do chamador | **V** `test-governance` seção 6 | P1 | Aplicado |
| 6 | Cron `storage-reconciliation` purgava sem rastro | `200 ok`, objeto apagado, zero linha de auditoria | Função `sistema_registrar_evento_plataforma` + rota checa o retorno | **V** `test-cron-storage-reconciliation` (14/14). Caminho de falha coberto (500 + `system_event`): 18/18 | P1 | Migration aplicada; **rota sem deploy** |
| 7 | Política de senha divergente (6 na nuvem; 10, 8 e 8 no app) | Três mínimos; nuvem em 6 | Mínimo único de 10 no app e na nuvem; app valida maiúscula, minúscula, número e símbolo | **V** `test-password-policy`. Composição validada como função pura; telas não testadas no navegador | P1 | `config diff` sem divergência; **código sem deploy** |
| 8 | `anonimizar_pessoa` só limpava `pessoas` | Ficavam nome e endereço da obra, e-mail da proposta, banco e PIX do fornecedor | Limpa as cópias, preservando o que tem guarda legal | **V** `test-lgpd-pessoa` seção 4 | P1 | Aplicado |
| 9 | Nome, e-mail e ficha na trilha de auditoria imutável | Dado pessoal gravado em `description` e `metadata` | Logs novos sem dado pessoal (12 funções) | **V** `test-lgpd-pessoa` seção 5. `registrar_aceite_instalacao`: asserção escrita em `test-instalacao`, ainda sem execução limpa | P1 | Aplicado |
| 10 | **Sem backup da produção** | `pitr_enabled: false`, nenhum backup | **Sem mudança** | **E** `backups list` | **P0** | **Aberto** |
| 11 | Headers de segurança não estão em produção | Só HSTS e `X-Powered-By` na resposta | **Sem mudança** até o deploy | **E** `curl -I` | P1 | **Aberto** |
| 12 | **Contas e dados de teste no banco de produção**: 248 empresas, 382 usuários e 11 `platform_admins` com senha fixa pública | Credenciais conhecidas e ativas na nuvem | Limpeza executada: 1 empresa (`jrbox`), 2 usuários, 0 platform_admins, 1 arquivo; trava `somente-local` impede teste contra a nuvem; regra no `CLAUDE.md` | **V** `test-somente-local` (7/7) + limpeza validada de ponta a ponta no local e conferida na nuvem | **P0** | Executado e conferido |
| 13 | **Redefinição de senha na tela Usuários trocava a senha de usuário de OUTRA empresa**: a Admin API agia antes de o banco validar a empresa | Um ADMIN de qualquer empresa, conhecendo o UUID do alvo, assumia a conta | O banco valida (permissão, suspensão, empresa) antes da Admin API; erros voltam como mensagem | **V** `test-usuarios-senha-ordem` (6 falhas antes, 8/8 depois) + ataque reproduzido e bloqueado no navegador, no banco local | **P0** | Corrigido e em produção (mensagem de senha fraca confirmada no site publicado) |

Também foi coberta a minimização de fotos: `test-imagem-exif` prova que a foto de obra perde EXIF e GPS no upload (**V**, com regressão simulada). Três testes que existiam e não rodavam (`test-lgpd-pessoa`, `test-export`, `test-limite-usuarios`) entraram na suíte.

---

## 3. O que depende de decisão humana ou de plano

**Ações imediatas, sem decisão jurídica:**
1. **Deploy (`git push`):** publica os headers (achado 11), a rota do cron (achado 6) e a validação de senha forte (achado 7). Depois: validar a CSP em `next build && next start` e no site real, com atenção a download por URL assinada e à sincronização do app de campo, e confirmar `CRON_SECRET` na Vercel.
2. **Backup da produção (achado 10):** Supabase Pro dá backup diário gerenciado (PITR é adicional). Sem upgrade, o mínimo é um `supabase db dump --linked` periódico, guardado de forma segura por conter dado pessoal. O ADR-010 §15 já registrava esse risco.

**Decisões do responsável de produto já tomadas nesta auditoria:** limpar cópias na anonimização preservando guarda legal; parar de gravar dado pessoal nos logs novos, sem limpeza do histórico.

**Decisões ainda abertas:**
- Os **3 itens jurídicos do ADR-010 §15**, a validação jurídica do inventário de dados pessoais (finalidade, base legal, prazo), a publicação da lista de suboperadores e a região do Resend.
- **Logs antigos** continuam com dado pessoal (decisão explícita de não limpar). Reavaliar se um titular pedir eliminação.
- **Texto livre** (`observacoes`, descrições) não é higienizado pela anonimização. É limitação técnica, a registrar no ADR-010.
- **Inventário de dados pessoais** (rascunho de 23/09) não cobre chave PIX, `propostas.destinatario`, `documentos_fiscais.dados` nem `integracao_operacoes.payload`.
- **Chamadas `rpc` com retorno descartado** (webhooks de saída, `log_platform_admin_access`, `log_client_event`): nenhuma falha foi reproduzida, mas uma falha não deixaria rastro. Decidir caso a caso se deve ser visível.

---

## 4. O que não foi testado

- **Produção.** Nenhum teste de comportamento rodou contra a nuvem. A inspeção foi somente leitura, e a conferência das funções foi feita lendo o corpo no catálogo. As 24 telas do menu foram abertas contra a nuvem depois do achado 4, sem as ações de escrita.
- **Suíte completa:** `npm test` com `db reset` em 12/10/2026, no estado final do código (commit `051a41a`): **47/47 scripts passaram**, inclusive `test-bancario` e `test-instalacao` com as asserções novas.
- **Achado 7:** a validação de senha foi vista no Chrome (formulário com mínimo 10 e dica), mas nenhum envio de senha fraca foi feito pela tela.
- **CSP em produção:** o deploy na Vercel entrou e o `curl -I` em `/login` mostra CSP, `x-frame-options: DENY` e `nosniff`, sem `x-powered-by`. Falta uma conferência manual no site publicado de login, download por URL assinada e sincronização do app de campo.
- **Teste de alçada que passava por motivo errado:** `test-comercial` movia o perfil de empresa com `UPDATE`, que o trigger `profiles_company_id_immutable` recusa em silêncio. Os "bloqueios" de alçada passavam por falta de permissão. Foi corrigido (usuário criado na empresa certa) e as asserções agora exigem a mensagem da alçada. Convém revisar outros testes que usem esse padrão.
- **Cobertura geral:** a auditoria cobriu os controles listados no prompt e os achados da varredura. Não houve revisão exaustiva de cada controle P1/P2 da matriz LGPD, nem teste de carga, pentest externo ou revisão de dependências.

---

## 5. Observação

Este relatório **não constitui certificação de segurança nem garantia de conformidade integral com a LGPD.** Ele registra o que foi examinado e testado em 12/10/2026, no estado do código e do banco naquela data. A conformidade com a LGPD depende também de decisões jurídicas e organizacionais (base legal, prazos de retenção, contratos com operadores, resposta a incidentes) que não são verificáveis por teste automatizado.
