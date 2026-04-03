export async function onRequest(context: any) {
  const url = new URL(context.request.url);

  // Bloqueio de exposição pública via URL interna .pages.dev
  if (url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'admin.lcv.app.br';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
};
