# Runbook — Backup e Recuperação (Fase 5)

Este documento **não é um ADR** — é a documentação operacional exigida pelo
Prompt Mestre de Segurança (itens 34-38) e pela ADR-003 §12 (backup e
recuperação obrigatórios desde o primeiro registro operacional real do
cliente-piloto). Decisões de negócio nele contidas (RPO/RTO, política de
retenção) estão marcadas como **propostas**, pendentes de aprovação
explícita do responsável do produto antes de valerem como compromisso com
o cliente-piloto (item 37: "não prometer ao cliente valores que a
infraestrutura não suporta").

## 1. Estado atual da infraestrutura

**Atualizado em 13/09/2026 (Security Gate Fase 8).** Desenvolvimento
continua em ambiente local (Supabase via Docker/Colima) — os scripts desta
fase seguem cobrindo isso normalmente. Além disso, agora existe um projeto
remoto provisionado: `Saas-Vidracaria` (ref `kisjfapdbyhgszvxyugc`, região
`sa-east-1`), mas **no plano Free**, por decisão explícita de não assinar
Pro neste momento (ver ADR-010 §15). Isso muda o que estava escrito aqui:

- O backup automático diário do item 34 **continua não se aplicando** —
  mas agora não é "ainda não temos projeto de produção", é "o plano atual
  do projeto que já existe não inclui backup gerenciado". O Free do
  Supabase não tem backup automático em nenhuma circunstância; é recurso
  exclusivo de Pro e acima. Passa a existir automaticamente no momento do
  upgrade, sem ação adicional aqui.
- Os scripts desta fase (`backup-db.mjs`, `backup-storage.mjs`,
  `restore-db.mjs`, `test-restore.mjs`) seguem sendo a única cobertura de
  backup real deste ambiente enquanto ele estiver no Free — não são só
  "complemento", são o backup de fato hoje. Recomenda-se rodar
  `backup-db.mjs` manualmente contra o projeto remoto (`DATABASE_URL`
  apontando para ele) enquanto durar o Free, e não só contra o banco
  local.
- Backup externo (item 35) e RPO/RTO (item 37) continuam **plano
  documentado**, não infraestrutura ativa, até o upgrade para Pro (que traz
  backup automático gerenciado) ou até uma decisão explícita de operar
  backup externo à parte.

## 2. Backup do banco (`scripts/backup-db.mjs`)

```bash
node scripts/backup-db.mjs
```

Gera um dump completo (`pg_dump --format=custom`) dos schemas `public`
(dados da aplicação), `auth` (contas de usuário) e `storage` (metadados de
arquivo) em `backups/db/<timestamp>.dump`. Schemas internos do Supabase
(`realtime`, `vault`, `_analytics` etc.) ficam de fora deliberadamente:
pertencem à infraestrutura da própria plataforma, exigem privilégios que a
aplicação não deveria ter mesmo em produção, e já são cobertos pelo backup
gerenciado do provedor (item 34).

`backups/` está no `.gitignore` — os dumps contêm dados reais de tenant e
nunca podem ser versionados.

Variável de ambiente: `DATABASE_URL` (default: banco local do
`supabase start`). Em produção, aponta para a connection string do projeto
real, mantida como secret, nunca commitada.

## 3. Backup do Storage (`scripts/backup-storage.mjs`)

```bash
set -a; source .env.local; set +a
node scripts/backup-storage.mjs
```

Backup do PostgreSQL **não cobre os binários do Storage** (item 36) — os
arquivos físicos vivem fora do banco. Este script baixa todo objeto do
bucket privado `company-files` para `backups/storage/<timestamp>/objects/`,
e exporta um manifesto (`files-metadata.json`) com os metadados completos
da tabela `public.files` (empresa, tipo/entidade associada, nome original,
MIME, tamanho), preservando a relação empresa/entidade/arquivo mesmo fora
do banco.

## 4. Backup externo (item 35) — plano

**Ainda não implementado — depende da infraestrutura de produção.** Plano:

1. Os dumps gerados por `backup-db.mjs`/`backup-storage.mjs` (ou o backup
   gerenciado do Supabase, quando disponível) devem ser copiados para um
   destino **fora do provedor principal** — ex.: um bucket S3-compatível
   (Cloudflare R2, Backblaze B2 ou AWS S3) em conta separada.
2. A cópia externa deve ter suas próprias credenciais, sem acesso de
   escrita a partir do ambiente de produção principal comprometido (só
   escrita via job de backup, nunca pela aplicação em si) — protege contra
   exclusão acidental e contra comprometimento do ambiente principal
   (item 35).
3. Cadência: diária, acompanhando o backup primário.
4. Retenção da cópia externa: ver política de retenção (seção 5).

Este plano será executado quando a Fase 8 (Produção) definir o provedor de
hospedagem definitivo — implementar contra uma infraestrutura que ainda
não existe geraria configuração especulativa e não testável.

## 5. Política de retenção — proposta (pendente de aprovação)

| Tipo de backup | Retenção proposta |
|---|---|
| Backup diário (banco + Storage) | 7 dias |
| Backup semanal | 4 semanas |
| Backup mensal | 12 meses |

Justificativa: cobre o cenário mais comum (erro detectado em até 1 semana)
sem exigir armazenamento indefinido, e preserva pontos de restauração mais
espaçados para investigações tardias. **Estes números são uma proposta
inicial, não um compromisso já assumido com o cliente-piloto** — precisam
de aprovação do responsável do produto antes de virarem SLA.

Retenção de dados de tenant após cancelamento/exclusão segue o ciclo de
vida `ATIVA → CANCELAMENTO → SUSPENSA → RETENÇÃO → EXCLUSÃO DEFINITIVA` já
modelado em `companies.status` (Fase 2) — este runbook trata de backups
técnicos, não da retenção de dados do tenant em si.

## 6. Teste de restauração (`scripts/test-restore.mjs`)

Implementa o pipeline exigido pelo item 38 — **backup não é válido só por
estar configurado**:

```
backup → banco isolado → restauração → validação → relatório
```

```bash
node scripts/test-restore.mjs
```

O script: gera um backup fresco, restaura num banco **isolado** (nunca o
banco em uso — nunca se testa restauração destrutiva em produção), e
valida:

- contagem de registros nas tabelas-chave batendo com a origem;
- RLS continua habilitada em `activity_logs` e `files`;
- o trigger de imutabilidade de auditoria (Fase 4) sobreviveu à restauração;
- integridade referencial básica (sem perfis órfãos).

Ao final imprime um relatório com data, dump testado e status
PASS/FAIL, e remove o banco de teste.

**Limitação conhecida**: o banco isolado é criado na mesma instância
Postgres local (aproveita roles já existentes no cluster, como
`supabase_auth_admin`). Isso valida fidelidade dos dados e do schema, mas
não substitui um teste de restauração num projeto Supabase totalmente
novo/vazio — esse teste "do zero" é uma validação adicional a fazer na
Fase 8, quando a infraestrutura de produção existir.

**Cadência recomendada**: antes do início de qualquer operação real de
cliente (ADR-003 §12 exige teste de recuperação antes do uso operacional
real da JR Box) e periodicamente depois (proposta: semanal) — a definir
junto com o responsável do produto.

## 7. Procedimentos de recuperação de desastres (item 37)

| Cenário | Procedimento |
|---|---|
| **Exclusão acidental (1 registro)** | Tabelas com soft delete (`deleted_at`) permitem restauração direta via `UPDATE ... SET deleted_at = NULL` (quando a regra de negócio permitir). Sem soft delete: restaurar o registro a partir do backup mais recente anterior ao incidente, num banco isolado, e reinserir manualmente após validação. |
| **Exclusão em massa** | Isolar a causa (bug, ação manual, script) antes de qualquer restauração. Restaurar o backup anterior ao incidente em banco isolado (`restore-db.mjs`), comparar com o estado atual, e reconciliar seletivamente — nunca sobrescrever o banco em produção inteiro sem essa comparação. |
| **Banco corrompido** | Provisionar um banco novo, restaurar o backup válido mais recente (`restore-db.mjs` + `test-restore.mjs` para confirmar integridade antes de promover), repontar a aplicação para o banco restaurado. |
| **Arquivos perdidos (Storage)** | Restaurar os objetos a partir do backup de Storage mais recente (`backups/storage/<timestamp>/objects/`), recriando os mesmos `storage_path`; reconciliar com `files-metadata.json` para preencher metadados caso a tabela `files` também precise de restauração parcial. |
| **Conta comprometida** | Revogar sessões do usuário (`supabase.auth.admin.signOut`), forçar troca de senha (`must_change_password = true`), revisar `activity_logs` do usuário (imutáveis desde a Fase 4) para escopo do incidente, desativar temporariamente (`profiles.active = false`) se necessário. |
| **Secrets vazados** | Rotacionar a chave/secret vazada imediatamente (Supabase service role key, JWT secret, credenciais de terceiros) e invalidar sessões existentes que dependam dela. Nunca reaproveitar a chave antiga. Registrar o incidente. |
| **Falha do provedor (Supabase indisponível)** | Sem plano ativo de multi-provedor nesta fase (custo/complexidade não justificados para o estágio atual do piloto). Mitigação: os backups externos (seção 4) garantem que os dados sobrevivem a uma falha do provedor, mesmo que a operação fique pausada até a normalização ou migração. |
| **Indisponibilidade da aplicação (não do banco)** | Verificar logs de deploy/infra primeiro (fora do escopo deste runbook, que cobre dados). Se o banco estiver saudável, o problema está na camada de aplicação/hospedagem — reverter o último deploy costuma ser o caminho mais rápido. |

## 8. RPO/RTO — proposta (pendente de aprovação)

| Métrica | Proposta | Justificativa |
|---|---|---|
| **RPO** (perda máxima de dados aceitável) | 24 horas | Alinhado à cadência de backup diário (seção 5); qualquer coisa mais agressiva exigiria backup contínuo (WAL archiving / PITR), que é um recurso de plano pago do Supabase — só assumir esse compromisso quando esse plano estiver contratado. |
| **RTO** (tempo máximo para restaurar operação) | 4 horas úteis | Cobre provisionar/restaurar um banco a partir do backup mais recente e revalidar (pipeline da seção 6), mais margem para diagnóstico. Não inclui reconstrução de infraestrutura do zero (ex.: provedor inteiro fora do ar) — esse cenário é tratado como indisponibilidade prolongada, não RTO padrão. |

**Estes valores não devem ser comunicados ao cliente-piloto como SLA até
serem aprovados explicitamente** — são estimativas de engenharia baseadas
na infraestrutura atual (ambiente local + plano de produção ainda não
contratado), não um compromisso comercial.
