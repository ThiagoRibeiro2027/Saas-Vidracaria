**PROMPT DE IMPLEMENTAÇÃO — TÓPICO 10**

**COMERCIAL / ORÇAMENTOS**

**1. Objetivo**

Implementar o módulo **Comercial / Orçamentos** de um SaaS
industrial/manufatura, responsável por administrar o processo comercial
desde a oportunidade até a aprovação e liberação para geração do Pedido.

O módulo deverá permitir:

**Prospect/Cliente → Oportunidade → Orçamento → Engenharia → Formação de
custo/preço → Aprovações → Proposta → Negociação → Aprovação do cliente
→ Validação técnica final → Liberação → Pedido**

O módulo deverá manter rastreabilidade completa, histórico de versões,
aprovações e alterações.

Não duplicar responsabilidades dos módulos de Cadastros, Pedidos,
Engenharia, PCP, Produção, Estoque, Suprimentos, Qualidade, Expedição ou
Financeiro.

**2. Clientes, prospects e contatos**

O Comercial deverá utilizar o cadastro mestre de clientes e contatos
existente no módulo de Cadastros.

Deverá permitir trabalhar com:

cliente existente;

prospect;

cliente em prospecção;

cliente inativo.

Um prospect poderá ser convertido em cliente sem perder seu histórico
comercial.

Um cliente/prospect poderá possuir múltiplos contatos, incluindo:

compras;

financeiro;

engenharia;

recebimento;

instalação;

gestão;

outros.

O Comercial deverá manter o histórico das relações comerciais sem
duplicar o cadastro mestre.

**3. Oportunidades comerciais**

Permitir criação de oportunidade antes da elaboração do orçamento.

Dados mínimos:

cliente/prospect;

responsável;

vendedor;

representante;

origem;

descrição;

valor potencial;

probabilidade de fechamento;

previsão de fechamento;

produtos/serviços;

concorrência;

observações.

O funil deverá ser configurável.

Exemplo padrão:

**Prospecção → Contato → Levantamento → Oportunidade qualificada →
Orçamento → Negociação → Aprovação → Ganha/Perdida**

Permitir outros estágios conforme configuração da empresa.

**4. Motivos de perda**

Permitir registrar motivos configuráveis, incluindo:

preço;

prazo;

concorrente;

condição comercial;

especificação;

cliente desistiu;

projeto cancelado;

falta de orçamento;

produto inadequado;

outros.

Quando aplicável, registrar também o concorrente envolvido.

**5. Histórico comercial**

Manter histórico completo de:

oportunidades;

atividades;

orçamentos;

versões;

propostas;

negociações;

aprovações;

perdas;

pedidos resultantes;

observações;

documentos.

Exemplo de rastreabilidade:

**Oportunidade → Orçamento V1 → Orçamento V2 → Negociação → Orçamento V3
→ Aprovação → Engenharia → Pedido**

Nenhuma informação histórica relevante poderá ser apagada pela simples
alteração do registro atual.

**6. Atividades e follow-up**

Permitir registrar:

ligação;

e-mail;

reunião;

visita;

mensagem;

apresentação;

follow-up;

outros tipos configuráveis.

Cada atividade poderá possuir:

data;

horário;

responsável;

cliente;

contato;

oportunidade;

orçamento;

resultado;

próxima ação;

prazo;

observações.

Permitir controle de follow-ups vencidos e pendentes.

Notificações são opcionais e deverão ser configuráveis pela empresa.

**7. Orçamentos**

Permitir criar orçamento a partir de:

oportunidade;

cliente/prospect;

solicitação direta;

vendedor;

representante;

importação;

integração externa;

outras origens configuráveis.

Dados principais:

número;

data;

cliente/prospect;

responsável;

vendedor/representante;

validade;

condição comercial;

prazo esperado;

endereço de entrega;

itens;

quantidades;

preços;

descontos;

impostos por integração;

frete;

serviços;

instalação;

observações;

anexos.

**8. Tipos de itens**

Permitir incluir:

produtos cadastrados;

produtos configuráveis;

produtos sob medida;

conjuntos/montagens;

componentes;

matérias-primas;

serviços;

instalação;

frete;

outros itens configuráveis.

**9. Produtos configuráveis**

Para produtos configuráveis, permitir informar:

modelo;

dimensões;

quantidade;

material;

acabamento;

cor;

espessura;

componentes;

acessórios;

opções construtivas;

características especiais.

As combinações deverão respeitar as regras definidas nos cadastros e na
Engenharia.

**10. Produtos especiais e Engenharia**

Quando o produto não existir ou não puder ser configurado diretamente, o
Comercial poderá solicitar análise da Engenharia.

A solicitação poderá conter:

cliente;

orçamento;

descrição;

quantidade;

especificações;

medidas;

desenhos;

fotos;

documentos;

requisitos do cliente;

prazo desejado;

observações.

A Engenharia poderá:

utilizar solução existente;

duplicar estrutura existente;

criar nova solução;

solicitar informações;

reprovar;

devolver solução técnica;

liberar para orçamento.

O Comercial não deverá alterar diretamente uma estrutura técnica
aprovada pela Engenharia.

**11. Validação técnica durante o orçamento**

Quando necessário, a Engenharia deverá validar:

solução técnica;

dimensões;

materiais;

componentes;

configuração;

estrutura;

processos;

requisitos;

viabilidade;

documentação.

A validação poderá retornar:

aprovado;

pendente;

necessita alteração;

inviável;

aguardando informação.

**12. Formação de custos**

Permitir composição de custo com:

matérias-primas;

componentes;

insumos;

mão de obra;

processos produtivos;

terceirizações;

serviços;

instalação;

embalagem;

frete;

impostos;

comissões;

despesas;

outros componentes configuráveis.

A Engenharia poderá fornecer estrutura técnica e custos necessários.

Processos produtivos poderão considerar:

operação;

recurso;

máquina;

mão de obra;

tempo;

terceirização;

custos adicionais.

**13. Metodologia de custo**

Permitir metodologias configuráveis, como:

último custo;

custo médio;

custo de compra;

custo informado;

custo padrão;

outros.

O método utilizado deverá ficar registrado na versão do orçamento.

**14. Formação de preço**

Permitir formar preço utilizando:

**Custo + despesas + impostos + margem + demais componentes**

Suportar:

markup;

margem percentual;

margem em valor;

preço mínimo;

preço-alvo;

preço sugerido;

preço negociado.

Antes do envio ao cliente, o sistema deverá permitir visualizar
internamente:

custo;

preço;

ganho;

margem;

markup;

conformidade com políticas.

**15. Descontos**

Permitir descontos:

por item;

por grupo;

sobre o total;

por condição comercial;

por política;

negociados.

Após alteração do desconto, recalcular:

preço líquido;

valor total;

custo;

margem;

resultado.

Desconto abaixo dos limites configurados deverá gerar:

bloqueio;

alerta;

ou aprovação,

conforme política da empresa.

**16. Cenários comerciais**

Permitir simulação de diferentes cenários de:

preço;

quantidade;

desconto;

margem;

prazo;

condição de pagamento;

frete;

instalação.

Os cenários não aprovados não deverão alterar a versão oficial do
orçamento.

**17. Condições comerciais**

Permitir:

condição de pagamento;

prazo de entrega;

validade;

frete;

instalação;

descontos;

acréscimos;

impostos;

comissões;

outras condições configuráveis.

Permitir tabelas de preços por:

cliente;

grupo;

produto;

família;

quantidade;

condição comercial.

As tabelas deverão possuir vigência.

**18. Condições específicas do cliente**

Permitir cadastrar ou aplicar automaticamente condições específicas,
como:

tabela;

desconto;

prazo;

pagamento;

frete;

comissão;

outras condições.

Alterações fora da política poderão exigir aprovação.

**19. Negociação**

Manter histórico de:

preço inicial;

contrapropostas;

descontos;

quantidade;

especificações;

prazo;

pagamento;

frete;

instalação;

observações;

responsável;

data/hora.

Nunca sobrescrever uma condição anteriormente apresentada.

Alterações relevantes deverão gerar nova versão.

**20. Versionamento**

O orçamento deverá possuir versões independentes.

Exemplo:

**V1 → enviada → negociação → V2 → enviada → V3 → aprovada**

Uma versão enviada ou aprovada não poderá ser sobrescrita.

Cada versão deverá preservar:

itens;

quantidades;

configurações;

custos;

preços;

descontos;

margens;

condições;

prazo;

documentos;

informações técnicas.

Alterações técnicas deverão estar vinculadas à versão correspondente.

**21. Aprovação interna**

Implementar matriz de aprovação configurável considerando:

valor;

desconto;

margem;

preço mínimo;

condição de pagamento;

prazo;

produto;

cliente;

exceção comercial;

outros critérios.

Permitir múltiplos níveis de aprovação.

Exemplo:

**Vendedor → Supervisor → Gerente → Diretoria**

Não fixar cargos ou níveis no código.

**22. Informações internas**

Informações como:

custo;

margem;

markup;

preço mínimo;

custos internos;

regras de aprovação;

observações internas;

não poderão ser exibidas ao cliente, salvo configuração explícita.

**23. Proposta comercial**

Gerar proposta a partir de uma versão específica do orçamento.

Permitir configurar:

identidade visual;

logotipo;

cabeçalho;

rodapé;

textos padrão;

condições gerais;

campos exibidos;

assinatura;

contatos;

modelos diferentes.

A proposta deverá conter, quando aplicável:

cliente;

contato;

número;

data;

validade;

itens;

quantidades;

preços;

descontos;

total;

impostos;

frete;

instalação;

prazo;

pagamento;

condições;

observações;

anexos.

**24. Documentos e anexos**

Permitir anexar:

desenhos;

imagens;

memoriais;

especificações;

fichas técnicas;

catálogos;

documentos comerciais;

documentos técnicos.

Cada documento deverá possuir controle sobre ser:

interno;

compartilhável com cliente;

enviado junto à proposta.

**25. Envio da proposta**

Registrar:

data/hora;

responsável;

destinatário;

versão enviada;

canal;

observação;

status de entrega quando houver integração.

Canais:

e-mail;

portal;

integração;

outros.

**26. Validade da proposta**

Toda proposta deverá possuir validade.

O sistema deverá:

controlar vencimento;

alertar proximidade;

identificar propostas vencidas;

permitir renovação;

registrar renovação;

preservar a versão anterior;

impedir aprovação de proposta vencida, salvo autorização;

permitir reativação conforme regra configurável.

Não alterar silenciosamente a validade de uma versão já enviada.

**27. Aceite do cliente**

Permitir aceite por:

portal;

assinatura eletrônica;

confirmação registrada pelo Comercial;

documento assinado;

outros meios configuráveis.

Armazenar evidência do aceite.

**28. Aprovação parcial**

Permitir aprovação parcial de um orçamento.

Exemplo:

**10 itens orçados → cliente aprova 6 → somente os 6 aprovados podem
gerar Pedido.**

Manter os demais itens vinculados ao orçamento original.

**29. Validação técnica FINAL antes do Pedido**

Esta é uma etapa obrigatória quando a Engenharia for aplicável.

Após a aprovação do cliente, a versão efetivamente aprovada deverá
passar pela validação final da Engenharia antes de poder ser convertida
em Pedido.

A Engenharia deverá confirmar:

especificações;

dimensões;

quantidades;

materiais;

componentes;

acessórios;

acabamentos;

configurações;

desenhos;

documentos;

requisitos especiais;

viabilidade;

estrutura/BOM;

processos;

informações necessárias para PCP/Produção.

Resultados possíveis:

**Liberado tecnicamente**

**Liberado com ressalva**, se permitido pela política.

**Retornado/Pendente**

**Reprovado**

Se houver pendência obrigatória, o Pedido não poderá ser criado.

**30. Controle da versão técnica**

A validação final deverá estar vinculada à versão exata do orçamento
aprovada pelo cliente.

Exemplo:

**Orçamento V1 → Engenharia → V2 → negociação → V3 aprovada → Engenharia
valida V3 → Pedido**

Se houver qualquer alteração relevante depois da validação:

**nova versão → nova validação técnica.**

Uma aprovação técnica anterior não poderá ser reutilizada
automaticamente para uma versão diferente.

**31. Conversão em Pedido**

A conversão deverá ocorrer somente quando todas as condições
obrigatórias estiverem cumpridas:

aprovação comercial;

aprovação do cliente;

aprovação das exceções;

validação técnica, quando aplicável;

demais requisitos configurados.

A conversão deverá preservar:

**Oportunidade → Orçamento → Versão → Aprovações → Engenharia → Pedido**

Transferir para o Pedido:

cliente;

contatos relevantes;

itens;

quantidades;

configurações;

preços;

descontos;

condições;

prazo;

endereço;

documentos;

observações;

versão técnica;

origem comercial.

O Pedido passa a ser o documento operacional oficial da venda.

O Comercial não deverá duplicar os processos operacionais dos demais
módulos.

**32. Status do orçamento**

Utilizar, no mínimo:

Rascunho;

Em elaboração;

Em análise;

Aguardando aprovação;

Enviado ao cliente;

Em negociação;

Aprovado;

Rejeitado;

Expirado;

Cancelado;

Convertido em Pedido.

Os status deverão ser configuráveis.

**33. Integração com Engenharia**

**Comercial envia:**

especificações;

configuração;

quantidade;

documentos;

requisitos;

prazo desejado.

**Engenharia retorna:**

solução;

estrutura;

custos;

processos;

pendências;

validação técnica.

**34. Integração com Pedidos**

Ao converter:

**Comercial → Pedido**

Preservar a origem e a versão aprovada.

O Pedido deverá permitir rastrear de qual:

oportunidade;

orçamento;

versão;

negociação;

aprovação;

validação técnica;

ele foi originado.

**35. Integração com Financeiro**

Enviar informações comerciais necessárias para:

faturamento;

valores;

descontos;

condições;

pagamento;

comissões.

O Financeiro permanece responsável pela execução financeira.

**36. Integração com BI**

Disponibilizar dados para indicadores de:

oportunidades;

orçamentos;

propostas;

conversão;

vendas;

margem;

descontos;

perdas;

previsão;

vendedores;

representantes;

clientes;

produtos;

concorrentes;

prazo de fechamento.

**37. Indicadores comerciais**

Implementar indicadores de:

**Orçamentos**

quantidade;

valor;

ticket médio;

enviados;

aprovados;

rejeitados;

expirados;

cancelados;

convertidos.

**Conversão**

taxa de conversão;

por vendedor;

por representante;

por cliente;

por produto;

por família;

por período.

**Margem**

margem média;

margem por vendedor;

margem por produto;

margem por cliente;

descontos;

vendas abaixo da margem-alvo.

**Funil**

oportunidades por etapa;

valor por etapa;

tempo em cada etapa;

oportunidades paradas;

ganhas;

perdidas.

**38. Previsão comercial**

Permitir acompanhar:

valor total das oportunidades;

valor ponderado;

previsão mensal;

previsão por vendedor;

previsão por equipe;

previsão por representante;

previsão por cliente;

previsão por produto;

oportunidades em risco.

O cálculo ponderado deverá ser configurável.

**39. Previsto × realizado**

Após a conversão em Pedido e posterior execução, permitir comparar:

**Orçado × Vendido × Realizado**

Incluindo, quando disponível:

valor orçado;

preço aprovado;

custo estimado;

margem estimada;

valor vendido;

custo realizado;

margem realizada.

**40. Concorrência**

Permitir registrar:

concorrente;

produto/solução concorrente;

preço conhecido;

condição;

motivo da vantagem;

motivo da perda;

observações.

**41. Responsabilidade comercial**

Permitir definir:

responsável principal;

vendedor;

representante;

equipe;

participantes.

Permitir regras de acesso e alteração conforme permissões.

**42. Auditoria**

Registrar alterações críticas:

usuário;

data/hora;

versão anterior;

nova versão;

aprovação;

rejeição;

alteração de preço;

alteração de desconto;

alteração de margem;

alteração de condição;

alteração técnica;

envio;

aceite;

conversão em Pedido.

**43. Regras de integridade**

Implementar obrigatoriamente:

Nunca sobrescrever versões enviadas/aprovadas.

Toda alteração relevante deverá ser rastreável.

A Engenharia não poderá ser substituída pelo Comercial na definição
técnica.

O Pedido somente poderá ser criado quando os requisitos obrigatórios
estiverem cumpridos.

A validação final da Engenharia deve corresponder à versão efetivamente
aprovada pelo cliente.

Proposta vencida não poderá ser aprovada sem regra/autorização.

Informações internas não poderão aparecer na proposta ao cliente.

Aprovação parcial deverá ser suportada.

O Pedido deverá preservar a origem comercial.

O Comercial não deverá duplicar responsabilidades de outros módulos.

**44. Arquitetura funcional esperada**

Estruturar o módulo de forma preparada para:

multiempresa;

múltiplos usuários;

permissões;

auditoria;

versionamento;

workflows configuráveis;

aprovações;

integrações;

BI;

evolução futura.

Não criar regras rígidas que impeçam a empresa de configurar:

etapas;

alçadas;

políticas;

status;

condições;

metodologias;

notificações;

critérios de aprovação;

regras de Engenharia.

**45. Fluxo definitivo**

O fluxo principal deverá ser:

**Cliente/Prospect**\
→ **Oportunidade**\
→ **Orçamento**\
→ **Definição/validação técnica**\
→ **Custos**\
→ **Preço**\
→ **Aprovação interna**\
→ **Proposta**\
→ **Negociação**\
→ **Nova versão, se necessário**\
→ **Aprovação do cliente**\
→ **Validação técnica final**\
→ **Liberação**\
→ **Pedido**

Após o Pedido:

**Pedido → Engenharia → PCP → Produção → Estoque → Qualidade → Expedição
→ Financeiro → BI**

O módulo Comercial deverá manter a rastreabilidade da origem sem assumir
a execução dos processos dos demais módulos.

**Objetivo final do módulo**

Garantir que a empresa saiba, antes de transformar uma negociação em
Pedido:

**o que está vendendo, para quem está vendendo, quanto está vendendo,
por qual preço, com qual margem, sob quais condições e se a solução foi
tecnicamente validada.**

A conversão em Pedido deverá representar uma venda **comercialmente
aprovada e tecnicamente consistente**, preservando todo o histórico da
negociação.
