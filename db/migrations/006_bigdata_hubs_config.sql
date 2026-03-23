-- admin-app / bigdata_db
-- Migration 006: configuração dos módulos apphub/adminhub no cockpit unificado

CREATE TABLE IF NOT EXISTS apphub_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    badge TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_apphub_cards_display_order
ON apphub_cards(display_order ASC);

CREATE TABLE IF NOT EXISTS adminhub_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    badge TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_adminhub_cards_display_order
ON adminhub_cards(display_order ASC);