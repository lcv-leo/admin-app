// Corrige id=33 reinserindo as <img> originais do backup (R2) no lugar dos
// ![alt](file.png) markdown do .md refundado. As URLs /api/mainsite/media/{uuid}
// apontam para o worker que serve do R2.
//
// Estratégia:
//   1) Lê .md refundado (já tem ![alt](file.png) nos lugares corretos)
//   2) Lê backup e extrai as <img> tags na ordem de aparição
//   3) Substitui cada ![]() pela <img> correspondente (1:1 por ordem)
//   4) Roda o pipeline convertMarkdownToFormattedHtml como sempre
//   5) Anexa rodapé + sanitize + collapse
//   6) Grava post-33.html e gera update-post-33.sql; executa UPDATE e verifica

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import DOMPurifyFactory from 'dompurify';
import { Window } from 'happy-dom';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const MD_PATH = path.join(ROOT, 'textos-refundados', '033-v2.1-o-ego-na-senda.md');
const BACKUP = path.join(ROOT, 'backup-mainsite_posts-20260420-0439.json');
const OUT_HTML = path.join(ROOT, 'textos-para-insercao', 'post-33.html');
const OUT_SQL = path.join(ROOT, 'sql-updates', 'update-post-33.sql');
const GDRIVE_MAP = path.join(ROOT, 'gdrive-map.json');
const OLD_DIR = 'C:/Users/leona/OneDrive/Documentos/Artigos Antigos';

// ----- Pipeline (replica markdownImport.ts, com pré-substituição de imagens) -----
const window = new Window();
const DOMPurify = DOMPurifyFactory(window);

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const stripFrontmatter = md => md.replace(FRONTMATTER_RE, '');
const TRAILING_SIGNATURE_RE = /^\s*\*\*[^*\n]+\*\*\s*$/;
function stripTrailingSignature(md) {
  const lines = md.split(/\r?\n/);
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0) return md;
  if (!TRAILING_SIGNATURE_RE.test(lines[i])) return md;
  lines.splice(i, lines.length - i);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}
function extractFirstH1(md) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return { title: null, body: md };
  const match = lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
  if (!match) return { title: null, body: md };
  const title = match[1].trim();
  lines.splice(i, 1);
  while (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
  return { title, body: lines.join('\n') };
}
function preprocessMarkdownNoImages(md) {
  // Difere do original: NÃO substitui ![]() porque já fizemos isso antes (com tag <img>).
  return md.replace(/^(#{1,6})\s/gm, '### ');
}
function postprocessHtml(html) {
  let processed = html;
  processed = processed.replace(/<p[^>]*>(?:<br\s*\/?>|&nbsp;|\s)*<\/p>\s*/gi, '');
  processed = processed.replace(/<p>/g, '<p style="text-indent: 1.5rem; text-align: justify;">');
  processed = processed.replace(/<h3>/g, '<h3 style="text-align: left;">');
  return processed;
}
function collapseBlockWhitespace(html) {
  return html.replace(/>\s*\n\s*</g, '><').replace(/\n/g, ' ');
}

// Escape para regex
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseFrontmatter(rawMd) {
  const m = rawMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1];
  const get = key => {
    const re = new RegExp(`^${key}\\s*:\\s*"(.*)"\\s*$`, 'm');
    const mm = fm.match(re);
    return mm ? mm[1] : null;
  };
  return { title: get('title') ?? get('título'), author: get('author') ?? get('autor') };
}

// ----- Executa -----
const rawMd = fs.readFileSync(MD_PATH, 'utf8');
const backupRows = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))[0].results;
const oldPost = backupRows.find(r => r.id === 33);

const originalImgs = [...oldPost.content.matchAll(/<img[^>]*>/g)].map(m => m[0]);
const mdImgs = [...rawMd.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
if (originalImgs.length !== mdImgs.length) {
  throw new Error(`Mismatch: ${originalImgs.length} <img> no backup, ${mdImgs.length} ![]() no .md`);
}
console.log(`Substituindo ${mdImgs.length} imagem(ns) no .md pelas <img> originais do backup.`);

// Substituir ocorrência por ocorrência, preservando ordem
let patchedMd = rawMd;
for (let i = 0; i < mdImgs.length; i++) {
  const full = mdImgs[i][0]; // ex.: ![alt](file.png)
  const idx = patchedMd.indexOf(full);
  if (idx < 0) throw new Error(`Não encontrou ${full}`);
  patchedMd = patchedMd.slice(0, idx) + originalImgs[i] + patchedMd.slice(idx + full.length);
}

// Pipeline
const noFront = stripFrontmatter(patchedMd);
const noSig = stripTrailingSignature(noFront);
const { title: h1Title, body } = extractFirstH1(noSig);
const prepared = preprocessMarkdownNoImages(body);
const rawHtml = marked.parse(prepared, { async: false });
const formatted = postprocessHtml(rawHtml);
const sanitized = DOMPurify.sanitize(formatted, { ADD_ATTR: ['style', 'data-width'] });

// Rodapé (usar mesma lógica: id=33 tem 1 URL Drive, arquivo antigo 033-o-ego-na-senda...)
const gdriveMap = JSON.parse(fs.readFileSync(GDRIVE_MAP, 'utf8'));
const gdriveEntry = gdriveMap['33'];
const gdriveUrl = gdriveEntry.gdrive_url;
const oldFile = '033-o-ego-na-senda-anatomia-provisoria-do-falso-eu-na-jornada-espiritual.md';
const oldFm = fs.readFileSync(path.join(OLD_DIR, oldFile), 'utf8').match(/^---\s*\n([\s\S]*?)\n---/)[1];
const oldTitle = oldFm.match(/^title\s*:\s*"(.*)"\s*$/m)[1];
const rodape = `<p style="text-indent: 1.5rem; text-align: justify;"><em>A versão anterior deste ensaio pode ser acessada em <a target="_blank" rel="noopener noreferrer" href="${gdriveUrl}"><em>${oldTitle}</em></a>.</em></p>`;

// Sanitize links
function sanitizeLinksTargetBlank(html) {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = html;
  const anchors = doc.querySelectorAll('a[href]');
  let changed = false;
  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (/(?:youtube\.com|youtu\.be)/i.test(href)) return;
    if (a.getAttribute('target') !== '_blank') { a.setAttribute('target', '_blank'); changed = true; }
    if (a.getAttribute('rel') !== 'noopener noreferrer') { a.setAttribute('rel', 'noopener noreferrer'); changed = true; }
  });
  return changed ? doc.body.innerHTML : html;
}

const finalHtml = collapseBlockWhitespace(sanitizeLinksTargetBlank(sanitized + rodape));
fs.writeFileSync(OUT_HTML, finalHtml, 'utf8');
console.log(`post-33.html regerado: ${finalHtml.length} chars, ${Buffer.byteLength(finalHtml, 'utf8')} bytes`);

// Verificações
const imgInFinal = (finalHtml.match(/<img[^>]*>/g) || []).length;
const placeholderInFinal = (finalHtml.match(/🖼️/g) || []).length;
console.log(`  <img> tags: ${imgInFinal}  |  placeholders 🖼️: ${placeholderInFinal}`);
if (imgInFinal !== 2 || placeholderInFinal !== 0) {
  throw new Error('Contagem de imagens inesperada após fix');
}

// UPDATE no banco
const fm = parseFrontmatter(rawMd);
const backup = oldPost;
const finalTitle = backup.title; // id=33 na lista de exceções (mantém banco)
const finalAuthor = fm.author || backup.author;

const escapeSqlite = v => v.replace(/'/g, "''");
const sql = `UPDATE mainsite_posts\nSET content = '${escapeSqlite(finalHtml)}',\n    title   = '${escapeSqlite(finalTitle)}',\n    author  = '${escapeSqlite(finalAuthor ?? '')}',\n    updated_at = CURRENT_TIMESTAMP\nWHERE id = 33;\n`;
fs.writeFileSync(OUT_SQL, sql, 'utf8');
console.log(`SQL gerado: ${path.relative(ROOT, OUT_SQL)} (${sql.length} bytes)`);

if (process.argv.includes('--apply')) {
  console.log('Executando UPDATE no banco...');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigdata_db', '--remote', '--file', OUT_SQL], {
    cwd: ROOT, stdio: 'inherit', shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  console.log('UPDATE concluído.');
} else {
  console.log('Modo preview. Use --apply para executar o UPDATE no banco.');
}
