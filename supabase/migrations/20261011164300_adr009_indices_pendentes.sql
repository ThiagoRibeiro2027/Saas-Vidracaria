-- ADR-009 ("Performance sob RLS") já deixou a regra registrada em
-- 20260912140000_adr009_rls_performance.sql: "nenhuma tabela multi-tenant
-- nova poderá ser criada sem o índice [em company_id]" — mas 24 tabelas
-- criadas DEPOIS dessa regra (TÓPICOs 4 a 18, 15/09 a 10/10/2026) não
-- ganharam o índice, violando a própria regra sem ninguém notar (achado
-- da auditoria de gaps ADR-001 a ADR-012, 11/10/2026). Toda política de
-- SELECT dessas tabelas filtra por `company_id = current_company_id()`
-- (RLS) sem nenhum índice que cubra esse filtro — sequential scan cresce
-- junto com a tabela, pior caso é estoque_movimentacoes (ledger só de
-- insert, nunca editado/apagado).
--
-- Puramente aditivo: nenhuma policy, função ou comportamento muda — só os
-- planos de execução do Postgres para esses SELECTs.
create index if not exists danos_instalacao_company_id_idx on public.danos_instalacao (company_id);
create index if not exists engenharia_versoes_company_id_idx on public.engenharia_versoes (company_id);
create index if not exists estoque_movimentacoes_company_id_idx on public.estoque_movimentacoes (company_id);
create index if not exists estoque_reservas_company_id_idx on public.estoque_reservas (company_id);
create index if not exists expedicao_itens_company_id_idx on public.expedicao_itens (company_id);
create index if not exists inspecoes_qualidade_company_id_idx on public.inspecoes_qualidade (company_id);
create index if not exists instalacao_itens_company_id_idx on public.instalacao_itens (company_id);
create index if not exists itens_producao_company_id_idx on public.itens_producao (company_id);
create index if not exists lote_fabril_itens_company_id_idx on public.lote_fabril_itens (company_id);
create index if not exists manutencoes_corretivas_company_id_idx on public.manutencoes_corretivas (company_id);
create index if not exists manutencoes_preventivas_company_id_idx on public.manutencoes_preventivas (company_id);
create index if not exists nao_conformidades_company_id_idx on public.nao_conformidades (company_id);
create index if not exists ocorrencias_expedicao_company_id_idx on public.ocorrencias_expedicao (company_id);
create index if not exists ocorrencias_instalacao_company_id_idx on public.ocorrencias_instalacao (company_id);
create index if not exists op_lote_operacao_recursos_company_id_idx on public.op_lote_operacao_recursos (company_id);
create index if not exists op_lote_operacoes_company_id_idx on public.op_lote_operacoes (company_id);
create index if not exists op_lotes_company_id_idx on public.op_lotes (company_id);
create index if not exists pagamentos_titulo_compra_company_id_idx on public.pagamentos_titulo_compra (company_id);
create index if not exists pedido_itens_company_id_idx on public.pedido_itens (company_id);
create index if not exists producao_apontamentos_company_id_idx on public.producao_apontamentos (company_id);
create index if not exists recebimentos_titulo_company_id_idx on public.recebimentos_titulo (company_id);
create index if not exists roteiro_operacoes_company_id_idx on public.roteiro_operacoes (company_id);
create index if not exists sequenciamento_decisoes_company_id_idx on public.sequenciamento_decisoes (company_id);
create index if not exists solicitacoes_nova_fabricacao_company_id_idx on public.solicitacoes_nova_fabricacao (company_id);
