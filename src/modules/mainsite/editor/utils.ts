export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const formatImageUrl = (url: string): string => {
  if (!url) return '';
  const driveRegex = /(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/;
  const match = url.match(driveRegex);
  if (match?.[1]) return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  return url;
};

export const isYoutubeUrl = (url: string): boolean => /(?:youtube\.com|youtu\.be)\//i.test(url);

export function migrateLegacyCaptions(html: string): string {
  if (!html) return html;

  const normalizeCaption = (caption: string) => {
    // Loop até estabilizar para resistir a padrões aninhados (`<a<b>>`) onde
    // um único pass deixaria caracteres residuais.
    let prev = '';
    let out = caption;
    while (prev !== out) {
      prev = out;
      out = out.replace(/<[^>]+>/g, '');
    }
    return out.replace(/\s+/g, ' ').trim();
  };

  const wrappedImagePattern =
    /<p[^>]*>\s*(<img\b[^>]*>)\s*<\/p>\s*<p[^>]*text-align\s*:\s*center[^>]*>\s*(?:<em>|<i>)\s*([\s\S]*?)\s*(?:<\/em>|<\/i>)\s*<\/p>/gi;
  const plainImagePattern =
    /(<img\b[^>]*>)\s*<p[^>]*text-align\s*:\s*center[^>]*>\s*(?:<em>|<i>)\s*([\s\S]*?)\s*(?:<\/em>|<\/i>)\s*<\/p>/gi;

  let migrated = html.replace(wrappedImagePattern, (_m, imgTag: string, captionRaw: string) => {
    const caption = normalizeCaption(captionRaw);
    if (!caption) return `<figure class="tiptap-figure">${imgTag}</figure>`;
    return `<figure class="tiptap-figure">${imgTag}<figcaption>${caption}</figcaption></figure>`;
  });

  migrated = migrated.replace(plainImagePattern, (_m, imgTag: string, captionRaw: string) => {
    const caption = normalizeCaption(captionRaw);
    if (!caption) return `<figure class="tiptap-figure">${imgTag}</figure>`;
    return `<figure class="tiptap-figure">${imgTag}<figcaption>${caption}</figcaption></figure>`;
  });

  return migrated;
}
