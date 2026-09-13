**NOTA TÉCNICA — DIMENSIONAMENTO DE STORAGE E CUSTOS DO PILOTO**

**Status:** PARA DECISÃO\
**Versão:** 1.0\
**Data:** 12/09/2026\
**Contexto:** Piloto JR Box, 01/01/2027 a 31/12/2027 (ADR-003)

**1. Por que esta nota existe**

O piloto operará 12 meses com dados e registro fotográfico reais. Nenhum
documento do projeto estimava o consumo de armazenamento nem o custo de
infraestrutura. Esta nota preenche essa lacuna e aponta duas decisões
que precisam ser tomadas **antes do go-live**.

**2. Parâmetros técnicos já implementados**

Verificados no código, não estimados:

imagens são convertidas para **WebP com qualidade 80** e redimensionadas
para no máximo **2000 px** no maior lado;

o limite por arquivo é de **20 MiB**;

os formatos aceitos são JPEG, PNG, WEBP e PDF;

o consumo por empresa já é calculável — existe função de uso por tenant
e campo de limite de storage por plano (hoje sem valor definido,
conforme o ADR-006).

O efeito prático da conversão é grande: uma foto de celular de 3–5 MB
passa a ocupar tipicamente **200–350 KB**. Os cálculos abaixo usam
**300 KB por foto**.

**3. Premissas de volume**

Fotos por instalação: **8** (faixa informada: 5 a 10).

Documentos por obra (PDF de contrato, comprovantes): **~1 MB**.

Consumo de arquivos por obra: **8 × 300 KB + 1 MB ≈ 3,4 MB**.

Banco de dados por obra: pedidos, itens, OPs, apontamentos e trilha de
auditoria — estimados em **~300 KB**, dominados pelos registros de
`activity_logs`.

O volume mensal de obras da JR Box ainda não foi levantado, então os
cenários abaixo cobrem três ordens de grandeza.

**4. Projeção para os 12 meses do piloto**

**Cenário pequeno — 30 obras/mês**

arquivos: ~102 MB/mês → **~1,2 GB em 12 meses**;

banco: ~9 MB/mês → **~0,1 GB em 12 meses**.

**Cenário médio — 80 obras/mês**

arquivos: ~272 MB/mês → **~3,3 GB em 12 meses**;

banco: ~24 MB/mês → **~0,3 GB em 12 meses**.

**Cenário grande — 200 obras/mês**

arquivos: ~680 MB/mês → **~8,2 GB em 12 meses**;

banco: ~60 MB/mês → **~0,7 GB em 12 meses**.

**Conclusão do dimensionamento:** mesmo no cenário grande, o piloto
consome menos de 10% do armazenamento incluído no plano pago do
provedor de banco. **Storage não é o risco.** O risco está no plano
contratado e nas regras de uso, tratados a seguir.

**5. O plano gratuito não sustenta o piloto**

Dois impedimentos, independentes do volume:

**o projeto é pausado após uma semana de inatividade** — inaceitável
para operação real de um cliente;

o plano gratuito inclui **1 GB de arquivos e 500 MB de banco**, abaixo
até do cenário pequeno.

**6. O plano gratuito de hospedagem não permite uso comercial**

O plano Hobby do provedor de hospedagem é, pelos próprios termos,
**para uso pessoal e não comercial**. O piloto da JR Box é operação
real de um cliente, com dados reais — portanto exige plano pago, e isso
é uma questão contratual, não de capacidade técnica.

**7. Custo estimado do piloto**

Valores de referência em setembro/2026, sujeitos a alteração pelos
provedores:

banco de dados, autenticação e storage (plano pago): **US$ 25/mês**,
incluindo 8 GB de banco, 100 GB de arquivos e 250 GB de tráfego;

hospedagem da aplicação (plano pago): **US$ 20/mês** por desenvolvedor,
com crédito de uso incluído;

**total aproximado: US$ 45/mês**, ou cerca de **US$ 540 nos 12 meses do
piloto** — sem considerar variação cambial, impostos sobre serviços
internacionais ou custos de serviços ainda não contratados (e-mail
transacional, push, observabilidade).

Excedentes só passariam a pesar em volumes muito acima do cenário
grande: cada GB adicional de arquivos custa centavos de dólar, e o
tráfego incluído é dezenas de vezes maior que o projetado.

**8. Riscos a monitorar**

**Tráfego de saída (egress)** — é o item que pode surpreender, porque
cresce com quantas vezes cada foto é visualizada, não com quantas são
armazenadas. No cenário grande, com cada foto vista dez vezes, ainda se
fica dentro do incluído — mas convém acompanhar.

**Crescimento de `activity_logs`** — tabela de crescimento contínuo, já
sinalizada no ADR-009 como candidata a política de retenção ou
arquivamento.

**Backups** — se armazenados no mesmo provedor, somam ao consumo; se
externos, representam custo próprio. O RUNBOOK define o procedimento,
não o custo.

**Multiplicação por tenant** — o piloto é um tenant. Cada nova empresa
repete o consumo. Os limites por plano previstos no ADR-006 continuam
sem valor definido, e esta nota fornece a base numérica para defini-los.

**9. Decisões necessárias**

**9.1 Contratar os planos pagos antes do go-live (01/01/2027)**, tanto
do provedor de banco quanto da hospedagem — o segundo por exigência
contratual de uso comercial, o primeiro por causa da pausa por
inatividade.

**9.2 Levantar o volume real de obras/mês da JR Box** e confirmar o
cenário aplicável, ajustando esta nota.

**9.3 Definir os limites de storage por plano comercial** (ADR-006 §3.5
e §4), usando os números desta nota como base — sugestão de partida:
limite por tenant uma ordem de grandeza acima do cenário médio,
revisado após os primeiros meses de operação real.

**10. Revisão**

Esta nota deverá ser revista após o marco M2 do piloto (31/03/2027),
quando houver três meses de consumo real para comparar com a projeção.
