**PROMPT DEFINITIVO DE DESENVOLVIMENTO**

**TÓPICO 8 — QUALIDADE**

**1. OBJETIVO**

Implementar o módulo de **Qualidade** de um SaaS industrial/manufatura,
responsável por controlar inspeções, critérios de aceitação, resultados,
não conformidades, bloqueios, liberações, retrabalhos, reclamações,
devoluções, auditorias, instrumentos de medição e rastreabilidade da
qualidade.

O módulo deverá atuar de forma integrada aos demais módulos, sem
duplicar suas responsabilidades.

A Qualidade deverá determinar o **status de qualidade** dos itens,
enquanto os módulos responsáveis executam as ações operacionais
correspondentes.

**2. PRINCÍPIO DE RESPONSABILIDADE**

A divisão de responsabilidades deverá ser:

**Engenharia:** define especificações e características técnicas.

**Qualidade:** define/valida critérios de inspeção, realiza inspeções e
determina aprovação, bloqueio ou restrição.

**Estoque:** executa movimentações e controla saldos/localizações.

**PCP/Produção:** planeja e executa produção.

**Suprimentos:** executa compras e relacionamento operacional com
fornecedores.

**Expedição:** executa a saída física.

**Comercial:** administra reclamações e relacionamento comercial.

**Financeiro:** administra impactos financeiros.

A Qualidade não deverá criar processos paralelos aos módulos existentes.

**3. TIPOS DE INSPEÇÃO**

Suportar, no mínimo:

- inspeção de recebimento;

- inspeção durante processo;

- inspeção final;

- inspeção extraordinária.

A empresa poderá configurar novos tipos.

A inspeção poderá ser:

- 100%;

- por amostragem;

- obrigatória;

- opcional;

- condicional.

**4. PLANOS DE INSPEÇÃO**

Permitir criar planos de inspeção reutilizáveis.

Cada plano poderá conter:

- produto;

- família;

- processo;

- operação;

- fornecedor;

- cliente;

- tipo de inspeção;

- características;

- especificação esperada;

- tolerância;

- método de inspeção;

- instrumento/equipamento;

- tamanho da amostra;

- frequência;

- critério de aceitação;

- evidências obrigatórias;

- fotos;

- observações;

- regras condicionais.

**5. CARACTERÍSTICAS DE INSPEÇÃO**

Suportar características:

- numérica;

- texto;

- sim/não;

- seleção;

- visual;

- documento;

- outros tipos configuráveis.

Para características numéricas, permitir:

- valor nominal;

- limite inferior;

- limite superior;

- tolerância;

- unidade de medida.

O sistema deverá poder comparar automaticamente o resultado com a
especificação.

**6. RESULTADO DA INSPEÇÃO**

Registrar:

- característica;

- valor obtido;

- resultado;

- responsável;

- data/hora;

- equipamento utilizado;

- observações;

- evidências;

- fotos;

- documentos.

Resultados possíveis:

- aprovado;

- reprovado;

- não aplicável;

- pendente;

- em análise.

<span dir="rtl">“</span>Não Aplicável” deverá ser permitido quando
previsto pelo plano/regra.

**7. APROVAÇÃO E STATUS DE QUALIDADE**

A inspeção poderá resultar em:

**Aprovado**

**Aprovado com ressalva**

**Reprovado**

**Pendente**

**Em análise**

O sistema deverá permitir configurar critérios para cada resultado.

Uma inspeção reprovada poderá gerar bloqueio automático ou exigir
decisão conforme configuração.

**8. EVIDÊNCIAS**

Permitir anexar:

- fotos;

- documentos;

- certificados;

- relatórios;

- arquivos;

- observações.

As evidências deverão permanecer vinculadas à inspeção, item, lote ou
ocorrência correspondente.

**9. VERSIONAMENTO DOS PLANOS**

Planos de inspeção deverão possuir versão/revisão.

Quando uma nova versão for criada:

- registros históricos não poderão ser alterados;

- inspeções anteriores permanecerão vinculadas à versão utilizada;

- a nova versão será aplicada somente conforme sua vigência.

Alterações futuras não poderão modificar retroativamente resultados já
registrados.

**10. REGRAS CONDICIONAIS**

Permitir regras como:

- aplicar determinada inspeção somente para determinados produtos;

- aplicar critérios diferentes por fornecedor;

- aplicar critérios diferentes por cliente;

- alterar amostragem;

- exigir inspeção em determinadas condições;

- adicionar características conforme configuração;

- exigir aprovação adicional.

**11. INSPEÇÃO DE RECEBIMENTO**

A inspeção de recebimento deverá estar integrada ao processo:

**Pedido de compra → Recebimento → Lote → Inspeção → Estoque**

Quando necessário, o material recebido poderá permanecer:

- em quarentena;

- bloqueado;

- aguardando inspeção.

A aprovação poderá ocorrer total ou parcialmente.

Exemplo:

**100 unidades recebidas → 80 aprovadas → 20 reprovadas/bloqueadas.**

**12. MATERIAL REPROVADO NO RECEBIMENTO**

Material reprovado deverá permanecer controlado e não poderá ser
considerado automaticamente disponível para consumo.

Possíveis disposições:

- devolução ao fornecedor;

- substituição;

- retrabalho;

- seleção;

- liberação;

- concessão;

- sucata;

- uso condicional;

- outra disposição configurável.

A Qualidade determina a disposição/status.

O Estoque executa a movimentação física correspondente.

**13. NÃO CONFORMIDADE DE FORNECEDOR**

Permitir vincular a não conformidade a:

- fornecedor;

- pedido de compra;

- recebimento;

- item;

- lote;

- inspeção;

- quantidade.

Registrar histórico de ocorrências para avaliação do desempenho do
fornecedor.

**14. RASTREABILIDADE DE LOTE**

Implementar rastreabilidade:

**Fornecedor → Compra → Recebimento → Lote → Inspeção → Estoque →
Consumo → OP → Produto acabado**

Sempre que houver rastreabilidade disponível.

Permitir consultar a origem e o destino do lote.

**15. NÍVEL DE INSPEÇÃO DE FORNECEDORES**

Permitir histórico de qualidade por fornecedor.

A empresa poderá configurar níveis de inspeção conforme desempenho, por
exemplo:

- inspeção reduzida;

- inspeção normal;

- inspeção intensificada;

- inspeção obrigatória.

As regras deverão ser configuráveis.

**16. INSPEÇÃO DURANTE PRODUÇÃO**

Permitir criar pontos de inspeção dentro do processo produtivo.

As inspeções poderão estar vinculadas a:

- produto;

- OP;

- operação;

- processo;

- máquina;

- lote;

- quantidade;

- característica.

O resultado poderá:

- liberar a continuidade;

- bloquear a operação;

- bloquear somente a quantidade afetada;

- exigir correção;

- gerar não conformidade;

- exigir reinspeção.

O comportamento deverá ser configurável.

**17. SEGREGAÇÃO**

Quando houver problema de qualidade, permitir identificar
especificamente:

- item afetado;

- quantidade afetada;

- lote;

- localização;

- OP;

- operação.

Evitar bloquear desnecessariamente todo o estoque ou toda a produção.

**18. NÃO CONFORMIDADES**

Permitir abertura de NC a partir de:

- recebimento;

- produção;

- inspeção final;

- expedição;

- reclamação;

- fornecedor;

- auditoria;

- outras origens configuráveis.

Dados mínimos:

- número;

- origem;

- item;

- lote;

- quantidade;

- pedido;

- OP;

- fornecedor;

- cliente;

- descrição;

- evidências;

- responsável;

- prioridade;

- severidade.

**19. ANÁLISE DE CAUSA**

Permitir análise de causa utilizando métodos configuráveis.

Exemplos:

- 5 Porquês;

- Ishikawa;

- análise livre;

- outros métodos.

O uso poderá ser obrigatório ou opcional conforme a
gravidade/configuração.

**20. CONTENÇÃO**

Permitir registrar ações imediatas para conter o problema.

Exemplos:

- bloquear lote;

- segregar quantidade;

- interromper processo;

- impedir expedição;

- inspeção adicional;

- seleção;

- outras ações.

**21. DISPOSIÇÃO DA NÃO CONFORMIDADE**

Permitir definir:

- retrabalho;

- reparo;

- seleção;

- devolução;

- sucata;

- concessão;

- liberação;

- uso condicional;

- outras disposições.

Uma NC poderá ter diferentes disposições para diferentes quantidades
afetadas.

**22. AÇÕES CORRETIVAS E PREVENTIVAS**

Permitir registrar múltiplas ações relacionadas à NC.

Cada ação poderá possuir:

- responsável;

- prazo;

- descrição;

- status;

- evidência;

- data de conclusão;

- aprovação.

A NC somente poderá ser encerrada quando todas as ações obrigatórias
estiverem concluídas.

**23. CONCESSÃO**

Permitir solicitar concessão para utilização de material/produto fora da
especificação.

Registrar:

- motivo;

- item;

- lote;

- quantidade;

- desvio;

- justificativa;

- responsável;

- aprovador;

- data;

- validade;

- evidências.

Concessões poderão exigir aprovação de nível superior conforme
configuração.

**24. RETRABALHO**

Retrabalho deverá ser tratado como atividade rastreável e não
simplesmente como alteração do status da OP original.

Deverá existir vínculo entre:

**NC → OP original → Retrabalho → Resultado → Reinspeção**

Permitir:

- retrabalho parcial;

- múltiplos itens/quantidades;

- diferentes disposições;

- novo ciclo de inspeção;

- limite configurável de ciclos;

- aprovação adicional quando necessário.

O retrabalho deverá alimentar PCP/Produção e Estoque.

A estrutura deverá estar preparada para captura de custos de retrabalho.

**25. REINSPEÇÃO**

Após retrabalho ou correção, permitir nova inspeção vinculada ao
histórico original.

Manter:

- resultado anterior;

- ação executada;

- novo resultado;

- responsável;

- data;

- evidências.

Nunca apagar a reprovação anterior.

**26. INSPEÇÃO FINAL**

Antes da liberação para expedição, permitir inspeção final.

A inspeção poderá estar vinculada a:

- produto;

- conjunto;

- lote;

- OP;

- pedido;

- cliente.

A Engenharia define as especificações.

A Qualidade define a verificação.

**27. CHECKLIST DE LIBERAÇÃO PARA EXPEDIÇÃO**

Implementar um checklist específico de liberação.

**Identificação**

Verificar:

- cliente correto;

- pedido correto;

- produto correto;

- código;

- quantidade;

- identificação/etiqueta.

**Condição física**

Verificar:

- dimensões;

- modelo/configuração;

- componentes;

- acessórios;

- acabamento;

- ausência de danos;

- limpeza/apresentação.

**Documentação**

Verificar:

- documentos obrigatórios;

- certificados;

- relatório de inspeção;

- desenho;

- demais documentos exigidos.

**Embalagem**

Verificar:

- embalagem correta;

- proteção;

- identificação externa;

- quantidade de volumes;

- proteção de itens frágeis.

**Comparação com pedido**

Verificar:

- todos os itens;

- quantidades;

- itens especiais;

- requisitos específicos do cliente.

Registrar:

- responsável;

- data/hora;

- resultado;

- observações;

- fotos/evidências.

Resultados:

**Aprovado para expedição**

**Aprovado com ressalva**

**Bloqueado**

Se qualquer item obrigatório não estiver aprovado, a expedição não
poderá ser liberada.

O checklist deverá ser configurável por:

- produto;

- família;

- cliente;

- operação;

- outras condições.

**28. INTEGRAÇÃO COM EXPEDIÇÃO**

A Qualidade determina:

**Liberado / Bloqueado / Liberado com restrição**

A Expedição executa a saída física.

Não criar um segundo processo de expedição dentro da Qualidade.

**29. RECLAMAÇÕES DE CLIENTES**

Permitir registrar reclamações relacionadas a:

- cliente;

- pedido;

- item;

- lote;

- produto;

- entrega;

- qualidade;

- outros.

Uma reclamação não deverá exigir obrigatoriamente uma devolução física.

Permitir gerar NC a partir da reclamação.

**30. DEVOLUÇÕES**

Fluxo:

**Cliente → Devolução → Qualidade → Inspeção → Disposição**

A devolução poderá resultar em:

- retorno ao estoque;

- quarentena;

- retrabalho;

- reparo;

- devolução ao cliente;

- sucata;

- outra disposição.

A devolução não deverá tornar automaticamente o material disponível em
estoque.

**31. AVARIAS**

Permitir registrar avarias ocorridas em:

- recebimento;

- produção;

- carregamento;

- transporte;

- entrega.

Registrar:

- item;

- quantidade;

- origem;

- responsável;

- descrição;

- fotos;

- documentos;

- disposição.

**32. AUDITORIAS**

Permitir auditorias:

- internas;

- de processo;

- de produto;

- de fornecedor;

- relacionadas a clientes;

- outras configuráveis.

Registrar:

- planejamento;

- escopo;

- responsáveis;

- critérios;

- resultados;

- evidências;

- não conformidades;

- ações;

- conclusão.

**33. CONTROLE DE DOCUMENTOS**

Permitir controle de documentos relacionados à qualidade.

Suportar:

- versão;

- revisão;

- vigência;

- responsável;

- aprovação;

- histórico.

Documentos obsoletos não deverão ser utilizados como versão vigente.

**34. INSTRUMENTOS DE MEDIÇÃO — MVP**

Permitir cadastro de instrumentos contendo:

- identificação;

- código;

- tipo;

- status;

- validade;

- certificado;

- documento;

- observações.

Permitir vincular instrumentos às inspeções.

Instrumento vencido poderá ser bloqueado para utilização em inspeções.

Metrologia avançada ficará preparada para evolução futura, não sendo
necessária no MVP.

**35. INSPEÇÕES PERIÓDICAS E CONDICIONAIS**

Permitir programar inspeções:

- periódicas;

- por lote;

- por quantidade;

- por tempo;

- por condição;

- por ocorrência;

- conforme regra configurável.

**36. INTEGRAÇÃO COM ENGENHARIA**

Quando houver nova revisão técnica:

**Engenharia → Qualidade**

A Qualidade deverá ser capaz de identificar a necessidade de revisão dos
critérios de inspeção.

Critérios antigos deverão permanecer vinculados aos registros
históricos.

Uma nova revisão técnica não deverá modificar inspeções já realizadas.

**37. INTEGRAÇÃO COM ESTOQUE**

A Qualidade deverá informar o status de qualidade:

- liberado;

- bloqueado;

- quarentena;

- restrito;

- outros configuráveis.

O Estoque deverá executar:

- transferência;

- bloqueio físico/lógico;

- liberação;

- retorno;

- descarte;

- demais movimentações.

A Qualidade não deverá manter um saldo de estoque paralelo.

**38. INTEGRAÇÃO COM PRODUÇÃO**

Permitir:

- inspeção em processo;

- bloqueio;

- liberação;

- retrabalho;

- reinspeção;

- registro de perdas;

- vínculo com OP;

- rastreabilidade de lote.

**39. INTEGRAÇÃO COM SUPRIMENTOS**

Permitir rastrear:

**Fornecedor → Pedido de compra → Recebimento → Inspeção → NC →
Disposição**

Disponibilizar histórico de desempenho do fornecedor.

**40. INTEGRAÇÃO COM EXPEDIÇÃO**

A expedição deverá consultar a situação de qualidade antes da saída.

Produto bloqueado ou sem liberação obrigatória não poderá ser expedido.

A liberação de qualidade deverá permanecer rastreável.

**41. INTEGRAÇÃO COM COMERCIAL**

Permitir relacionar:

- reclamações;

- devoluções;

- NCs;

- cliente;

- pedido;

- item.

O Comercial poderá visualizar informações relevantes, respeitando
permissões.

**42. INTEGRAÇÃO COM BI**

Disponibilizar indicadores:

- quantidade de inspeções;

- aprovação/reprovação;

- NCs;

- retrabalhos;

- sucatas;

- defeitos;

- defeitos por operação;

- defeitos por produto;

- defeitos por máquina;

- defeitos por turno;

- defeitos por OP;

- rejeições de fornecedores;

- reclamações;

- devoluções;

- custo da não qualidade, quando disponível.

**43. INDICADORES DE QUALIDADE**

Permitir análise por:

- período;

- produto;

- família;

- fornecedor;

- cliente;

- OP;

- lote;

- operação;

- máquina;

- turno;

- responsável;

- origem da NC.

Indicadores deverão ser preparados para análise histórica e comparação
de desempenho.

**44. CUSTO DA NÃO QUALIDADE**

A estrutura deverá estar preparada para registrar custos relacionados a:

- retrabalho;

- sucata;

- devolução;

- seleção;

- reparo;

- perdas;

- reclamações;

- outras despesas relacionadas à qualidade.

O custo poderá ser integrado ao módulo Financeiro e ao BI.

**45. AUDITORIA DO SISTEMA**

Registrar ações críticas:

- criação/alteração de plano;

- inspeção;

- resultado;

- aprovação;

- reprovação;

- bloqueio;

- liberação;

- concessão;

- NC;

- disposição;

- retrabalho;

- reinspeção;

- alteração de documentos;

- encerramento.

Registrar:

- usuário;

- data/hora;

- ação;

- registro afetado;

- valor anterior;

- novo valor, quando aplicável.

**46. PERMISSÕES**

Permitir controle de acesso por função/permissão para:

- criar inspeção;

- executar inspeção;

- aprovar;

- bloquear;

- liberar;

- abrir NC;

- definir disposição;

- conceder;

- aprovar concessão;

- encerrar NC;

- alterar planos;

- consultar custos;

- consultar informações restritas.

As permissões deverão ser configuráveis.

**47. STATUS CONFIGURÁVEIS**

A empresa deverá poder configurar:

- status de inspeção;

- status de NC;

- status de lote;

- tipos de disposição;

- severidades;

- prioridades;

- critérios de aprovação;

- regras de bloqueio;

- regras de liberação;

- tipos de auditoria;

- tipos de ocorrência.

Não fixar a lógica de negócio de forma rígida no código.

**48. REGRA FUNDAMENTAL DE INTEGRAÇÃO**

A Qualidade deverá atuar como autoridade sobre o **status de
qualidade**, mas não como autoridade sobre os saldos ou processos
operacionais de outros módulos.

Exemplo:

**Qualidade:** <span dir="rtl">“</span>Lote bloqueado.”

**Estoque:** executa a movimentação/segregação correspondente.

**Qualidade:** <span dir="rtl">“</span>Produto liberado.”

**Expedição:** pode prosseguir conforme as demais condições.

**49. FLUXO PRINCIPAL DE QUALIDADE**

O sistema deverá suportar:

**Recebimento**\
→ **Quarentena/Inspeção**\
→ **Aprovação ou NC**\
→ **Liberação/Disposição**

**Produção**\
→ **Inspeção em processo**\
→ **Aprovação ou NC**\
→ **Continuidade/Retrabalho**

**Produto acabado**\
→ **Inspeção final**\
→ **Checklist de liberação**\
→ **Liberado/Bloqueado**\
→ **Expedição**

**Cliente**\
→ **Reclamação/Devolução**\
→ **Inspeção**\
→ **NC**\
→ **Disposição**\
→ **Ação corretiva**\
→ **Encerramento**

**50. OBJETIVO FINAL**

O módulo deverá garantir:

**Nenhum material, produto ou quantidade afetada por uma condição de
qualidade deverá ser tratado como livremente disponível sem que seu
status esteja claramente determinado e rastreado.**

A solução deverá permitir rastrear:

**o que foi inspecionado, por quem, quando, segundo qual especificação,
qual foi o resultado, qual quantidade foi afetada, qual decisão foi
tomada, quais ações foram executadas e qual foi o resultado final.**

A implementação deverá permanecer preparada para evolução futura sem
comprometer a simplicidade e o escopo do MVP.
