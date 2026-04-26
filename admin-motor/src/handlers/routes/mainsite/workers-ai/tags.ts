// Módulo: admin-app/functions/api/mainsite/workers-ai/tags.ts
// Descrição: Endpoint que usa Llama-3 (Cloudflare Workers AI) para gerar tags automaticamente.

interface Env {
  AI: any;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const data = await context.request.json<{ text: string }>();
    if (!data.text) {
      return new Response(JSON.stringify({ ok: false, error: 'Text required' }), { status: 400 });
    }

    const messages = [
      {
        role: 'system',
        content:
          'You are a precise tag generator. Return exactly 5 comma-separated keywords or short phrases that summarize the given text. Return ONLY the comma-separated words, nothing else.',
      },
      { role: 'user', content: data.text },
    ];

    const response = await ((context as any).data?.env || context.env).AI.run('@cf/meta/llama-3-8b-instruct', {
      messages,
    });

    const output = (response as { response: string }).response;
    const tags = output
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    return new Response(JSON.stringify({ ok: true, tags }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[workers-ai/tags] unhandled error', err);
    return new Response(JSON.stringify({ ok: false, error: 'Erro interno ao gerar tags.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
