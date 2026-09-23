**RELAÇÃO DE SUBOPERADORES DE DADOS PESSOAIS**

**Documento para:** empresa-cliente (operadora dos dados de seus
próprios clientes, fornecedores e funcionários dentro do sistema)\
**Versão:** 1.0\
**Data:** 23/09/2026\
**Referência interna:** RUNBOOK-SUBOPERADORES-LGPD.md, ADR-010 §10

**1. O que é este documento**

Esta é a relação dos prestadores de serviço (suboperadores) que a
plataforma utiliza para tratar dados pessoais em nome da sua empresa,
conforme exigido pela Lei Geral de Proteção de Dados (LGPD, art. 39).
Ela é mantida atualizada e disponibilizada sempre que houver mudança
relevante.

**2. Suboperadores atualmente em uso**

| Prestador | O que faz | Dado pessoal tratado | Onde os dados ficam |
|---|---|---|---|
| **Supabase** | Banco de dados, login/autenticação e armazenamento de arquivos da plataforma | Todos os dados pessoais cadastrados no sistema: perfis de usuário, clientes, fornecedores, funcionários, documentos anexados | São Paulo, Brasil |
| **Vercel** | Hospedagem da aplicação web | Dados pessoais em trânsito durante o uso do sistema (processados, não armazenados nesta camada) | São Paulo, Brasil |
| **Resend** | Envio de e-mails automáticos (alertas e notificações do sistema) | Nome e e-mail do destinatário; o conteúdo do e-mail pode referenciar informações do seu negócio (ex.: número de um pedido) | Estados Unidos — ver nota na seção 3 |

**3. Nota sobre o Resend (envio de e-mail)**

O Resend é uma empresa sediada nos Estados Unidos. A confirmação da
política de residência/processamento de dados desse fornecedor está em
andamento; enquanto isso não for formalizado, o envio de e-mail deve
ser tratado como uma transferência internacional de dados, sujeita às
garantias exigidas pela LGPD para esse tipo de transferência. Esta
seção será atualizada assim que a confirmação (ou a formalização da
transferência internacional) estiver concluída.

**4. Serviços previstos, ainda não em uso**

Os seguintes serviços fazem parte do desenho da plataforma mas **ainda
não processam nenhum dado real**, porque ainda não foram
implementados: notificação por push e meio de pagamento integrado.
Quando entrarem em operação, esta relação será atualizada antes de
tratarem qualquer dado pessoal.

**5. Como esta relação é mantida**

Ela é revisada sempre que um novo prestador de serviço é adicionado à
plataforma, antes de qualquer decisão de colocar dados reais em
produção, e sempre que um dos prestadores acima muda seus próprios
subcontratados. A versão mais atual pode ser solicitada a qualquer
momento.
