import {
  resolveCloudflarePwAccount,
  listCloudflarePagesDomains,
  listCloudflareZones,
  purgeCloudflareZoneCache,
} from '../_lib/cfpw-api'

type Context = {
  request: Request
  env: {
    CLOUDFLARE_PW?: string
    CLOUDFLARE_API_TOKEN?: string
    CF_API_TOKEN?: string
    CF_ACCOUNT_ID?: string
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * POST — Purge Cache por Projeto
 * Mapeia os domínios customizados de um projeto e limpa o cache (purge_everything)
 * das respectivas zonas (Zones) na Cloudflare.
 *
 * Body: { projectName: string }
 */
export async function onRequestPost(context: Context) {
  try {
    const body = (await context.request.json()) as { projectName?: string }
    const projectName = String(body.projectName ?? '').trim()

    if (!projectName) {
      return jsonResponse({ error: 'projectName é obrigatório.' }, 400)
    }

    const { accountId } = await resolveCloudflarePwAccount(context.env)

    // 1. Obter domínios atrelados ao projeto
    const pagesDomains = await listCloudflarePagesDomains(context.env, accountId, projectName)
    
    // Filtrar apenas domínios customizados e ignorar o default da Cloudflare
    const customDomains = pagesDomains
      .map(d => String(d.name ?? '').trim())
      .filter(d => d && !d.endsWith('.pages.dev'))

    if (customDomains.length === 0) {
      return jsonResponse({
        ok: true,
        projectName,
        processedZones: 0,
        purgedDomains: [],
        message: 'Nenhum domínio customizado (somente .pages.dev). Permanece intocado.',
      })
    }

    // 2. Obter todas as zonas da conta
    const zones = await listCloudflareZones(context.env)
    
    // 3. Mapear domínios para seus respectivos Zone IDs
    const matchedZoneIds = new Set<string>()
    const matchedDomains: string[] = []

    for (const domain of customDomains) {
      let bestZoneId: string | null = null
      let longestMatchLength = -1

      for (const zone of zones) {
        const zoneName = String(zone.name ?? '')
        const zoneId = String(zone.id ?? '')
        if (!zoneName || !zoneId) continue

        // Verifica se o domínio pertence a esta zona
        if (domain === zoneName || domain.endsWith('.' + zoneName)) {
          if (zoneName.length > longestMatchLength) {
            longestMatchLength = zoneName.length
            bestZoneId = zoneId
          }
        }
      }

      if (bestZoneId) {
        matchedZoneIds.add(bestZoneId)
        matchedDomains.push(domain)
      }
    }

    // 4. Executar limpeza de cache apenas nas zonas únicas identificadas
    const purgePromises = Array.from(matchedZoneIds).map(zoneId => 
      purgeCloudflareZoneCache(context.env, zoneId, { purge_everything: true })
        .catch(err => {
          throw new Error(`Falha ao limpar Zona ${zoneId}: ` + (err instanceof Error ? err.message : String(err)))
        })
    )

    if (purgePromises.length > 0) {
      await Promise.all(purgePromises)
    }

    return jsonResponse({
      ok: true,
      projectName,
      processedZones: matchedZoneIds.size,
      purgedDomains: matchedDomains,
      message: `Cache expurgado com sucesso em ${matchedZoneIds.size} zona(s).`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao limpar cache do projeto.'
    return jsonResponse({ error: message, ok: false }, 500)
  }
}
