-- admin-app / bigdata_db
-- Migration 012: mecanismo de publicação do MainSite
-- Objetivo:
--   (a) visibilidade individual por texto em mainsite_posts (coluna is_published)
--   (b) controle geral do site via mainsite_settings chave 'mainsite/publishing'
-- Regra de precedência aplicada na leitura: texto visível ⇔ mode='normal' AND is_published=1.

-- ============================================================================
-- (a) VISIBILIDADE INDIVIDUAL
-- ============================================================================
-- Default 1: todos os posts existentes permanecem visíveis após aplicação.
-- Compatível com auto-migração runtime em admin-motor/handlers/routes/mainsite/posts.ts
-- (ensureIsPublishedColumn). O ALTER aqui serve como registro formal.

ALTER TABLE mainsite_posts ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- (b) CONTROLE GERAL
-- ============================================================================
-- mode: 'normal' | 'hidden'
--   normal  → listagem e detalhe retornam posts com is_published=1
--   hidden  → listagem vazia, detalhe 404 (folha em branco no frontend)
-- notice_title / notice_message: string livre opcional, renderizada na área de
-- conteúdo do PostReader APENAS quando mode='hidden'. Vazias → folha em branco.

INSERT OR IGNORE INTO mainsite_settings (id, payload)
VALUES ('mainsite/publishing', '{"mode":"normal","notice_title":"","notice_message":""}');
