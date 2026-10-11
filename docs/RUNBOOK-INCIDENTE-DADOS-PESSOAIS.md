# Runbook — Incidente Envolvendo Dados Pessoais

Este documento **não é um ADR** — é o procedimento operacional que a
ADR-010 §11 exige que exista, mas só descreve como checklist de
requisitos ("deverá existir procedimento... contemplando..."), sem os
passos concretos. Achado da auditoria de gaps ADR-001 a ADR-012
(11/10/2026): o requisito estava escrito, o procedimento em si não.

**Papel do SaaS neste cenário (ADR-010 §2): somos operador, não
controlador**, para os dados operacionais de cada empresa-cliente
(clientes finais, funcionários, fornecedores). A empresa-cliente é quem
decide sobre comunicação ao titular e à ANPD — nosso papel é detectar,
conter e **comunicar rápido e claramente à empresa-cliente**, nunca
decidir por ela nem notificar o titular/ANPD em nome dela.

## 1. O que conta como incidente reportável aqui

Qualquer evento em que dado pessoal de um tenant (não a infraestrutura
genérica do SaaS) teve, ou pode razoavelmente ter tido, confidencialidade,
integridade ou disponibilidade comprometida sem autorização. Exemplos
concretos neste sistema:

- acesso cross-tenant indevido (falha de isolamento RLS, bug de
  autorização) — mesma categoria do que os testes de isolamento
  (`scripts/test-*-rls*.mjs`, item 6 do Prompt Mestre) existem para
  prevenir;
- vazamento de `SUPABASE_SERVICE_ROLE_KEY` ou de outro secret com
  alcance a dados de tenant (ver `RUNBOOK-ROTACAO-DE-SECRETS.md` para a
  rotação em si — este runbook cobre a resposta ao incidente de dados que
  a rotação sozinha não resolve: avaliar o que já pode ter sido acessado
  antes da rotação);
- acesso de `platform_admin` sem justificativa/fora do procedimento de
  suporte (item 33) a dados operacionais de tenant;
- exportação (`exportCompanyDataAction`) ou link assinado de arquivo
  obtido por quem não deveria ter acesso;
- perda/corrupção de dados pessoais sem backup restaurável (ver
  `RUNBOOK-BACKUP-E-RECUPERACAO.md` §7) — disponibilidade também é um
  dos três pilares, não só confidencialidade.

**Não é este runbook**: incidente de disponibilidade pura da aplicação
sem exposição de dado pessoal (ver `RUNBOOK-GOVERNANCA-DE-SEGURANCA.md`),
ou perda de MFA de um usuário (`RUNBOOK-RECUPERACAO-MFA.md`).

## 2. Quem está de prontidão

Não existe hoje uma escala de plantão formal (pendência — projeto ainda
no piloto, equipe pequena). Até isso existir: quem identificar um
incidente (de qualquer papel) aciona diretamente o SUPER_ADMIN/responsável
técnico do projeto — nunca assume que "alguém mais vai ver".

## 3. Procedimento

### 3.1 Detecção e registro

A capacidade de detecção depende da observabilidade já construída
(ADR-009): `activity_logs` (trilha de negócio, imutável), `system_events`
(eventos técnicos, só `platform_admin`), e os alertas automáticos do cron
`security-alerts` (`WATCHED_ACTIONS` em
`src/app/api/cron/security-alerts/route.ts`) — login bloqueado repetido,
transição de assinatura/status de empresa, anonimização de auditoria,
purga de retenção. Um incidente pode chegar por esse alerta, por relato
de um usuário, ou por achado manual (ex.: auditoria de código como a que
gerou este runbook).

No momento da detecção, registrar **imediatamente**, antes de investigar
a fundo: data/hora da detecção (não da ocorrência, que pode ser anterior
e desconhecida ainda), quem detectou, como, e a descrição inicial — mesmo
incompleta. Usar `system_events` (`logSystemEvent`, categoria mais
próxima disponível, ou uma nova se nenhuma servir) para que fique
consultável, e abrir um registro textual paralelo (fora do sistema, já
que o próprio sistema pode estar comprometido) com a linha do tempo do
incidente.

### 3.2 Avaliação de abrangência

Responder, nesta ordem, antes de qualquer comunicação:

1. **Quais empresas (tenants) foram afetadas?** Um incidente de
   isolamento cross-tenant pode afetar só o par de empresas envolvido no
   bug, ou todas — depende da causa raiz.
2. **Quais categorias de dado pessoal?** Usar o inventário já mantido em
   ADR-010 §3 (usuários do sistema, funcionários, clientes finais e
   contatos, fornecedores, registros de campo/fotos, `activity_logs`) para
   não esquecer uma categoria.
3. **Quantos registros/titulares, aproximadamente?** Mesmo uma estimativa
   grosseira já orienta a severidade.
4. **A exposição foi de leitura, escrita/alteração, ou exclusão?** Bugs
   de RLS mal escritos geralmente são leitura; falhas de autorização em
   função de escrita podem ser alteração — categorias diferentes de
   dano.

### 3.3 Contenção

Depende da causa, mas o padrão geral:

- **Bug de código (RLS, autorização)**: corrigir e aplicar a migration/
  deploy imediatamente — não esperar o ciclo normal de revisão quando o
  bug está ativo e explorável. Depois de corrigido, rodar a suíte de
  teste de isolamento relevante (`scripts/test-*-rls*.mjs`,
  `scripts/test-foundation-rls.mjs`) para confirmar o fechamento antes de
  considerar contido.
- **Secret vazado**: rotacionar imediatamente
  (`RUNBOOK-ROTACAO-DE-SECRETS.md`) — rotação é o próprio ato de
  contenção aqui, não um passo posterior.
- **Acesso indevido já ocorrido (não é mais um bug ativo)**: não há
  "conter" o acesso passado — o foco vira avaliação de abrangência
  (3.2) e comunicação (3.4). Revisar se a conta/credencial usada para o
  acesso continua ativa e, se sim, desativá-la (`profiles.active=false`,
  revogação de sessão — mesmo procedimento de "conta comprometida" do
  `RUNBOOK-BACKUP-E-RECUPERACAO.md` §7).

### 3.4 Comunicação à controladora (empresa-cliente)

**Este é o ponto onde o papel de operador (não controlador) do SaaS se
concretiza.** Comunicar à empresa-cliente afetada, por canal direto
(nunca só um aviso genérico no sistema, que ela pode nem estar acessando
no momento), contendo no mínimo:

- natureza do incidente e data/hora de detecção (e de ocorrência, se
  conhecida);
- categorias de dado e volume estimado afetados (resultado da seção 3.2);
- o que já foi feito para conter (3.3);
- que a decisão sobre comunicar ao titular e/ou à ANPD é da
  empresa-cliente, como controladora (ADR-010 §2) — o SaaS fornece os
  fatos para essa decisão, não a toma.

**Prazo**: a LGPD (art. 48) exige comunicação em prazo razoável à ANPD e
ao titular quando o incidente acarretar risco relevante — isso é
obrigação da controladora (a empresa-cliente), não deste runbook
diretamente, mas o SaaS como operador deve comunicar à controladora
**o quanto antes**, pois o relógio dela começa a contar a partir do que
ela sabe. Um prazo numérico específico de SLA interno (ex.: "em até X
horas") ainda não foi definido com apoio jurídico — pendência, mesmo
critério já usado para RPO/RTO em `RUNBOOK-BACKUP-E-RECUPERACAO.md` §8
("não prometer ao cliente valor que a prática ainda não suporta").

### 3.5 Registro das ações tomadas

Consolidar, no mesmo registro aberto em 3.1: linha do tempo completa
(detecção → avaliação → contenção → comunicação), decisões tomadas e por
quem, e o texto efetivamente enviado à empresa-cliente. Este registro é
em si um dado sensível (detalha uma falha de segurança) — tratar com o
mesmo cuidado de um secret: nunca num canal público, acesso restrito a
quem precisa.

### 3.6 Revisão posterior

Depois do incidente contido e comunicado: causa raiz documentada, teste
automatizado novo cobrindo o cenário quando aplicável (mesmo padrão já
usado nesta auditoria — cada correção de segurança veio com teste
negativo), e avaliação se o incidente revela um padrão (ex.: mesma classe
de bug já ocorreu antes) que justifique uma revisão mais ampla, não só o
ponto específico corrigido.

## 4. Pendências

- Escala de prontidão formal (seção 2) — hoje é "quem vir, aciona".
- Prazo de SLA interno de comunicação à controladora (seção 3.4) — precisa
  de apoio jurídico antes de virar compromisso comunicável ao cliente.
- Template de comunicação pronto (hoje descrito em prosa na seção 3.4,
  não como um modelo copiável) — vale preparar com antecedência, não
  redigir do zero durante um incidente real.
