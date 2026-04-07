/**
 * Route handler for /api/cfpw/observability
 * Proxies requests to the Cloudflare Workers Observability API.
 */
import { createResponseTrace } from '../_lib/request-trace'
import { resolveCloudflarePwAccount } from '../_lib/cfpw-api'
import {
  queryObservabilityTelemetry,
  listObservabilityKeys,
  listObservabilityValues,
  listObservabilityDestinations,
  createObservabilityDestination,
  deleteObservabilityDestination,
} from '../_lib/observability-api'

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>
      all<T>(): Promise<{ results: T[] }>
      run(): Promise<unknown>
    }
  }
}

type Context = {
  request: Request
  env: {
    BIGDATA_DB?: D1Database
    CLOUDFLARE_PW?: string
    CF_ACCOUNT_ID?: string
  }
}

const toHeaders = () => ({
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
})

const toError = (message: string, trace: { request_id: string; timestamp: string }, status = 500) =>
  new Response(JSON.stringify({ ok: false, ...trace, error: message }), {
    status,
    headers: toHeaders(),
  })

/**
 * GET /api/cfpw/observability — lista destinos OTel
 */
export async function onRequestGet(context: Context) {
  const trace = createResponseTrace(context.request)

  try {
    const env = (context as unknown as { data?: { env?: Context['env'] } }).data?.env || context.env
    const accountInfo = await resolveCloudflarePwAccount(env)
    const destinations = await listObservabilityDestinations(env, accountInfo.accountId)

    return new Response(JSON.stringify({
      ok: true,
      ...trace,
      destinations,
    }), { headers: toHeaders() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar destinos Observability.'
    return toError(message, trace, 502)
  }
}

/**
 * POST /api/cfpw/observability — multiplex por action
 * Actions: query, keys, values, create-destination, delete-destination
 */
export async function onRequestPost(context: Context) {
  const trace = createResponseTrace(context.request)

  try {
    const env = (context as unknown as { data?: { env?: Context['env'] } }).data?.env || context.env
    const accountInfo = await resolveCloudflarePwAccount(env)
    const accountId = accountInfo.accountId

    const body = await context.request.json() as {
      action: string
      body?: Record<string, unknown>
      slug?: string
    }

    const action = String(body.action || '').trim()
    if (!action) {
      return toError('Campo "action" é obrigatório.', trace, 400)
    }

    let result: unknown

    switch (action) {
      case 'query': {
        if (!body.body) return toError('Campo "body" é obrigatório para action=query.', trace, 400)
        result = await queryObservabilityTelemetry(env, accountId, body.body)
        break
      }
      case 'keys': {
        result = await listObservabilityKeys(env, accountId, body.body || {})
        break
      }
      case 'values': {
        if (!body.body) return toError('Campo "body" é obrigatório para action=values.', trace, 400)
        result = await listObservabilityValues(env, accountId, body.body)
        break
      }
      case 'create-destination': {
        if (!body.body) return toError('Campo "body" obrigatório para criar destino.', trace, 400)
        result = await createObservabilityDestination(env, accountId, body.body)
        break
      }
      case 'delete-destination': {
        const slug = String(body.slug || '').trim()
        if (!slug) return toError('Campo "slug" obrigatório para remover destino.', trace, 400)
        result = await deleteObservabilityDestination(env, accountId, slug)
        break
      }
      default:
        return toError(`Action desconhecida: ${action}`, trace, 400)
    }

    return new Response(JSON.stringify({
      ok: true,
      ...trace,
      action,
      result,
    }), { headers: toHeaders() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na operação Observability.'
    return toError(message, trace, 502)
  }
}
