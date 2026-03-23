import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { useNotification } from '../../components/Notification'

type HubCard = {
  name: string
  description: string
  url: string
  icon: string
  badge: string
}

type HubConfigPayload = {
  ok: boolean
  error?: string
  fonte: 'bigdata_db' | 'legacy-admin' | 'legacy-worker'
  avisos: string[]
  total: number
  cards: HubCard[]
  request_id?: string
}

type HubCardsModuleProps = {
  title: string
  description: string
  endpoint: '/api/apphub/config' | '/api/adminhub/config'
  adminActorFieldId: string
  adminActorFieldName: string
}

const parseApiPayload = async <T,>(response: Response, fallback: string): Promise<T> => {
  const rawText = await response.text()
  const trimmed = rawText.trim()

  if (!trimmed) {
    throw new Error(`${fallback} (HTTP ${response.status}, corpo vazio).`)
  }

  const looksLikeHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
  if (looksLikeHtml) {
    throw new Error(`${fallback} (HTTP ${response.status}, resposta HTML inesperada).`)
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`${fallback} (HTTP ${response.status}, resposta não-JSON).`)
  }
}

export function HubCardsModule({
  title,
  description,
  endpoint,
  adminActorFieldId,
  adminActorFieldName,
}: HubCardsModuleProps) {
  const { showNotification } = useNotification()
  const withTrace = (message: string, payload?: { request_id?: string }) => (
    payload?.request_id ? `${message} (req ${payload.request_id})` : message
  )

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adminActor, setAdminActor] = useState('admin@app.lcv')
  const [payload, setPayload] = useState<HubConfigPayload | null>(null)
  const [cardsJson, setCardsJson] = useState('[]')

  const disabled = useMemo(() => loading || saving, [loading, saving])

  const loadConfig = useCallback(async (shouldNotify = false) => {
    setLoading(true)
    try {
      const response = await fetch(endpoint, {
        headers: {
          'X-Admin-Actor': adminActor,
        },
      })

      const nextPayload = await parseApiPayload<HubConfigPayload>(response, `Falha ao carregar configuração de ${title}`)
      if (!response.ok || !nextPayload.ok) {
        throw new Error(nextPayload.error ?? `Falha ao carregar configuração de ${title}.`)
      }

      setPayload(nextPayload)
      setCardsJson(JSON.stringify(nextPayload.cards, null, 2))

      if (shouldNotify) {
        showNotification(withTrace(`${title} atualizado com ${nextPayload.total} card(s).`, nextPayload), 'success')
      }

      if (Array.isArray(nextPayload.avisos) && nextPayload.avisos.length > 0) {
        showNotification(nextPayload.avisos[0], 'info')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Não foi possível carregar ${title}.`
      showNotification(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [adminActor, endpoint, showNotification, title])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    let parsedCards: HubCard[]
    try {
      parsedCards = JSON.parse(cardsJson) as HubCard[]
    } catch {
      showNotification('JSON inválido. Corrija o payload antes de salvar.', 'error')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Actor': adminActor,
        },
        body: JSON.stringify({
          cards: parsedCards,
          adminActor,
        }),
      })

      const savePayload = await parseApiPayload<{ ok: boolean; error?: string; request_id?: string; total?: number }>(
        response,
        `Falha ao salvar configuração de ${title}`,
      )

      if (!response.ok || !savePayload.ok) {
        throw new Error(savePayload.error ?? `Falha ao salvar configuração de ${title}.`)
      }

      await loadConfig()
      showNotification(withTrace(`${title} salvo com sucesso.`, savePayload), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : `Não foi possível salvar ${title}.`
      showNotification(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div className="detail-icon"><Save size={22} /></div>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      <form className="form-card" onSubmit={handleSave}>
        <div className="result-toolbar">
          <div>
            <h4><Save size={16} /> Configuração de cards</h4>
            <p className="field-hint">Cards persistidos no `bigdata_db`; fallback do legado apenas para bootstrap inicial.</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => void loadConfig(true)} disabled={disabled}>
              {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Recarregar
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="field-group">
            <label htmlFor={adminActorFieldId}>Administrador responsável</label>
            <input
              id={adminActorFieldId}
              name={adminActorFieldName}
              type="text"
              autoComplete="email"
              placeholder="admin@lcv.app.br"
              value={adminActor}
              onChange={(event) => setAdminActor(event.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field-group">
            <label htmlFor={`${adminActorFieldId}-fonte`}>Fonte atual</label>
            <input
              id={`${adminActorFieldId}-fonte`}
              name={`${adminActorFieldName}Fonte`}
              value={payload?.fonte ?? '—'}
              readOnly
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor={`${adminActorFieldId}-cards-json`}>Cards (JSON)</label>
          <textarea
            id={`${adminActorFieldId}-cards-json`}
            name={`${adminActorFieldName}CardsJson`}
            className="json-textarea"
            rows={14}
            value={cardsJson}
            onChange={(event) => setCardsJson(event.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={disabled}>
            {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
            Salvar configuração
          </button>
        </div>
      </form>

      <section className="metrics-grid">
        <article className="metric-card">
          <div className="metric-icon"><Save size={20} /></div>
          <strong>{payload?.total ?? 0}</strong>
          <span>Total de cards ativos.</span>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><RefreshCw size={20} /></div>
          <strong>{payload?.fonte ?? '—'}</strong>
          <span>Fonte dos dados carregados.</span>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><Save size={20} /></div>
          <strong>{payload?.avisos?.length ?? 0}</strong>
          <span>Avisos operacionais no carregamento.</span>
        </article>
      </section>

      <article className="result-card">
        <header className="result-header">
          <h4><RefreshCw size={16} /> Cards atuais</h4>
          <span>{payload?.cards?.length ?? 0} item(ns)</span>
        </header>

        {!payload || payload.cards.length === 0 ? (
          <p className="result-empty">Sem cards carregados para este módulo.</p>
        ) : (
          <ul className="result-list">
            {payload.cards.map((card, index) => (
              <li key={`${card.name}-${index}`}>
                <strong>{card.icon ? `${card.icon} ${card.name}` : card.name}</strong>
                <span>{card.url}</span>
                <span className="badge badge-em-implantacao">{card.badge || 'ação'}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}