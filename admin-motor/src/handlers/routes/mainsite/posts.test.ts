import { describe, expect, it } from 'vitest';

import { onRequestPost, onRequestPut } from './posts.ts';

type TestPost = {
  id: number;
  title: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
  is_pinned: number;
  is_published: number;
};

type TestState = {
  posts: Map<number, TestPost>;
  comments: number[];
  ratings: number[];
  summaries: number[];
  shares: number[];
  aboutSourcePostId: number | null;
  contentVersionBumps: number;
};

const createPost = (id: number, title = `Post ${id}`): TestPost => ({
  id,
  title,
  content: '<p>Texto</p>',
  author: 'Leonardo',
  created_at: '2026-04-24 12:00:00',
  updated_at: '2026-04-24 12:00:00',
  is_pinned: 0,
  is_published: 1,
});

function createDb(seed?: Partial<TestState>) {
  const state: TestState = {
    posts: seed?.posts ?? new Map<number, TestPost>(),
    comments: seed?.comments ?? [],
    ratings: seed?.ratings ?? [],
    summaries: seed?.summaries ?? [],
    shares: seed?.shares ?? [],
    aboutSourcePostId: seed?.aboutSourcePostId ?? null,
    contentVersionBumps: 0,
  };

  const updateRefs = (items: number[], nextId: number, currentId: number) =>
    items.map((postId) => (postId === currentId ? nextId : postId));

  return {
    state,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results: unknown[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
    prepare(query: string) {
      const statement = {
        values: [] as Array<string | number | null>,
        bind(...values: Array<string | number | null>) {
          this.values = values;
          return this;
        },
        async first<T>() {
          if (query.includes('SELECT id FROM mainsite_posts WHERE id = ?')) {
            const id = Number(this.values[0]);
            return (state.posts.has(id) ? { id } : null) as T | null;
          }

          if (query.includes('SELECT id, title, content, author') && query.includes('WHERE id = ?')) {
            const id = Number(this.values[0]);
            return (state.posts.get(id) ?? null) as T | null;
          }

          if (query.includes('SELECT id, title, content, author') && query.includes('ORDER BY id DESC')) {
            const id = Math.max(...Array.from(state.posts.keys()));
            return (state.posts.get(id) ?? null) as T | null;
          }

          if (query.includes('FROM mainsite_settings')) {
            return { payload: JSON.stringify({ version: state.contentVersionBumps }) } as T;
          }

          return null;
        },
        async all<T>() {
          if (query.includes('PRAGMA table_info(mainsite_posts)')) {
            return { results: [{ name: 'author' }, { name: 'is_published' }] as T[] };
          }

          if (query.includes('PRAGMA table_info(mainsite_about)')) {
            return { results: [{ name: 'source_post_id' }] as T[] };
          }

          if (
            query.includes('PRAGMA table_info(mainsite_comments)') ||
            query.includes('PRAGMA table_info(mainsite_ratings)') ||
            query.includes('PRAGMA table_info(mainsite_post_ai_summaries)') ||
            query.includes('PRAGMA table_info(mainsite_shares)')
          ) {
            return { results: [{ name: 'post_id' }] as T[] };
          }

          return { results: [] as T[] };
        },
        async run() {
          if (query.includes('INSERT INTO mainsite_posts (id, title') && query.includes('SELECT')) {
            const id = Number(this.values[0]);
            const currentId = Number(this.values.at(-1));
            const existing = state.posts.get(currentId);
            if (existing) {
              state.posts.set(id, {
                ...existing,
                id,
                title: String(this.values[1]),
                content: String(this.values[2]),
                author: String(this.values[3]),
                is_published: query.includes('?, created_at') ? Number(this.values[4] ?? 1) : existing.is_published,
              });
            }
          } else if (query.includes('INSERT INTO mainsite_posts (id, title')) {
            const id = Number(this.values[0]);
            state.posts.set(id, {
              ...createPost(id, String(this.values[1])),
              content: String(this.values[2]),
              author: String(this.values[3]),
              is_published: Number(this.values[4] ?? 1),
            });
          } else if (query.includes('INSERT INTO mainsite_posts (title')) {
            const id = Math.max(0, ...Array.from(state.posts.keys())) + 1;
            state.posts.set(id, {
              ...createPost(id, String(this.values[0])),
              content: String(this.values[1]),
              author: String(this.values[2]),
              is_published: Number(this.values[3] ?? 1),
            });
          } else if (query.includes('UPDATE mainsite_comments SET post_id')) {
            state.comments = updateRefs(state.comments, Number(this.values[0]), Number(this.values[1]));
          } else if (query.includes('UPDATE mainsite_ratings SET post_id')) {
            state.ratings = updateRefs(state.ratings, Number(this.values[0]), Number(this.values[1]));
          } else if (query.includes('UPDATE mainsite_post_ai_summaries SET post_id')) {
            if (!state.posts.has(Number(this.values[0]))) {
              throw new Error('FOREIGN KEY constraint failed');
            }
            state.summaries = updateRefs(state.summaries, Number(this.values[0]), Number(this.values[1]));
          } else if (query.includes('UPDATE mainsite_shares SET post_id')) {
            state.shares = updateRefs(state.shares, Number(this.values[0]), Number(this.values[1]));
          } else if (query.includes('UPDATE mainsite_about SET source_post_id')) {
            if (state.aboutSourcePostId === Number(this.values[1])) {
              state.aboutSourcePostId = Number(this.values[0]);
            }
          } else if (query.includes('UPDATE mainsite_posts SET id = ?')) {
            const nextId = Number(this.values[0]);
            const currentId = Number(this.values.at(-1));
            const existing = state.posts.get(currentId);
            if (existing) {
              state.posts.delete(currentId);
              state.posts.set(nextId, {
                ...existing,
                id: nextId,
                title: String(this.values[1]),
                content: String(this.values[2]),
                author: String(this.values[3]),
                is_published: query.includes('is_published') ? Number(this.values[4] ?? 1) : existing.is_published,
              });
            }
          } else if (query.includes('DELETE FROM mainsite_posts WHERE id = ?')) {
            state.posts.delete(Number(this.values[0]));
          } else if (query.includes('UPDATE mainsite_posts SET title = ?')) {
            const id = Number(this.values.at(-1));
            const existing = state.posts.get(id);
            if (existing) {
              state.posts.set(id, {
                ...existing,
                title: String(this.values[0]),
                content: String(this.values[1]),
                author: String(this.values[2]),
                is_published: query.includes('is_published') ? Number(this.values[3] ?? 1) : existing.is_published,
              });
            }
          } else if (query.includes('INSERT INTO mainsite_settings')) {
            state.contentVersionBumps += 1;
          }

          return { meta: { changes: 1 } };
        },
      };

      return statement;
    },
  };
}

describe('mainsite posts admin route', () => {
  it('creates a post with an explicit ID when requested', async () => {
    const db = createDb();

    const response = await onRequestPost({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_id: 42,
          title: 'ID manual',
          author: 'Leonardo',
          content: '<p>Texto</p>',
          is_published: 1,
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; post: { id: number } };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.post.id).toBe(42);
    expect(db.state.posts.get(42)?.title).toBe('ID manual');
  });

  it('rejects explicit ID conflicts on creation', async () => {
    const db = createDb({ posts: new Map([[42, createPost(42)]]) });

    const response = await onRequestPost({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_id: 42,
          title: 'Conflito',
          content: '<p>Texto</p>',
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('#42');
  });

  it('renumbers an existing post and updates known post references', async () => {
    const db = createDb({
      posts: new Map([[7, createPost(7, 'Original')]]),
      comments: [7],
      ratings: [7],
      summaries: [7],
      shares: [7],
      aboutSourcePostId: 7,
    });

    const response = await onRequestPut({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          requested_id: 21,
          title: 'Renumerado',
          author: 'Leonardo',
          content: '<p>Texto atualizado</p>',
          is_published: 0,
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; post: { id: number; is_published: number } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.post.id).toBe(21);
    expect(payload.post.is_published).toBe(0);
    expect(db.state.posts.has(7)).toBe(false);
    expect(db.state.posts.get(21)?.title).toBe('Renumerado');
    expect(db.state.comments).toEqual([21]);
    expect(db.state.ratings).toEqual([21]);
    expect(db.state.summaries).toEqual([21]);
    expect(db.state.shares).toEqual([21]);
    expect(db.state.aboutSourcePostId).toBe(21);
    expect(db.state.contentVersionBumps).toBe(1);
  });

  it('rejects explicit ID conflicts on update', async () => {
    const db = createDb({
      posts: new Map([
        [7, createPost(7, 'Original')],
        [21, createPost(21, 'Ocupado')],
      ]),
      comments: [7],
    });

    const response = await onRequestPut({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          requested_id: 21,
          title: 'Conflito',
          author: 'Leonardo',
          content: '<p>Texto</p>',
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('#21');
    expect(db.state.posts.has(7)).toBe(true);
    expect(db.state.posts.get(21)?.title).toBe('Ocupado');
    expect(db.state.comments).toEqual([7]);
  });

  it('keeps the same ID when requested_id equals the current post id', async () => {
    const db = createDb({ posts: new Map([[7, createPost(7, 'Original')]]) });

    const response = await onRequestPut({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          requested_id: 7,
          title: 'Mesmo ID',
          author: 'Leonardo',
          content: '<p>Atualizado</p>',
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; post: { id: number; title: string } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.post.id).toBe(7);
    expect(payload.post.title).toBe('Mesmo ID');
    expect(db.state.posts.has(7)).toBe(true);
    expect(db.state.contentVersionBumps).toBe(0);
  });

  it('renumbers without changing visibility when is_published is omitted', async () => {
    const db = createDb({
      posts: new Map([[7, { ...createPost(7, 'Original'), is_published: 0 }]]),
      summaries: [7],
    });

    const response = await onRequestPut({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          requested_id: 8,
          title: 'Sem flag',
          author: 'Leonardo',
          content: '<p>Atualizado</p>',
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; post: { id: number; is_published: number } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.post.id).toBe(8);
    expect(payload.post.is_published).toBe(0);
    expect(db.state.summaries).toEqual([8]);
    expect(db.state.contentVersionBumps).toBe(1);
  });

  it('rejects invalid requested IDs on update', async () => {
    const db = createDb({ posts: new Map([[7, createPost(7)]]) });

    const response = await onRequestPut({
      request: new Request('https://admin.lcv.app.br/api/mainsite/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          requested_id: 0,
          title: 'Inválido',
          content: '<p>Texto</p>',
        }),
      }),
      env: { BIGDATA_DB: db },
    });

    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('inteiro positivo');
  });
});
