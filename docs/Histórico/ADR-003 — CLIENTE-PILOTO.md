**ADR-003 — CLIENTE-PILOTO**

**Documento Oficial — Versão 1.0**

**Status:** CONSOLIDADO — AGUARDANDO APROVAÇÃO FINAL\
**Tipo:** Decisão Arquitetural / Produto\
**Abrangência:** SaaS Industrial

**1. Objetivo**

Definir as diretrizes para seleção, implantação, operação,
acompanhamento, homologação e encerramento do cliente-piloto do SaaS
Industrial.

O cliente-piloto será utilizado como ambiente real e controlado para:

validar o produto;

validar os processos;

identificar problemas;

avaliar usabilidade;

testar integrações;

verificar qualidade dos dados;

avaliar estabilidade;

validar fluxos ponta a ponta;

identificar oportunidades de melhoria;

gerar aprendizado para evolução do produto.

O piloto não deverá transformar o SaaS em um projeto de desenvolvimento
sob medida.

**2. Princípio Fundamental**

O cliente-piloto participa ativamente da validação do produto, mas não
será responsável por definir unilateralmente:

arquitetura;

modelo de dados;

estrutura dos módulos;

padrões técnicos;

segurança;

multi-tenancy;

roadmap;

priorização;

evolução estrutural do produto.

O cliente fornece conhecimento operacional e feedback.

O SaaS é responsável por transformar esse aprendizado em decisões de
produto.

**O piloto valida o produto; não redefine o produto unilateralmente.**

**3. Critérios para Seleção do Cliente-Piloto**

O cliente-piloto deverá, preferencialmente, possuir uma operação
industrial real e suficientemente representativa do mercado-alvo do
SaaS.

Serão valorizados clientes que possuam, conforme aplicabilidade:

Engenharia;

PCP;

Produção;

operação de chão de fábrica;

Estoque;

Suprimentos/Compras;

Qualidade;

Expedição;

Obra;

Instalação/Montagem;

Comercial;

necessidades financeiras relacionadas à operação.

Também será desejável que a operação permita validar diferentes
situações, tais como:

produtos e componentes variados;

matérias-primas;

barras, perfis e outros materiais lineares;

diferentes processos produtivos;

produção parcial;

reprocessamento;

retrabalho;

perdas e sucatas;

compras;

recebimentos parciais;

divergências;

expedições parciais;

instalações;

ocorrências em obra.

O tamanho do cliente não será o principal critério.

O melhor piloto será aquele que combinar:

**complexidade + representatividade + colaboração + capacidade de
teste + potencial de aprendizado.**

**4. Representatividade do Piloto**

O piloto deverá gerar conhecimento potencialmente aplicável ao
mercado-alvo do SaaS.

Uma necessidade identificada exclusivamente em razão de uma
característica muito particular do cliente deverá ser tratada com
cautela.

A experiência do piloto deverá permitir distinguir:

necessidade do segmento;

necessidade operacional comum;

necessidade específica do cliente;

preferência individual;

problema de processo;

problema do produto.

O objetivo não é simplesmente reproduzir a operação do piloto, mas
utilizar a experiência para validar e aperfeiçoar um produto aplicável a
múltiplos clientes.

**5. Participação e Responsabilidades**

**5.1. Responsabilidades do cliente-piloto**

O cliente deverá:

indicar usuários-chave;

explicar seus processos;

fornecer dados necessários;

participar da parametrização;

validar regras e fluxos;

executar testes;

registrar problemas e sugestões;

homologar processos;

validar correções;

comunicar alterações de processo;

apoiar a implantação;

fornecer feedback sobre a operação real.

Poderão participar usuários-chave das áreas de:

Comercial;

Engenharia;

PCP;

Produção;

Estoque;

Suprimentos;

Qualidade;

Expedição;

Instalação;

Financeiro;

Administração.

**5.2. Responsabilidades do SaaS**

O SaaS será responsável por:

arquitetura;

padrões técnicos;

desenvolvimento;

análise das solicitações;

priorização;

correções;

controle de versões;

segurança;

isolamento de tenants;

integridade dos dados;

documentação;

testes técnicos;

releases;

decisões de produto.

**6. Feedback e Registro de Solicitações**

Toda necessidade relevante deverá ser registrada.

O registro deverá contemplar, conforme aplicabilidade:

solicitação;

problema ou necessidade;

módulo/processo;

origem;

prioridade;

impacto;

responsável;

classificação;

decisão;

status;

versão relacionada.

As solicitações poderão ser classificadas como:

correção;

melhoria;

nova funcionalidade;

configuração;

integração;

necessidade específica do cliente.

O feedback do cliente não será automaticamente convertido em requisito.

**7. Implantação, Testes e Homologação**

A implantação deverá ocorrer de forma progressiva:

**Preparação → Parametrização → Dados → Treinamento → Testes →
Homologação → Operação Assistida → Operação Real**

O cliente-piloto deverá possuir tenant próprio e ambiente adequadamente
controlado.

**Testes**

Deverão ser considerados, conforme aplicabilidade:

testes funcionais;

testes de integração;

testes ponta a ponta;

testes de exceções;

testes com usuários;

testes de homologação.

**Go-live**

A entrada em operação real deverá considerar:

processos essenciais homologados;

usuários treinados;

dados validados;

permissões configuradas;

integrações testadas;

problemas críticos tratados;

plano de contingência definido.

**8. Classificação de Problemas**

Problemas encontrados durante o piloto deverão ser classificados
conforme sua criticidade:

- **Crítico**;

- **Alto**;

- **Médio**;

- **Baixo**.

A existência de problemas não significa, por si só, fracasso do piloto.

O processo esperado será:

**Problema → Classificação → Correção → Reteste → Homologação**

**9. Limites de Customização**

O SaaS deverá permanecer um produto padrão, evolutivo e multi-tenant.

Uma necessidade específica do cliente não deverá ser automaticamente
incorporada ao produto.

As solicitações deverão ser analisadas conforme:

aplicabilidade a outros clientes;

alinhamento ao produto;

impacto arquitetural;

segurança;

manutenção;

escalabilidade;

complexidade;

benefício operacional;

viabilidade técnica.

Não deverão ser incorporadas soluções que:

criem arquitetura exclusiva;

criem dependências permanentes do piloto;

prejudiquem atualizações;

criem estruturas desnecessariamente específicas;

introduzam exceções excessivas;

comprometam o modelo multi-tenant.

**10. Problema versus Solução**

O cliente poderá apresentar tanto o problema quanto uma sugestão de
solução.

Entretanto, a análise deverá partir prioritariamente da necessidade.

**O cliente apresenta a necessidade; o SaaS define a solução.**

A solução proposta pelo cliente não deverá ser considerada obrigatória.

A equipe do SaaS deverá avaliar alternativas que possam atender ao
problema de forma mais adequada ao produto padrão.

**11. Critérios para Incorporar uma Necessidade ao Produto**

Uma necessidade poderá ser incorporada ao produto padrão quando:

tiver potencial de uso por outros clientes;

estiver alinhada ao propósito do SaaS;

não comprometer a arquitetura;

não criar dependência do piloto;

puder ser mantida e evoluída;

não gerar conflitos com outros processos;

possuir benefício justificável;

possuir complexidade compatível;

puder ser testada e documentada.

Uma necessidade inicialmente específica poderá ser reavaliada caso
demonstre relevância para o segmento.

Nesse caso, deverá ser redesenhada sob a perspectiva do produto padrão.

**12. Controle de Mudanças e Scope Creep**

Alterações de escopo durante o piloto deverão ser formalmente
registradas e avaliadas.

Não deverá ocorrer expansão descontrolada do piloto em razão de novas
solicitações.

Cada nova necessidade deverá ser analisada quanto a:

impacto no cronograma;

impacto técnico;

impacto no MVP;

impacto na implantação;

impacto nos testes;

impacto na arquitetura;

prioridade;

aplicabilidade ao produto.

O surgimento de uma necessidade durante o piloto não implica sua
implementação imediata.

**13. Critérios de Sucesso**

O sucesso do piloto será avaliado em seis dimensões:

|              |                                            |
|:------------:|--------------------------------------------|
| **Dimensão** | **Objetivo**                               |
|  Funcional   | Validar funcionalidades e processos        |
| Operacional  | Validar uso na rotina real                 |
| Usabilidade  | Avaliar facilidade de utilização           |
|  Integração  | Validar comunicação entre sistemas/módulos |
|    Dados     | Avaliar qualidade e rastreabilidade        |
| Estabilidade | Avaliar confiabilidade e desempenho        |

Deverão ser avaliados, conforme aplicabilidade:

processos críticos homologados;

problemas críticos;

ocorrências;

retrabalho;

tempo de execução;

adesão dos usuários;

volume de transações;

falhas de integração;

inconsistências;

disponibilidade;

tempo de resposta.

**14. Homologação**

O piloto será considerado homologado quando:

os processos críticos estiverem validados;

usuários-chave estiverem treinados;

dados essenciais estiverem validados;

permissões estiverem configuradas;

integrações necessárias estiverem testadas;

não existirem problemas críticos impeditivos;

os principais fluxos ponta a ponta tiverem sido executados;

houver registro formal da homologação.

**15. Governança**

Deverão existir, no mínimo:

responsável do SaaS;

responsável do cliente-piloto;

usuários-chave;

equipe técnica do SaaS, quando necessário;

responsáveis pelos processos.

Deverão ocorrer acompanhamentos periódicos para avaliar:

evolução;

testes;

homologações;

problemas;

correções;

novas necessidades;

indicadores;

riscos;

próximos passos.

Decisões relevantes deverão ser registradas.

**16. Dados e Segurança**

O cliente-piloto deverá operar como um cliente real do SaaS.

Deverá possuir:

tenant próprio;

isolamento de dados;

usuários próprios;

perfis e permissões;

configurações próprias;

histórico;

auditoria;

integrações controladas.

O acesso seguirá:

**Usuário → Perfil → Permissões → Escopo → Dados autorizados**

A participação no piloto não concederá privilégios especiais.

O cliente será responsável pela validação operacional dos dados
fornecidos.

O sistema deverá realizar validações técnicas, mas não deverá assumir
que dados fornecidos pelo cliente são operacionalmente corretos apenas
porque passaram por validação estrutural.

**17. Auditoria e Rastreabilidade**

As operações relevantes deverão permanecer rastreáveis, incluindo:

alterações de dados;

configurações;

permissões;

movimentações;

homologações;

integrações;

importações;

correções;

decisões administrativas.

Testes e homologações deverão ser controlados para evitar efeitos
indevidos na operação real.

**18. Aprendizado e Evolução do Produto**

O piloto deverá gerar aprendizado sobre:

dificuldades dos usuários;

problemas de processo;

funcionalidades de maior valor;

retrabalhos;

necessidades não previstas;

oportunidades de diferenciação;

pontos de simplificação.

Os aprendizados poderão resultar em:

correção;

configuração;

melhoria;

nova funcionalidade;

integração;

pesquisa;

alteração de processo;

não implementação.

A decisão de incorporar uma evolução permanecerá com o SaaS.

**19. Indicadores e Resultado Final**

Ao final do piloto deverá existir uma consolidação contendo:

processos homologados;

processos parcialmente homologados;

pendências;

problemas encontrados;

correções;

melhorias;

necessidades específicas;

funcionalidades incorporadas;

funcionalidades direcionadas ao roadmap;

funcionalidades rejeitadas;

indicadores;

aprendizados;

recomendações.

**20. Transição para Operação Padrão**

O piloto não deverá criar uma versão paralela do produto.

O fluxo será:

**Piloto → Homologação → Operação Padrão**

Após a transição, o cliente será tratado como cliente operacional do
SaaS, submetido aos processos normais de:

suporte;

atualizações;

segurança;

manutenção;

evolução;

incidentes;

mudanças;

monitoramento.

As configurações específicas permanecerão no tenant correspondente.

O cliente-piloto deverá continuar recebendo as evoluções do SaaS
conforme a estratégia padrão de produto.

**21. Encerramento do Piloto**

O piloto poderá ser formalmente encerrado quando:

os critérios de sucesso forem avaliados;

os processos críticos tiverem resultado definido;

pendências estiverem classificadas;

problemas críticos estiverem tratados ou formalmente aceitos;

aprendizados estiverem consolidados;

necessidades específicas estiverem classificadas;

houver decisão sobre continuidade;

a transição para operação padrão tiver sido realizada ou formalmente
decidida.

O encerramento poderá resultar em:

🟢 **Aprovado para continuidade**

🟡 **Aprovado com pendências controladas**

🟠 **Nova etapa de validação necessária**

🔴 **Não aprovado**

**22. Alterações Arquiteturais Decorrentes do Piloto**

Caso o piloto identifique necessidade de alteração em uma decisão
arquitetural existente, essa alteração deverá seguir o processo formal
de revisão arquitetural.

Nenhuma alteração estrutural deverá ser realizada informalmente apenas
para atender uma necessidade imediata do cliente-piloto.

Quando necessário, deverá ser criado ou atualizado um ADR específico.

**23. Hierarquia de Referência**

O ADR-003 deverá respeitar a seguinte hierarquia:

1.  **Arquitetura Mestre**

2.  **Escopo Geral do Projeto**

3.  **ADRs**

4.  **Especificações Funcionais dos Módulos**

5.  **Especificação Técnica**

6.  **Contratos de API/Eventos**

7.  **Modelo de Dados**

8.  **Implementação**

Em caso de conflito, prevalecerá a definição de nível superior.

**24. Decisões Arquiteturais Obrigatórias**

Ficam estabelecidas como decisões obrigatórias:

O piloto será realizado em ambiente real e controlado.

O cliente-piloto terá tenant próprio.

O piloto não será tratado como projeto de software sob medida.

O cliente participa da validação, mas não controla unilateralmente a
arquitetura.

Feedback não será automaticamente convertido em requisito.

Necessidades serão analisadas antes da definição da solução.

Customizações incompatíveis com o produto padrão não serão incorporadas.

Alterações de escopo deverão ser controladas.

Processos críticos deverão ser formalmente homologados.

Dados, acessos e operações deverão ser rastreáveis.

O piloto deverá gerar aprendizado aplicável ao produto.

O cliente deverá migrar para a operação padrão após a conclusão do
piloto.

Alterações arquiteturais deverão seguir processo formal de decisão.

O piloto não deverá criar uma arquitetura paralela ou permanente.

**25. Relação com Outros ADRs**

O ADR-003 deverá ser interpretado em conjunto com os demais ADRs do
projeto.

Especialmente:

**ADR-001 — Modelo de Permissões**

O piloto seguirá o modelo de usuários, perfis e permissões definido no
ADR-001.

**ADR-002 — Escopo do MVP**

O piloto deverá priorizar a validação do escopo definido no MVP, sem
transformar automaticamente novas necessidades em escopo obrigatório.

Os demais ADRs deverão ser considerados conforme forem definidos e
aprovados.

**26. Princípio Final**

O cliente-piloto será uma peça fundamental para validar o SaaS em
condições reais.

Entretanto, sua função será:

**testar + validar + informar + aprender + homologar**

e não:

**determinar + customizar + controlar a arquitetura + definir
unilateralmente o produto.**

O objetivo final é transformar a experiência do piloto em um produto
industrial SaaS:

robusto;

escalável;

multi-tenant;

seguro;

sustentável;

configurável;

aplicável a múltiplos clientes;

tecnicamente evolutivo.

**O piloto deve validar o produto em operação real, gerar aprendizado de
alto valor e preparar o SaaS para crescer como produto padrão.**

**STATUS DO ADR**

**ADR-003 — Cliente-Piloto**\
**Versão:** 1.0\
**Status:** CONSOLIDADO — AGUARDANDO APROVAÇÃO FINAL
