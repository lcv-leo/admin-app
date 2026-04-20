// Converte os .md refundados para o HTML do site usando o mesmo pipeline do PostEditor.
// Anexa a linha "A versão anterior deste ensaio pode ser acessada em [Título](URL)"
// com base em rodape-map.json.
// Gera: ../../textos-para-insercao/post-{id}.html + ../../insercao-manifest.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import DOMPurifyFactory from 'dompurify';
import { Window } from 'happy-dom';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OLD_DIR = 'C:/Users/leona/OneDrive/Documentos/Artigos Antigos';
const SRC_DIR = path.join(ROOT, 'textos-refundados');
const OUT_DIR = path.join(ROOT, 'textos-para-insercao');
const GDRIVE_MAP = path.join(ROOT, 'gdrive-map.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

// =========================================================================
// Pipeline idêntico ao markdownImport.ts do admin-app.
// =========================================================================
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
function stripFrontmatter(md) { return md.replace(FRONTMATTER_RE, ''); }

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

function preprocessMarkdown(md) {
  let processed = md;
  processed = processed.replace(/^(#{1,6})\s/gm, '### ');
  processed = processed.replace(/!\[([^\]]*)\]\([^)]+\)/g, '\n🖼️ *[Imagem não importada: $1]*\n');
  return processed;
}

function postprocessHtml(html) {
  let processed = html;
  processed = processed.replace(/<p[^>]*>(?:<br\s*\/?>|&nbsp;|\s)*<\/p>\s*/gi, '');
  // Usa a MESMA forma canônica que o banco armazena (após TipTap roundtrip):
  //   ordem: text-indent ; text-align  |  termina com ';'
  processed = processed.replace(/<p>/g, '<p style="text-indent: 1.5rem; text-align: justify;">');
  processed = processed.replace(/<p style="text-indent: 1\.5rem; text-align: justify;">(\s*)🖼️/g, '<p style="text-align: justify;">$1🖼️');
  processed = processed.replace(/<h3>/g, '<h3 style="text-align: left;">');
  return processed;
}

// Normaliza quebras de linha para o formato canônico do banco (tudo inline).
// 1) Colapsa whitespace entre tags. 2) Substitui \n residuais (dentro de texto) por espaço.
function collapseBlockWhitespace(html) {
  return html.replace(/>\s*\n\s*</g, '><').replace(/\n/g, ' ');
}

const window = new Window();
const DOMPurify = DOMPurifyFactory(window);

function convertMarkdownToFormattedHtml(rawMd) {
  if (!rawMd?.trim()) return { html: '', title: null };
  const withoutFrontmatter = stripFrontmatter(rawMd);
  const withoutSignature = stripTrailingSignature(withoutFrontmatter);
  const { title, body } = extractFirstH1(withoutSignature);
  const prepared = preprocessMarkdown(body);
  const rawHtml = marked.parse(prepared, { async: false });
  const formatted = postprocessHtml(rawHtml);
  const sanitized = DOMPurify.sanitize(formatted, { ADD_ATTR: ['style'] });
  const collapsed = collapseBlockWhitespace(sanitized);
  return { html: collapsed, title };
}

// =========================================================================
// Sanitizador de links: replica sanitizeLinksTargetBlank do PostEditor.tsx.
// Adiciona target="_blank" + rel="noopener noreferrer" a todos <a href> não-YouTube.
// =========================================================================
function isYoutubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function sanitizeLinksTargetBlank(html) {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = html;
  const anchors = doc.querySelectorAll('a[href]');
  let changed = false;
  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (isYoutubeUrl(href)) return;
    if (a.getAttribute('target') !== '_blank') { a.setAttribute('target', '_blank'); changed = true; }
    if (a.getAttribute('rel') !== 'noopener noreferrer') { a.setAttribute('rel', 'noopener noreferrer'); changed = true; }
  });
  return changed ? doc.body.innerHTML : html;
}

// =========================================================================
// Frontmatter parser simplificado (só precisa de title, author).
// =========================================================================
function parseFrontmatter(rawMd) {
  const m = rawMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1];
  const get = (key) => {
    const re = new RegExp(`^${key}\\s*:\\s*"(.*)"\\s*$`, 'm');
    const mm = fm.match(re);
    return mm ? mm[1] : null;
  };
  return {
    title: get('title') ?? get('título'),
    author: get('author') ?? get('autor'),
    subtitle: get('subtitle') ?? get('subtítulo'),
  };
}

// =========================================================================
// Mapa de arquivos .md alvo.
// =========================================================================
const FILE_MAP = {
  1:  '001-refundado-sobre-fragmentacao-e-unidade.md',
  2:  '002-refundado-sobre-a-hipocrisia.md',
  3:  '003-refundado-quando-o-vazio-aparece.md',
  6:  '006-refundado-sobre-a-astrologia.md',
  7:  '007-refundado-sobre-aquilo-que-chamo-de-eu.md',
  8:  '008-refundado-sobre-estar-sozinho.md',
  9:  '009-refundado-quando-o-escandalo-e-o-espelho.md',
  10: '010-refundado-sobre-o-niilismo-financeiro.md',
  22: '022-refundado-o-escandalo-do-cpf-infantil.md',
  24: '024-refundado-bets-e-endividamento-brasil.md',
  27: '027-refundado-a-triade-hospital-escola-comunidade.md',
  33: '033-v2.1-o-ego-na-senda.md',
  34: '034-refundado-a-arquitetura-do-inefavel.md',
  35: '035-refundado-a-metanoia-da-meia-idade.md',
  37: '037-refundado-a-duvida-de-tome.md',
  38: '038-refundado-as-sete-lagrimas-de-pai-preto.md',
  42: '042-refundado-paradigma-da-cruz.md',
  43: '043-refundado-mateus-10-16.md',
  45: '045-refundado-arquitetura-do-equilibrio.md',
  50: '050-refundado-alquimia-do-verbo.md',
  52: '052-refundado-abismo-entre-saber-e-ser.md',
  53: '053-stellium-abril-2026-peixes-cetus.md',
};

// =========================================================================
// Arquivos antigos e título extraído (para o rodapé "versão anterior").
// =========================================================================
function extractTitleOfOldFile(filePath) {
  const c = fs.readFileSync(filePath, 'utf8');
  const m = c.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const tm = fm.match(/^title\s*:\s*"(.*)"\s*$/m) || fm.match(/^t[íi]tulo\s*:\s*"(.*)"\s*$/mi);
  return tm ? tm[1] : null;
}

// Mapeamento especial para id=6 (duas URLs → dois arquivos antigos).
// Ordem das URLs no gdrive-map[6].entries bate com (v1.0, v2.0) → (005, 006).
const OLD_FILE_FOR_ID = {
  1: ['001-a-ilusao-da-fragmentacao.md'],
  2: ['002-a-cegueira-e-a-hipocrisia.md'],
  3: ['003-o-sublime-vazio.md'],
  6: [
    '005-analise-da-utilidade-pratica-da-astrologia-face-as-correntes-de-maestria-espirit.md',
    '006-analise-da-utilidade-pratica-da-astrologia-face-as-correntes-de-maestria-espirit.md',
  ],
  7: ['007-ser-vs-ego-identificando-a-essencia-divina.md'],
  8: ['008-a-soberania-psiquica-e-o-caminho-do-solitario-uma-analise-multidimensional-do-in.md'],
  9: ['009-o-espelho-da-ilusao-coletiva.md'],
  10: ['010-geracao-z-niilismo-financeiro-e-investimentos.md'],
  22: ['022-as-faces-do-abuso-parental.md'],
  24: ['024-a-anatomia-multidimensional-do-vicio-em-apostas-uma-analise-estrutural-psicologi.md'],
  27: ['027-umbanda-na-contemporaneidade-a-triade-templo-hospital-escola-sob-as-lentes-da-ps.md'],
  33: ['033-o-ego-na-senda-anatomia-provisoria-do-falso-eu-na-jornada-espiritual.md'],
  34: ['034-a-arquitetura-do-inefavel-simplicidade-erudicao-e-os-labirintos-da-comunicacao-n.md'],
  35: ['035-a-metanoia-e-a-jornada-da-alma-o-despertar-na-meia-idade-atraves-dos-espelhos-do.md'],
  37: ['037-o-labirinto-da-alma-a-danca-entre-a-ilusao-da-certeza-e-o-abismo-da-duvida-no-de.md'],
  38: ['038-o-misterio-da-reciprocidade-cosmica-uma-analise-da-lei-da-troca-sob-a-egide-das-.md'],
  42: ['042-o-paradigma-da-cruz-uma-exegese-multidimensional-do-discipulado-em-mateus-1624-m.md'],
  43: ['043-exegese-teologia-e-wirkungsgeschichte-de-mateus-1016-analise-sobre-a-etica-da-vu.md'],
  45: ['045-a-arquitetura-do-infinito-o-despertar-da-consciencia-atraves-do-equilibrio-multi.md'],
  50: ['050-a-alquimia-do-verbo-e-a-anatomia-da-cegueira-uma-investigacao-transdisciplinar-s.md'],
  52: ['052-o-abismo-entre-saber-e-ser-sabedoria-verdadeira-fe-e-o-retorno-a-fonte.md'],
  53: [], // sem URL, sem rodapé
};

// =========================================================================
// Montagem do rodapé HTML (linha "A versão anterior..."). Formato fechado
// com Leonardo: <p style="text-indent: 1.5rem; text-align: justify;">
//                <em>A versão anterior deste ensaio pode ser acessada em
//                 <a target="_blank" rel="noopener noreferrer" href="URL">
//                  <em>Título</em></a>.</em></p>
// Para id=6 (plural, 2 links): "As versões anteriores ... em X e Y."
// =========================================================================
function buildRodapeHtml(id, gdriveEntry) {
  if (!gdriveEntry || !OLD_FILE_FOR_ID[id] || OLD_FILE_FOR_ID[id].length === 0) return '';

  const urls = gdriveEntry.multiple
    ? gdriveEntry.entries.map(e => e.gdrive_url)
    : (gdriveEntry.gdrive_url ? [gdriveEntry.gdrive_url] : []);
  if (urls.length === 0) return '';

  const titles = OLD_FILE_FOR_ID[id].map(fname => extractTitleOfOldFile(path.join(OLD_DIR, fname)));
  if (titles.length !== urls.length) {
    throw new Error(`Mismatch URLs (${urls.length}) vs arquivos antigos (${titles.length}) para id=${id}`);
  }

  const linkFor = (title, url) =>
    `<a target="_blank" rel="noopener noreferrer" href="${url}"><em>${title}</em></a>`;

  let linkSection;
  if (urls.length === 1) {
    linkSection = `A versão anterior deste ensaio pode ser acessada em ${linkFor(titles[0], urls[0])}.`;
  } else if (urls.length === 2) {
    linkSection = `As versões anteriores deste ensaio podem ser acessadas em ${linkFor(titles[0], urls[0])} e ${linkFor(titles[1], urls[1])}.`;
  } else {
    const head = urls.slice(0, -1).map((u, i) => linkFor(titles[i], u)).join(', ');
    const last = linkFor(titles[urls.length - 1], urls[urls.length - 1]);
    linkSection = `As versões anteriores deste ensaio podem ser acessadas em ${head} e ${last}.`;
  }

  return `<p style="text-indent: 1.5rem; text-align: justify;"><em>${linkSection}</em></p>`;
}

// =========================================================================
// Execução principal.
// =========================================================================
const gdriveMap = JSON.parse(fs.readFileSync(GDRIVE_MAP, 'utf8'));
const backupRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'backup-mainsite_posts-20260420-0439.json'), 'utf8'))[0].results;
const backupById = new Map(backupRows.map(r => [r.id, r]));
const manifest = [];

for (const [idStr, fname] of Object.entries(FILE_MAP)) {
  const id = parseInt(idStr, 10);
  const mdPath = path.join(SRC_DIR, fname);
  const raw = fs.readFileSync(mdPath, 'utf8');

  const fm = parseFrontmatter(raw);
  const { html: convertedHtml, title: h1Title } = convertMarkdownToFormattedHtml(raw);

  const rodape = buildRodapeHtml(id, gdriveMap[String(id)]);
  const combined = rodape ? convertedHtml + rodape : convertedHtml;
  const finalHtml = collapseBlockWhitespace(sanitizeLinksTargetBlank(combined));

  const backup = backupById.get(id);
  // Exceções manuais: ids onde o title do banco deve ser preservado
  // (id=7: aspas curvas; id=33: título composto; id=53: Title Case)
  const TITLE_KEEP_FROM_DB = new Set([7, 33, 53]);
  const finalTitle = TITLE_KEEP_FROM_DB.has(id)
    ? backup?.title
    : (fm.title || h1Title || backup?.title || null);
  const finalAuthor = fm.author || backup?.author || null;

  const outPath = path.join(OUT_DIR, `post-${id}.html`);
  fs.writeFileSync(outPath, finalHtml, 'utf8');

  manifest.push({
    id,
    source_md: fname,
    final_title: finalTitle,
    final_author: finalAuthor,
    content_length: finalHtml.length,
    has_rodape: rodape.length > 0,
    rodape_preview: rodape || null,
  });

  console.log(`post ${String(id).padStart(2)}: ${finalHtml.length.toString().padStart(6)} bytes  | rodape=${rodape ? 'sim' : 'não'}  | title="${finalTitle?.slice(0, 60)}${finalTitle && finalTitle.length > 60 ? '…' : ''}"`);
}

fs.writeFileSync(path.join(ROOT, 'insercao-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('\nArquivos gerados em:', OUT_DIR);
console.log('Manifest:', path.join(ROOT, 'insercao-manifest.json'));
