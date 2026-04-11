// admin-motor — MP OAuth helpers
// GET  /api/financeiro/mp-oauth-url      → authorization URL to open in browser
// POST /api/financeiro/mp-oauth-callback  → exchange code for access_token with read scope

interface OAuthEnv {
  MP_APP_ID?: string;
  MP_CLIENT_SECRET?: string;
}

type OAuthContext = { request: Request; env: OAuthEnv };

const REDIRECT_URI = 'https://admin.lcv.app.br';

/**
 * Returns the MercadoPago OAuth authorization URL.
 * The admin opens this URL in the browser, authorizes, and MP redirects
 * back with ?code=TG-XXXX to the callback endpoint.
 */
export const onRequestGetUrl = async (context: OAuthContext) => {
  const appId = ((context as any).data?.env || context.env).MP_APP_ID;
  if (!appId) {
    return Response.json({ error: 'MP_APP_ID não configurado no Secrets Store.' }, { status: 503 });
  }

  const authUrl =
    `https://auth.mercadopago.com.br/authorization` +
    `?client_id=${appId}` +
    `&response_type=code` +
    `&platform_id=mp` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=read,offline_access`;

  return Response.json({ url: authUrl, redirect_uri: REDIRECT_URI });
};

/**
 * Exchanges the authorization code for an access_token with read scope.
 * Body: { "code": "TG-XXXX-XXXXX" }
 * Returns the full token response (access_token, refresh_token, user_id, scope, expires_in).
 */
export const onRequestPostCallback = async (context: OAuthContext) => {
  const env = (context as any).data?.env || context.env;
  const appId = env.MP_APP_ID;
  const clientSecret = env.MP_CLIENT_SECRET;

  if (!appId || !clientSecret) {
    return Response.json(
      { error: 'MP_APP_ID e/ou MP_CLIENT_SECRET não configurados no Secrets Store.' },
      { status: 503 },
    );
  }

  let code: string;
  try {
    const body = (await context.request.json()) as { code?: string };
    code = body?.code?.trim() || '';
  } catch {
    return Response.json({ error: 'Body inválido. Envie { "code": "TG-XXXX" }.' }, { status: 400 });
  }

  if (!code || !code.startsWith('TG-')) {
    return Response.json({ error: 'Code inválido. Deve começar com TG-.' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      console.error('[MP OAuth] Token exchange failed:', JSON.stringify(data));
      return Response.json({ error: 'Falha na troca do código.', detail: data }, { status: res.status });
    }

    console.info('[MP OAuth] Token obtido com sucesso. Scope:', data.scope, 'User:', data.user_id);

    return Response.json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      scope: data.scope,
      user_id: data.user_id,
      message: 'Salve o access_token como MP_ACCESS_TOKEN no Secrets Store via: wrangler secrets-store secret update <store-id> --secret-id <mp-access-token-id> --value "<token>"',
    });
  } catch (err) {
    console.error('[MP OAuth] Erro:', (err as Error).message);
    return Response.json({ error: 'Erro na troca do código.' }, { status: 500 });
  }
};
