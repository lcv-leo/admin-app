/*
 * Copyright (C) 2026 Leonardo Cardozo Vargas
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle, Eye, EyeOff, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useNotification } from '../../components/Notification'
import './CfPwModule.css'

type AccountSummary = {
  accountId: string
  accountName: string
  source: string
}

type WorkerSummary = {
  scriptName: string
  handlers: string[]
  createdAt: string | null
  updatedAt: string | null
  tag: string | null
}

type PageSummary = {
  projectName: string
  id: string | null
  subdomain: string | null
  productionBranch: string | null
  createdAt: string | null
  domains: string[]
  latestDeployment: {
    id: string | null
    environment: string | null
    createdAt: string | null
    url: string | null
  } | null
}

type OverviewPayload = {
  ok: boolean
  error?: string
  request_id?: string
  account?: AccountSummary
  summary?: {
    totalWorkers: number
    totalPages: number
  }
  workers?: WorkerSummary[]
  pages?: PageSummary[]
}

type WorkerDetailsPayload = {
  ok: boolean
  error?: string
  request_id?: string
  scriptName?: string
  worker?: Record<string, unknown>
  deployments?: Array<Record<string, unknown>>
  warnings?: Array<{ code?: string; message?: string }>
}

type PageDetailsPayload = {
  ok: boolean
  error?: string
  request_id?: string
  projectName?: string
  project?: Record<string, unknown>
  deployments?: Array<Record<string, unknown>>
  warnings?: Array<{ code?: string; message?: string }>
}

type DeletePayload = {
  ok: boolean
  error?: string
  request_id?: string
  message?: string
}

type OpsResponsePayload = {
  ok: boolean
  error?: string
  request_id?: string
  action?: string
  accountId?: string
  result?: unknown
}

type DetailType = 'worker' | 'page'

type DetailState = {
  type: DetailType
  id: string
  payload: WorkerDetailsPayload | PageDetailsPayload
}

type OperationalAlert = {
  code: string
  cause: string
  action: string
}

type OpsActionField =
  | 'scriptName'
  | 'projectName'
  | 'deploymentId'
  | 'domainName'
  | 'secretName'
  | 'secretValue'
  | 'usageModel'
  | 'schedules'
  | 'projectBranch'
  | 'pageSettingsJson'
  | 'zoneId'
  | 'routeId'
  | 'routePattern'

type OpsActionDefinition = {
  value: string
  label: string
  description: string
  fields: OpsActionField[]
  outcomeLabel: string
}

const WORKER_OPS: OpsActionDefinition[] = [
  {
    value: 'get-worker-schedules',
    label: 'Ler cron triggers do Worker',
    description: 'Consulta os schedules configurados para execução automática.',
    fields: ['scriptName'],
    outcomeLabel: 'Schedules retornados pela Cloudflare',
  },
  {
    value: 'update-worker-schedules',
    label: 'Atualizar cron triggers do Worker',
    description: 'Substitui a lista atual de schedules. Informe um cron por linha.',
    fields: ['scriptName', 'schedules'],
    outcomeLabel: 'Resultado da atualização de schedules',
  },
  {
    value: 'get-worker-usage-model',
    label: 'Ler usage model do Worker',
    description: 'Mostra o modelo de cobrança atualmente aplicado.',
    fields: ['scriptName'],
    outcomeLabel: 'Usage model atual',
  },
  {
    value: 'update-worker-usage-model',
    label: 'Atualizar usage model do Worker',
    description: 'Altera o usage model do Worker.',
    fields: ['scriptName', 'usageModel'],
    outcomeLabel: 'Resultado da troca de usage model',
  },
  {
    value: 'list-worker-secrets',
    label: 'Listar secrets do Worker',
    description: 'Retorna os nomes dos secrets configurados.',
    fields: ['scriptName'],
    outcomeLabel: 'Secrets encontrados',
  },
  {
    value: 'add-worker-secret',
    label: 'Adicionar secret ao Worker',
    description: 'Grava um novo secret. O valor é enviado apenas na execução.',
    fields: ['scriptName', 'secretName', 'secretValue'],
    outcomeLabel: 'Resultado da gravação do secret',
  },
  {
    value: 'delete-worker-secret',
    label: 'Remover secret do Worker',
    description: 'Exclui um secret existente pelo nome.',
    fields: ['scriptName', 'secretName'],
    outcomeLabel: 'Resultado da remoção do secret',
  },
  {
    value: 'list-worker-versions',
    label: 'Listar versões do Worker',
    description: 'Consulta as versões publicadas para apoiar rollback.',
    fields: ['scriptName'],
    outcomeLabel: 'Versões retornadas',
  },
  {
    value: 'list-worker-routes',
    label: 'Listar rotas por zona',
    description: 'Consulta rotas vinculadas a uma zona Cloudflare.',
    fields: ['zoneId'],
    outcomeLabel: 'Rotas encontradas na zona',
  },
  {
    value: 'add-worker-route',
    label: 'Adicionar rota do Worker',
    description: 'Vincula o Worker a um pattern de rota.',
    fields: ['zoneId', 'routePattern', 'scriptName'],
    outcomeLabel: 'Resultado da criação da rota',
  },
  {
    value: 'delete-worker-route',
    label: 'Remover rota',
    description: 'Exclui uma rota específica usando zoneId e routeId.',
    fields: ['zoneId', 'routeId'],
    outcomeLabel: 'Resultado da remoção da rota',
  },
]

const PAGE_OPS: OpsActionDefinition[] = [
  {
    value: 'create-page-project',
    label: 'Criar projeto Pages',
    description: 'Cria um projeto Pages informando o nome e a branch.',
    fields: ['projectName', 'projectBranch'],
    outcomeLabel: 'Resumo do projeto criado',
  },
  {
    value: 'list-page-domains',
    label: 'Listar domínios',
    description: 'Consulta os domínios já vinculados ao projeto.',
    fields: ['projectName'],
    outcomeLabel: 'Domínios configurados',
  },
  {
    value: 'add-page-domain',
    label: 'Adicionar domínio',
    description: 'Vincula um domínio customizado ao projeto Pages.',
    fields: ['projectName', 'domainName'],
    outcomeLabel: 'Resultado da adição do domínio',
  },
  {
    value: 'delete-page-domain',
    label: 'Remover domínio',
    description: 'Remove um domínio customizado do projeto.',
    fields: ['projectName', 'domainName'],
    outcomeLabel: 'Resultado da remoção do domínio',
  },
  {
    value: 'retry-page-deployment',
    label: 'Refazer deployment',
    description: 'Dispara novo processamento para um deployment específico.',
    fields: ['projectName', 'deploymentId'],
    outcomeLabel: 'Resultado do retry',
  },
  {
    value: 'rollback-page-deployment',
    label: 'Executar rollback',
    description: 'Solicita rollback para um deployment específico.',
    fields: ['projectName', 'deploymentId'],
    outcomeLabel: 'Resultado do rollback',
  },
  {
    value: 'get-page-deployment-logs',
    label: 'Ler logs de deployment',
    description: 'Traz o histórico de logs do deployment.',
    fields: ['projectName', 'deploymentId'],
    outcomeLabel: 'Logs retornados',
  },
]

const parseApiPayload = async <T,>(response: Response, fallback: string): Promise<T> => {
  const rawText = await response.text()
  const trimmed = rawText.trim()
  const cfRay = response.headers.get('cf-ray')
  const statusInfo = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  const traceInfo = cfRay ? `${statusInfo}, cf-ray ${cfRay}` : statusInfo

  if (!trimmed) {
    throw new Error(`${fallback} (${traceInfo}, corpo vazio).`)
  }

  const looksLikeHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
  if (looksLikeHtml) {
    throw new Error(`${fallback} (${traceInfo}, resposta HTML inesperada).`)
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`${fallback} (${traceInfo}, resposta não-JSON).`)
  }
}

const withReq = (message: string, payload?: { request_id?: string }) => {
  if (payload?.request_id) {
    return `${message} (req ${payload.request_id})`
  }
  return message
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('pt-BR')
}

const valueToText = (value: unknown) => {
  if (value == null) return '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return '—'
}

export function CfPwModule() {
  const { showNotification } = useNotification()
  const [adminActor] = useState('admin@app.lcv')

  const [loadingOverview, setLoadingOverview] = useState(false)
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [workers, setWorkers] = useState<WorkerSummary[]>([])
  const [pages, setPages] = useState<PageSummary[]>([])

  const [detailsLoading, setDetailsLoading] = useState(false)
  const [details, setDetails] = useState<DetailState | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<{ type: DetailType; id: string } | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  
  const [selectedOp, setSelectedOp] = useState<OpsActionDefinition | null>(null)
  const [opsModalOpen, setOpsModalOpen] = useState(false)
  const [opsLoading, setOpsLoading] = useState(false)
  
  const [opsState, setOpsState] = useState<Record<string, string>>({
    usageModel: 'standard',
    schedulesRaw: '0 5 * * *',
    projectBranch: 'main'
  })
  
  const [opsResult, setOpsResult] = useState<unknown>(null)
  const [showSecret, setShowSecret] = useState(false)

  const [activeTab, setActiveTab] = useState<'deployments' | 'settings'>('deployments')

  const updateOpsState = (key: string, value: string) => {
    setOpsState(prev => ({ ...prev, [key]: value }))
  }

  const operationalAlerts = useMemo<OperationalAlert[]>(() => {
    const next: OperationalAlert[] = []
    if (!account && !loadingOverview) {
      next.push({ code: 'CFPW-ACCOUNT-UNAVAILABLE', cause: 'A conta ativa não foi carregada nesta sessão.', action: 'Atualize para sincronizar.' })
    }
    if (loadingOverview) {
      next.push({ code: 'CFPW-SYNC-RUNNING', cause: 'Sincronização em andamento.', action: 'Aguarde' })
    }
    if (detailsLoading) {
      next.push({ code: 'CFPW-DETAILS-RUNNING', cause: 'Consulta em processamento.', action: 'Aguarde' })
    }
    if (deleting) {
      next.push({ code: 'CFPW-DELETE-RUNNING', cause: 'Exclusão em execução irreversível.', action: 'Aguarde' })
    }
    if (!loadingOverview && account && workers.length === 0 && pages.length === 0) {
      next.push({ code: 'CFPW-EMPTY-INVENTORY', cause: 'Nenhum recurso encontrado.', action: 'Verifique' })
    }
    return next
  }, [account, deleting, detailsLoading, loadingOverview, pages.length, workers.length])

  const loadOverview = useCallback(async (notify = false) => {
    setLoadingOverview(true)
    try {
      const response = await fetch('/api/cfpw/overview', { headers: { 'X-Admin-Actor': adminActor } })
      const payload = await parseApiPayload<OverviewPayload>(response, 'Falha ao carregar CF P&W')
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha.')
      
      setAccount(payload.account ?? null)
      setWorkers(Array.isArray(payload.workers) ? payload.workers : [])
      setPages(Array.isArray(payload.pages) ? payload.pages : [])
      if (notify) showNotification(withReq('Sincronizado.', payload), 'success')
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Falha.', 'error')
    } finally {
      setLoadingOverview(false)
    }
  }, [adminActor, showNotification])

  const openWorkerDetails = useCallback(async (scriptName: string) => {
    setDetailsLoading(true)
    try {
      const query = new URLSearchParams({ scriptName })
      const response = await fetch(`/api/cfpw/worker-details?${query.toString()}`, { headers: { 'X-Admin-Actor': adminActor } })
      const payload = await parseApiPayload<WorkerDetailsPayload>(response, `Falha ${scriptName}`)
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha.')
      
      setDetails({ type: 'worker', id: scriptName, payload })
      updateOpsState('scriptName', scriptName)
      setActiveTab('deployments')
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Falha.', 'error')
    } finally {
      setDetailsLoading(false)
    }
  }, [adminActor, showNotification])

  const openPageDetails = useCallback(async (projectName: string) => {
    setDetailsLoading(true)
    try {
      const query = new URLSearchParams({ projectName })
      const response = await fetch(`/api/cfpw/page-details?${query.toString()}`, { headers: { 'X-Admin-Actor': adminActor } })
      const payload = await parseApiPayload<PageDetailsPayload>(response, `Falha ${projectName}`)
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha.')
      
      setDetails({ type: 'page', id: projectName, payload })
      updateOpsState('projectName', projectName)
      setActiveTab('deployments')
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Falha.', 'error')
    } finally {
      setDetailsLoading(false)
    }
  }, [adminActor, showNotification])

  const closeDetails = () => {
    setDetails(null)
  }

  const runDelete = useCallback(async () => {
    if (!deleteTarget) return
    const expected = deleteTarget.id
    if (deleteConfirmation.trim() !== expected) {
      showNotification(`Digite exatamente: ${expected}`, 'error')
      return
    }
    setDeleting(true)
    try {
      const endpoint = deleteTarget.type === 'worker' ? '/api/cfpw/delete-worker' : '/api/cfpw/delete-page'
      const body = deleteTarget.type === 'worker' ? { scriptName: expected, confirmation: expected } : { projectName: expected, confirmation: expected }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Actor': adminActor },
        body: JSON.stringify(body)
      })
      const payload = await parseApiPayload<DeletePayload>(response, 'Falha exclusão')
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha exclusão.')
      
      showNotification(withReq(payload.message ?? 'Excluído.', payload), 'success')
      setDeleteTarget(null)
      setDeleteConfirmation('')
      if (details?.id === expected && details.type === deleteTarget.type) setDetails(null)
      await loadOverview()
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Erro', 'error')
    } finally {
      setDeleting(false)
    }
  }, [adminActor, deleteConfirmation, deleteTarget, details, loadOverview, showNotification])

  const executeAdvancedOp = useCallback(async (actionDef: OpsActionDefinition) => {
    setOpsLoading(true)
    try {
      const schedules = (opsState.schedulesRaw || '')
        .split('\n').map(line => line.trim()).filter(Boolean).map(cron => ({ cron }))

      const response = await fetch('/api/cfpw/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Actor': adminActor },
        body: JSON.stringify({
          action: actionDef.value,
          scriptName: opsState.scriptName || details?.id,
          projectName: opsState.projectName || details?.id,
          deploymentId: opsState.deploymentId,
          domainName: opsState.domainName,
          secretName: opsState.secretName,
          secretValue: opsState.secretValue,
          usageModel: opsState.usageModel,
          schedules,
          projectBranch: opsState.projectBranch,
          pageSettingsJson: opsState.pageSettingsJson,
          zoneId: opsState.zoneId,
          routeId: opsState.routeId,
          routePattern: opsState.routePattern
        })
      })
      const payload = await parseApiPayload<OpsResponsePayload>(response, `Falha na operação`)
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha na operação')
      
      setOpsResult(payload.result ?? null)
      showNotification(withReq(`Operação (${actionDef.value}) concluída.`, payload), 'success')
      
      if (actionDef.value === 'rollback-page-deployment' && details?.type === 'page') {
         void openPageDetails(details.id)
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Erro na operação.', 'error')
    } finally {
      setOpsLoading(false)
    }
  }, [adminActor, details, opsState, openPageDetails, showNotification])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const openActionModal = (action: OpsActionDefinition) => {
    setSelectedOp(action)
    setOpsResult(null)
    setOpsModalOpen(true)
  }

  const detailDeployments = useMemo(() => {
    if (!details) return [] as Array<Record<string, unknown>>
    return Array.isArray(details.payload.deployments) ? details.payload.deployments : []
  }, [details])

  const renderDashboard = () => (
    <div className="cfpw-dashboard">
      <div className="cfpw-overview-hero">
        <div>
          <h3>Cloudflare Edge Network</h3>
          <p>
            {account ? `Conectado a ${account.accountName}` : 'Aguardando sincronização...'} • 
            Status: <span className={`cfpw-status-badge ${loadingOverview ? 'warning' : 'ok'}`}>{loadingOverview ? 'Sincronizando' : 'Ativo'}</span>
          </p>
        </div>
        <div className="cfpw-overview-kpis">
          <div className="cfpw-kpi">
            <span>Workers</span>
            <strong>{workers.length}</strong>
          </div>
          <div className="cfpw-kpi">
            <span>Pages</span>
            <strong>{pages.length}</strong>
          </div>
          <button type="button" className="ghost-button" onClick={() => void loadOverview(true)} disabled={loadingOverview} style={{ alignSelf: 'center', height: '40px', width: '40px', padding: '0', display: 'flex', justifyContent: 'center' }}>
            {loadingOverview ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />} 
          </button>
        </div>
      </div>

      {operationalAlerts.length > 0 && (
         <article className="integrity-banner integrity-banner--warning" role="status">
            <h4 className="integrity-banner__header"><AlertTriangle size={16} /> Alertas</h4>
            <ul className="integrity-banner__list">
              {operationalAlerts.map(alert => (
                <li key={alert.code}><strong>{alert.code}</strong> · {alert.cause} {alert.action}</li>
              ))}
            </ul>
         </article>
      )}

      {/* Pages Grid */}
      <h4 style={{ margin: '8px 0 0', fontWeight: 600 }}>Pages Projects</h4>
      {pages.length === 0 ? <div className="cfpw-empty-state">Nenhum projeto encontrado.</div> : (
        <div className="cfpw-dash-grid">
          {pages.map(page => (
            <div className="cfpw-resource-card" key={page.projectName}>
              <div className="cfpw-resource-header">
                <div className="cfpw-resource-title">
                  <div className="cfpw-resource-title-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4>{page.projectName}</h4>
                    <p>{page.subdomain ?? 'Sem subdomínio'}</p>
                  </div>
                </div>
                <div className="cfpw-status-badge">
                  {page.productionBranch ?? 'N/A'}
                </div>
              </div>
              <div className="cfpw-resource-meta">
                <div className="cfpw-meta-item">
                  <span>Domínios</span>
                  <strong>{page.domains?.length || 0}</strong>
                </div>
                <div className="cfpw-meta-item">
                  <span>Atualizado</span>
                  <strong>{formatDateTime(page.latestDeployment?.createdAt)}</strong>
                </div>
              </div>
              <div className="cfpw-resource-actions">
                <button type="button" className="ghost-button" onClick={() => void openPageDetails(page.projectName)}>Gerenciar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workers Grid */}
      <h4 style={{ margin: '24px 0 0', fontWeight: 600 }}>Workers</h4>
      {workers.length === 0 ? <div className="cfpw-empty-state">Nenhum Worker encontrado.</div> : (
        <div className="cfpw-dash-grid">
          {workers.map(worker => (
            <div className="cfpw-resource-card" key={worker.scriptName}>
              <div className="cfpw-resource-header">
                <div className="cfpw-resource-title">
                  <div className="cfpw-resource-title-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4>{worker.scriptName}</h4>
                    <p>{worker.handlers.length > 0 ? worker.handlers.join(', ') : 'No handlers'}</p>
                  </div>
                </div>
                <div className="cfpw-status-badge">
                  Ativo
                </div>
              </div>
              <div className="cfpw-resource-meta">
                <div className="cfpw-meta-item">
                  <span>Atualizado em</span>
                  <strong>{formatDateTime(worker.updatedAt)}</strong>
                </div>
              </div>
              <div className="cfpw-resource-actions">
                <button type="button" className="ghost-button" onClick={() => void openWorkerDetails(worker.scriptName)}>Gerenciar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderDetailView = () => {
    if (!details) return null
    return (
      <div className="cfpw-detail-view">
        <div className="cfpw-detail-view-header">
           <button type="button" className="ghost-button" onClick={closeDetails} style={{ padding: '8px', border: 'none' }}>← Voltar</button>
           <div className="cfpw-detail-view-header-content">
             <h2>{details.id} {detailsLoading && <Loader2 size={16} className="spin"/>}</h2>
             <p>{details.type === 'page' ? 'Pages Project' : 'Cloudflare Worker'}</p>
           </div>
           <button 
             type="button" 
             className="ghost-button" 
             style={{ borderColor: 'rgba(234,67,53,0.3)', color: '#d93025' }} 
             onClick={() => { setDeleteTarget({ type: details.type, id: details.id }); setDeleteConfirmation(''); }}
           >
             <Trash2 size={14}/> Excluir projeto
           </button>
        </div>

        <div className="page-tab-nav" style={{ padding: '0 32px' }}>
          <button className={`page-tab-item ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => setActiveTab('deployments')}>Deployments & Visão Geral</button>
          <button className={`page-tab-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Configurações & Ações</button>
        </div>

        <div className="cfpw-detail-body">
          <div className="cfpw-detail-content">
            {activeTab === 'deployments' && (
              <div className="cfpw-detail-section">
                <h3>Histórico de Deployments ({detailDeployments.length})</h3>
                {detailDeployments.length > 0 ? (
                  <div className="cfpw-deploy-list">
                      {detailDeployments.slice(0, 15).map((deployment, index) => {
                        const id = valueToText(deployment.id ?? deployment.short_id)
                        const environment = valueToText(deployment.environment)
                        const status = valueToText((deployment.latest_stage as Record<string, unknown> | undefined)?.status ?? deployment.strategy)
                        const url = valueToText(deployment.url)
                        
                        return (
                          <div className="cfpw-deploy-item" key={`${id}-${index}`}>
                              <div className="cfpw-deploy-type">
                                {environment}
                              </div>
                              <div className="cfpw-deploy-item-main">
                                <strong>{id}</strong>
                                <span>{formatDateTime(typeof deployment.created_on === 'string' ? deployment.created_on : null)} • {status}</span>
                              </div>
                              <div>
                                {url !== '—' && (
                                  <a href={String(url)} target="_blank" rel="noreferrer" className="ghost-button" style={{ padding: '4px 12px', fontSize: '12px' }}>Acessar URL</a>
                                )}
                              </div>
                          </div>
                        )
                      })}
                  </div>
                ) : <div className="cfpw-empty-state">Sem deployments ativos</div>}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="cfpw-detail-section">
                 <h3>Ações de Gerenciamento</h3>
                 <div className="cfpw-action-list">
                    {(details.type === 'worker' ? WORKER_OPS : PAGE_OPS).map(action => (
                       <button type="button" className="cfpw-action-item" key={action.value} onClick={() => openActionModal(action)}>
                         <div className="action-icon">
                           <ShieldCheck size={20} />
                         </div>
                         <div className="cfpw-action-item-text">
                           <strong>{action.label}</strong>
                           <span>{action.description}</span>
                         </div>
                       </button>
                    ))}
                 </div>
              </div>
            )}
          </div>

          <div className="cfpw-detail-sidebar">
             <div className="cfpw-detail-section">
                <h3>Informações Técnicas</h3>
                {details.type === 'page' && (
                  <>
                  <div className="cfpw-detail-kpi">
                     <span>Domínios Vinculados</span>
                     <strong>{(details.payload as any)?.project?.domains?.length || 0}</strong>
                  </div>
                  <div className="cfpw-detail-kpi" style={{ marginTop: '12px' }}>
                     <span>Branch de Produção</span>
                     <strong>{(details.payload as any)?.project?.production_branch || 'N/A'}</strong>
                  </div>
                  </>
                )}
                {details.type === 'worker' && (
                  <>
                  <div className="cfpw-detail-kpi">
                     <span>Usage Model</span>
                     <strong>{(details.payload as any)?.worker?.usage_model || 'N/A'}</strong>
                  </div>
                  <div className="cfpw-detail-kpi" style={{ marginTop: '12px' }}>
                     <span>Compatibility Date</span>
                     <strong>{(details.payload as any)?.worker?.compatibility_date || 'N/A'}</strong>
                  </div>
                  </>
                )}
             </div>
          </div>
        </div>
      </div>
    )
  }

  const renderOpsModal = () => {
    if (!selectedOp || !opsModalOpen) return null

    const visibleFields = new Set(selectedOp.fields)

    return createPortal(
      <div className="cfpw-modal-overlay" onClick={() => { if(!opsLoading) setOpsModalOpen(false) }}>
         <div className="cfpw-modal" onClick={e => e.stopPropagation()}>
            <div className="cfpw-modal-header">
               <div>
                 <h3>{selectedOp.label}</h3>
                 <p style={{margin:0, fontSize:'0.85rem', color:'#5f6368', marginTop:'4px'}}>{selectedOp.description}</p>
               </div>
               <button className="cfpw-modal-close" onClick={() => setOpsModalOpen(false)}><RefreshCw size={20}/></button>
            </div>
            
            <div className="cfpw-modal-body">
               <div className="form-grid cfpw-ops-grid">
                  {visibleFields.has('deploymentId') && (
                    <div className="field-group cfpw-ops-grid-full">
                       <label>Deployment ID</label>
                       <input value={opsState.deploymentId || ''} onChange={e => updateOpsState('deploymentId', e.target.value)} disabled={opsLoading} />
                    </div>
                  )}
                  {visibleFields.has('domainName') && (
                    <div className="field-group cfpw-ops-grid-full">
                       <label>Domínio</label>
                       <input value={opsState.domainName || ''} onChange={e => updateOpsState('domainName', e.target.value)} disabled={opsLoading} />
                    </div>
                  )}
                  {visibleFields.has('secretName') && (
                    <div className="field-group">
                       <label>Nome do Secret</label>
                       <input value={opsState.secretName || ''} onChange={e => updateOpsState('secretName', e.target.value)} disabled={opsLoading} />
                    </div>
                  )}
                  {visibleFields.has('secretValue') && (
                    <div className="field-group">
                       <label>Valor</label>
                       <div className="cfpw-secret-wrap">
                          <input type={showSecret ? 'text' : 'password'} value={opsState.secretValue || ''} onChange={e => updateOpsState('secretValue', e.target.value)} disabled={opsLoading} />
                          <button type="button" className="cfpw-secret-toggle" onClick={() => setShowSecret(v => !v)}>
                            {showSecret ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                       </div>
                    </div>
                  )}
                  {visibleFields.has('usageModel') && (
                    <div className="field-group">
                       <label>Usage Model</label>
                       <select value={opsState.usageModel} onChange={e => updateOpsState('usageModel', e.target.value)}>
                         <option value="standard">standard</option>
                         <option value="bundled">bundled</option>
                         <option value="unbound">unbound</option>
                       </select>
                    </div>
                  )}
                  {visibleFields.has('schedules') && (
                     <div className="field-group cfpw-ops-grid-full">
                        <label>Schedules (Cron, um por linha)</label>
                        <textarea className="json-textarea" rows={4} value={opsState.schedulesRaw} onChange={e => updateOpsState('schedulesRaw', e.target.value)} />
                     </div>
                  )}
                  {visibleFields.has('pageSettingsJson') && (
                     <div className="field-group cfpw-ops-grid-full">
                        <label>Config JSON (Avançado)</label>
                        <textarea className="json-textarea" rows={4} value={opsState.pageSettingsJson || ''} onChange={e => updateOpsState('pageSettingsJson', e.target.value)} />
                     </div>
                  )}
                  {visibleFields.has('routePattern') && (
                     <div className="field-group cfpw-ops-grid-full">
                        <label>Pattern Route</label>
                        <input value={opsState.routePattern || ''} onChange={e => updateOpsState('routePattern', e.target.value)} disabled={opsLoading}/>
                     </div>
                  )}
                  {visibleFields.has('zoneId') && (
                     <div className="field-group">
                        <label>Zone ID</label>
                        <input value={opsState.zoneId || ''} onChange={e => updateOpsState('zoneId', e.target.value)} disabled={opsLoading}/>
                     </div>
                  )}
                  {visibleFields.has('routeId') && (
                     <div className="field-group">
                        <label>Route ID (para exclusão)</label>
                        <input value={opsState.routeId || ''} onChange={e => updateOpsState('routeId', e.target.value)} disabled={opsLoading}/>
                     </div>
                  )}
               </div>

               {opsResult ? (
                  <div className="cfpw-result-container" style={{ marginTop: '16px', background: '#f8f9fa', padding: '16px', borderRadius: '12px' }}>
                    <div className="cfpw-result-header" style={{ marginBottom: '8px' }}>
                      <span className="cfpw-result-header__badge cfpw-result-header__badge--ok" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#137333', background: '#e6f4ea', width: 'fit-content', padding: '4px 8px', borderRadius: '12px' }}>
                        <CheckCircle size={12} /> Concluído
                      </span>
                    </div>
                    <details>
                      <summary style={{ fontSize: '0.85rem', cursor: 'pointer', color: '#5f6368' }}>Visualizar Saída de Dados</summary>
                      <pre style={{ margin: '8px 0 0', fontSize: '0.8rem', textWrap: 'wrap', wordBreak: 'break-all' }}>{JSON.stringify(opsResult, null, 2)}</pre>
                    </details>
                  </div>
               ) : null}
            </div>

            <div className="cfpw-modal-footer">
               <button className="ghost-button" onClick={() => setOpsModalOpen(false)} disabled={opsLoading}>Fechar</button>
               <button className="primary-button" onClick={() => executeAdvancedOp(selectedOp)} disabled={opsLoading}>
                 {opsLoading ? <Loader2 size={16} className="spin"/> : 'Executar Ação'}
               </button>
            </div>
         </div>
      </div>,
      document.body
    )
  }

  const renderDeleteConfirmation = () => {
    if (!deleteTarget) return null
    return createPortal(
      <div className="cfpw-modal-overlay">
        <div className="cfpw-modal" style={{ maxWidth: '400px' }}>
           <div className="cfpw-modal-header" style={{ background: '#fce8e6' }}>
              <h3 style={{ color: '#c5221f', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={24}/> Remoção Crítica</h3>
           </div>
           <div className="cfpw-modal-body">
              <p>Você está prestes a excluir o projeto <strong>{deleteTarget.id}</strong> (Tipo: {deleteTarget.type}). Essa ação é irreversível.</p>
              <div className="field-group">
                 <label>Verificação de Segurança</label>
                 <input placeholder={`Digite: ${deleteTarget.id}`} value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} autoFocus />
              </div>
           </div>
           <div className="cfpw-modal-footer">
              <button className="ghost-button" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
              <button className="primary-button" style={{ background: '#d93025', borderColor: '#d93025', color: '#fff' }} onClick={() => runDelete()} disabled={deleting}>
                 {deleting ? <Loader2 className="spin" size={16}/> : 'Confirmar Destruição'}
              </button>
           </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <section className="module-shell module-shell-cfpw" aria-label="Cloudflare Pages & Workers">
       {!details ? renderDashboard() : renderDetailView()}
       {renderOpsModal()}
       {renderDeleteConfirmation()}
    </section>
  )
}
