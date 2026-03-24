import { logModuleOperationalEvent } from '../_lib/operational'
import { toHeaders, type Context } from '../_lib/astrologo-admin'
import { resolveAdminActorFromRequest } from '../_lib/admin-actor'
import { createResponseTrace } from '../_lib/request-trace'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: toHeaders(),
})

const resolveDb = (context: Context) => context.env.BIGDATA_DB ?? context.env.ASTROLOGO_SOURCE_DB
const resolveOperationalSource = () => 'bigdata_db' as const

export async function onRequestPost(context: Context) {
  const trace = createResponseTrace(context.request)
  const db = resolveDb(context)
  const source = resolveOperationalSource(context)

  if (!db) {
    return json({ ok: false, error: 'Nenhum binding D1 disponível (BIGDATA_DB/ASTROLOGO_SOURCE_DB).', ...trace }, 503)
  }

  try {
    const body = await context.request.json() as Record<string, unknown>
    const adminActor = resolveAdminActorFromRequest(context.request, body)
    const id = String(body.id ?? '').trim()

    if (!id) {
      return json({ ok: false, error: 'ID inválido.', ...trace }, 400)
    }

    await db.prepare('DELETE FROM mapas_astrologicos WHERE id = ?')
      .bind(id)
      .run()

    if (context.env.BIGDATA_DB) {
      await context.env.BIGDATA_DB.prepare('DELETE FROM astrologo_mapas WHERE id = ?')
        .bind(id)
        .run()

      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'astrologo',
          source,
          fallbackUsed: false,
          ok: true,
          metadata: {
            action: 'delete-mapa',
            mapaId: id,
            adminActor,
          },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({ ok: true, id, admin_actor: adminActor, ...trace })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao excluir mapa do Astrólogo'

    if (context.env.BIGDATA_DB) {
      try {
        await logModuleOperationalEvent(context.env.BIGDATA_DB, {
          module: 'astrologo',
          source,
          fallbackUsed: false,
          ok: false,
          errorMessage: message,
          metadata: { action: 'delete-mapa' },
        })
      } catch {
        // Não bloquear por telemetria.
      }
    }

    return json({ ok: false, error: message, ...trace }, 500)
  }
}
