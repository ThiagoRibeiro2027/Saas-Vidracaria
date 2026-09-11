**CONTEXTO**

Você está implementando o Tópico 7 — Suprimentos e Compras de um sistema
SaaS de gestão empresarial.

IMPORTANTE:

Este projeto SaaS é independente da USIMETAL e do Consistem.

Não utilizar, assumir ou criar dependências de processos, regras,
cadastros, integrações ou particularidades dessas empresas/sistemas.

O módulo deve ser desenvolvido como uma solução SaaS genérica,
multiempresa, parametrizável e preparada para futuras integrações.

**OBJETIVO**

Implementar um módulo completo de Suprimentos e Compras responsável por
controlar o ciclo:

Necessidade → Solicitação → Cotação → Negociação → Aprovação → Pedido de
Compra → Recebimento → Conferência → Estoque → Consumo.

O sistema deve atender compras de matérias-primas, componentes, insumos,
materiais auxiliares, produtos, serviços e demais categorias
configuráveis.

**PRINCÍPIO CENTRAL**

O sistema deve funcionar como orientador e automatizador.

Ele deve calcular, sugerir, comparar, alertar, consolidar e recomendar.

Porém, a decisão final de negócio deve permanecer com o operador
autorizado.

Não assumir automaticamente que a recomendação do sistema deve ser
executada.

O usuário autorizado deve poder escolher outro fornecedor, alterar
quantidade, comprar acima da necessidade, manter excedentes, rejeitar
uma recomendação ou tomar outra decisão permitida pelas regras.

Quando exigido pela configuração, registrar a justificativa.

**FUNCIONALIDADES**

**1. GERAÇÃO DE NECESSIDADES**

Implementar necessidades automáticas originadas de:

pedidos;

planejamento;

produção;

BOM;

estoque mínimo;

estoque de segurança;

ponto de reposição;

consumo previsto;

reservas;

compromissos;

compras abertas;

materiais em trânsito;

produção prevista;

perdas previstas.

Permitir também criação manual.

**2. COMPRAS DIRETAS**

Permitir compras sem Solicitação de Compra quando o usuário possuir
autorização.

Registrar obrigatoriamente ou opcionalmente, conforme configuração:

motivo;

justificativa;

responsável;

data;

vínculos.

Motivos padrão:

oportunidade de mercado;

compra para estoque;

antecipação;

condição comercial;

lote econômico;

reposição;

emergência;

outro.

**3. MOTOR DE NECESSIDADES**

Criar motor de cálculo considerando:

Estoque disponível

compras abertas

materiais em trânsito

produção prevista

outros recebimentos previstos

reservas

compromissos

consumo previsto

necessidades já atendidas.

O resultado será o saldo projetado e a necessidade de aquisição.

Não gerar compras duplicadas.

Permitir parametrização das regras.

**4. ESTOQUE E SOBRAS**

Antes de recomendar uma compra, verificar:

estoque;

reservas;

sobras;

materiais equivalentes;

materiais alternativos;

compras abertas;

trânsito;

compras programadas.

Implementar aproveitamento de sobras para materiais dimensionais.

**5. MATERIAIS DIMENSIONAIS**

Suportar:

barras;

perfis;

tubos;

chapas;

bobinas;

rolos;

materiais por comprimento;

materiais por peso;

materiais por área;

outros.

Controlar:

quantidade adquirida;

quantidade consumida;

sobra gerada.

Suportar dimensões configuráveis.

**6. UNIDADES**

Permitir unidades diferentes entre:

compra;

estoque;

consumo.

Criar mecanismo de conversão parametrizável.

**7. CONSOLIDAÇÃO**

Permitir consolidar necessidades compatíveis.

A consolidação pode ser:

automática;

sugerida;

manual.

Nunca perder a rastreabilidade das necessidades originais.

**8. COMPRA ACIMA DA NECESSIDADE**

Permitir aquisição acima da necessidade.

Motivos possíveis:

lote mínimo;

preço;

frete;

oportunidade;

estoque estratégico;

antecipação;

condição comercial.

Controlar o excedente.

**9. EXCEDENTE**

O excedente deve inicialmente permanecer como estoque não vinculado.

O sistema poderá sugerir vinculação a necessidades futuras compatíveis.

A decisão final é do operador.

**10. POLÍTICAS DE ABASTECIMENTO**

Implementar parametrização para:

compra sob demanda;

estoque mínimo;

segurança;

ponto de reposição;

lote mínimo;

lote econômico;

múltiplos;

embalagem;

frequência;

fornecedor preferencial.

**11. LEAD TIME**

Calcular data recomendada de compra considerando:

fabricação;

fornecedor;

transporte;

recebimento;

inspeção;

calendário;

feriados.

Relacionar data necessária com prazo de aquisição.

**12. MAPA DE COMPRAS FUTURAS**

Criar visão futura de suprimentos.

Exibir:

necessidades;

estoque projetado;

compras abertas;

trânsito;

compras previstas;

data necessária;

data recomendada de compra;

risco de ruptura.

Permitir filtros e horizonte configurável.

**13. FORNECEDORES**

Implementar cadastro completo de fornecedores.

Permitir múltiplos fornecedores por item.

**14. FORNECEDORES ALTERNATIVOS**

Permitir definir:

principal;

alternativos;

prioridade;

homologação;

condições;

restrições.

**15. MATERIAIS ALTERNATIVOS**

Permitir equivalências.

Substituições podem exigir aprovação conforme regras configuráveis.

Registrar toda substituição.

**16. SOLICITAÇÃO DE COMPRA**

Implementar SC com:

número;

data;

solicitante;

setor;

centro de custo;

prioridade;

justificativa;

itens;

quantidades;

unidades;

data necessária;

aplicação;

vínculos;

observações;

anexos;

status.

Permitir múltiplos itens.

**17. COTAÇÃO**

Permitir cotação com múltiplos fornecedores.

Comparar:

preço;

desconto;

impostos;

frete;

custo total;

prazo;

pagamento;

lote;

quantidade;

validade;

qualidade;

histórico.

Os critérios devem ser configuráveis.

**18. COTAÇÃO PARCIAL**

Permitir dividir uma cotação entre fornecedores.

Gerar múltiplos Pedidos de Compra quando necessário.

**19. NEGOCIAÇÃO**

Registrar:

preço inicial;

contraproposta;

preço final;

condição inicial;

condição final;

responsável;

data;

observações.

Calcular economia.

**20. HISTÓRICO DE PREÇOS**

Manter histórico por item/fornecedor.

Permitir comparações e alertas de variação.

**21. CUSTO TOTAL**

Permitir comparar fornecedores pelo custo total:

Preço + impostos + frete + outros custos.

Não selecionar automaticamente o menor preço.

**22. APROVAÇÕES**

Criar workflow configurável.

Regras podem considerar:

valor;

setor;

centro de custo;

categoria;

fornecedor;

tipo;

urgência;

projeto;

unidade.

Permitir múltiplas etapas.

**23. ALÇADAS**

Criar mecanismo configurável de alçadas.

Não codificar valores fixos.

A empresa deve definir:

limites;

responsáveis;

etapas;

exceções.

**24. PEDIDO DE COMPRA**

Implementar PC com:

fornecedor;

itens;

quantidades;

unidades;

preços;

descontos;

impostos;

frete;

prazo;

pagamento;

entrega;

centro de custo;

projeto;

pedido;

OP;

observações;

anexos;

responsável;

status.

**25. COMPRAS RECORRENTES**

Suportar:

recorrências;

contratos;

acordos;

pedidos programados;

entregas futuras;

quantidades programadas;

datas programadas.

**26. ESTOQUE EM TRÂNSITO**

Controlar estados distintos:

disponível;

reservado;

comprometido;

comprado;

trânsito;

recebido;

conferência;

quarentena;

disponível para consumo.

Compra não significa estoque disponível.

**27. RECEBIMENTO**

Suportar:

total;

parcial;

múltiplos recebimentos;

por item;

por quantidade;

divergência;

recusa;

devolução.

**28. CONFERÊNCIA E QUALIDADE**

Permitir fluxo configurável:

Recebimento → Conferência → Qualidade → Estoque

ou:

Recebimento → Estoque.

Suportar quarentena.

**29. LOTES**

Controlar, quando aplicável:

lote;

fabricação;

validade;

certificado;

fornecedor;

documento;

origem.

**30. DIVERGÊNCIAS**

Registrar:

quantidade;

preço;

item;

qualidade;

lote;

documentação;

atraso;

avaria;

outras.

Controlar responsável, status e tratamento.

**31. DEVOLUÇÕES**

Implementar devoluções totais e parciais.

Atualizar os saldos correspondentes.

**32. COMPRAS EMERGENCIAIS**

Criar fluxo específico.

Registrar:

motivo;

justificativa;

responsável;

aprovação;

fornecedor;

valor;

impacto.

Gerar indicadores.

**33. ORÇAMENTO**

Controlar:

Orçado × Comprometido × Realizado.

Permitir filtros por:

setor;

centro de custo;

categoria;

período;

projeto;

unidade.

**34. SERVIÇOS**

Implementar tratamento simples para compras de serviços.

Controlar:

descrição;

fornecedor;

quantidade;

unidade;

preço;

prazo;

aprovação;

pedido;

aceite;

documentos;

centro de custo;

projeto.

Não implementar gestão avançada de contratos no MVP.

**35. AVALIAÇÃO DE FORNECEDORES**

Calcular indicadores de:

prazo;

atraso;

divergências;

rejeições;

qualidade;

preço;

ocorrências;

volume.

Permitir score configurável.

**36. DOCUMENTOS**

Permitir anexos em todas as etapas relevantes.

**37. AUDITORIA**

Registrar alterações importantes:

usuário;

data/hora;

campo;

valor anterior;

novo valor;

justificativa, quando necessária.

**38. DASHBOARD**

Criar indicadores de:

necessidades;

solicitações;

cotações;

aprovações;

pedidos;

atrasos;

recebimentos;

emergências;

valores;

economia;

preços;

fornecedores;

lead time;

necessidades futuras.

**39. RASTREABILIDADE**

Todo processo deve possuir vínculos entre as etapas.

Deve ser possível navegar:

Pedido → Necessidade → SC → Cotação → Negociação → Aprovação → PC →
Recebimento → Estoque → Consumo.

Também permitir consulta reversa da origem e destino dos materiais.

**MOTOR DE CONFIGURAÇÃO**

Criar estrutura parametrizável para:

políticas de abastecimento;

estoque;

sobras;

consolidação;

lotes;

múltiplos;

fornecedores;

fornecedores alternativos;

materiais alternativos;

lead times;

aprovações;

alçadas;

critérios de cotação;

critérios de comparação;

tolerâncias;

inspeção;

emergências;

orçamento.

Evitar regras fixas no código sempre que representarem decisões de
negócio.

**PERMISSÕES**

Todas as operações críticas deverão respeitar o sistema de usuários,
perfis e permissões.

Exemplos de permissões:

criar necessidade;

criar compra direta;

criar SC;

cotar;

negociar;

escolher fornecedor;

alterar quantidade;

aprovar;

gerar PC;

receber;

aceitar divergência;

devolver;

alterar regras;

configurar alçadas.

**INTEGRAÇÕES**

Preparar interfaces para:

Pedidos;

Produtos;

Engenharia;

BOM;

Planejamento;

Produção;

Estoque;

Financeiro;

Cadastros;

Usuários;

BI;

módulos futuros.

Não criar dependência obrigatória de ERP externo.

**REQUISITOS DE IMPLEMENTAÇÃO**

Priorizar arquitetura modular.

Separar claramente regras de negócio, persistência e interface.

Utilizar entidades relacionais consistentes.

Manter histórico e auditoria.

Garantir rastreabilidade entre todos os documentos.

Evitar duplicidade de necessidades e compras.

Permitir operações parciais.

Não apagar informações transacionais relevantes.

Utilizar status e transições de estado bem definidos.

Validar permissões antes de operações críticas.

Preparar a arquitetura para multiempresa.

Não criar regras específicas para USIMETAL, Consistem ou qualquer
empresa externa.

Não assumir que o menor preço representa a melhor compra.

Não executar decisões de negócio automaticamente sem
autorização/configuração.

Toda automação deverá respeitar as regras configuradas pela empresa.

**CRITÉRIO DE CONCLUSÃO**

O Tópico 7 será considerado implementado quando for possível executar,
no sistema, pelo menos o seguinte fluxo completo:

Criar ou gerar necessidade.

Verificar estoque, sobras, compras abertas e trânsito.

Calcular necessidade líquida.

Consolidar necessidades quando aplicável.

Criar Solicitação de Compra ou compra direta autorizada.

Selecionar fornecedores.

Solicitar e registrar cotações.

Comparar propostas.

Registrar negociação.

Permitir decisão manual do comprador.

Submeter à aprovação conforme alçada.

Gerar Pedido de Compra.

Controlar material em trânsito.

Receber total ou parcialmente.

Registrar divergências.

Realizar conferência/qualidade quando aplicável.

Atualizar estoque.

Manter rastreabilidade.

Registrar auditoria.

Alimentar indicadores e dashboard.

Exibir necessidades futuras e recomendações de compra.

A implementação deve privilegiar flexibilidade e parametrização,
mantendo a empresa responsável pelas decisões e metodologias de
operação.
