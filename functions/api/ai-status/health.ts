// Módulo: admin-app/functions/api/ai-status/health.ts
// Descrição: Health check da API Gemini — valida key, mede latência, retorna status.

import { toHeaders } from '../_lib/mainsite-admin';

export interface Env {
  GEMINI_API_KEY: string;
  BIGDATA_DB?: D1Database;
  CF_AI_GATEWAY?: string;
}

interface D1Database {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown>, first<T>(): Promise<T|null> } }
}

const DEFAULT_MODEL = '';

async function resolveModel(db: D1Database | undefined): Promise<string> {
  if (!db) return DEFAULT_MODEL;
  try {
    const row = await db.prepare('SELECT payload FROM mainsite_settings WHERE id = ? LIMIT 1').bind('mainsite/ai_models').first<{ payload?: string }>();
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as Record<string, unknown>;
      if (typeof parsed.chat === 'string' && parsed.chat) {
        return parsed.chat;
      }
    }
  } catch {
    //
  }
  return DEFAULT_MODEL;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: toHeaders(),
  })
}

interface Ctx { env: Env }

export const onRequestGet = async (context: any) => {
  const env = context.data?.env || context.env;
  const apiKey = env?.GEMINI_API_KEY
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY não configurada.', keyConfigured: false }, 503)

  const activeModel = await resolveModel(env.BIGDATA_DB);
  const gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/d65b76a0e64c3791e932edd9163b1c71/workspace-gateway/google-ai-studio';
  const baseUrl = env.CF_AI_GATEWAY ? gatewayUrl : 'https://generativelanguage.googleapis.com';

  const requestHeaders = toHeaders() as Record<string, string>;
  if (env.CF_AI_GATEWAY) {
    requestHeaders['cf-aig-authorization'] = `Bearer ${env.CF_AI_GATEWAY}`;
  }

  try {
    const start = Date.now()
    
    const res = await fetch(`${baseUrl}/v1beta/models/${activeModel}?key=${apiKey}`, {
      headers: requestHeaders
    });
    const model = res.ok;
    const latencyMs = Date.now() - start

    if (model) {
      return json({
        ok: true,
        keyConfigured: true,
        apiReachable: true,
        model: activeModel,
        latencyMs,
        httpStatus: 200,
        checkedAt: new Date().toISOString(),
      })
    }

    return json({
      ok: false,
      keyConfigured: true,
      apiReachable: true,
      model: activeModel,
      latencyMs,
      httpStatus: 404,
      errorDetail: `Modelo ${activeModel} não encontrado pela API`,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    const errorBody = err instanceof Error ? err.message : String(err);
    return json({
      ok: false,
      keyConfigured: true,
      apiReachable: false,
      latencyMs: null,
      httpStatus: null,
      error: errorBody.slice(0, 500),
      checkedAt: new Date().toISOString(),
    })
  }
}
