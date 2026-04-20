// Envolve conteúdo cru de <li> em <p style="text-align: left;"> para id=33 e id=53,
// corrigindo herança de text-align: center do .site-shell quando o <li> não tinha <p>.
//
// Uso: node refund-fix-li-wrap.mjs [--apply]

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
const IDS_TO_FIX = [33, 53];

function wrapLiInP(html) {
  const win = new Window();
  win.document.body.innerHTML = html;
  let wrapped = 0;
  for (const li of win.document.querySelectorAll('li')) {
    const hasP = Array.from(li.children).some(c => c.tagName === 'P');
    if (hasP) continue;
    const inner = li.innerHTML.trim();
    if (!inner) continue;
    li.innerHTML = `<p style="text-align: left;">${inner}</p>`;
    wrapped++;
  }
  return { html: win.document.body.innerHTML, wrapped };
}

function escapeSqlite(v) { return v.replace(/'/g, "''"); }

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, `${msg}\n`, 'utf8');
}

log(`Fase 4.2 (fix li wrap) iniciada. apply=${apply}`);
const touched = [];

for (const id of IDS_TO_FIX) {
  const m = manifest.find(x => x.id === id);
  const htmlPath = path.join(HTML_DIR, `post-${id}.html`);
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  const { html: fixedHtml, wrapped } = wrapLiInP(originalHtml);
  if (wrapped === 0) { log(`id=${id}: 0 <li> a envolver. Pulando.`); continue; }

  fs.writeFileSync(htmlPath, fixedHtml, 'utf8');
  const sql = `UPDATE mainsite_posts\nSET content = '${escapeSqlite(fixedHtml)}',\n    title   = '${escapeSqlite(m.final_title)}',\n    author  = '${escapeSqlite(m.final_author ?? '')}',\n    updated_at = CURRENT_TIMESTAMP\nWHERE id = ${id};\n`;
  fs.writeFileSync(path.join(SQL_DIR, `update-post-${id}.sql`), sql, 'utf8');

  const newBytes = Buffer.byteLength(fixedHtml, 'utf8');
  log(`id=${id}: ${wrapped} <li> envolvidos em <p> (bytes: ${Buffer.byteLength(originalHtml, 'utf8')} → ${newBytes})`);
  touched.push({ id, wrapped, newBytes });
}

if (touched.length === 0) { log('Nada a fazer.'); process.exit(0); }

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
  log(`id=${t.id}: OK (${dbBytes} bytes, ${t.wrapped} <li> envolvidos)`);
}
log('Fase 4.2 concluída.');
