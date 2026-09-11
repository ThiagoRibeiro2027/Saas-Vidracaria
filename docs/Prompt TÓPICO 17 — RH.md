**PROMPT TÓPICO 17 — RH**

*Sistema de Gestão Operacional da Fábrica de Vidraçaria*

**Status:** PROPOSTO PARA APROVAÇÃO\
**Data:** 11/09/2026

**1. Objetivo**

Centralizar o cadastro de colaboradores, equipes de trabalho, documentos
e habilitações necessários para a operação da vidraçaria — sem assumir
responsabilidade por cálculo de folha de pagamento, encargos ou
rescisão, que permanecem fora do escopo deste módulo.

**2. Cadastro de funcionários**

O cadastro deverá conter, conforme aplicável:

dados pessoais e de contato;

cargo e função;

unidade/filial de lotação;

data de admissão;

status: ativo, afastado, desligado.

**3. Relação com Usuários (ADR-001)**

O funcionário e o usuário do sistema são conceitos relacionados, mas não
equivalentes:

nem todo funcionário precisa ser usuário do sistema;

pode haver usuários que não são funcionários (ex.: terceirizados com
acesso pontual).

O vínculo entre um registro de RH e uma conta de usuário, quando
existir, deve ser explícito e rastreável.

**4. Desligamento e revogação de acesso**

Quando um funcionário for desligado, o sistema deve sinalizar — ou, onde
tecnicamente viável, disparar — a revogação do acesso dele ao sistema,
em conformidade com o ADR-001.

Não deve ser possível um funcionário permanecer com status "desligado"
no RH enquanto sua conta de usuário permanece ativa sem revisão.

**5. Equipes**

Cadastro mestre de equipes de produção e de instalação, para uso pelos
módulos de Produção e Instalação (que referenciam essas equipes, mas não
duplicam o cadastro).

**6. Documentos do colaborador**

O sistema deve permitir registrar, por colaborador:

documentos de admissão;

certificações e treinamentos, incluindo treinamentos de segurança;

controle de entrega e validade de EPI (Equipamento de Proteção
Individual);

habilitação para operar equipamentos específicos da vidraçaria (ex.:
forno de têmpera, mesa de corte de vidro, máquinas de lapidação/
beneficiamento de borda, corte e usinagem de perfis de alumínio,
equipamentos de manuseio em campo como ventosas e talhas).

**7. Afastamentos e férias**

Registro simples de períodos de afastamento e férias (datas e motivo),
sem cálculo de valores ou encargos.

**8. Fora do escopo (decisão consciente)**

Ficam deliberadamente fora deste módulo, podendo ser revisitados no
futuro:

cálculo de folha de pagamento, encargos e rescisão;

escala/jornada de trabalho;

ponto/frequência.

Fica reservado espaço arquitetural para integração futura com um
sistema externo de folha de pagamento, sem implementar isso agora.

**9. Segurança e privacidade**

Dados de RH são dados pessoais sensíveis (LGPD). O acesso a esses dados
deve ser restrito por permissão, seguindo o princípio de menor privilégio
já definido para o projeto, e respeitando o isolamento multi-tenant.

**10. Integração com outros módulos**

**Produção e Instalação**: consultam o cadastro de equipes e de
habilitação para operar equipamentos.

**Usuários/Permissões (ADR-001)**: vínculo funcionário-usuário e
revogação de acesso no desligamento.

**Auditoria**: alterações relevantes no cadastro (admissão, mudança de
status, desligamento) devem ser registradas, seguindo o mecanismo geral
de auditoria do SaaS.

**11. MVP**

No MVP, priorizar: cadastro de funcionários, cadastro de equipes,
vínculo com usuários, e sinalização de desligamento. Documentos, EPI e
habilitações podem ser incorporados em etapa seguinte, conforme
necessidade validada no piloto.
