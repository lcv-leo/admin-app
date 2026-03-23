/**
 * Astrological Report Generation
 * Generates HTML and text variants from mapa data
 */

interface MapaDetalhado {
  id: string
  nome: string
  data_nascimento: string | null
  hora_nascimento: string | null
  local_nascimento: string | null
  dados_astronomica: string | null
  dados_tropical: string | null
  dados_globais: string | null
  analise_ia: string | null
  created_at: string | null
}

interface GeneratedReport {
  html: string
  text: string
  summary: string
}

function safeParseJson<T>(jsonString: string | null): T | null {
  if (!jsonString) return null
  try {
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}

function formatPlanetsTable(dados: Record<string, unknown> | null): string {
  if (!dados) return ''
  const planets = (dados.planets as Array<Record<string, unknown>>) || []
  if (planets.length === 0) return ''

  let html = '<table style="width:100%; border-collapse: collapse; margin: 16px 0;">'
  html += '<tr style="background-color: #f5f5f5; font-weight: bold;">'
  html += '<th style="padding: 8px; border: 1px solid #ddd;">Planeta</th>'
  html += '<th style="padding: 8px; border: 1px solid #ddd;">Signo</th>'
  html += '<th style="padding: 8px; border: 1px solid #ddd;">Grau</th>'
  html += '<th style="padding: 8px; border: 1px solid #ddd;">Dignidade</th>'
  html += '</tr>'

  planets.forEach((planet) => {
    html += '<tr>'
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${(planet.name as string) || 'N/A'}</td>`
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${(planet.sign as string) || 'N/A'}</td>`
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${planet.degrees ? `${planet.degrees}°` : 'N/A'}</td>`
    html += `<td style="padding: 8px; border: 1px solid #ddd;">${(planet.dignity as string) || '-'}</td>`
    html += '</tr>'
  })
  html += '</table>'
  return html
}

function formatPlanetsText(dados: Record<string, unknown> | null): string {
  if (!dados) return ''
  const planets = (dados.planets as Array<Record<string, unknown>>) || []
  if (planets.length === 0) return ''

  let text = 'POSIÇÕES ASTRONÔMICAS\n'
  text += '====================\n\n'
  planets.forEach((planet) => {
    const name = (planet.name as string) || 'Planeta'
    const sign = (planet.sign as string) || 'Desconhecido'
    const degrees = planet.degrees ? `${planet.degrees}°` : 'N/A'
    const dignity = (planet.dignity as string) || '-'
    text += `${name}: ${sign} ${degrees} (${dignity})\n`
  })
  text += '\n'
  return text
}

function formatAspectsText(dados: Record<string, unknown> | null): string {
  if (!dados) return ''
  const aspects = (dados.aspects as Array<Record<string, unknown>>) || []
  if (aspects.length === 0) return ''

  let text = 'ASPECTOS PRINCIPAIS\n'
  text += '===================\n\n'
  aspects.forEach((aspect) => {
    const p1 = (aspect.planet1 as string) || '?'
    const type = (aspect.type as string) || 'ASPECTO'
    const p2 = (aspect.planet2 as string) || '?'
    const orb = aspect.orb ? ` (orbe: ${aspect.orb}°)` : ''
    text += `${p1} ${type} ${p2}${orb}\n`
  })
  text += '\n'
  return text
}

export function generateAstrologicalReport(
  mapa: MapaDetalhado,
  template?: 'resumo' | 'completo'
): GeneratedReport {
  const reportTemplate = template || 'completo'
  const dadosAstro = safeParseJson<Record<string, unknown>>(mapa.dados_astronomica)
  const dadosTropical = safeParseJson<Record<string, unknown>>(mapa.dados_tropical)
  const dadosGlobais = safeParseJson<Record<string, unknown>>(mapa.dados_globais)

  let htmlContent = `<h2>${mapa.nome}</h2><hr>`
  let textContent = `${mapa.nome}\n${'='.repeat(mapa.nome.length)}\n\n`

  // Header info
  const birthInfo = [mapa.data_nascimento, mapa.hora_nascimento, mapa.local_nascimento]
    .filter(Boolean)
    .join(' | ')
  if (birthInfo) {
    htmlContent += `<p><strong>Data/Hora/Local:</strong> ${birthInfo}</p>`
    textContent += `Data/Hora/Local: ${birthInfo}\n\n`
  }

  // Astronomical data
  if (dadosAstro) {
    htmlContent += `<h3>Posições Astronômicas</h3>${formatPlanetsTable(dadosAstro)}`
    textContent += formatPlanetsText(dadosAstro)
    if (reportTemplate === 'completo') {
      textContent += formatAspectsText(dadosAstro)
    }
  }

  // Tropical data
  if (dadosTropical) {
    htmlContent += '<h3>Zodíaco Tropical</h3>'
    const houses = (dadosTropical.houses as Array<Record<string, unknown>>) || []
    if (houses.length > 0) {
      htmlContent += '<p><strong>Casas:</strong></p>'
      htmlContent += '<ul>'
      houses.forEach((house) => {
        const num = (house.number as number) || '?'
        const sign = (house.sign as string) || '?'
        const degrees = house.degrees ? `${house.degrees}°` : ''
        htmlContent += `<li>Casa ${num}: ${sign} ${degrees}</li>`
      })
      htmlContent += '</ul>'
    }
  }

  // Global patterns
  if (dadosGlobais && reportTemplate === 'completo') {
    htmlContent += '<h3>Padrões Globais</h3>'
    const dignities = (dadosGlobais.dignities as string[]) || []
    if (dignities.length > 0) {
      htmlContent += '<p><strong>Dignidades:</strong></p><ul>'
      dignities.forEach((d) => {
        htmlContent += `<li>${d}</li>`
      })
      htmlContent += '</ul>'
    }
  }

  // AI Analysis
  if (mapa.analise_ia) {
    htmlContent += '<h3>Análise por IA</h3>'
    htmlContent += `<p>${mapa.analise_ia.replace(/\n/g, '</p><p>')}</p>`
    textContent += 'ANÁLISE POR IA\n'
    textContent += '==============\n\n'
    textContent += mapa.analise_ia
    textContent += '\n\n'
  }

  // Generate summary from AI analysis or from key data
  let summary = ''
  if (mapa.analise_ia) {
    const lines = mapa.analise_ia.split('.')
    summary = lines[0].trim()
  } else if (dadosAstro) {
    const planets = (dadosAstro.planets as Array<Record<string, unknown>>) || []
    summary = `Mapa astrológico de ${mapa.nome} com ${planets.length} principais posições planetárias analisadas.`
  } else {
    summary = `Mapa astrológico de ${mapa.nome}`
  }

  return {
    html: htmlContent,
    text: textContent,
    summary: summary
  }
}
