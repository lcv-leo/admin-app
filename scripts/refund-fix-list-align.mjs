// Corrige alinhamento de <p> dentro de <li> em todos os 22 posts alvo.
// Regra: <p> dentro de <li> deve ser text-align: left (sem indent) — referências
// bibliográficas e itens de lista em geral não usam justify.
//
// Preserva: <p> fora de <li> fica como está (text-align: justify; text-indent: 1.5rem).
//
// Uso: node refund-fix-list-align.mjs [--apply]
//   Sem --apply: regenera HTMLs + SQLs e mostra estatísticas.
//   Com --apply: também executa UPDATE no banco para posts alterados.

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
const backupRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'backup-mainsite_posts-20260420-0439.json'), 'utf8'))[0].results;
const backupById = new Map(backupRows.map(r => [r.id, r]));

function fixListAlignment(html) {
  const win = new Window();
  win.document.body.innerHTML = html;
  let changed = 0;
  for (const p of win.document.querySelectorAll('li p')) {
    const prev = p.getAttribute('style') || '';
    const next = 'text-align: left;';
    if (prev !== next) {
      p.setAttribute('style', next);
      changed++;
    }
  }
  return { html: win.document.body.innerHTML, changed };
}

function escapeSqlite(v) { return v.replace(/'/g, "''"); }

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, `${msg}\n`, 'utf8');
}

const touched = [];
log(`Fase 4.1 (fix align) iniciada. apply=${apply}`);

for (const m of manifest) {
  const htmlPath = path.join(HTML_DIR, `post-${m.id}.html`);
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  const { html: fixedHtml, changed } = fixListAlignment(originalHtml);
  if (changed === 0) continue;

  fs.writeFileSync(htmlPath, fixedHtml, 'utf8');
  const backup = backupById.get(m.id);
  const sql = `UPDATE mainsite_posts\nSET content = '${escapeSqlite(fixedHtml)}',\n    title   = '${escapeSqlite(m.final_title)}',\n    author  = '${escapeSqlite(m.final_author ?? '')}',\n    updated_at = CURRENT_TIMESTAMP\nWHERE id = ${m.id};\n`;
  fs.writeFileSync(path.join(SQL_DIR, `update-post-${m.id}.sql`), sql, 'utf8');

  const newBytes = Buffer.byteLength(fixedHtml, 'utf8');
  log(`id=${m.id}: ${changed} <p> em <li> corrigidos (bytes: ${Buffer.byteLength(originalHtml, 'utf8')} → ${newBytes})`);
  touched.push({ id: m.id, changed, newBytes });
}

if (touched.length === 0) {
  log('Nada a corrigir.');
  process.exit(0);
}

log(`Total: ${touched.length} posts com fix. Ids: ${touched.map(t => t.id).join(',')}`);

if (!apply) {
  log('Modo preview. Use --apply para executar UPDATE.');
  process.exit(0);
}

log('Aplicando UPDATE no banco...');
for (const t of touched) {
  const sqlPath = path.join(SQL_DIR, `update-post-${t.id}.sql`);
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigdata_db', '--remote', '--file', sqlPath], {
      cwd: ROOT, stdio: 'pipe', shell: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
    });
  } catch (e) {
    log(`id=${t.id}: FALHA no UPDATE: ${e.message}`);
    process.exit(1);
  }

  // Verificação por bytes
  const verifyCmd = `"SELECT LENGTH(CAST(content AS BLOB)) AS bytes FROM mainsite_posts WHERE id = ${t.id};"`;
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigdata_db', '--remote', '--command', verifyCmd, '--json'], {
    cwd: ROOT, stdio: 'pipe', shell: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
  });
  const bracket = out.indexOf('[');
  const j = JSON.parse(out.slice(bracket));
  const dbBytes = j[0].results[0].bytes;
  if (dbBytes !== t.newBytes) {
    log(`id=${t.id}: VERIFICAÇÃO FALHOU. banco=${dbBytes} esperado=${t.newBytes}. ABORTANDO.`);
    process.exit(1);
  }
  log(`id=${t.id}: OK (${dbBytes} bytes)`);
}
log('Fase 4.1 concluída.');
