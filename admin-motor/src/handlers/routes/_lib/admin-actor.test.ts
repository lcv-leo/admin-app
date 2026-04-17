import { describe, expect, it } from 'vitest';

import { resolveAdminActorFromRequest } from './admin-actor.ts';

describe('resolveAdminActorFromRequest', () => {
  it('prefers the authenticated Cloudflare Access email over client supplied actor headers', () => {
    const request = new Request('https://admin.lcv.app.br/api/test', {
      headers: {
        'CF-Access-Authenticated-User-Email': 'real-admin@lcv.app.br',
        'X-Admin-Actor': 'spoofed-admin@app.lcv',
        'X-Admin-Email': 'spoofed-email@app.lcv',
      },
    });

    const resolved = resolveAdminActorFromRequest(request, {
      adminActor: 'spoofed-body@app.lcv',
      adminEmail: 'spoofed-body-email@app.lcv',
    });

    expect(resolved).toBe('real-admin@lcv.app.br');
  });

  it('falls back to client supplied actor when Cloudflare Access identity is unavailable', () => {
    const request = new Request('https://admin.lcv.app.br/api/test', {
      headers: {
        'X-Admin-Actor': 'admin@app.lcv',
      },
    });

    const resolved = resolveAdminActorFromRequest(request);

    expect(resolved).toBe('admin@app.lcv');
  });
});
