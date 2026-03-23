/**
 * Rate Limit Common Type Definitions (Client-side)
 * 
 * Exposes only the types needed by client modules.
 * Server-side implementation is in functions/api/_lib/rate-limit-common.ts
 */

/**
 * Rate limit policy for a single route or service
 */
export interface RateLimitPolicy {
  route: 'calcular' | 'analisar' | 'enviar-email' | 'chatbot' | 'email' | 'generate' | 'regenerate'
  label: string
  enabled: boolean
  max_requests: number
  window_minutes: number
  updated_at: string | null
  defaults: {
    enabled: boolean
    max_requests: number
    window_minutes: number
  }
  stats: {
    total_requests_window: number
    distinct_keys_window: number
  }
}
