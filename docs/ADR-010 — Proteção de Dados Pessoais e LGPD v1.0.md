**ADR-010 — Proteção de Dados Pessoais e LGPD**

**Status:** APROVADO\
**Versão:** 1.0\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 12/09/2026\
**Decisão:** Papéis, bases de tratamento, direitos do titular e retenção de dados pessoais\
**Decisão vinculada:** ADR-001, ADR-003, ADR-006, ADR-008, ADR-009, TÓPICO 1, TÓPICO 17, TÓPICO 18

**Aviso**

Este documento organiza decisões de **arquitetura e processo**. Ele não
substitui parecer jurídico. As bases legais indicadas, o contrato de
tratamento de dados e as respostas a pedidos de titulares deverão ser
validados por profissional habilitado antes da entrada em produção com
dados reais.

**1. Contexto**

O item 44 do Prompt Mestre de Segurança determina que a arquitetura
considere os princípios da LGPD e prepare o sistema para controle de
acesso, rastreabilidade, identificação de dados pessoais, exportação,
correção, exclusão quando aplicável, retenção, segurança e resposta a
incidentes.

Essa é a base deste ADR. O que faltava — e é o objeto deste documento —
são as decisões operacionais: **quem responde pelo quê**, com que base
se trata cada categoria de dado, como um pedido de titular é atendido
num sistema multiempresa, e como a retenção convive com a
imutabilidade da auditoria.

A entrada do módulo de RH (TÓPICO 17) ampliou a exposição: antes o
sistema tratava sobretudo dados de clientes; agora trata também dados
pessoais de funcionários das empresas clientes.

**2. Papéis**

**A empresa cliente (vidraçaria) é a controladora** dos dados pessoais
que insere e trata no sistema: seus clientes finais, seus funcionários,
seus fornecedores e as pessoas registradas em obras.

**O SaaS é operador** desses dados: trata em nome da controladora,
conforme suas instruções e conforme o contrato.

**O SaaS é controlador** apenas dos dados cadastrais da própria empresa
cliente enquanto cliente do SaaS — contato comercial, faturamento,
usuários administradores da conta.

Consequências diretas:

pedidos de titulares relativos a dados operacionais são endereçados à
vidraçaria, que utiliza o sistema para atendê-los;

o SaaS não decide finalidades sobre os dados operacionais dos tenants;

o acesso de administrador de plataforma a dados de tenant é excepcional,
justificado e auditado, conforme o ADR-001.

**3. Inventário de dados pessoais tratados**

O sistema deverá manter identificados, no mínimo, os seguintes
conjuntos:

**Usuários do sistema** — identificação, credenciais, MFA, sessões,
registros de acesso.

**Funcionários** (TÓPICO 17) — dados pessoais e de contato, cargo,
admissão, documentos, certificações, EPI, afastamentos.

**Clientes finais e contatos** — identificação, contato, endereço de
obra.

**Fornecedores e prestadores** — contatos e contratos (TÓPICO 18).

**Registros de campo** (ADR-008) — fotos de obra, que podem capturar
pessoas e propriedade de terceiros; assinaturas e evidências de aceite.

**Registros técnicos e de auditoria** — `activity_logs`, incluindo
endereço IP e user agent, que são dados pessoais.

Cada conjunto deverá ter finalidade declarada e responsável
identificável.

**4. Bases de tratamento** *(sujeito a validação jurídica)*

A orientação de arquitetura é tratar cada conjunto sob a base adequada à
sua finalidade — tipicamente execução de contrato para dados
operacionais de clientes e fornecedores, obrigações legais e execução de
contrato de trabalho para dados de funcionários, e legítimo interesse
para registros de segurança e auditoria.

Nenhuma funcionalidade deverá depender de consentimento como base
padrão sem que isso seja decidido explicitamente, pois consentimento
revogável cria dependência frágil em processo operacional.

A definição final das bases é responsabilidade da controladora, com
apoio jurídico.

**5. Direitos do titular**

O sistema deverá permitir que a controladora atenda, em relação aos
dados sob sua responsabilidade:

**Acesso e confirmação** — localizar todos os registros de um titular.

**Correção** — corrigir dados incorretos, preservando histórico de
alteração.

**Exportação/portabilidade** — extrair os dados do titular em formato
estruturado, aproveitando os mecanismos já previstos no ADR-006.

**Exclusão ou anonimização**, conforme a seção 6.

Os pedidos deverão ser rastreáveis: quem solicitou, quando, o que foi
feito e por quem.

Prazos e formalidades de resposta ao titular são responsabilidade da
controladora.

**Consequência operacional:** a anonimização da trilha de auditoria é
restrita ao administrador de plataforma (seção 6). Logo, a controladora
**depende do operador** para concluir esse passo. Deverá existir canal
formal de solicitação e prazo acordado entre controladora e operador,
registrado no contrato de tratamento de dados (seção 12) — caso
contrário a controladora fica sem meio de cumprir o prazo legal que lhe
cabe.

**6. Exclusão e auditoria imutável**

Hoje a tabela `activity_logs` possui trigger que impede UPDATE e DELETE
inclusive para a service role — proteção deliberada da trilha de
auditoria, conforme o Prompt Mestre item 18.

**Decisão:** um pedido de exclusão de titular **não apaga a trilha de
auditoria**. Os campos pessoais do titular são **anonimizados** —
identificação, e-mail, endereço IP e user agent são substituídos por
valores irreversíveis —, preservando o fato registrado (o que aconteceu,
quando, sobre qual entidade).

**Consequência de implementação:** o trigger atual
(`activity_logs_immutable`) bloqueia UPDATE e DELETE para qualquer role,
inclusive a service role. Implementar a anonimização exigirá **ajustar
esse trigger de forma deliberada e auditada** — permitindo
exclusivamente a operação de anonimização por procedimento controlado, e
mantendo o bloqueio para todo o resto. O próprio comentário da migration
já previa essa necessidade. Contornar o trigger silenciosamente não é
aceitável.

A anonimização deverá:

ser executada por procedimento próprio, restrito e auditado;

registrar que houve anonimização, sem reintroduzir o dado removido;

preservar a integridade referencial e a capacidade de reconstruir a
sequência dos fatos;

não ser contornável por usuário comum nem por administrador de tenant.

Registros com obrigação legal de guarda (fiscais, trabalhistas,
contratuais) permanecem pelo prazo aplicável, mesmo após pedido de
exclusão — decisão que a controladora deverá poder justificar.

**7. Retenção**

Cada conjunto de dados deverá ter prazo de retenção definido pela
finalidade, e não apenas pela conveniência técnica.

A retenção de backups segue o RUNBOOK de backup e recuperação; a
retenção de auditoria segue a política de crescimento prevista no
ADR-009; a retenção de dados de tenant após cancelamento segue o
ADR-006, que já determina que o encerramento não implica exclusão
imediata.

Deverá existir um ponto único onde esses prazos são consultáveis, para
que não se contradigam entre si.

**8. Minimização**

Aplicam-se, e são reafirmadas aqui:

registros técnicos não contêm segredos, tokens, senhas nem dados
pessoais desnecessários ao diagnóstico (ADR-009);

notificações não expõem dados sensíveis em canal inadequado (ADR-007);

dados de RH têm acesso restrito por permissão, princípio do menor
privilégio (TÓPICO 17);

ambientes não produtivos usam dados anonimizados ou mascarados
(ADR-006);

fotos de obra devem capturar o necessário à comprovação do serviço,
evitando registro desnecessário de pessoas e de ambientes privados
(ADR-008).

**9. Hospedagem e transferência internacional**

**Decisão:** banco de dados e armazenamento de arquivos deverão ser
hospedados em **região brasileira**, evitando transferência
internacional de dados pessoais.

A região efetivamente configurada no provedor deverá ser verificada e
registrada antes da entrada em produção com dados reais.

Caso algum componente não ofereça região brasileira, a exceção deverá
ser registrada formalmente, com a salvaguarda contratual aplicável e
validação jurídica — não podendo ser adotada silenciosamente.

**10. Suboperadores**

O SaaS utiliza terceiros no tratamento (provedor de banco e
autenticação, hospedagem de aplicação, envio de e-mail, push e, no
futuro, gateway de pagamento).

Deverá existir relação mantida e atualizada desses suboperadores,
disponível à controladora.

A inclusão de um novo suboperador que trate dados pessoais é decisão
que exige registro formal.

**11. Incidentes**

Deverá existir procedimento para incidente envolvendo dados pessoais,
contemplando:

detecção e registro;

avaliação de abrangência e de dados afetados;

contenção;

**comunicação à controladora** — o SaaS, como operador, comunica a
empresa cliente, que decide sobre comunicação ao titular e à
autoridade;

registro das ações tomadas;

revisão posterior.

A capacidade de detecção depende da observabilidade definida no
ADR-009.

**12. Contrato de tratamento de dados**

O contrato entre o SaaS e a empresa cliente deverá conter cláusula ou
anexo de tratamento de dados, definindo papéis, finalidades, instruções,
suboperadores, segurança, incidentes, término e devolução/eliminação.

Esse instrumento integra o ciclo comercial do ADR-006 e utiliza o módulo
de Contratos (TÓPICO 18) quando aplicável.

**Sua redação depende de validação jurídica.**

**13. Consequências aceitas**

Necessidade de procedimento próprio de anonimização; manutenção de
inventário de dados pessoais e de suboperadores; restrição de região de
hospedagem, que pode limitar escolhas técnicas; e dependência de
validação jurídica para fechar bases legais e contrato.

**14. Consequências não aceitas**

Não são aceitos: tratamento de dado pessoal sem finalidade declarada;
exclusão que destrua a trilha de auditoria; acesso de plataforma a dados
de tenant sem justificativa e registro; exposição de dados pessoais em
logs técnicos, notificações ou ambientes não produtivos; transferência
internacional adotada por omissão; e novo suboperador sem registro.

**15. Pendências bloqueantes antes da produção com dados reais**

validação jurídica das bases de tratamento e do contrato — **confirmado por
Thiago em 13/09/2026, via chat (Security Gate Fase 8)**. Evidência
documental formal (parecer jurídico sobre as bases legais e contrato/termo
de tratamento de dados assinado com as vidraçarias) fica pendente de
anexação posterior — quando disponível, substituir esta nota pela
referência ao(s) documento(s);

verificação e registro da região de hospedagem efetivamente em uso — **confirmado
por Thiago em 13/09/2026, via chat (Security Gate Fase 8)**, decisão:
Supabase em região brasileira (São Paulo/`sa-east-1`). Confirmação por
escrito da região efetivamente provisionada fica pendente de anexação
posterior — quando disponível, substituir esta nota pela referência ao
documento.

Projeto provisionado em 13/09/2026: `Saas-Vidracaria` (ref
`kisjfapdbyhgszvxyugc`), organization `Saas Vidraçarias`, região
`sa-east-1`, confirmada disponível no momento da criação. **Plano: Free,
por decisão explícita de Thiago em 13/09/2026** ("assinar o plano Pro agora
não é viável neste momento") — o Free pausa por inatividade e não é
adequado para produção; este ambiente é **provisório** e não deve ser
confundido com o ambiente de produção definitivo. Upgrade para Pro é
pré-requisito antes de qualquer go-live real ou de manter o projeto no ar
sem risco de pausa.

Verificado em 13/09/2026 (Security Gate Fase 8, item 4 — Banco): **o plano
Free do Supabase não inclui backup automático** — não é só o risco de pausa
por inatividade citado acima, é ausência total de backup gerenciado
enquanto o projeto estiver nesse plano. O RUNBOOK de backup e recuperação
(Fase 5) e os testes de restore (`scripts/test-restore.mjs`) validam o
procedimento manual/local, mas isso não substitui backup automático de um
banco de produção real. O item "backup automático configurado e testado"
do checklist da Fase 8 fica **bloqueado** — não apenas pendente — enquanto
o projeto remoto permanecer no plano Free;

implementação do procedimento de anonimização — **concluído**: activity_logs
(migrations 20260912140500 e 20260912141000) e, a partir de 13/09/2026,
extensão a profiles/auth.users (migration 20260913090000 e
`src/lib/audit/anonymizeDataSubject.ts`, item 2.2 do Security Gate Fase 8),
com testes automatizados em `scripts/test-lgpd-anonymization.mjs`;

inventário de dados pessoais preenchido — **ainda pendente**, não tratado
nas decisões de 12–13/09/2026;

relação de suboperadores publicada — **ainda pendente**, não tratado nas
decisões de 12–13/09/2026.

**16. Dependências**

**Prompt Mestre de Segurança, item 44** — base deste ADR.

**TÓPICO 1 §18** — segurança estrutural.

**ADR-001** — acesso, menor privilégio e acesso excepcional de
plataforma.

**ADR-003** — o piloto será a primeira operação com dados pessoais
reais.

**ADR-006** — exportação, retenção após cancelamento e ambientes não
produtivos.

**ADR-008** — evidências de campo e fotos de obra.

**ADR-009** — observabilidade, minimização em logs e retenção de
auditoria.

**TÓPICO 17** — dados de funcionários.

**TÓPICO 18** — contratos, incluindo o de tratamento de dados.

**17. Princípio final**

**O sistema trata dados pessoais em nome de outra empresa: cada dado
precisa de dono, finalidade, prazo e rastro — e o que protege a trilha
de auditoria não pode ser usado como desculpa para ignorar o titular.**

**Status final: APROVADO**
