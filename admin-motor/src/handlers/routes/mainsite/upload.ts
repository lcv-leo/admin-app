/**
 * Upload de mídia para Cloudflare R2 (binding direto MEDIA_BUCKET).
 * POST /api/mainsite/upload — recebe FormData com campo `file`.
 * Retorna { success: true, url: "<public URL>" }.
 */

interface Env {
  MEDIA_BUCKET: R2Bucket;
  [key: string]: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return Response.json({ error: 'Nenhum arquivo submetido.' }, { status: 400 });
    }

    const extension = file.name.split('.').pop() || 'bin';
    const uniqueName = `${crypto.randomUUID()}.${extension}`;

    await ((context as any).data?.env || context.env).MEDIA_BUCKET.put(uniqueName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    // URL relativa servida pelo próprio admin-app (binding direto R2, sem URL externa)
    const publicUrl = `/api/mainsite/media/${uniqueName}`;

    return Response.json({ success: true, url: publicUrl }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido no upload.';
    return Response.json({ error: message }, { status: 500 });
  }
};
