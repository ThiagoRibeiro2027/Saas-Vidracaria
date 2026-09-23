**ROTEIRO — FECHAMENTO DA FASE 1 (GO-LIVE)**

**Status:** APROVADO — ordem da seção 7 confirmada por Thiago via chat
em 23/09/2026\
**Versão:** 1.0\
**Data:** 23/09/2026\
**Base documental:** ADR-002, ADR-003, ADR-009 §4-5, ADR-010 §14-15,
PLANO DE ENTREGA — MVP DO PILOTO v1.0, NOTA TÉCNICA — Dimensionamento
de Storage e Custos do Piloto v1.0, RUNBOOK-SUBOPERADORES-LGPD.md,
RUNBOOK-BACKUP-E-RECUPERACAO.md, RUNBOOK-GOVERNANCA-DE-SEGURANCA.md

**1. Situação atual**

Todo o código do escopo do MVP (ADR-002 §4.1 a §4.18) está implementado
— base/estrutura, cadastros, comercial, pedidos, engenharia, estoque,
PCP/produção, expedição, instalação, usuários/permissões,
configurações, notificações, qualidade, financeiro, fiscal,
indicadores, integrações e abastecimento/compras. Vários módulos já
foram além do recorte mínimo original (Produção, Suprimentos, BI, RH,
Fiscal, Integrações, Contratos, e a fila de produção/peças
fabricadas/recebimento entregues em 23/09/2026), adiantando trabalho
que só era esperado para M2 (31/03/2027), M3 (30/06/2027) e M4
(30/09/2027) no PLANO DE ENTREGA.

O que falta para fechar a Fase 1 (M1, 01/01/2027, conforme ADR-003)
**não é código**. É uma lista de itens jurídicos, de infraestrutura, de
validação técnica e de homologação — hoje espalhada em vários
documentos. Este roteiro consolida tudo num só lugar, ordenado por
dependência, com o dono de cada item explícito. A maioria depende de
uma ação sua (pagamento, decisão de negócio, assinatura) — não de mim.

**2. Bloqueantes antes de produção com dados reais** (ADR-010 §15)

**2.1 — Upgrade do Supabase de Free para Pro.** Dono: você (ação de
pagamento). O plano Free não inclui backup automático — o item "backup
automático configurado e testado" do checklist de segurança está
**bloqueado**, não apenas pendente, enquanto o projeto permanecer no
Free, que também corre risco de pausa por inatividade. É pré-requisito
de qualquer go-live real e do item 4.2 abaixo. Custo estimado:
~US$ 25/mês (NOTA TÉCNICA §7).

**2.2 — Contratar o plano pago de hospedagem (Vercel).** Dono: você. O
plano Hobby/gratuito tem restrição de uso comercial nos termos de
serviço. Custo estimado: ~US$ 20/mês por desenvolvedor (NOTA TÉCNICA
§7). Total combinado com o item 2.1: ~US$ 45/mês, ~US$ 540/ano, sem
contar câmbio, impostos e serviços ainda não contratados (e-mail
transacional, push, observabilidade).

**2.3 — Fixar a região da hospedagem** (`regions` no `vercel.json`).
**Concluído em 23/09/2026** — `regions: ["gru1"]` (São Paulo),
confirmado por você, coerente com o Supabase já provisionado em
`sa-east-1`. `RUNBOOK-SUBOPERADORES-LGPD.md` e ADR-010 §15 atualizados.

**2.4 — Confirmar a residência de dados do Resend.** Dono: você
(verificar no painel/termos do Resend) — ou registrar formalmente como
transferência internacional caso não haja opção de região Brasil/UE.

**2.5 — Preencher o inventário de dados pessoais** (LGPD). **Rascunho
técnico pronto em 23/09/2026** —
`docs/INVENTÁRIO DE DADOS PESSOAIS (LGPD) v1.0.md`, organizado pelas 6
categorias do ADR-010 §3, com tabela/coluna de origem, finalidade e
base legal preliminar para cada uma. Falta você (com apoio jurídico)
validar a base legal e definir os dois prazos de retenção ainda em
aberto (funcionário desligado, contrato encerrado) — aí o documento
passa de rascunho a vigente.

**2.6 — Publicar formalmente a relação de suboperadores à
empresa-cliente.** **Rascunho pronto em 23/09/2026** —
`docs/RELAÇÃO DE SUBOPERADORES — Versão para a Empresa-Cliente v1.0.md`,
sem jargão técnico, pronto para anexar ao contrato/enviar à JR Box.
Falta só a ação comercial de publicação/envio (dono: você) e, quando
resolvido, atualizar a seção 3 desse documento com a confirmação do
Resend (item 2.4).

**2.7 — Anexar evidência documental formal** do parecer jurídico sobre
as bases legais e do contrato/termo de tratamento de dados assinado
com a JR Box. Dono: você (jurídico) — já confirmado verbalmente em
13/09/2026, falta só o documento em si.

**2.8 — Confirmação por escrito da região do Supabase** efetivamente
provisionada (anexar print/documento do painel). Dono: você.

**3. Observabilidade e alertas** (ADR-009 §5.5-5.6)

**3.1 — Escolher a ferramenta de observabilidade** — decisão ainda em
aberto, sem orçamento definido. Dono: você.

**3.2 — Configurar os 5 alertas mínimos exigidos**: indisponibilidade
da aplicação, taxa anormal de erros, falha de backup, falha recorrente
de integração e esgotamento de capacidade. Hoje só existe o cron
diário de verificação de `activity_logs` com e-mail via Resend
(RUNBOOK-GOVERNANCA-DE-SEGURANCA.md); falha de backup e esgotamento de
capacidade ainda não têm alerta nenhum. Dono: eu, depois que a
ferramenta do item 3.1 for escolhida.

**3.3 — Resolver a restrição do remetente sandbox do Resend**
(`onboarding@resend.dev` só entrega e-mail para o próprio dono da
conta — qualquer outro endereço de alerta falha silenciosamente).
Verificar um domínio de verdade no Resend. Dono: você.

**4. Validação técnica final**

**4.1 — CI/`npm test` contra Supabase real.** Já funciona — o pipeline
de CI (`.github/workflows/ci.yml`) provisiona Supabase via CLI e roda
a suíte completa a cada push/PR, sem `continue-on-error`, e já pegou
uma regressão real (registrado no RUNBOOK-GOVERNANCA-DE-SEGURANCA.md).
Nenhuma ação pendente além de manter verde.

**4.2 — Teste de restore a partir do zero na infraestrutura de
produção real.** Hoje só validado contra um Postgres local
(`scripts/test-restore.mjs`). Dono: eu, mas só depois do item 2.1
(upgrade Pro) existir de fato.

**4.3 — Levantar o volume real de obras/mês da JR Box** (NOTA TÉCNICA
§9.2) e **definir os limites de storage por plano comercial** (NOTA
TÉCNICA §9.3, ADR-006 §3.5/§4). Dono: você — dado de negócio que eu
não tenho como estimar.

**5. Homologação com a JR Box**

Carga de cadastros iniciais, treinamento da equipe e ajustes finos com
uso real do sistema. O PLANO DE ENTREGA original reservava as duas
últimas semanas de dezembro para isso — dado o adiantamento do código
frente ao cronograma, essa janela pode começar bem antes. Dono: você,
com meu suporte durante os ajustes que aparecerem.

**6. Fora do escopo deste roteiro — não bloqueia o go-live**

Campos personalizados (bucket M4 no PLANO DE ENTREGA, sem ADR próprio
ainda definido) e todo o restante listado como Fase 2 do produto
(módulo completo de Compras, Fiscal completo, Financeiro completo, BI
avançado, Integrações Fase 2+, Contratos com alçada/garantia, BOM
hierárquica completa, entre outros) — nenhum desses impede a entrada em
produção com o recorte atual.

**7. Ordem recomendada**

Respeitando as dependências acima: **2.1 e 2.2** (pagamento) → **2.3,
2.4 e 2.8** (configuração que depende do pagamento) → **4.2** (restore
real, depende de 2.1) → **2.5, 2.6 e 2.7** (documentação/jurídico, em
paralelo, não dependem de infraestrutura) → **3.1, 3.2 e 3.3**
(observabilidade) → **4.3** (dado de negócio) → **5** (homologação).

**8. Próxima ação**

Itens 2.3, 2.5 e 2.6 resolvidos/rascunhados em 23/09/2026. Restam, na
ordem da seção 7: **2.1 e 2.2** (pagamento — Supabase Pro e Vercel
pago) são o próximo passo, pois destravam 2.4/2.8/4.2. Em paralelo,
você pode revisar e validar os dois rascunhos (2.5, 2.6) e resolver
2.7 (documento jurídico) a qualquer momento, já que não dependem de
infraestrutura.
