// admin-app/functions/api/financeiro/financeiro.ts
// GET — Query mainsite_financial_logs from BIGDATA_DB with filters
// Returns logs, totals, and approved counts

import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  BIGDATA_DB: D1Database
}

interface FinancialLog {
  id: number
  payment_id: string | null
  status: string
  amount: number
  method: string | null
  payer_email: string | null
  raw_payload: string | null
  created_at: string
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

const resolveSumupStatusFromSources = (rowStatus: string, rawPayload: string | null): string => {
  let payloadStatus: string | null = null
  try {
    const payload = rawPayload ? JSON.parse(rawPayload) : null
    const allTxns = payload?.transactions || []
    const amount = Number(payload?.amount || 0)

    // Detectar refunds no array de transações do checkout
    const refundTxns = allTxns.filter((t: Record<string, unknown>) =>
      String(t.type || '').toUpperCase() === 'REFUND' &&
      String(t.status || '').toUpperCase() === 'SUCCESSFUL'
    )
    if (refundTxns.length > 0) {
      const totalRefunded = refundTxns.reduce((sum: number, t: Record<string, unknown>) => sum + Number(t.amount || 0), 0)
      payloadStatus = totalRefunded >= amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    } else {
      payloadStatus = allTxns[0]?.status || payload?.transaction?.status || payload?.status || null
    }
  } catch {
    payloadStatus = null
  }

  const row = normalizeSumupStatus(rowStatus || 'UNKNOWN')
  const provider = normalizeSumupStatus(payloadStatus || 'UNKNOWN')

  // Dados do provedor SEMPRE têm prioridade sobre o que está na D1
  if (provider && provider !== 'UNKNOWN') return provider
  return row !== 'UNKNOWN' ? row : 'UNKNOWN'
}

type FinanceiroContext = {
  request: Request
  env: Env
}

export const onRequestGet = async (context: FinanceiroContext): Promise<Response> => {
  const db = context.env.BIGDATA_DB
  const url = new URL(context.request.url)

  const status = url.searchParams.get('status') || ''
  const method = url.searchParams.get('method') || ''
  const startDate = url.searchParams.get('start_date') || ''
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))

  try {
    // Build dynamic WHERE clauses
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (status) {
      conditions.push('LOWER(status) = LOWER(?)')
      params.push(status)
    }
    if (method) {
      conditions.push('LOWER(method) = LOWER(?)')
      params.push(method)
    }
    if (startDate) {
      conditions.push('created_at >= ?')
      params.push(startDate)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Parallel queries: logs + totals
    const [logsResult, totalRow, approvedRow, sumRow, distinctStatuses, distinctMethods] = await Promise.all([
      db.prepare(
        `SELECT id, payment_id, status, amount, method, payer_email, raw_payload, created_at
         FROM mainsite_financial_logs ${whereClause}
         ORDER BY created_at DESC LIMIT ?`
      ).bind(...params, limit).all() as Promise<{ results: FinancialLog[] }>,

      db.prepare(
        `SELECT COUNT(1) AS total FROM mainsite_financial_logs ${whereClause}`
      ).bind(...params).first() as Promise<{ total: number } | null>,

      db.prepare(
        `SELECT COUNT(1) AS total FROM mainsite_financial_logs
         WHERE LOWER(status) IN ('approved', 'successful', 'paid')
         ${conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''}`
      ).bind(...params).first() as Promise<{ total: number } | null>,

      db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total_amount FROM mainsite_financial_logs ${whereClause}`
      ).bind(...params).first() as Promise<{ total_amount: number } | null>,

      db.prepare(
        'SELECT DISTINCT LOWER(status) AS status FROM mainsite_financial_logs WHERE status IS NOT NULL ORDER BY status'
      ).all() as Promise<{ results: { status: string }[] }>,

      db.prepare(
        'SELECT DISTINCT LOWER(method) AS method FROM mainsite_financial_logs WHERE method IS NOT NULL ORDER BY method'
      ).all() as Promise<{ results: { method: string }[] }>,
    ])

    const normalizedLogs = (logsResult.results ?? []).map((log: FinancialLog) => {
      if (String(log.method || '').trim().toLowerCase() !== 'sumup_card') return log
      return {
        ...log,
        status: resolveSumupStatusFromSources(log.status, log.raw_payload),
      }
    })

    return Response.json({
      ok: true,
      logs: normalizedLogs,
      totals: {
        count: Number(totalRow?.total ?? 0),
        approved: Number(approvedRow?.total ?? 0),
        totalAmount: Number(sumRow?.total_amount ?? 0),
      },
      filters: {
        statuses: (distinctStatuses.results ?? []).map((r: { status: string }) => r.status),
        methods: (distinctMethods.results ?? []).map((r: { method: string }) => r.method),
      },
    })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno ao consultar logs financeiros.' },
      { status: 500 },
    )
  }
}
