// Varredura universal de alinhamento: adiciona text-align: left em qualquer
// <h1>, <h2>, <h3>, <h4>, <h5>, <h6> que não tenha text-align no style.
// Regenera HTMLs e UPDATEs o banco dos posts afetados.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HTML_DIR = path.join(ROOT, 'textos-para-insercao');
const SQL_DIR = path.join(ROOT, 'sql-updates');
const MANIFEST = path.join(ROOT, 'insercao-manifest.json');
const LOG_PATH = path.join(ROOT, 'fase4-execution.log');

const apply = process.argv.includes('--apply');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

function fixHeadings(html) {
  const win = new Window();
  win.document.body.innerHTML = html;
  let fixed = 0;
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    for (const el of win.document.querySelectorAll(tag)) {
      const style = el.getAttribute('style') || '';
      if (/text-align\s*:/.test(style)) continue; // já tem alinhamento explícito
      const newStyle = style.trim() ? `${style.trim().replace(/;$/, '')}; text-align: left;` : 'text-align: left;';
      el.setAttribute('style', newStyle);
      fixed++;
    }
  }
  return { html: win.document.body.innerHTML, fixed };
}

function escapeSqlite(v) { return v.replace(/'/g, "''"); }

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, `${msg}\n`, 'utf8');
}

log(`Fase 4.3 (fix all headings align) iniciada. apply=${apply}`);
const touched = [];

for (const m of manifest) {
  const htmlPath = path.join(HTML_DIR, `post-${m.id}.html`);
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  const { html: fixedHtml, fixed } = fixHeadings(originalHtml);
  if (fixed === 0) continue;

  fs.writeFileSync(htmlPath, fixedHtml, 'utf8');
  const sql = `UPDATE mainsite_posts\nSET content = '${escapeSqlite(fixedHtml)}',\n    title   = '${escapeSqlite(m.final_title)}',\n    author  = '${escapeSqlite(m.final_author ?? '')}',\n    updated_at = CURRENT_TIMESTAMP\nWHERE id = ${m.id};\n`;
  fs.writeFileSync(path.join(SQL_DIR, `update-post-${m.id}.sql`), sql, 'utf8');

  const newBytes = Buffer.byteLength(fixedHtml, 'utf8');
  log(`id=${m.id}: ${fixed} headings corrigidos (bytes: ${Buffer.byteLength(originalHtml, 'utf8')} → ${newBytes})`);
  touched.push({ id: m.id, fixed, newBytes });
}

if (touched.length === 0) { log('Nada a fazer.'); process.exit(0); }
log(`Total: ${touched.length} posts afetados. Ids: ${touched.map(t => t.id).join(',')}`);

if (!apply) { log('Modo preview. Use --apply para executar UPDATE.'); process.exit(0); }

log('Aplicando UPDATE no banco...');
for (const t of touched) {
  const sqlPath = path.join(SQL_DIR, `update-post-${t.id}.sql`);
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigdata_db', '--remote', '--file', sqlPath], {
      cwd: ROOT, stdio: 'pipe', shell: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
    });
  } catch (e) { log(`id=${t.id}: FALHA no UPDATE: ${e.message}`); process.exit(1); }
  const verifyCmd = `"SELECT LENGTH(CAST(content AS BLOB)) AS bytes FROM mainsite_posts WHERE id = ${t.id};"`;
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigdata_db', '--remote', '--command', verifyCmd, '--json'], {
    cwd: ROOT, stdio: 'pipe', shell: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const j = JSON.parse(out.slice(out.indexOf('[')));
  const dbBytes = j[0].results[0].bytes;
  if (dbBytes !== t.newBytes) { log(`id=${t.id}: FALHOU. banco=${dbBytes} esperado=${t.newBytes}`); process.exit(1); }
  log(`id=${t.id}: OK (${dbBytes} bytes, ${t.fixed} headings corrigidos)`);
}
log('Fase 4.3 concluída.');
