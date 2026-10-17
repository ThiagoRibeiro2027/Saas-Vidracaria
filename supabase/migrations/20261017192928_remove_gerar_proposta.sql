-- Remove a funcionalidade "Gerar proposta" (TÓPICO 10) — decisão do usuário
-- (17/10/2026): não trava nada hoje (conversão em pedido já é independente),
-- só adiciona rigidez sem necessidade real.
--
-- Mantém a tabela `propostas`, a policy de SELECT e os dados já existentes
-- intactos (9 propostas reais já geradas antes desta mudança — decisão
-- explícita do usuário de não apagar histórico). anonimizar_pessoa() também
-- fica como está: ela limpa propostas.destinatario na anonimização LGPD, e
-- isso continua necessário enquanto a tabela e os dados existirem.
--
-- Remove só o CAMINHO DE ESCRITA (ninguém cria proposta nova daqui pra
-- frente): as 5 funções que geram/alteram proposta, a entrada no catálogo de
-- numeração de documento, e as permissões propostas.view/propostas.manage
-- (que, à parte, nunca chegaram a existir no banco de produção — só estavam
-- em seed.sql, removidas abaixo também).

drop function if exists public.gerar_proposta(uuid, date);
drop function if exists public.marcar_proposta_enviada(uuid, text, text);
drop function if exists public.registrar_aceite_proposta(uuid, boolean);
drop function if exists public.registrar_recusa_proposta(uuid, text);
drop function if exists public.cancelar_proposta(uuid);

delete from public.numbering_document_types where document_type = 'proposta';
delete from public.permissions where resource = 'propostas';
