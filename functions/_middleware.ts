
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

  // ========== SECRET STORE RESOLVER MIDDLEWARE ==========
  // Resolve os secrets que vêm encapsulados como banco/binding no Pages
  const envClone = { ...context.env };
  
  const mappings: Record<string, string> = {
    'GEMINI_API_KEY': 'gemini-api-key',
    'PIX_KEY': 'pix-key',
    'PIX_NAME': 'pix-name',
    'PIX_CITY': 'pix-city',
    'CF_AI_GATEWAY': 'cf-ai-gateway',
    'CLOUDFLARE_PW': 'cloudflare-pw',
    'MP_ACCESS_TOKEN': 'mp-access-token',
    'MERCADO_PAGO_WEBHOOK_SECRET': 'mercado-pago-webhook-secret',
    'RESEND_API_KEY': 'resend-api-key',
    'RESEND_APPKEY': 'resend-appkey',
    'SUMUP_API_KEY_PRIVATE': 'sumup-api-key-private',
    'SUMUP_MERCHANT_CODE': 'sumup-merchant-code',
    'GCP_SA_KEY': 'gcp-sa-key'
  };

  await Promise.all(
    SECRET_KEYS.map(async (key) => {
      let binding = envClone[key];
      // Fallback para caso tracejado se não achar a chave uppercase original
      if (binding === undefined && mappings[key]) {
        binding = envClone[mappings[key]];
      }

      if (binding && typeof binding === 'object' && typeof (binding as { get?: unknown }).get === 'function') {
        try {
          envClone[key] = await (binding as { get(): Promise<string> }).get();
        } catch (error) {
          console.warn(`[Secrets Store] Falha ao resolver secret ${key}:`, error);
          envClone[key] = undefined;
        }
      } else if (binding !== undefined && envClone[key] === undefined) {
        // Se achou o tracejado e ele já era string, injeta na uppercase
        envClone[key] = binding;
      }
    }),
  );

  // Inject clone directly to context.data, which is propagated correctly across handlers.
  const mutableContext = context as unknown as Record<string, unknown>;
  const mutableData = (mutableContext.data || {}) as Record<string, unknown>;
  mutableData.env = envClone;
  mutableContext.data = mutableData;

  // Substitui env no context via Object.defineProperty para contornar object sealing (Cloudflare Pages)
  try {
    context.env = envClone;
  } catch {
    Object.defineProperty(context, 'env', {
      value: envClone,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  return context.next();
}
