/**
 * Serve de mídia diretamente do Cloudflare R2 (binding MEDIA_BUCKET).
 * GET /api/mainsite/media/:filename
 * Retorna o objeto binário com Content-Type correto e cache público.
 */

interface R2ObjectBody {
  body: ReadableStream
  etag: string
  httpMetadata?: { contentType?: string }
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectBody | null>
}

interface Env {
  MEDIA_BUCKET: R2BucketLike
  [key: string]: unknown
}

interface MediaContext {
  request: Request
  env: Env
  params: Record<string, string>
}

export async function onRequestGet(context: MediaContext): Promise<Response> {
  const filename = context.params?.filename as string
  if (!filename) {
    return new Response('Arquivo não especificado.', { status: 400 })
  }

  try {
    const object = await context.env.MEDIA_BUCKET.get(filename)
    if (!object) {
      return new Response('Arquivo não encontrado.', { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('ETag', object.etag)

    return new Response(object.body, { headers })
  } catch {
    return new Response('Erro ao recuperar arquivo.', { status: 500 })
  }
}
