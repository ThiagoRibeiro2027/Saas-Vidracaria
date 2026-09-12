**TÓPICO 16 — INSTALAÇÃO / MONTAGEM**

**Status:** APROVADO\
**Data:** 12/09/2026

**Objetivo**

Desenvolver o módulo de Instalação/Montagem do SaaS industrial,
responsável pela programação, agendamento, execução, ocorrências,
evidências, conclusão e aceite das instalações realizadas em obra.

Conforme o princípio P19 da Arquitetura Mestre, Instalação é um processo
próprio: expedição, entrega e instalação são etapas diferentes.

O módulo é proprietário das entidades **Instalação** e **Ocorrências de
Instalação**, e deve integrar-se a Expedição, Estoque, Engenharia,
Qualidade, RH, Financeiro e Notificações, sem duplicar as
responsabilidades desses módulos.

Conforme o princípio P20, **Obra é um contexto próprio** — diferente de
cliente, pedido e endereço — mantida estruturalmente em Cadastros. Uma
Obra poderá relacionar-se a diferentes pedidos e instalações.

**1. Programação e agendamento**

Permitir gerar uma instalação a partir de:

pedido;

entrega realizada na obra;

obra;

ocorrência anterior;

revisita;

outros eventos configuráveis.

A instalação deverá identificar:

obra;

cliente;

pedido ou pedidos relacionados;

endereço de execução;

itens a instalar;

equipe;

responsável;

data e janela de atendimento;

duração estimada;

materiais necessários;

pré-requisitos;

documentos aplicáveis;

observações.

**Agenda**

A agenda deverá permitir visualização por equipe, por dia e por obra,
identificando conflitos de agendamento e respeitando a disponibilidade
das equipes.

**Pré-requisitos de liberação**

Não deverá ser possível confirmar uma instalação sem que os
pré-requisitos configurados estejam atendidos, tais como:

obra liberada;

material disponível ou entregue;

medidas confirmadas;

pendências críticas resolvidas.

**Instalações parciais**

Um mesmo pedido ou obra poderá possuir várias instalações, cada uma com
rastreabilidade própria.

**2. Estados da instalação**

A instalação deverá seguir os estados definidos na Arquitetura Mestre:

Planejada\
→ Agendada\
→ Confirmada\
→ Em execução\
→ Parcial\
→ Concluída\
→ Aguardando aceite\
→ Aceita.

As transições deverão ser centralizadas, não espalhadas pelos demais
módulos.

O estado operacional da instalação é independente do estado financeiro
do pedido.

**3. Equipe e responsável**

A instalação deverá consumir o cadastro de equipes mantido pelo módulo
de RH (T17), sem duplicá-lo.

Deverá registrar:

equipe designada;

responsável pela execução;

integrantes efetivamente presentes;

habilitação exigida, quando aplicável.

**4. Materiais da instalação**

Registrar, quando aplicável:

materiais previstos;

materiais efetivamente utilizados;

material adicional solicitado em campo;

sobras;

devoluções;

peças danificadas.

Toda movimentação física de material permanece de propriedade do módulo
de Estoque (T6). A Instalação registra o evento ocorrido em obra; o
Estoque permanece como fonte de verdade do saldo.

**5. Execução em campo**

A execução deverá permitir:

registro de início;

execução por item, ambiente ou etapa;

quantidades instaladas;

execução parcial;

pendências;

observações;

registro de término.

A execução deverá funcionar em condições de conectividade instável,
conforme o ADR-005, utilizando a plataforma de campo definida no
ADR-008.

**6. Ocorrências**

O módulo deverá suportar, no mínimo, as ocorrências previstas na
Arquitetura Mestre:

obra não liberada;

cliente ausente;

dificuldade de acesso;

peça faltante;

peça incorreta;

peça danificada;

medida incompatível;

problema técnico;

problema de qualidade;

retrabalho;

nova fabricação;

material adicional;

instalação parcial;

necessidade de revisita.

**Encaminhamento das ocorrências**

Cada ocorrência deverá ter destino definido, conforme a Arquitetura
Mestre:

problema técnico: Instalação → Engenharia;

problema de conformidade: Instalação → Qualidade;

material físico: Instalação → Estoque;

consequência financeira: Instalação → Financeiro.

A instalação pode gerar consequências financeiras, mas **não altera
diretamente títulos** — o Financeiro permanece como fonte de verdade.

**7. Medição em obra**

Como o vidro temperado não admite recorte após a têmpera, a medição
incorreta gera perda total da peça e novo ciclo de fabricação. A medição
deverá, portanto, ser tratada como atividade formal e rastreável.

O sistema deverá permitir:

registrar a medição realizada em obra, vinculada à obra e ao pedido;

identificar quem mediu, quando e em que condições;

registrar as medidas por item/ambiente;

registrar revisões de medida, preservando o histórico;

exigir confirmação/conferência das medidas antes da liberação para
produção.

**Regra de bloqueio**

A exigência de medida confirmada deverá ser configurável por tipo de
pedido/item:

itens sob medida (vidro temperado, esquadrias e demais itens fabricados
conforme medida de obra): a liberação para produção deverá ser
**impedida** enquanto não houver medida confirmada;

itens padrão/catálogo, para os quais a medição em obra não se aplica: o
sistema deverá apenas **sinalizar**, sem impedir.

A parametrização dessa regra pertence ao módulo de Configurações.

A medição é atividade de campo e deverá estar disponível na plataforma
definida no ADR-008, respeitando a operação offline do ADR-005.

**8. Quebra e dano em obra**

Quando houver peça danificada, quebra em obra ou medida incompatível, o
sistema deverá permitir:

registrar o evento com sua causa;

identificar o item, a quantidade e o responsável pelo registro;

registrar a responsabilidade atribuída à ocorrência: fabricação,
transporte, instalação, cliente/terceiro ou indeterminada;

encaminhar a consequência física ao Estoque;

reprogramar revisita;

notificar os responsáveis;

preservar o histórico, sem sobrescrever o registro original.

**Nova fabricação**

A quebra ou o dano **não deverá gerar ordem de produção
automaticamente**.

O registro deverá gerar uma solicitação de nova fabricação em estado
pendente, que só se converte em ordem de produção após aprovação de
usuário com alçada, conforme o ADR-001.

A solicitação deverá registrar:

item;

quantidade;

motivo;

responsabilidade atribuída;

solicitante;

aprovador;

data e hora;

decisão.

**Indicadores**

A responsabilidade atribuída deverá alimentar os indicadores do módulo
de BI (T12), permitindo acompanhar a incidência de quebra por origem —
fabricação, transporte, instalação ou cliente/terceiro — e identificar
onde o processo falha com mais frequência.

**9. Evidências e documentos**

Permitir anexar à instalação:

registro fotográfico antes, durante e após a execução;

documentos aplicáveis;

comprovação de execução;

evidências de ocorrências.

Os arquivos deverão ser armazenados em storage privado, seguindo as
regras de segurança já definidas no projeto (upload, validação,
autorização, auditoria), com sincronização quando a captura ocorrer
offline.

**10. Conclusão e aceite**

Conforme a Arquitetura Mestre, **conclusão e aceite são eventos
distintos**: a instalação pode estar concluída operacionalmente e ainda
permanecer aguardando aceite.

O sistema deverá registrar:

conclusão operacional: data, hora, responsável, quantidades;

aceite: quem aceitou, quando, por qual meio, com quais ressalvas;

aceite parcial, quando aplicável;

pendências remanescentes no momento do aceite.

**11. Revisitas**

Uma revisita deverá:

estar vinculada à instalação original;

registrar o motivo;

possuir agendamento próprio;

preservar o histórico da execução anterior;

não apagar nem substituir os registros originais.

**12. Notificações**

Eventos de instalação poderão gerar notificações — agendamento,
confirmação, atraso, ocorrência, conclusão, aceite pendente — conforme o
ADR-007.

A notificação não é autoridade sobre o estado da instalação.

**13. Rastreabilidade e auditoria**

Deverão ser registrados, no mínimo, os eventos previstos na Arquitetura
Mestre:

InstalaçãoAgendada;

InstalaçãoIniciada;

InstalaçãoParcial;

OcorrenciaInstalacao;

InstalaçãoConcluida;

AceiteRealizado.

Deverá ser possível reconstruir o histórico completo da instalação,
utilizando o mecanismo geral de auditoria do SaaS.

**14. Permissões**

Conforme o ADR-001, deverão ser distinguíveis, no mínimo:

quem programa e agenda;

quem confirma;

quem executa em campo;

quem registra ocorrência;

quem registra conclusão;

quem registra o aceite.

O usuário de campo deverá operar com o menor privilégio necessário, e o
isolamento multi-tenant deverá ser respeitado integralmente.

**15. Operação offline**

Conforme o ADR-005, o dispositivo de campo registra fatos ocorridos, mas
não é autoridade sobre o estado oficial da instalação.

A ausência de conectividade não poderá impedir o registro do que ocorreu
em obra, nem causar perda de evidências.

**16. Integração com outros módulos**

**Expedição (T9)**: entrega na obra antecede a instalação; são processos
distintos.

**Estoque (T6)**: movimentação física de materiais, sobras, devoluções e
peças danificadas.

**Engenharia (T5)**: problemas técnicos e revisões de projeto.

**Qualidade (T8)**: não conformidades identificadas em campo.

**Produção (T4)**: nova fabricação decorrente de quebra, dano ou medida
incompatível.

**RH (T17)**: cadastro de equipes e habilitações.

**Financeiro (T11)**: consequências financeiras, sem alteração direta de
títulos.

**Cadastros (T2)**: entidade Obra.

**Notificações (ADR-007)** e **Plataforma de campo (ADR-008)**.

**17. MVP**

Conforme o item 4.9 do ADR-002, fazem parte do MVP:

agendamento; obra; endereço; equipe; responsável; agenda; materiais;
execução; observações; ocorrências; pendências; execução parcial;
conclusão; aceite; evidências; encerramento.

O módulo deverá estar preparado para operação offline conforme o
ADR-005.

Os itens 7 (medição em obra) e 8 (quebra e dano em obra) foram
aprovados e integram o MVP, por serem, respectivamente, a principal
causa de refugo e o principal evento de retrabalho da operação.

**18. Fora do escopo**

Não fazem parte deste módulo, conforme o ADR-002:

otimização de rotas;

telemetria de frota;

gestão logística avançada.

Assinatura eletrônica formal do aceite permanece como decisão futura,
conforme previsto no TÓPICO 18 — Contratos.
