import { finishSyncRun, logModuleOperationalEvent, startSyncRun } from '../_lib/operational'
import type { D1Database } from '../_lib/operational'
import { getCloudflareDnsSnapshot, listCloudflareZones } from '../_lib/cloudflare-api'

type Env = {
  BIGDATA_DB?: D1Database
  CF_API_TOKEN?: string
  CLOUDFLARE_DNS?: string
  CLOUDFLARE_API_TOKEN?: string
}

type Context = {
  request: Request
  env: Env
}

type HistoryRow = {
  gerado_em?: string
  domain?: string | null
}

type PolicyRow = {
  domain: string
  policy_text?: string | null
  tlsrpt_email?: string | null
}

const parseDryRun = (rawValue: string | null) => rawValue === '1' || rawValue === 'true'

const toHeaders = () => ({
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
})

export async function onRequestPost(context: Context) {
  const { request, env } = context

  if (!env.BIGDATA_DB) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'BIGDATA_DB não configurado no runtime.',
    }), {
      status: 503,
      headers: toHeaders(),
    })
  }

  const url = new URL(request.url)
  const dryRun = parseDryRun(url.searchParams.get('dryRun'))

  const startedAt = Date.now()
  const syncRunId = await startSyncRun(env.BIGDATA_DB, {
    module: 'mtasts',
    status: 'running',
    startedAt,
    metadata: { dryRun },
  })

  try {
    const [zones, historyRowsRaw, policyRowsRaw] = await Promise.all([
      listCloudflareZones(env),
      env.BIGDATA_DB.prepare('SELECT gerado_em, domain FROM mtasts_history ORDER BY id DESC').all<HistoryRow>(),
      env.BIGDATA_DB.prepare('SELECT domain, policy_text, tlsrpt_email FROM mtasts_mta_sts_policies').all<PolicyRow>(),
    ])

    const historyRows = (historyRowsRaw.results ?? [])
      .map((row) => ({
        geradoEm: String(row.gerado_em ?? '').trim(),
        domain: row.domain == null ? null : String(row.domain).trim().toLowerCase(),
      }))
      .filter((row) => row.geradoEm)

    const policyByDomain = new Map(
      (policyRowsRaw.results ?? [])
        .map((row) => ({
          domain: String(row.domain ?? '').trim().toLowerCase(),
          policyText: String(row.policy_text ?? '').trim(),
          tlsrptEmail: row.tlsrpt_email == null ? null : String(row.tlsrpt_email).trim().toLowerCase(),
        }))
        .filter((row) => row.domain && row.policyText)
        .map((row) => [row.domain, row] as const),
    )

    const dnsSnapshots = await Promise.all(
      zones.map(async (zone) => ({
        zone,
        dns: await getCloudflareDnsSnapshot(env, zone.name, zone.id),
      })),
    )

    let historyUpserted = 0
    let policiesUpserted = 0

    if (!dryRun) {
      for (const row of historyRows) {
        await env.BIGDATA_DB.prepare(`
          INSERT INTO mtasts_history (gerado_em, domain, data_criacao)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(gerado_em) DO UPDATE SET
            domain = excluded.domain
        `)
          .bind(row.geradoEm, row.domain)
          .run()

        historyUpserted += 1
      }

      for (const item of dnsSnapshots) {
        const domain = item.zone.name
        const existing = policyByDomain.get(domain)
        const policyText = existing?.policyText

        if (!policyText) {
          continue
        }

        await env.BIGDATA_DB.prepare(`
          INSERT INTO mtasts_mta_sts_policies (domain, policy_text, tlsrpt_email, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(domain) DO UPDATE SET
            policy_text = excluded.policy_text,
            tlsrpt_email = excluded.tlsrpt_email,
            updated_at = CURRENT_TIMESTAMP
        `)
          .bind(domain, policyText, item.dns.dnsTlsRptEmail ?? existing.tlsrptEmail)
          .run()

        policiesUpserted += 1
      }
    }

    const recordsRead = historyRows.length + dnsSnapshots.length
    const recordsUpserted = dryRun ? 0 : historyUpserted + policiesUpserted

    await finishSyncRun(env.BIGDATA_DB, {
      id: syncRunId,
      status: 'success',
      finishedAt: Date.now(),
      recordsRead,
      recordsUpserted,
    })

    await logModuleOperationalEvent(env.BIGDATA_DB, {
      module: 'mtasts',
      source: 'bigdata_db',
      fallbackUsed: false,
      ok: true,
      metadata: {
        action: 'sync',
        pulledFrom: 'cloudflare-api+d1',
        provider: 'cloudflare-api',
        dryRun,
        historyLido: historyRows.length,
        historyUpserted: dryRun ? 0 : historyUpserted,
        policiesLidas: dnsSnapshots.length,
        policiesUpserted: dryRun ? 0 : policiesUpserted,
        zonesAuditadas: zones.length,
      },
    })

    return new Response(JSON.stringify({
      ok: true,
      dryRun,
      syncRunId,
      recordsRead,
      recordsUpserted,
      history: {
        lidos: historyRows.length,
        upserted: dryRun ? 0 : historyUpserted,
      },
      policies: {
        lidas: dnsSnapshots.length,
        upserted: dryRun ? 0 : policiesUpserted,
      },
      zonesAuditadas: zones.length,
      startedAt,
      finishedAt: Date.now(),
    }), {
      headers: toHeaders(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada no sync do MTA-STS'

    await finishSyncRun(env.BIGDATA_DB, {
      id: syncRunId,
      status: 'error',
      finishedAt: Date.now(),
      recordsRead: 0,
      recordsUpserted: 0,
      errorMessage: message,
    })

    await logModuleOperationalEvent(env.BIGDATA_DB, {
      module: 'mtasts',
      source: 'bigdata_db',
      fallbackUsed: false,
      ok: false,
      errorMessage: message,
      metadata: {
        action: 'sync',
        pulledFrom: 'cloudflare-api+d1',
        provider: 'cloudflare-api',
        dryRun,
      },
    })

    return new Response(JSON.stringify({
      ok: false,
      error: message,
      syncRunId,
    }), {
      status: 500,
      headers: toHeaders(),
    })
  }
}
