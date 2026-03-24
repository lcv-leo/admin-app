/**
 * Configurações do painel de notícias — utilitário compartilhado.
 * Salva/lê do localStorage para uso em NewsPanel (leitura) e ConfigModule (edição).
 *
 * Fontes são dinâmicas: o usuário pode adicionar quantas fontes quiser.
 * Cada fonte precisa de: id (slug único), name (nome de exibição),
 * url (URL do feed RSS) e category (etiqueta livre).
 */

export interface NewsSource {
  /** Identificador único (slug). Ex.: "g1", "cnn-brasil" */
  id: string
  /** Nome de exibição. Ex.: "G1", "CNN Brasil" */
  name: string
  /** URL completa do feed RSS/Atom. Ex.: "https://g1.globo.com/rss/g1/" */
  url: string
  /** Categoria livre. Ex.: "Brasil", "Tecnologia", "Economia" */
  category: string
}

export interface NewsSettings {
  refreshMinutes: number
  maxItems: number
  /** IDs das fontes ativas (presentes em `sources`) */
  enabledSources: string[]
  keywords: string
  /** Lista completa de fontes configuradas pelo usuário */
  sources: NewsSource[]
}

export const NEWS_STORAGE_KEY = 'lcv-news-settings'

/** Fontes pré-configuradas (instalação inicial) */
export const BUILTIN_SOURCES: NewsSource[] = [
  { id: 'g1',         name: 'G1',          url: 'https://g1.globo.com/rss/g1/',                            category: 'Brasil' },
  { id: 'folha',      name: 'Folha',       url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',  category: 'Brasil' },
  { id: 'bbc',        name: 'BBC Brasil',  url: 'https://www.bbc.com/portuguese/index.xml',                category: 'Mundo' },
  { id: 'techcrunch', name: 'TechCrunch',  url: 'https://techcrunch.com/feed/',                            category: 'Tecnologia' },
]

export const DEFAULT_NEWS_SETTINGS: NewsSettings = {
  refreshMinutes: 5,
  maxItems: 30,
  enabledSources: BUILTIN_SOURCES.map(s => s.id),
  keywords: '',
  sources: [...BUILTIN_SOURCES],
}

export function loadNewsSettings(): NewsSettings {
  try {
    const raw = localStorage.getItem(NEWS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NEWS_SETTINGS, sources: [...BUILTIN_SOURCES] }
    const parsed = JSON.parse(raw) as Partial<NewsSettings>

    // Migração: se não tem `sources`, usar BUILTIN
    const sources = Array.isArray(parsed.sources) && parsed.sources.length > 0
      ? parsed.sources
      : [...BUILTIN_SOURCES]

    return {
      ...DEFAULT_NEWS_SETTINGS,
      ...parsed,
      sources,
    }
  } catch {
    return { ...DEFAULT_NEWS_SETTINGS, sources: [...BUILTIN_SOURCES] }
  }
}

export function saveNewsSettings(settings: NewsSettings): void {
  localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(settings))
}

/** Emite evento customizado para notificar NewsPanel sobre mudanças de config */
export function dispatchNewsSettingsChange(): void {
  window.dispatchEvent(new CustomEvent('news-settings-changed'))
}

/** Gera um slug a partir do nome da fonte */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
