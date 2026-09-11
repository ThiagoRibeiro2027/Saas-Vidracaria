**PROMPT DE DESENVOLVIMENTO — TÓPICO 11: FINANCEIRO**

**1. CONTEXTO DO PROJETO**

Desenvolver o módulo **Financeiro** de um sistema SaaS industrial
multiempresa.

O sistema deve atender diferentes empresas, mantendo isolamento absoluto
dos dados entre empresas por meio de company_id e políticas de
segurança/RLS.

O módulo Financeiro deve controlar a operação financeira e fornecer
visão gerencial da empresa, sem pretender substituir sistemas contábeis
ou fiscais especializados.

O desenvolvimento deve priorizar:

consistência financeira;

rastreabilidade;

auditoria;

segurança;

multiempresa;

parametrização por empresa;

integração com os demais módulos;

ausência de duplicidade de lançamentos;

preservação do histórico;

possibilidade de integração futura com bancos, sistemas fiscais e outros
serviços.

**2. PRINCÍPIOS FINANCEIROS FUNDAMENTAIS**

Implementar claramente os seguintes conceitos:

**Previsão**

Valor que a empresa espera receber ou pagar.

**Orçamento**

Valor planejado pela empresa para determinado período e classificação.

**Compromisso financeiro**

Obrigação de pagar ou direito de receber.

**Liquidação**

Pagamento ou recebimento total ou parcial de um compromisso.

**Movimento financeiro**

Movimentação efetiva de dinheiro em uma conta financeira ou caixa.

A relação conceitual principal é:

**Previsão → Compromisso → Liquidação → Movimento**

Porém, o sistema não deve obrigar essa sequência em todos os casos.

Exemplos:

uma previsão pode nunca virar compromisso;

um compromisso pode ser criado sem previsão;

um compromisso pode ser parcialmente liquidado;

um título pode ser liquidado por vários movimentos;

um movimento bancário pode existir sem compromisso, como uma tarifa
bancária.

**3. ESTRUTURA FINANCEIRA**

Criar estrutura financeira configurável por empresa.

**3.1 Plano de Contas**

Permitir:

plano hierárquico;

contas sintéticas;

contas analíticas;

classificação para DRE gerencial;

contas de receita;

contas de despesa;

contas financeiras;

contas patrimoniais necessárias à operação gerencial.

O plano de contas deve ser independente das categorias financeiras.

**3.2 Categorias Financeiras**

Criar categorias financeiras independentes do plano de contas.

**3.3 Centros de Custo**

Permitir:

centros de custo;

hierarquia;

departamentos;

unidades;

fábricas;

projetos;

demais estruturas configuradas pela empresa.

Permitir rateio:

manual;

por regras previamente configuradas.

**3.4 Contas Financeiras**

Permitir cadastro de:

conta corrente;

conta de pagamento;

conta de investimento;

caixa físico;

outros tipos necessários.

Dados:

descrição;

tipo;

instituição;

agência;

número da conta;

moeda;

saldo inicial;

data do saldo inicial;

status;

empresa.

No MVP, utilizar BRL como moeda principal, mas estruturar o modelo para
futura operação multicurrency.

**4. PERÍODOS FINANCEIROS**

Permitir:

abertura de período;

fechamento;

consulta;

reabertura mediante autorização.

Após fechamento:

impedir alterações comuns;

impedir exclusões;

exigir correções/reversões autorizadas;

registrar auditoria.

Toda reabertura deve registrar:

usuário;

data/hora;

motivo.

**5. IDENTIFICAÇÃO DOS DOCUMENTOS**

Criar identificadores únicos para documentos financeiros.

Exemplos:

CP — Contas a Pagar;

CR — Contas a Receber;

MOV — Movimento;

TRF — Transferência;

CON — Contrato financeiro.

Os códigos devem ser únicos dentro da empresa e possuir estrutura
preparada para crescimento.

**6. CONTAS A PAGAR**

**6.1 Origem**

Permitir criação a partir de:

compras;

notas fiscais;

contratos;

despesas recorrentes;

serviços;

comissões;

empréstimos;

financiamentos;

outros módulos;

lançamentos manuais autorizados;

futuras importações.

**6.2 Dados**

Cada título deve possuir, conforme aplicável:

fornecedor/beneficiário;

documento;

data de emissão;

data de competência;

valor original;

vencimento;

condição de pagamento;

parcela;

plano de contas;

centro de custo;

categoria;

origem;

empresa;

observações;

usuário responsável.

**6.3 Parcelamento**

Permitir geração automática de parcelas.

Cada parcela deve possuir controle individual.

Garantir que a soma das parcelas seja exatamente igual ao valor
original, inclusive tratando diferenças de centavos.

**6.4 Status**

Utilizar pelo menos:

Em aberto;

Parcialmente pago;

Vencido;

Pago;

Cancelado;

Renegociado.

**6.5 Pagamentos**

Permitir:

pagamento integral;

pagamento parcial;

múltiplos pagamentos para um mesmo título;

descontos;

abatimentos;

juros;

multas;

outras despesas financeiras.

Os valores adicionais devem permanecer separados do valor original.

O pagamento deve gerar movimento financeiro e vinculá-lo ao título.

**6.6 Aprovação**

Permitir configurar aprovação por:

valor;

fornecedor;

categoria;

centro de custo;

outras regras.

**6.7 Renegociação**

Nunca sobrescrever silenciosamente o título original.

A renegociação deve:

preservar o título original;

registrar a renegociação;

criar novo compromisso conforme necessário;

preservar condições anteriores;

registrar usuário, data e motivo.

**6.8 Recorrências**

Permitir despesas recorrentes configuráveis.

**6.9 Dashboard**

Disponibilizar:

vencendo hoje;

vencidos;

próximos 7 dias;

próximos 30 dias;

total em aberto;

aprovados;

aguardando aprovação.

**7. CONTAS A RECEBER**

**7.1 Origem**

Permitir geração a partir de:

pedidos;

faturamento;

notas fiscais;

contratos;

serviços;

outras receitas;

adiantamentos;

lançamentos manuais autorizados;

integrações futuras.

**7.2 Dados**

Controlar:

cliente;

documento;

data de emissão;

competência;

valor original;

vencimento;

condição de pagamento;

parcela;

plano de contas;

centro de custo;

categoria;

origem;

empresa;

observações;

usuário.

**7.3 Status**

Em aberto;

Parcialmente recebido;

Vencido;

Recebido;

Cancelado;

Renegociado.

**7.4 Recebimentos**

Permitir:

recebimento integral;

recebimento parcial;

múltiplos movimentos para um título;

juros;

multas;

descontos;

abatimentos;

diferenças autorizadas.

O recebimento deve:

gerar movimento financeiro;

vincular movimento ao título;

atualizar saldo do título;

atualizar saldo da conta financeira.

**7.5 Inadimplência**

Criar controle configurável de:

dias de atraso;

faixas de aging;

exposição;

histórico;

ações de cobrança.

**7.6 Limite de crédito**

Preparar integração com Comercial.

Permitir cálculo configurável de:

**Limite aprovado − contas a receber em aberto − pedidos comprometidos =
crédito disponível**

O comportamento de bloqueio deve ser configurável pela empresa.

**7.7 Cobrança**

Registrar histórico:

data;

usuário;

canal;

observação;

promessa de pagamento;

resultado.

Permitir promessa de pagamento com:

valor;

data prevista.

**8. FLUXO DE CAIXA**

Implementar dois conceitos distintos:

**Fluxo realizado**

Baseado em movimentos financeiros efetivamente ocorridos.

**Fluxo projetado**

Baseado em compromissos e previsões futuras.

Nunca misturar os dois conceitos sem identificação clara.

**8.1 Visualizações**

Permitir:

diário;

semanal;

mensal;

anual;

período personalizado.

Agrupamento por:

dia;

semana;

mês;

categoria;

centro de custo;

conta financeira.

**8.2 Contas**

Permitir:

visão por conta;

caixa;

bancos;

consolidado.

**8.3 Transferências**

Transferências internas:

**não são receita nem despesa.**

Exemplo:

Banco A → Banco B

O sistema deve registrar saída e entrada nas respectivas contas, mas o
fluxo consolidado deve ter efeito líquido zero.

**8.4 Alertas**

Permitir alerta de saldo projetado negativo.

**9. FATURAMENTO E RECEITAS**

Manter separação clara entre:

**Venda → Faturamento → Nota Fiscal → Contas a Receber → Recebimento →
Movimento**

Não considerar faturamento como recebimento.

**9.1 Faturamento**

Permitir:

faturamento integral;

faturamento parcial;

vários faturamentos para um pedido;

várias NFs para um pedido;

múltiplos pedidos em uma NF quando legal/fiscalmente aplicável;

serviços;

outras operações;

lançamento manual autorizado;

integração fiscal futura.

Exemplo:

Pedido = R\$ 100.000

Faturamento:

R\$ 40.000;

R\$ 60.000.

**9.2 Cancelamentos**

Cancelamento não deve apagar histórico.

Deve:

registrar cancelamento;

ajustar compromisso relacionado;

tratar recebimentos anteriores por reversão, devolução ou ajuste
conforme o caso.

**9.3 Devoluções**

Permitir:

ajuste;

devolução;

crédito ao cliente;

restituição;

compensação.

Sempre preservar a transação original.

**9.4 Outras receitas**

Permitir:

juros;

rendimentos;

venda de ativos;

indenizações;

outras receitas.

**10. CAIXA, BANCOS E MOVIMENTAÇÕES**

**10.1 Saldo**

O saldo da conta financeira deve ser consequência dos movimentos.

Não permitir edição livre do saldo.

Diferenças devem ser corrigidas por ajuste auditado.

**10.2 Movimento**

Campos:

data;

conta financeira;

entrada/saída;

valor;

descrição;

origem;

documento;

cliente/fornecedor;

plano de contas;

centro de custo;

usuário;

data/hora de criação;

compromisso vinculado, quando houver.

**10.3 Movimentos manuais**

Permitir conforme permissões.

**10.4 Transferências**

Criar operação específica para transferência.

Nunca classificar transferência interna como receita ou despesa.

**10.5 Reversão**

Não excluir movimento já efetivado.

Criar reversão com:

movimento original;

movimento inverso;

motivo;

usuário;

data/hora.

**10.6 Caixa físico**

Controlar:

suprimentos;

retiradas;

fechamento;

saldo esperado;

saldo contado;

diferença;

justificativa.

**11. CONCILIAÇÃO BANCÁRIA**

Criar mecanismo para comparar:

**Movimentos do sistema × Extrato bancário**

**11.1 Importação**

Preparar suporte para:

OFX;

CSV;

arquivos bancários;

API;

Open Finance;

outras integrações futuras.

Os detalhes técnicos das integrações pertencem ao Tópico 13.

**11.2 Matching**

Considerar:

valor;

data;

documento;

identificador da transação;

cliente;

fornecedor;

descrição;

referência.

Classificar confiança:

alta;

média;

baixa.

**11.3 Fluxo**

Permitir:

sugestão automática;

confirmação;

rejeição;

conciliação manual.

Permitir configuração de conciliação automática para correspondências de
alta confiança.

**11.4 Situações**

Identificar:

movimento bancário sem lançamento no sistema;

lançamento do sistema sem correspondente bancário;

diferença de valor;

diferença de data;

duplicidade;

títulos não conciliados.

Permitir tolerâncias configuráveis.

**11.5 Regra importante**

**Importar extrato não significa conciliar.**

A importação apenas informa o que ocorreu no banco.

A conciliação estabelece o vínculo com a operação do sistema.

**12. PLANO DE CONTAS, CENTROS DE CUSTO E DRE**

**12.1 Dimensões**

Manter separadamente:

Plano de contas = o que;

Centro de custo = onde;

Origem = de onde veio.

**12.2 Rateio**

Permitir:

rateio manual;

regras predefinidas;

múltiplos centros de custo;

percentuais ou valores.

**12.3 DRE Gerencial**

Criar DRE gerencial, não contábil.

Estrutura mínima:

Receita Bruta;

Deduções;

Receita Líquida;

Custos;

Lucro Bruto;

Despesas Operacionais;

Resultado Operacional;

Resultado Financeiro;

Resultado Gerencial Líquido.

**12.4 Competência x Caixa**

DRE:

**regime de competência**

Fluxo de caixa:

**movimentação financeira efetiva**

Nunca confundir os dois.

**12.5 Resultado financeiro**

Separar:

juros;

tarifas;

descontos;

demais despesas financeiras;

receitas financeiras.

**13. COMISSÕES, COBRANÇA E INADIMPLÊNCIA**

**13.1 Comissões**

A comissão é controlada pelo Financeiro, tendo origem no Comercial.

Permitir regras por:

venda;

faturamento;

recebimento;

produto;

família;

cliente;

vendedor;

região;

faixa de valor;

outras dimensões configuráveis.

Definir:

percentual;

base;

momento da liberação;

prioridade entre regras.

**13.2 Comissão não é pagamento**

Distinguir:

**Comissão gerada → Comissão liberada → Compromisso a pagar → Pagamento
→ Movimento**

Quando baseada em recebimento:

Exemplo:

Venda = R\$ 100.000\
Comissão = 3%\
Recebido = R\$ 40.000

Comissão liberada:

**R\$ 1.200**

**13.3 Cancelamentos e devoluções**

Devem recalcular ou ajustar comissões quando necessário.

Comissão já paga não deve ser apagada.

Utilizar ajuste ou reversão.

**13.4 Cobrança**

Criar painel de:

títulos vencidos;

clientes inadimplentes;

aging;

exposição;

promessas;

ações realizadas.

Permitir régua configurável.

Exemplo:

5 dias antes;

vencimento;

3 dias após;

10 dias após;

30 dias após.

Canais preparados:

e-mail;

WhatsApp;

SMS;

telefone.

Integrações externas pertencem ao Tópico 13.

**14. CONDIÇÕES E MEIOS DE PAGAMENTO**

**14.1 Condições**

Criar cadastro reutilizável.

Exemplos:

à vista;

7/14/28;

30/60;

entrada + parcelas;

condições personalizadas.

Controlar:

quantidade de parcelas;

intervalo;

percentual;

valor;

primeira parcela;

vencimento fixo;

meio preferencial;

conta financeira preferencial;

necessidade de aprovação;

status.

**14.2 Aplicação**

Condições podem ser utilizadas em:

pedidos;

orçamentos;

faturamento;

contas a receber;

contas a pagar;

compras;

contratos;

serviços.

Permitir condição padrão e condição negociada.

A condição negociada deve registrar:

usuário;

data;

aprovação, quando aplicável.

**14.3 Meios de pagamento**

Permitir:

dinheiro;

PIX;

transferência;

boleto;

cartão;

cheque;

outros.

Meio de pagamento é diferente de conta financeira.

**14.4 Taxas**

Configurar:

percentual;

valor fixo;

responsável pela taxa;

impacto no valor líquido;

classificação financeira.

**15. ORÇAMENTO, PREVISÃO E PLANEJAMENTO**

**15.1 Orçamento**

Permitir períodos:

mensal;

trimestral;

semestral;

anual.

Dimensões:

plano de contas;

centro de custo;

conta financeira;

unidade;

projeto;

categoria.

Separar:

receitas;

despesas.

**15.2 Status**

Em elaboração;

Aguardando aprovação;

Aprovado;

Em revisão;

Encerrado.

**15.3 Indicadores**

Exibir:

Orçado;

Comprometido;

Realizado;

Disponível;

% consumido;

variação.

**Disponível para compromisso**

**Orçamento − Comprometido**

**Disponível pelo realizado**

**Orçamento − Realizado**

**15.4 Previsões**

Previsões podem vir de:

contas a receber;

contas a pagar;

recorrências;

demais fontes.

Previsão não cria automaticamente compromisso.

**15.5 Extrapolação**

Comportamento configurável:

apenas alerta;

exigir aprovação;

bloquear.

**15.6 Versionamento**

Alterações de orçamento devem preservar versões anteriores.

**16. FECHAMENTO FINANCEIRO E CONTROLES**

Antes do fechamento, disponibilizar checklist.

Verificar:

contas a pagar pendentes de classificação;

contas a receber pendentes;

movimentos não conciliados;

diferenças entre banco e sistema;

caixa não fechado;

títulos vencidos;

ausência de centro de custo;

ausência de plano de contas;

documentos cancelados com pendências financeiras;

inconsistências faturamento × contas a receber;

possíveis duplicidades.

**16.1 Fechamento**

Após fechamento:

bloquear lançamentos comuns;

bloquear alterações;

bloquear exclusões;

exigir autorização para ajustes;

registrar auditoria.

**17. INDICADORES FINANCEIROS**

Disponibilizar indicadores como:

contas a pagar;

contas a receber;

saldo de caixa;

saldo bancário;

fluxo realizado;

fluxo projetado;

resultado;

orçamento;

inadimplência;

aging;

prazo médio de recebimento;

concentração de clientes;

dívida;

compromissos futuros.

Todos devem possuir filtros.

**18. OPERAÇÕES FINANCEIRAS ESPECIAIS**

**18.1 Empréstimos**

Esta funcionalidade é prioritária.

Cadastrar:

instituição;

número do contrato;

data;

valor contratado;

valor efetivamente recebido;

taxa de juros;

tipo de taxa;

sistema de amortização;

quantidade de parcelas;

periodicidade;

primeira parcela;

carência;

tarifas;

IOF e demais encargos;

conta de destino;

finalidade;

centro de custo;

projeto;

status.

**Regra fundamental**

O recebimento de empréstimo:

**aumenta o caixa, mas NÃO é receita.**

Exemplo:

Empréstimo = R\$ 500.000

Movimento:

**+ R\$ 500.000 no caixa**

Receita:

**R\$ 0**

**18.2 Parcelas**

Separar:

principal;

juros;

tarifas;

encargos;

total.

O principal reduz a dívida.

Juros e encargos representam despesa financeira.

**18.3 Amortização**

Suportar:

SAC;

Price;

parcelas personalizadas;

amortização extraordinária.

Permitir:

geração automática do cronograma;

importação/registro de cronograma contratado;

atualização após amortização extraordinária.

**18.4 Liquidação antecipada**

Calcular/registrar:

saldo principal;

juros;

descontos;

encargos;

valor efetivamente pago;

data;

movimento;

encerramento do contrato.

**18.5 Refinanciamento**

Preservar:

contrato original;

histórico;

saldo;

condições originais.

Criar novo cronograma para o refinanciamento.

**19. FINANCIAMENTOS**

Tratar de forma semelhante aos empréstimos.

Permitir vínculo com:

máquina;

equipamento;

veículo;

imóvel;

ativo;

projeto;

outro objeto financiado.

Controlar:

contrato;

instituição;

valor;

parcelas;

juros;

amortização;

saldo;

pagamentos;

encerramento.

**20. ADIANTAMENTO DE RECEBÍVEIS**

Permitir:

**Título original → Antecipação → Taxa → Valor líquido → Movimento**

Preservar:

título original;

instituição;

data;

valor antecipado;

custo;

valor líquido.

Não apagar o título original.

**21. ADIANTAMENTO A FORNECEDORES**

Registrar:

**Pagamento antecipado → Crédito do fornecedor → Aplicação no título**

O adiantamento não deve ser automaticamente considerado despesa no
momento da saída de caixa.

**22. ADIANTAMENTO DE CLIENTES**

Registrar:

**Recebimento antecipado → Crédito do cliente → Aplicação futura**

O recebimento antecipado não deve ser automaticamente considerado
receita quando a operação ainda não justificar seu reconhecimento.

**23. CRÉDITOS E COMPENSAÇÕES**

Permitir:

crédito de cliente;

crédito decorrente de devolução;

compensação;

aplicação do crédito em títulos futuros.

Preservar a origem do crédito.

**24. INVESTIMENTOS**

No MVP, implementar funcionalidade básica.

Permitir:

aplicação;

resgate;

rendimento;

taxas.

**Regras**

Aplicação:

**não é despesa.**

Resgate:

**não é receita.**

Rendimento:

**é receita financeira.**

As transferências entre conta corrente e investimento devem ser tratadas
como movimentações financeiras apropriadas.

**25. AUDITORIA**

Registrar todas as operações relevantes:

criação;

alteração;

aprovação;

cancelamento;

pagamento;

recebimento;

renegociação;

reversão;

ajuste;

conciliação;

fechamento;

reabertura;

alteração de configuração.

Nunca permitir exclusão silenciosa de histórico financeiro.

**26. SEGURANÇA E PERMISSÕES**

Criar permissões granulares para:

visualizar;

criar;

editar;

aprovar;

pagar;

receber;

cancelar;

renegociar;

ajustar;

conciliar;

fechar;

reabrir;

configurar.

Permitir segregação de funções.

Exemplo:

**Criar → Aprovar → Executar**

As regras de segregação devem ser configuráveis pela empresa.

**27. NOTIFICAÇÕES**

Todas as notificações financeiras devem ser configuráveis pela empresa.

A empresa deve decidir:

quais notificações utilizar;

destinatários;

canais;

frequência;

antecedência;

regras.

Exemplos:

título próximo do vencimento;

título vencido;

saldo projetado negativo;

aprovação pendente;

orçamento excedido;

conciliação pendente;

promessa de pagamento vencida;

fechamento pendente.

**28. INTEGRAÇÃO COM OS DEMAIS MÓDULOS**

O Financeiro deve ser preparado para integração com:

Comercial;

Orçamentos;

Pedidos;

Compras;

Estoque;

Engenharia;

PCP/Produção;

Qualidade;

Expedição/Logística.

Evitar redigitação.

Exemplos de fluxos:

**Comercial**

**Pedido → Faturamento → NF → Contas a Receber → Recebimento →
Movimento**

**Compras**

**Compra/NF → Contas a Pagar → Pagamento → Movimento**

**Comissão**

**Venda → Comissão → Liberação → Contas a Pagar → Pagamento**

**Empréstimo**

**Contrato → Liberação → Movimento → Parcelas → Amortização →
Encerramento**

**29. NOTAS FISCAIS E INTEGRAÇÕES EXTERNAS**

O sistema deve possuir arquitetura preparada para receber/importar
automaticamente:

NF-e;

NFS-e;

outros documentos fiscais aplicáveis.

O objetivo é evitar redigitação e permitir que os dados alimentem
automaticamente os módulos correspondentes.

A origem do documento deve ser preservada.

A implementação técnica de:

SEFAZ;

APIs;

XML;

certificados;

provedores;

bancos;

Open Finance;

WhatsApp;

SMS;

outros serviços externos

deve ser tratada no **Tópico 13 — Integrações**.

Não duplicar essa lógica dentro do Financeiro.

**30. REGRAS INVIOLÁVEIS DO MÓDULO**

Implementar como regras de negócio centrais:

Saldo financeiro é consequência dos movimentos.

Movimento não significa necessariamente compromisso.

Compromisso não significa dinheiro movimentado.

Liquidação pode ser parcial.

Um título pode possuir vários movimentos.

Um movimento pode liquidar vários títulos.

Transferências internas não são receitas nem despesas.

Empréstimos não são receitas.

Amortização do principal não é despesa.

Juros e encargos devem ser separados do principal.

Faturamento não é recebimento.

DRE e fluxo de caixa possuem bases diferentes.

Cancelamento não apaga histórico.

Reversão preserva a operação original.

Renegociação não sobrescreve silenciosamente o compromisso original.

Períodos fechados não podem ser alterados livremente.

Cada empresa possui suas próprias configurações financeiras.

Todos os dados devem respeitar company_id.

Integrações devem evitar redigitação.

A origem das informações integradas deve ser rastreável.

Datas de emissão, competência, vencimento, liquidação e movimento devem
ser tratadas separadamente quando aplicáveis.

Valores brutos, descontos, juros, multas, encargos, retenções e valores
líquidos devem permanecer identificáveis.

Nenhuma operação financeira relevante deve desaparecer do histórico.

**31. REQUISITOS DE UX**

A interface deve ser clara, operacional e orientada à tomada de decisão.

Criar:

dashboards;

filtros;

busca;

ordenação;

agrupamentos;

indicadores;

alertas;

histórico;

timeline;

drill-down;

exportações quando aplicável.

O usuário deve conseguir navegar da informação gerencial até sua origem.

Exemplo:

**DRE → Receita → Cliente → Pedido → Faturamento → NF → Título →
Recebimento → Movimento**

**32. MULTIEMPRESA**

Todo dado financeiro deve possuir company_id.

Implementar isolamento por empresa através de:

banco de dados;

políticas RLS;

validação no backend;

validação nas operações;

permissões.

Nenhum usuário de uma empresa poderá visualizar ou alterar dados de
outra.

**33. ARQUITETURA E QUALIDADE**

O desenvolvimento deve seguir arquitetura preparada para SaaS.

Priorizar:

componentes reutilizáveis;

serviços desacoplados;

regras de negócio centralizadas;

validações no backend;

transações para operações críticas;

integridade referencial;

auditoria;

idempotência para integrações;

prevenção de duplicidade;

tratamento consistente de erros;

logs;

testes automatizados.

Operações financeiras críticas devem ser atômicas.

Exemplo:

Ao efetuar um pagamento:

validar título;

validar permissão;

validar período;

registrar liquidação;

registrar movimento;

atualizar saldos derivados;

registrar auditoria.

Se uma etapa crítica falhar, não deixar o sistema em estado financeiro
inconsistente.

**34. ESCOPO DO MVP**

O MVP do Financeiro deve contemplar:

**Obrigatório**

estrutura financeira;

plano de contas;

centros de custo;

contas financeiras;

contas a pagar;

contas a receber;

parcelamento;

pagamentos;

recebimentos;

movimentos;

transferências;

caixa;

fluxo de caixa realizado;

fluxo de caixa projetado;

faturamento financeiro;

conciliação bancária básica;

DRE gerencial;

condições e meios de pagamento;

orçamento básico;

comissões;

cobrança;

inadimplência;

fechamento financeiro;

auditoria;

permissões;

empréstimos;

financiamentos;

adiantamentos;

créditos;

investimentos básicos.

**Preparado para evolução**

multicurrency;

Open Finance;

APIs bancárias;

automações de cobrança;

cenários financeiros;

BI avançado;

integrações fiscais;

integrações externas;

funcionalidades financeiras avançadas.

**35. CRITÉRIO DE CONCLUSÃO DO MÓDULO**

Considerar o Tópico 11 concluído quando:

todas as funcionalidades descritas estiverem implementadas;

todas as regras de negócio estiverem implementadas;

os dados estiverem isolados por empresa;

auditoria estiver funcionando;

permissões estiverem funcionando;

pagamentos e recebimentos forem consistentes;

saldos forem derivados dos movimentos;

transferências não impactarem indevidamente receitas/despesas;

empréstimos não forem tratados como receita;

principal e juros forem separados;

faturamento e recebimento estiverem separados;

renegociações preservarem histórico;

períodos fechados estiverem protegidos;

conciliação estiver funcionando;

DRE e fluxo de caixa estiverem corretamente separados;

operações críticas forem transacionais;

integrações estiverem preparadas sem acoplamento indevido;

testes cobrirem os principais cenários financeiros.

Após a conclusão deste módulo, realizar somente a revisão interna do
Financeiro.

A **auditoria de integração entre Financeiro e os demais módulos deverá
ser realizada posteriormente na etapa de Auditoria Geral do Sistema**,
após a conclusão de todos os tópicos.

**FIM DO PROMPT — TÓPICO 11: FINANCEIRO**
