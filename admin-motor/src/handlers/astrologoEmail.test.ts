import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logModuleOperationalEvent } = vi.hoisted(() => ({
  logModuleOperationalEvent: vi.fn(),
}));

vi.mock('../../../functions/api/_lib/operational', () => ({
  logModuleOperationalEvent,
}));

import { handleAstrologoEnviarEmailPost } from './astrologoEmail.ts';

describe('handleAstrologoEnviarEmailPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'email_123' }),
      })),
    );
  });

  it('masks the destination email in operational telemetry metadata', async () => {
    const request = new Request('https://admin.lcv.app.br/api/astrologo/enviar-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Actor': 'admin@lcv.app.br' },
      body: JSON.stringify({
        emailDestino: 'consulente@example.com',
        relatorioHtml: '<p>ok</p>',
        relatorioTexto: 'ok',
        nomeConsulente: 'Teste',
      }),
    });

    const response = await handleAstrologoEnviarEmailPost({
      request,
      env: {
        RESEND_API_KEY: 'resend-key',
        BIGDATA_DB: {} as unknown,
      },
    });

    expect(response.status).toBe(200);
    expect(logModuleOperationalEvent).toHaveBeenCalledTimes(1);
    expect(logModuleOperationalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'send-email',
          emailDestino: 'co***@ex***.com',
        }),
      }),
    );
  });
});
