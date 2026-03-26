import { useState, useEffect } from 'react'
import { BrainCircuit, Clock, Database, ExternalLink, Globe, Loader2, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react'
import { useNotification } from '../../components/Notification'

type TabId = 'lci-lca' | 'tesouro-ipca' | 'configuracoes'

type RegistroLciLca = {
  id: string
  criadoEm: string
  prazoDias: number
  taxaLciLca: number
  aporte: number
  aliquotaIr: number
  cdbEquivalente: number
}

type RegistroTesouroIpca = {
  id: string
  criadoEm: string
  dataCompra: string
  valorInvestido: number
  taxaContratada: number
}

type TaxaCache = {
  ok: boolean
  fonte?: string
  dataReferencia?: string
  taxaMediaIndicativa?: number
  titulos?: Array<{
    tipo: string
    vencimento: string
    dataBase: string
    taxaCompra: number
    taxaVenda: number
    pu: number
  }>
  error?: string
}

// ─── Configurações persistidas no localStorage ─────────────────────────────

interface OracleConfig {
  csvUrl: string
  cronSchedule: string
  cronTimezone: string
  modeloVision: string
  modeloAnalise: string
}

const DEFAULT_CONFIG: OracleConfig = {
  csvUrl: 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv',
  cronSchedule: '0 5 * * *',
  cronTimezone: 'America/Sao_Paulo (02:00 BRT)',
  modeloVision: 'gemini-3.1-pro-preview',
  modeloAnalise: 'gemini-3.1-pro-preview',
}

function loadConfig(): OracleConfig {
  try {
    const stored = localStorage.getItem('oraculo-config')
    return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

export function OraculoModule() {
  const { showNotification } = useNotification()
  const [activeTab, setActiveTab] = useState<TabId>('tesouro-ipca')
  const [loading, setLoading] = useState(false)
  const [adminActor] = useState('admin@app.lcv')
  const [lciRegistros, setLciRegistros] = useState<RegistroLciLca[]>([])
  const [tesouroRegistros, setTesouroRegistros] = useState<RegistroTesouroIpca[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)

  const [searchTerm, setSearchTerm] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean, id: string, label: string } | null>(null)

  // Configurações
  const [config, setConfig] = useState<OracleConfig>(loadConfig)

  // Status do cache de taxas
  const [taxaCache, setTaxaCache] = useState<TaxaCache | null>(null)
  const [taxaCacheLoading, setTaxaCacheLoading] = useState(false)

  // Trigger manual do CSV
  const [csvTriggerLoading, setCsvTriggerLoading] = useState(false)
  const [csvTriggerResult, setCsvTriggerResult] = useState<{ ok: boolean, message: string, time?: number } | null>(null)

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const carregarRegistros = async () => {
    if (activeTab === 'configuracoes') return
    setLoading(true)
    try {
      const response = await fetch(`/api/oraculo/listar?tipo=${activeTab}&limit=500`)
      const payload = await response.json() as { ok: boolean, total: number, items: any[] }

      if (!response.ok || !payload.ok) {
        throw new Error('Falha ao listar registros do Oráculo.')
      }

      if (activeTab === 'lci-lca') {
        setLciRegistros(payload.items as RegistroLciLca[])
      } else {
        setTesouroRegistros(payload.items as RegistroTesouroIpca[])
      }
      setTotalRegistros(payload.total)
    } catch {
      showNotification('Não foi possível carregar os registros do Oráculo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const carregarStatusCache = async () => {
    setTaxaCacheLoading(true)
    try {
      const res = await fetch('/api/taxa-ipca-atual')
      const data = await res.json() as TaxaCache
      setTaxaCache(data)
    } catch {
      setTaxaCache({ ok: false, error: 'Falha na conexão.' })
    } finally {
      setTaxaCacheLoading(false)
    }
  }

  const dispararProcessamentoCSV = async () => {
    setCsvTriggerLoading(true)
    setCsvTriggerResult(null)
    const start = performance.now()
    try {
      const res = await fetch('/api/taxa-ipca-atual?force=true')
      const data = await res.json() as TaxaCache
      const elapsed = Math.round(performance.now() - start)
      if (data.ok) {
        setCsvTriggerResult({ ok: true, message: `CSV processado com sucesso. ${data.titulos?.length ?? 0} títulos IPCA+ extraídos. Taxa média: ${data.taxaMediaIndicativa}% (ref: ${data.dataReferencia})`, time: elapsed })
        setTaxaCache(data)
        showNotification('CSV do Tesouro Transparente processado com sucesso.', 'success')
      } else {
        setCsvTriggerResult({ ok: false, message: data.error ?? 'Erro desconhecido.', time: elapsed })
        showNotification(`Falha: ${data.error ?? 'Erro desconhecido'}`, 'error')
      }
    } catch {
      setCsvTriggerResult({ ok: false, message: 'Falha na conexão com o servidor.' })
      showNotification('Erro de conexão ao processar CSV.', 'error')
    } finally {
      setCsvTriggerLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'configuracoes') {
      void carregarStatusCache()
    } else {
      void carregarRegistros()
    }
  }, [activeTab])

  const saveConfig = (updates: Partial<OracleConfig>) => {
    const updated = { ...config, ...updates }
    setConfig(updated)
    localStorage.setItem('oraculo-config', JSON.stringify(updated))
    showNotification('Configuração salva.', 'success')
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const executeDelete = async (id: string) => {
    setConfirmDelete(null)
    setDeletingId(id)
    try {
      const response = await fetch('/api/oraculo/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Actor': adminActor },
        body: JSON.stringify({ id, tipo: activeTab }),
      })
      const payload = await response.json() as { ok: boolean, error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha ao excluir.')

      if (activeTab === 'lci-lca') {
        setLciRegistros((c) => c.filter((i) => i.id !== id))
      } else {
        setTesouroRegistros((c) => c.filter((i) => i.id !== id))
      }
      setTotalRegistros((prev) => Math.max(0, prev - 1))
      showNotification('Registro excluído com sucesso.', 'success')
    } catch {
      showNotification('Não foi possível excluir o registro.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Filtro ──────────────────────────────────────────────────────────────────

  const registrosFiltrados = (activeTab === 'lci-lca' ? lciRegistros : tesouroRegistros).filter((registro: any) => {
    const term = searchTerm.toLowerCase()
    if (!term) return true
    const dataHora = new Date(registro.criadoEm ?? '').toLocaleString('pt-BR').toLowerCase()
    if (activeTab === 'lci-lca') {
      return dataHora.includes(term) || String(registro.prazoDias).includes(term) || String(registro.aporte).includes(term) || String(registro.taxaLciLca).includes(term)
    } else {
      return dataHora.includes(term) || (registro.dataCompra ?? '').includes(term) || String(registro.valorInvestido).includes(term) || String(registro.taxaContratada).includes(term)
    }
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: { id: TabId, label: string, icon: React.ReactNode }[] = [
    { id: 'lci-lca', label: 'LCI/LCA', icon: <Database size={14} /> },
    { id: 'tesouro-ipca', label: 'Tesouro IPCA+', icon: <Globe size={14} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={14} /> },
  ]

  return (
    <div className="module-shell">
      <header className="module-shell__header">
        <div className="module-shell__title">
          <BrainCircuit className="h-6 w-6 text-[var(--accent)]" />
          <div className="module-shell__title-text">
            <h2>Oráculo Financeiro</h2>
            <p className="text-sm text-[var(--fg-dim)]">Gestão de simulações, dados de mercado e integrações financeiras</p>
          </div>
        </div>
      </header>

      <div className="module-shell__content">
        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="tabs mb-4 flex gap-2 border-b border-[var(--border)] pb-2">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? 'primary-button' : 'ghost'}
              onClick={() => setActiveTab(id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ── Conteúdo: Registros ─────────────────────────────────────── */}
        {activeTab !== 'configuracoes' && (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0 text-lg font-bold">Registros — {activeTab === 'lci-lca' ? 'LCI/LCA' : 'Tesouro IPCA+'}</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-dim)]" />
                  <input
                    type="text"
                    placeholder="Filtrar dados..."
                    className="pl-9 pr-4 py-2"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button type="button" className="ghost" onClick={() => carregarRegistros()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw size={14} /> Atualizar</>}
                </button>
              </div>
            </div>

            <div className="table-container pt-4">
              {loading && registrosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--fg-dim)]">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p>Carregando registros...</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Data da Análise</th>
                      {activeTab === 'lci-lca' ? (
                        <>
                          <th>Aporte</th>
                          <th>Prazo</th>
                          <th>Taxa (% CDI)</th>
                          <th>Equivalente CDB</th>
                        </>
                      ) : (
                        <>
                          <th>Data Compra</th>
                          <th>Valor Investido</th>
                          <th>Taxa Contratada</th>
                        </>
                      )}
                      <th className="text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={activeTab === 'lci-lca' ? 6 : 5} className="text-center py-8 text-[var(--fg-dim)]">
                          Nenhum registro encontrado para o filtro atual.
                        </td>
                      </tr>
                    ) : (
                      registrosFiltrados.map((registro: any) => {
                        const dataFormatada = new Date(registro.criadoEm).toLocaleString('pt-BR')
                        const label = activeTab === 'lci-lca'
                          ? `${dataFormatada} — LCI ${registro.taxaLciLca}% CDI`
                          : `${dataFormatada} — Tesouro ${registro.taxaContratada}% a.a.`

                        return (
                          <tr key={registro.id}>
                            <td>{dataFormatada}</td>
                            {activeTab === 'lci-lca' ? (
                              <>
                                <td>R$ {registro.aporte.toLocaleString('pt-BR')}</td>
                                <td>{registro.prazoDias} dias</td>
                                <td>{registro.taxaLciLca.toFixed(2)}%</td>
                                <td className="font-medium text-[var(--fg)]">{registro.cdbEquivalente.toFixed(2)}%</td>
                              </>
                            ) : (
                              <>
                                <td>{registro.dataCompra.split('-').reverse().join('/')}</td>
                                <td>R$ {registro.valorInvestido.toLocaleString('pt-BR')}</td>
                                <td className="font-medium text-[var(--fg)]">{registro.taxaContratada.toFixed(2)}%</td>
                              </>
                            )}
                            <td className="text-right">
                              <button
                                type="button"
                                className="ghost p-2"
                                title="Excluir"
                                onClick={() => setConfirmDelete({ show: true, id: registro.id, label })}
                                disabled={deletingId === registro.id}
                              >
                                {deletingId === registro.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-[var(--danger)]" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
              <div className="mt-4 text-sm text-[var(--fg-dim)] text-right">
                Total na base: {totalRegistros} registro(s)
              </div>
            </div>
          </div>
        )}

        {/* ── Conteúdo: Configurações ─────────────────────────────────── */}
        {activeTab === 'configuracoes' && (
          <section className="module-shell__content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Status do Cache de Taxas ── */}
            <article className="result-card">
              <header className="result-header">
                <h4><Database size={16} /> Status do Cache — Taxas IPCA+</h4>
                <button type="button" className="ghost" onClick={() => carregarStatusCache()} disabled={taxaCacheLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  {taxaCacheLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Verificar
                </button>
              </header>

              {taxaCache ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem 0' }}>
                  <div className="field-group">
                    <span className="field-hint">Status</span>
                    <span style={{ fontWeight: 700, color: taxaCache.ok ? 'var(--success, #34a853)' : 'var(--danger)' }}>
                      {taxaCache.ok ? '✓ Operacional' : `✕ ${taxaCache.error ?? 'Erro'}`}
                    </span>
                  </div>
                  {taxaCache.ok && (
                    <>
                      <div className="field-group">
                        <span className="field-hint">Fonte</span>
                        <span style={{ fontWeight: 600 }}>{taxaCache.fonte === 'cache' ? 'Cache D1' : 'Tesouro Transparente (CSV)'}</span>
                      </div>
                      <div className="field-group">
                        <span className="field-hint">Data de Referência</span>
                        <span style={{ fontWeight: 600 }}>{taxaCache.dataReferencia ?? '—'}</span>
                      </div>
                      <div className="field-group">
                        <span className="field-hint">Taxa Média Indicativa</span>
                        <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>
                          {taxaCache.taxaMediaIndicativa?.toFixed(2) ?? '—'}% a.a.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="field-hint" style={{ padding: '1rem 0' }}>Clique em "Verificar" para consultar o status do cache.</p>
              )}

              {/* Títulos disponíveis no cache */}
              {taxaCache?.ok && taxaCache.titulos && taxaCache.titulos.length > 0 && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--fg-dim)' }}>
                    {taxaCache.titulos.length} vencimentos disponíveis
                  </summary>
                  <div className="table-container" style={{ marginTop: '0.5rem' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Vencimento</th>
                          <th>Taxa Compra</th>
                          <th>Taxa Venda</th>
                          <th>PU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxaCache.titulos.map((t, i) => (
                          <tr key={i}>
                            <td>{t.tipo}</td>
                            <td>{t.vencimento}</td>
                            <td>{t.taxaCompra.toFixed(2)}%</td>
                            <td>{t.taxaVenda.toFixed(2)}%</td>
                            <td>R$ {t.pu.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </article>

            {/* ── Disparo Manual do CSV ── */}
            <article className="result-card">
              <header className="result-header">
                <h4><RefreshCw size={16} /> Processamento Manual do CSV</h4>
              </header>
              <p className="field-hint" style={{ padding: '0.5rem 0 0' }}>
                Força o download e reprocessamento imediato do CSV do Tesouro Transparente (~13 MB), independente do cache atual.
                Útil para verificar atualizações fora do horário do cron.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void dispararProcessamentoCSV()}
                  disabled={csvTriggerLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {csvTriggerLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Processando CSV...</>
                  ) : (
                    <><RefreshCw size={14} /> Disparar Agora</>
                  )}
                </button>
              </div>
              {csvTriggerResult && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: `1px solid ${csvTriggerResult.ok ? 'var(--success, #34a853)' : 'var(--danger)'}`,
                  backgroundColor: csvTriggerResult.ok ? 'rgba(52, 168, 83, 0.08)' : 'rgba(234, 67, 53, 0.08)',
                  color: csvTriggerResult.ok ? 'var(--success, #34a853)' : 'var(--danger)',
                  fontSize: '0.9rem',
                }}>
                  <strong>{csvTriggerResult.ok ? '✓ Sucesso' : '✕ Erro'}</strong>
                  {csvTriggerResult.time && <span style={{ marginLeft: '0.75rem', opacity: 0.7 }}>({csvTriggerResult.time}ms)</span>}
                  <p style={{ margin: '0.25rem 0 0', fontWeight: 400 }}>{csvTriggerResult.message}</p>
                </div>
              )}
            </article>

            {/* ── Fonte de Dados ── */}
            <fieldset className="settings-fieldset">
              <legend>Fonte de Dados — Tesouro Transparente</legend>
              <div className="form-grid">
                <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="oraculo-csv-url">
                    <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                    URL do CSV (Tesouro Transparente)
                  </label>
                  <input
                    id="oraculo-csv-url"
                    name="oraculoCsvUrl"
                    type="url"
                    value={config.csvUrl}
                    onChange={(e) => setConfig({ ...config, csvUrl: e.target.value })}
                    onBlur={() => saveConfig({ csvUrl: config.csvUrl })}
                    autoComplete="off"
                    placeholder="https://..."
                  />
                  <span className="field-hint">
                    Fonte oficial de dados abertos do Tesouro Nacional (Licença ODbL). CSV atualizado diariamente (~13 MB).
                    <a href="https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '0.4rem', color: 'var(--accent)' }}>
                      <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /> Ver dataset
                    </a>
                  </span>
                </div>
              </div>
            </fieldset>

            {/* ── Cron (Agendamento) ── */}
            <fieldset className="settings-fieldset">
              <legend>Agendamento — Cron Worker</legend>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="oraculo-cron-schedule">
                    <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                    Schedule (cron expression)
                  </label>
                  <input
                    id="oraculo-cron-schedule"
                    name="oraculoCronSchedule"
                    type="text"
                    value={config.cronSchedule}
                    onChange={(e) => setConfig({ ...config, cronSchedule: e.target.value })}
                    onBlur={() => saveConfig({ cronSchedule: config.cronSchedule })}
                    autoComplete="off"
                    placeholder="0 5 * * *"
                  />
                  <span className="field-hint">Formato cron UTC. Padrão: <code>0 5 * * *</code> (05:00 UTC = 02:00 BRT, diário).</span>
                </div>
                <div className="field-group">
                  <label htmlFor="oraculo-cron-tz">Fuso Horário de Referência</label>
                  <input
                    id="oraculo-cron-tz"
                    name="oraculoCronTimezone"
                    type="text"
                    value={config.cronTimezone}
                    readOnly
                    style={{ opacity: 0.7 }}
                  />
                  <span className="field-hint">O cron roda em UTC no Cloudflare. O horário BRT é apenas referência visual.</span>
                </div>
              </div>
            </fieldset>

            {/* ── Modelos de IA ── */}
            <fieldset className="settings-fieldset">
              <legend>Modelos de IA — Gemini</legend>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="oraculo-model-vision">Modelo Vision (OCR de extratos)</label>
                  <input
                    id="oraculo-model-vision"
                    name="oraculoModelVision"
                    type="text"
                    value={config.modeloVision}
                    onChange={(e) => setConfig({ ...config, modeloVision: e.target.value })}
                    onBlur={() => saveConfig({ modeloVision: config.modeloVision })}
                    autoComplete="off"
                  />
                  <span className="field-hint">Modelo Gemini para extração multimodal (OCR). Ex: gemini-3.1-pro-preview</span>
                </div>
                <div className="field-group">
                  <label htmlFor="oraculo-model-analise">Modelo Análise (Fiduciário)</label>
                  <input
                    id="oraculo-model-analise"
                    name="oraculoModelAnalise"
                    type="text"
                    value={config.modeloAnalise}
                    onChange={(e) => setConfig({ ...config, modeloAnalise: e.target.value })}
                    onBlur={() => saveConfig({ modeloAnalise: config.modeloAnalise })}
                    autoComplete="off"
                  />
                  <span className="field-hint">Modelo Gemini para análise financeira e recomendações.</span>
                </div>
              </div>
            </fieldset>

            {/* ── Informações do Sistema ── */}
            <article className="result-card">
              <header className="result-header">
                <h4><BrainCircuit size={16} /> Informações do Sistema</h4>
              </header>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem 0' }}>
                <div className="field-group">
                  <span className="field-hint">Worker Cron</span>
                  <span style={{ fontWeight: 600 }}>cron-taxa-ipca</span>
                </div>
                <div className="field-group">
                  <span className="field-hint">Database</span>
                  <span style={{ fontWeight: 600 }}>bigdata_db (D1)</span>
                </div>
                <div className="field-group">
                  <span className="field-hint">Tabela Cache</span>
                  <span style={{ fontWeight: 600 }}>oraculo_taxa_ipca_cache</span>
                </div>
                <div className="field-group">
                  <span className="field-hint">Regime Fiscal</span>
                  <span style={{ fontWeight: 600 }}>MP 2026 — IR 17,5% uniforme (novos investimentos)</span>
                </div>
              </div>
            </article>
          </section>
        )}
      </div>

      {/* ── Modal de Confirmação de Exclusão ───────────────────────────── */}
      {confirmDelete?.show && (
        <div className="modal-backdrop fade-in" role="presentation">
          <div className="modal slide-up" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="modal-header">
              <h3 id="delete-title" className="text-lg font-bold">Excluir Registro?</h3>
              <button type="button" className="ghost p-2" onClick={() => setConfirmDelete(null)} aria-label="Cancelar exclusão">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 border-b border-[var(--border)] bg-[var(--danger)] bg-opacity-10 text-[var(--danger)]">
              Você está prestes a excluir este registro da base <b>bigdata_db</b> do Oráculo permanentemente.
              <p className="mt-2 text-sm font-semibold">{confirmDelete.label}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button
                type="button"
                className="primary-button bg-[var(--danger)] border-[var(--danger)] hover:opacity-90 active:scale-95 text-white"
                onClick={() => void executeDelete(confirmDelete.id)}
              >
                Sim, excluir registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
