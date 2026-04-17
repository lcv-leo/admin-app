import { describe, expect, it } from 'vitest';

import { onRequestDelete } from './userdata.ts';

function createDeleteDb(row: { email: string; dados_json: string }) {
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (query.includes('SELECT email, dados_json FROM astrologo_user_data')) {
                return row;
              }

              return null;
            },
            async run() {
              const boundId = values[0];

              if (query.includes('DELETE FROM astrologo_mapas WHERE id = ?')) {
                return {
                  meta: {
                    changes: boundId === 'mapa-1' ? 1 : 0,
                  },
                };
              }

              if (query.includes('DELETE FROM astrologo_auth_tokens WHERE email = ?')) {
                return { meta: { changes: 2 } };
              }

              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            },
          };
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

describe('astrologo userdata delete', () => {
  it('does not return the raw email in the response payload', async () => {
    const response = await onRequestDelete({
      request: new Request('https://admin.lcv.app.br/api/astrologo/userdata?id=user-1', {
        method: 'DELETE',
      }),
      env: {
        BIGDATA_DB: createDeleteDb({
          email: 'consulente@example.com',
          dados_json: JSON.stringify({
            mapasSalvos: [{ id: 'mapa-1' }, { id: 'mapa-2' }],
          }),
        }),
      },
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.userId).toBe('user-1');
    expect(payload).not.toHaveProperty('email');
    expect(payload.deleted).toEqual({
      userdata: 1,
      mapas: 1,
      tokens: 2,
    });
  });
});
