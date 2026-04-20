// Fase 4 — UPDATE no banco, post a post, com verificação.
// Lê insercao-manifest.json + textos-para-insercao/post-{id}.html.
// Para cada post: gera SQL temp, executa via wrangler, faz SELECT de verificação.
// Para imediatamente ao primeiro sinal de problema.
//
// Uso:
//   node refund-db-update.mjs              # executa todos os 22
//   node refund-db-update.mjs 1 2 3        # executa só ids específicos
//   node refund-db-update.mjs --dry-run    # só gera SQLs, não executa
//
// Obs.: para ser executado a partir de qualquer CWD (usa caminhos absolutos).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'insercao-manifest.json');
const HTML_DIR = path.join(ROOT, 'textos-para-insercao');
const SQL_DIR = path.join(ROOT, 'sql-updates');
const LOG_PATH = path.join(ROOT, 'fase4-execution.log');

fs.mkdirSync(SQL_DIR, { recursive: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIds = args.filter(a => /^\d+$/.test(a)).map(a => parseInt(a, 10));

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const toProcess = onlyIds.length > 0
  ? manifest.filter(m => onlyIds.includes(m.id))
  : manifest;

function escapeSqlite(value) {
  // SQLite: escapa aspa simples dobrando
  return value.replace(/'/g, "''");
}

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, `${msg}\n`, 'utf8');
}

function runWrangler(args, expectJson = true) {
  // Executa via npx wrangler. cwd = ROOT para aproveitar wrangler config.
  // shell: true é necessário no Windows para resolver .cmd shims do npx.
  const out = execFileSync('npx', ['wrangler', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  if (!expectJson) return out;
  // A saída do wrangler inclui linhas de status antes do JSON. Pega a partir do primeiro '['
  const bracket = out.indexOf('[');
  if (bracket < 0) throw new Error(`Saída do wrangler sem JSON: ${out.slice(0, 300)}`);
  try {
    return JSON.parse(out.slice(bracket));
  } catch (e) {
    throw new Error(`Falha ao parsear JSON do wrangler: ${e.message}\n--- início da saída:\n${out.slice(0, 800)}`);
  }
}

log(`Fase 4 iniciada. Posts a processar: ${toProcess.map(m => m.id).join(', ')}. dry-run=${dryRun}`);

for (const entry of toProcess) {
  const id = entry.id;
  const htmlPath = path.join(HTML_DIR, `post-${id}.html`);
  const html = fs.readFileSync(htmlPath, 'utf8');

  const title = entry.final_title;
  const author = entry.final_author;
  if (!title) { log(`id=${id}: title vazio no manifest. ABORTANDO.`); process.exit(1); }

  const sql = `UPDATE mainsite_posts\nSET content = '${escapeSqlite(html)}',\n    title   = '${escapeSqlite(title)}',\n    author  = '${escapeSqlite(author ?? '')}',\n    updated_at = CURRENT_TIMESTAMP\nWHERE id = ${id};\n`;
  const sqlPath = path.join(SQL_DIR, `update-post-${id}.sql`);
  fs.writeFileSync(sqlPath, sql, 'utf8');
  log(`id=${id}: SQL gravado em ${path.relative(ROOT, sqlPath)} (${sql.length} bytes)`);

  if (dryRun) continue;

  // 1) UPDATE
  let updRes;
  try {
    updRes = runWrangler(['d1', 'execute', 'bigdata_db', '--remote', '--file', sqlPath]);
  } catch (e) {
    log(`id=${id}: FALHA no UPDATE: ${e.message}`);
    process.exit(1);
  }
  const changes = updRes?.[0]?.meta?.changes ?? null;
  // D1 costuma reportar changes=2 para UPDATE single-row (contagem interna de páginas);
  // a verdade operacional vem do SELECT de verificação abaixo.
  if (!Number.isInteger(changes) || changes < 1) {
    log(`id=${id}: changes=${changes} (esperado >=1). ABORTANDO.`);
    process.exit(1);
  }

  // 2) SELECT de verificação (via --command, pois --file não retorna resultados de SELECT)
  // Usamos LENGTH(CAST(... AS BLOB)) para contar BYTES UTF-8, não chars (evita divergência em
  // emojis fora do BMP, onde string.length do JS conta UTF-16 code units).
  const selectSql = `SELECT id, LENGTH(CAST(content AS BLOB)) AS tamanho_bytes, title, author, substr(content, -400) AS final_300 FROM mainsite_posts WHERE id = ${id};`;
  let verify;
  try {
    verify = runWrangler(['d1', 'execute', 'bigdata_db', '--remote', '--command', `"${selectSql}"`, '--json']);
  } catch (e) {
    log(`id=${id}: FALHA no SELECT de verificação: ${e.message}`);
    process.exit(1);
  }
  const row = verify?.[0]?.results?.[0];
  if (!row) { log(`id=${id}: SELECT não retornou linha. ABORTANDO.`); process.exit(1); }
  const expectedBytes = Buffer.byteLength(html, 'utf8');
  if (row.tamanho_bytes !== expectedBytes) {
    log(`id=${id}: LENGTH(content) em bytes=${row.tamanho_bytes} no banco != ${expectedBytes} local. ABORTANDO.`);
    process.exit(1);
  }
  if (row.title !== title) {
    log(`id=${id}: title no banco=${JSON.stringify(row.title)} != esperado=${JSON.stringify(title)}. ABORTANDO.`);
    process.exit(1);
  }
  if (row.author !== (author ?? '')) {
    log(`id=${id}: author no banco=${JSON.stringify(row.author)} != esperado=${JSON.stringify(author ?? '')}. ABORTANDO.`);
    process.exit(1);
  }
  // Se o post tinha rodapé, checar se os últimos 400 chars contêm drive.google.com
  const hasRodape = entry.has_rodape;
  const hasDrive = row.final_300 && /drive\.google\.com/.test(row.final_300);
  if (hasRodape && !hasDrive) {
    log(`id=${id}: rodapé esperado mas URL Drive não encontrada nos últimos 400 chars. ABORTANDO.`);
    process.exit(1);
  }
  log(`id=${id}: OK (tamanho=${row.tamanho}, rodape=${hasRodape ? 'presente' : 'sem URL'})`);
}

log(`Fase 4 concluída. ${toProcess.length} post(s) processado(s).`);
