// admin-app/functions/api/financeiro/sumup-sync.ts
// POST — Sincroniza checkouts SumUp com D1 usando @sumup/sdk
// Portado 1:1 do mainsite-worker /api/sumup/sync para compliance com SumUp SDK v0.1.2+

import SumUp from '@sumup/sdk'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  BIGDATA_DB: D1Database
  SUMUP_API_KEY_PRIVATE: string
  SUMUP_MERCHANT_CODE: string
}

const FINANCIAL_CUTOFF_BRT = '2026-03-01T00:00:00-03:00'
const FINANCIAL_CUTOFF_UTC = new Date(FINANCIAL_CUTOFF_BRT)

const isOnOrAfterCutoff = (value: string | null | undefined): boolean => {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() >= FINANCIAL_CUTOFF_UTC.getTime()
}

const normalizeSumupStatus = (status: string): string => {
  const s = String(status || '').trim().toUpperCase()
  if (!s) return 'UNKNOWN'
  const map: Record<string, string> = {
    PAID: 'SUCCESSFUL', APPROVED: 'SUCCESSFUL', SUCCESSFUL: 'SUCCESSFUL',
    PENDING: 'PENDING', IN_PROCESS: 'PENDING', PROCESSING: 'PENDING',
    FAILED: 'FAILED', FAILURE: 'FAILED',
    EXPIRED: 'EXPIRED',
    REFUNDED: 'REFUNDED',
    PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
    CANCELED: 'CANCELLED', CANCEL: 'CANCELLED', CANCELLED: 'CANCELLED',
    CHARGEBACK: 'CHARGE_BACK', CHARGE_BACK: 'CHARGE_BACK',
  }
  return map[s] || s
}

const resolveSumupStatusFromSources = (rowStatus: string, payloadStatus: string | null): string => {
  const row = normalizeSumupStatus(rowStatus || 'UNKNOWN')
  const payload = normalizeSumupStatus(payloadStatus || 'UNKNOWN')

  // Dados do provedor (SumUp) SEMPRE têm prioridade sobre o que está na D1.
  // Se o provedor reporta um status válido (não-UNKNOWN), ele vence.
  if (payload && payload !== 'UNKNOWN') return payload

  // Fallback para status do DB apenas quando o provedor não reporta nada
  return row !== 'UNKNOWN' ? row : 'UNKNOWN'
}

interface SumUpTransaction {
  id?: string
  status?: string
  type?: string
  amount?: number
  timestamp?: string
}

interface SumUpCheckout {
  id?: string
  status?: string
  amount?: number
  date?: string
  timestamp?: string
  created_at?: string
  transactions?: SumUpTransaction[]
}

type SyncContext = {
  request: Request
  env: Env
}

export const onRequestPost = async (context: SyncContext): Promise<Response> => {
  const db = context.env.BIGDATA_DB
  const token = context.env.SUMUP_API_KEY_PRIVATE
  if (!token) return Response.json({ error: 'SUMUP_API_KEY_PRIVATE ausente.' }, { status: 503 })

  try {
    const client = new SumUp({ apiKey: token })
    const checkouts: SumUpCheckout[] = await client.checkouts.list()
    if (!Array.isArray(checkouts)) throw new Error('Resposta inesperada da SumUp.')

    let inserted = 0, updated = 0
    for (const checkout of checkouts) {
      const tx = checkout.transactions?.[0]
      const sourceTimestamp = tx?.timestamp || checkout?.timestamp || checkout?.date || checkout?.created_at || null
      if (sourceTimestamp && !isOnOrAfterCutoff(sourceTimestamp)) continue

      const checkoutId = checkout.id
      const transactionId = tx?.id || checkout.id
      const amount = Number(checkout.amount || 0)
      const raw = JSON.stringify(checkout)

      // Detectar status real analisando TODAS as transações do checkout.
      // Refunds aparecem como transações adicionais com type=REFUND.
      let payloadStatus = tx?.status || checkout.status || 'UNKNOWN'
      const allTxns = checkout.transactions || []
      const refundTxns = allTxns.filter((t: SumUpTransaction) =>
        String(t.type || '').toUpperCase() === 'REFUND' &&
        String(t.status || '').toUpperCase() === 'SUCCESSFUL'
      )
      if (refundTxns.length > 0) {
        const totalRefunded = refundTxns.reduce((sum: number, t: SumUpTransaction) => sum + Number(t.amount || 0), 0)
        payloadStatus = totalRefunded >= amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      }

      const existing = await db.prepare(
        "SELECT id, status FROM mainsite_financial_logs WHERE method = 'sumup_card' AND (payment_id = ? OR payment_id = ?) LIMIT 1"
      ).bind(checkoutId, transactionId).first() as { id: number; status: string } | null

      const status = resolveSumupStatusFromSources(existing?.status || 'UNKNOWN', payloadStatus)

      if (existing) {
        await db.prepare(
          "UPDATE mainsite_financial_logs SET payment_id = ?, status = ?, raw_payload = ? WHERE method = 'sumup_card' AND (payment_id = ? OR payment_id = ?)"
        ).bind(checkoutId, status, raw, checkoutId, transactionId).run()
        updated++
      } else {
        await db.prepare(
          'INSERT INTO mainsite_financial_logs (payment_id, status, amount, method, payer_email, raw_payload) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(checkoutId, status, amount, 'sumup_card', 'N/A', raw).run()
        inserted++
      }
    }

    return Response.json({ success: true, inserted, updated, total: checkouts.length })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Falha ao sincronizar SumUp.' }, { status: 500 })
  }
}
