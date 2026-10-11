# Runbook — Recuperação de Acesso por Perda de Dispositivo MFA

Este documento **não é um ADR** — é a documentação operacional exigida pelo
Prompt Mestre de Segurança (item 27: MFA obrigatório para SUPER_ADMIN e
ADMIN) e pelo item 37 (procedimentos de recuperação de desastres, que
inclui explicitamente "conta comprometida" — perda do segundo fator é a
mesma categoria de risco, do lado do titular legítimo em vez de um
atacante). Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026):
o enroll/verify de MFA (`src/app/mfa/`) está implementado e funcionando,
mas não existe nenhum procedimento — documentado ou em código — para o
caso em que o dispositivo (celular com o app autenticador) é perdido,
trocado ou tem o app desinstalado. Sem este runbook, um ADMIN ou
SUPER_ADMIN que perde o dispositivo fica permanentemente bloqueado do
próprio sistema.

## 1. Quando se aplica

A pessoa está travada na tela `/mfa/verify` (AAL1, não consegue gerar
código válido) porque:

- perdeu, trocou ou teve furtado o celular com o app autenticador;
- desinstalou o app autenticador sem remover o fator antes;
- o app corrompeu o segredo TOTP (raro, mas acontece).

**Não se aplica** a esquecimento de senha — isso é `resetarSenhaAction`
(`src/app/usuarios/actions.ts`), fluxo já existente e documentado, e não
exige re-enrollment de MFA quando o dispositivo continua acessível.

## 2. Quem pode executar

Mesma lógica de alçada do item 33 do Prompt Mestre (acesso de suporte):
quem resolve é sempre um nível acima de quem está travado, nunca a
própria pessoa (ela não tem como se autenticar em AAL2 justamente por
isso) e nunca um nível igual ou abaixo.

| Quem está travado | Quem executa a recuperação |
|---|---|
| Usuário comum (COMERCIAL/PRODUCAO/etc., sem MFA obrigatório — item 27 trata como opcional, mas pode ter ativado por conta própria) | ADMIN da própria empresa |
| ADMIN de uma empresa cliente | SUPER_ADMIN (plataforma), via canal de suporte formal |
| SUPER_ADMIN (plataforma) | Outro SUPER_ADMIN com acesso de infraestrutura — ver seção 6 |

## 3. Verificação de identidade — obrigatória antes de qualquer reset

Remover o fator MFA de alguém reabre a porta de entrada da conta —
**verificar a identidade de quem pede é o passo mais importante deste
runbook**, não um formalismo. Nunca executar a seção 4 sem isso.

1. O pedido chega por um canal que não seja o próprio sistema (a pessoa
   está travada fora dele) — e-mail já conhecido, telefone, ou outro canal
   combinado previamente com a empresa-cliente.
2. Confirmar identidade por algo que só a pessoa legítima saberia/teria —
   nunca só "disse que é fulano". Na ausência de um processo formal de
   verificação de identidade documentado (pendência — ver seção 7), usar
   no mínimo: confirmação pelo e-mail/telefone de contato já cadastrado
   **e** confirmação verbal por quem já tem relação direta com a pessoa na
   empresa (outro ADMIN, ou — para ADMIN travado — alguém da JR Box que o
   SUPER_ADMIN já conhece do onboarding).
3. Registrar o pedido (quem pediu, por qual canal, quando, quem
   verificou) **antes** de agir — mesmo que informalmente, até existir um
   sistema de tickets formal (fora do escopo deste SaaS).

## 4. Procedimento técnico

Executado por quem tem acesso de Admin API (hoje, só via script
autorizado com `SUPABASE_SERVICE_ROLE_KEY` — não existe botão de UI para
isto, de propósito: é uma operação rara e sensível o suficiente para não
merecer um atalho de um clique ainda).

```js
// set -a; source .env.local; set +a; node -e "..."  (ou script dedicado)
import { createClient } from "@supabase/supabase-js";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const userId = "<id do profile travado>";

// 1. Lista os fatores do usuário para confirmar qual remover.
const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
console.log(factors);

// 2. Remove o fator TOTP verificado. Isto já revoga toda sessão ativa do
//    usuário como efeito colateral documentado da própria API — não
//    precisa de um supabase.auth.admin.signOut() separado.
await admin.auth.admin.mfa.deleteFactor({ id: "<factor id>", userId });
```

Depois de remover o fator:

1. **Forçar troca de senha** — `marcar_troca_senha_obrigatoria(p_profile_id)`
   (mesma RPC usada por `resetarSenhaAction`) ou, se houver qualquer
   suspeita de que o dispositivo perdido foi comprometido (furto, não só
   perda), também resetar a senha via
   `admin.auth.admin.updateUserById(userId, { password: novaSenhaTemporaria })`.
2. **Registrar o incidente em auditoria** — não existe hoje uma ação
   `log_activity` dedicada para isto; usar
   `log_client_event`/`log_activity` com `action='auth.mfa_recovery_performed'`,
   `entity_type='profile'`, `entity_id=userId`, e `description` com o
   motivo e quem executou (capturado automaticamente via `auth.uid()`
   quando a chamada é feita pela sessão autenticada de quem executa, não
   pela service role).
3. **Avisar a pessoa** pelo mesmo canal usado na verificação de
   identidade (seção 3) — nunca pelo sistema, que ela ainda não consegue
   acessar até fazer login de novo e re-enrollar o MFA em `/mfa/enroll`.

## 5. Depois da recuperação

A pessoa faz login normal (senha temporária, se foi resetada, força
`must_change_password`), é redirecionada para `/mfa/enroll` (mesmo fluxo
de primeiro cadastro de MFA, já existente) e cadastra um novo dispositivo.
Nenhum estado residual do fator antigo permanece — `deleteFactor` já
removeu por completo.

## 6. Caso especial — SUPER_ADMIN perde o dispositivo

Não existe hoje um segundo SUPER_ADMIN garantido nem um procedimento de
"break glass" (acesso de emergência via credencial fora de banda,
cofre de secrets, etc.) documentado para este cenário. **Pendência real**:
antes de operar com mais de um SUPER_ADMIN pessoa física, decidir e
documentar aqui o mecanismo de recuperação mútua (ex.: um segundo
SUPER_ADMIN sempre provisionado como contingência, ou acesso de
emergência via painel do Supabase com MFA próprio da conta da
plataforma, fora deste sistema).

## 7. Pendências

- Processo formal de verificação de identidade (seção 3) ainda é
  ad-hoc — mesma lacuna, aliás, que afeta qualquer fluxo de suporte deste
  SaaS, não só este.
- Ação de auditoria dedicada (`auth.mfa_recovery_performed`) ainda não
  está cadastrada em nenhuma lista de eventos monitorados
  (`src/app/api/cron/security-alerts/route.ts`, `WATCHED_ACTIONS`) — vale
  avaliar se recuperação de MFA deveria gerar alerta automático ao
  SUPER_ADMIN, dado o risco de uso indevido deste procedimento.
- Caso do SUPER_ADMIN (seção 6) segue sem solução operacional definida.
