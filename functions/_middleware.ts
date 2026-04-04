const SECRET_KEYS = [
  'CLOUDFLARE_PW', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'RESEND_APPKEY', 'CF_AI_GATEWAY',
  'SUMUP_API_KEY_PRIVATE', 'SUMUP_MERCHANT_CODE', 'MP_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET', 'PIX_KEY', 'PIX_NAME', 'PIX_CITY', 'GCP_SA_KEY'
] as const;

export async function onRequest(context: { request: Request; env: Record<string, unknown>; next: () => Promise<Response> }) {
  const url = new URL(context.request.url);

  // Bloqueio de exposição pública via URL interna .pages.dev
  if (url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'admin.lcv.app.br';
    return Response.redirect(url.toString(), 301);
  }

  // ========== ENVIRONMENT KEYS FALLBACK ==========
  // Se o usuário configurar no dashboard com o padrão antigo do secrets_store
  if (context.env) {
    const mappings: Record<string, string> = {
      'gemini-api-key': 'GEMINI_API_KEY',
      'pix-key': 'PIX_KEY',
      'pix-name': 'PIX_NAME',
      'pix-city': 'PIX_CITY',
      'cf-ai-gateway': 'CF_AI_GATEWAY',
      'cloudflare-pw': 'CLOUDFLARE_PW',
      'mp-access-token': 'MP_ACCESS_TOKEN',
      'mercado-pago-webhook-secret': 'MERCADO_PAGO_WEBHOOK_SECRET',
      'resend-api-key': 'RESEND_API_KEY',
      'resend-appkey': 'RESEND_APPKEY',
      'sumup-api-key-private': 'SUMUP_API_KEY_PRIVATE',
      'sumup-merchant-code': 'SUMUP_MERCHANT_CODE',
      'gcp-sa-key': 'GCP_SA_KEY'
    };
    for (const [lowerKey, upperKey] of Object.entries(mappings)) {
      if (!context.env[upperKey] && context.env[lowerKey]) {
        context.env[upperKey] = context.env[lowerKey];
      }
    }
  }

  // ========== SECRET STORE RESOLVER MIDDLEWARE ==========
  if (context.env) {
    await Promise.all(
      SECRET_KEYS.map(async (key) => {
        const binding = context.env[key];
        if (binding && typeof binding === 'object' && typeof (binding as { get?: unknown }).get === 'function') {
          try {
            context.env[key] = await (binding as { get(): Promise<string> }).get();
          } catch (error) {
            console.warn(`[Secrets Store] Falha ao resolver secret ${key}:`, error);
            context.env[key] = undefined;
          }
        }
      })
    );
  }

  return context.next();
};
