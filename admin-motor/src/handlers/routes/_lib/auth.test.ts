import { describe, expect, it } from 'vitest';
import { validatePutAuth } from './auth.ts';

describe('validatePutAuth', () => {
  it('accepts a valid bearer token in constant time flow', async () => {
    const request = new Request('https://admin.lcv.app.br/api/test', {
      headers: { Authorization: 'Bearer super-secret-token' },
    });

    const result = await validatePutAuth(request, 'super-secret-token');

    expect(result.isAuthenticated).toBe(true);
    expect(result.source).toBe('bearer');
  });

  it('fails closed when CF Access audience is missing', async () => {
    const request = new Request('https://admin.lcv.app.br/api/test', {
      headers: {
        'CF-Access-Authenticated-User-Email': 'admin@lcv.app.br',
        'CF-Access-JWT-Assertion': 'header.payload.signature',
      },
    });

    const result = await validatePutAuth(request, undefined, {
      teamDomain: 'lcv',
      enforcement: 'block',
    });

    expect(result.isAuthenticated).toBe(false);
    expect(result.source).toBe('cloudflare-access');
    expect(result.error).toContain('audience');
  });
});
