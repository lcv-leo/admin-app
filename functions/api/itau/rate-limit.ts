import { logModuleOperationalEvent } from '../_lib/operational'
import { listPoliciesWithStats, resetRateLimitPolicy, SUPPORTED_ROUTES, toHeaders, upsertRateLimitPolicy, type Context } from '../_lib/calculadora-admin'
import { resolveAdminActorFromRequest } from '../_lib/admin-actor'
import { createResponseTrace } from '../_lib/request-trace'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: toHeaders(),
})

const normalizeRoute = (value: unknown) => {
  const route = String(value ?? '').trim() as (typeof SUPPORTED_ROUTES)[number]
  if (SUPPORTED_ROUTES.includes(route)) {
    return route
  }
  return null
}

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const resolveRateLimitDb = (context: Context) => context.env.BIGDATA_DB ?? context.env.CALC_SOURCE_DB
const resolveOperationalSource = () => 'bigdata_db' as const

export async function onRequestGet(context: Context) {
  const trace = createResponseTrace(context.request)
  const adminActor = resolveAdminActorFromRequest(context.request)
  const db = resolveRateLimitDb(context)
  const source = resolveOperationalSource(context)

  if (!db) {
    return json({ ok: false, error: 'Nenhum binding D1 disponível (BIGDATA_DB/CALC_SOURCE_DB).', ...trace }, 503)
  }

  try {
    const policies = await listPoliciesWithStats(db)

    if (context.env.BIGDATA_DB) {
      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'calculadora',
          source,
          fallbackUsed: false,
          ok: true,
          metadata: {
            action: 'read-rate-limit',
            adminActor,
            policies: policies.length,
          },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({
      ok: true,
      admin_email: adminActor,
      admin_actor: adminActor,
      ...trace,
      policies,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar painel de rate limit do Calculadora'

    if (context.env.BIGDATA_DB) {
      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'calculadora',
          source,
          fallbackUsed: false,
          ok: false,
          errorMessage: message,
          metadata: { action: 'read-rate-limit' },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({ ok: false, error: message, ...trace }, 500)
  }
}

export async function onRequestPost(context: Context) {
  const trace = createResponseTrace(context.request)
  const db = resolveRateLimitDb(context)
  const source = resolveOperationalSource(context)

  if (!db) {
    return json({ ok: false, error: 'Nenhum binding D1 disponível (BIGDATA_DB/CALC_SOURCE_DB).', ...trace }, 503)
  }

  try {
    const body = await context.request.json() as Record<string, unknown>
    const adminActor = resolveAdminActorFromRequest(context.request, body)
    const routeKey = normalizeRoute(body.route_key)

    if (!routeKey) {
      return json({ ok: false, error: 'Rota de rate limit inválida.', ...trace }, 400)
    }

    const action = String(body.action ?? 'update').trim()

    if (action === 'restore_default') {
      await resetRateLimitPolicy(db, routeKey, adminActor)
      const policies = await listPoliciesWithStats(db)

      if (context.env.BIGDATA_DB) {
        try {
          await logModuleOperationalEvent(context.env.BIGDATA_DB, {
            module: 'calculadora',
            source,
            fallbackUsed: false,
            ok: true,
            metadata: {
              action: 'restore-rate-limit-default',
              routeKey,
              adminActor,
            },
          })
        } catch {
          // Não bloquear por telemetria.
        }
      }

      return json({ ok: true, action: 'restore_default', policies, admin_actor: adminActor, ...trace })
    }

    const enabled = body.enabled ? 1 : 0
    const maxRequests = toPositiveInt(body.max_requests, 2)
    const windowMinutes = toPositiveInt(body.window_minutes, 10)

    if (maxRequests > 5000 || windowMinutes > 1440) {
      return json({ ok: false, error: 'Parâmetros fora da faixa permitida.', ...trace }, 400)
    }

    await upsertRateLimitPolicy(db, {
      routeKey,
      enabled,
      maxRequests,
      windowMinutes,
      updatedBy: adminActor,
    })

    const policies = await listPoliciesWithStats(db)

    if (context.env.BIGDATA_DB) {
      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'calculadora',
          source,
          fallbackUsed: false,
          ok: true,
          metadata: {
            action: 'save-rate-limit',
            routeKey,
            enabled: enabled === 1,
            maxRequests,
            windowMinutes,
            adminActor,
          },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({ ok: true, action: 'update', policies, admin_actor: adminActor, ...trace })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar painel de rate limit do Calculadora'

    if (context.env.BIGDATA_DB) {
      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'calculadora',
          source,
          fallbackUsed: false,
          ok: false,
          errorMessage: message,
          metadata: { action: 'save-rate-limit' },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({ ok: false, error: message, ...trace }, 500)
  }
}
