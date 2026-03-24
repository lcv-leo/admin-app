-- admin-app / bigdata_db
-- Migration 010: Bootstrap dos dados iniciais de apphub_cards e adminhub_cards
-- Esta migração carrega os dados dos cards.json locais para o banco centralizado

-- APPHUB_CARDS
INSERT OR REPLACE INTO apphub_cards (id, display_order, name, description, url, icon, badge, updated_at, updated_by)
VALUES
  (1, 0, 'Divagações Filosóficas', 'Publicações sobre temas científico-religio-filosóficos', 'https://www.lcv.rio.br', '🧠', 'Abrir Site', 1711270400000, 'bootstrap@bigdata-hubs'),
  (2, 1, 'Mapa Astral', 'Cálculo de mapas baseados no Zodíaco Tropical e no Astronômico Realista.', 'https://mapa-astral.lcv.app.br', '✨', 'Abrir App', 1711270400000, 'bootstrap@bigdata-hubs'),
  (3, 2, 'Oráculo Financeiro', 'Consolidação e projeção de métricas financeiras.', 'https://oraculo-financeiro.lcv.app.br', '💰', 'Abrir App', 1711270400000, 'bootstrap@bigdata-hubs'),
  (4, 3, 'Calculadora Financeira', 'Simulador para operações financeiras.', 'https://calculadora.lcv.app.br/', '🧮', 'Abrir App', 1711270400000, 'bootstrap@bigdata-hubs');

-- ADMINHUB_CARDS
INSERT OR REPLACE INTO adminhub_cards (id, display_order, name, description, url, icon, badge, updated_at, updated_by)
VALUES
  (1, 0, 'MTA-STS ADMIN', 'Ferramenta administrativa para geração e gestão de identificadores e políticas.', 'https://mtasts-admin.lcv.app.br', '🔐', 'Autenticar', 1711270400000, 'bootstrap@bigdata-hubs'),
  (2, 1, 'Leitor TLS-RPT', 'Leitura e consolidação de relatórios TLS para análise operacional.', 'https://tls-rpt.lcv.app.br', '📄', 'Autenticar', 1711270400000, 'bootstrap@bigdata-hubs'),
  (3, 2, 'MainSite Admin', 'Painel de gestão do site principal.', 'https://admin-site.lcv.rio.br', '🏢', 'Autenticar', 1711270400000, 'bootstrap@bigdata-hubs'),
  (4, 3, 'Astrólogo Admin', 'Painel administrativo do ecossistema Astrólogo.', 'https://admin-astrologo.lcv.app.br', '🌌', 'Autenticar', 1711270400000, 'bootstrap@bigdata-hubs'),
  (5, 4, 'Calculadora Financeira Admin', 'Painel administrativo da calculadora de câmbio com controle operacional.', 'https://admin.lcv.app.br', '🏦', 'Autenticar', 1711270400000, 'bootstrap@bigdata-hubs');
