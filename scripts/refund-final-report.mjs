// Gera relatório final da refundação em markdown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const TS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'insercao-manifest.json'), 'utf8'));
const backupRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'backup-mainsite_posts-20260420-0439.json'), 'utf8'))[0].results;
const byId = new Map(backupRows.map(r => [r.id, r]));

const L = [];
L.push('# Relatório de refundação de posts em mainsite_posts (Cloudflare D1)');
L.push('');
L.push('**Database:** bigdata_db (00000000-0000-0000-0000-000000000000)');
L.push('**Conta Cloudflare:** LCV (cloudflare@lcvmail.com)');
L.push('**Executor:** Claude Code (Opus 4.7)');
L.push('**Operador:** Leonardo Cardozo Vargas');
L.push('**Início:** 2026-04-20 04:39 (horário do backup)');
L.push(`**Término:** ${new Date().toISOString()}`);
L.push('');
L.push('## Escopo');
L.push('');
L.push('Substituição do `content`, `title` e `author` de 22 posts pela versão refundada ("Protocolo Leonardo-Tomé v1.3"), preservando URLs do Google Drive das versões antigas em rodapé padronizado e imagens do R2.');
L.push('');
L.push(`**Ids processados (22):** ${manifest.map(m => m.id).join(', ')}`);
L.push('');
L.push('## Totais');
L.push('');
L.push('| Métrica | Valor |');
L.push('|---|---|');
L.push('| Posts processados com sucesso | 22 / 22 |');
L.push('| Posts com rodapé ("versão anterior...") | 21 |');
L.push('| Posts sem rodapé (sem URL Drive) | 1 (id=53) |');
L.push('| Posts com 2 URLs no rodapé (plural) | 1 (id=6, v1.0 + v2.0) |');
L.push('| Imagens `<img>` preservadas do R2 | 2 (id=33) |');
L.push('| Posts com `<p>` em `<li>` corrigidos para text-align: left | 12 (ids: 22,24,27,34,35,37,38,42,43,45,50,52) |');
L.push('| Total de `<p>` em `<li>` corrigidos | 459 |');
L.push('| Falhas | 0 |');
L.push('');
L.push('## Execução por post');
L.push('');
L.push('| id | bytes antigos | bytes novos | rodapé | imgs | title mudou | author mudou |');
L.push('|---|---|---|---|---|---|---|');
for (const m of manifest) {
  const old = byId.get(m.id);
  const html = fs.readFileSync(path.join(ROOT, 'textos-para-insercao', `post-${m.id}.html`), 'utf8');
  const newBytes = Buffer.byteLength(html, 'utf8');
  const imgs = (html.match(/<img[^>]*>/g) || []).length;
  L.push(`| ${m.id} | ${Buffer.byteLength(old.content, 'utf8')} | ${newBytes} | ${m.has_rodape ? 'sim' : 'não'} | ${imgs} | ${old.title !== m.final_title ? 'sim' : 'não'} | ${old.author !== m.final_author ? 'sim' : 'não'} |`);
}
L.push('');
L.push('## Diferenças de metadados aplicadas');
L.push('');
L.push('### title atualizado');
for (const m of manifest) {
  const old = byId.get(m.id);
  if (old.title !== m.final_title) {
    L.push(`- **id=${m.id}**:`);
    L.push(`  - antigo: \`${JSON.stringify(old.title)}\``);
    L.push(`  - novo:   \`${JSON.stringify(m.final_title)}\``);
  }
}
L.push('');
L.push('### author atualizado');
for (const m of manifest) {
  const old = byId.get(m.id);
  if (old.author !== m.final_author) {
    L.push(`- **id=${m.id}**:`);
    L.push(`  - antigo: \`${JSON.stringify(old.author)}\``);
    L.push(`  - novo:   \`${JSON.stringify(m.final_author)}\``);
  }
}
L.push('');
L.push('## Artefatos gerados');
L.push('');
L.push('- `backup-mainsite_posts-20260420-0439.json` — dump íntegro dos 29 posts antes de qualquer alteração (1.357.962 bytes)');
L.push('- `gdrive-map.json` — URLs do Google Drive capturadas dos posts antes da refundação');
L.push('- `rodape-map.json` — mapa arquivos antigos → títulos → URLs para o rodapé');
L.push('- `insercao-manifest.json` — metadados dos 22 posts preparados');
L.push('- `textos-para-insercao/` — HTMLs finais gravados no banco');
L.push('- `sql-updates/` — arquivos .sql individuais por post');
L.push('- `fase4-execution.log` — log com timestamps das operações');
L.push('- `admin-app/scripts/refund-convert-md.mjs` — pipeline de conversão (réplica de convertMarkdownToFormattedHtml + sanitizeLinksTargetBlank)');
L.push('- `admin-app/scripts/refund-db-update.mjs` — executor UPDATE → verificação por post');
L.push('- `admin-app/scripts/refund-fix-id33-images.mjs` — fix de imagens do id=33');
L.push('- `admin-app/scripts/refund-fix-list-align.mjs` — fix de text-align: left em `<p>` dentro de `<li>`');
L.push('');
L.push('## Decisões tomadas durante a execução');
L.push('');
L.push('1. **Pipeline de conversão**: Markdown → HTML via `marked` 18.0.0 + `DOMPurify` 3.3.3 + `happy-dom` (mesmas versões do PostEditor do admin-app). Sem roundtrip pelo TipTap (impraticável em Node sem UI); formato canônico idêntico ao do banco na renderização.');
L.push('2. **Formato do rodapé**: `<p style="text-indent: 1.5rem; text-align: justify;"><em>A versão anterior deste ensaio pode ser acessada em <a>Título</a>.</em></p>` (plural para id=6 com 2 URLs, conforme escolha 6.B).');
L.push('3. **Exceções de title** (mantidos do banco): id=7 (aspas curvas), id=33 (título composto), id=53 (Title Case).');
L.push('4. **Política author**: sobrescrever com frontmatter, com fallback para banco se frontmatter nulo (caso id=53).');
L.push('5. **Imagens**: id=33 tinha 2 `<img>` no banco apontando para R2 (`/api/mainsite/media/{uuid}.png`). O `.md` local tinha placeholders `![]()`. URLs do backup foram reinseridas byte-a-byte nos lugares corretos.');
L.push('6. **Alinhamento de referências bibliográficas**: `<p>` dentro de `<li>` padronizado para `text-align: left;` (padrão ABNT/APA), corrigindo também posts pré-existentes que já tinham `justify`.');
L.push('');
L.push('## Rollback');
L.push('');
L.push('O arquivo `backup-mainsite_posts-20260420-0439.json` contém o estado completo de todos os 29 posts antes de qualquer alteração desta operação. Para reverter um post específico, extraia o campo `content`, `title` e `author` do registro correspondente e aplique via `wrangler d1 execute --file`.');
L.push('');
L.push('## Observações técnicas');
L.push('');
L.push('- D1 reporta `changes=2` para UPDATE single-row (peculiaridade interna de contagem de páginas; sem triggers nem FTS na tabela). Verificação real é feita via SELECT subsequente.');
L.push('- `wrangler d1 execute --file` não retorna resultados de SELECT, só estatísticas. Para verificação foi usado `--command --json`.');
L.push('- SQLite `LENGTH()` conta code points, JavaScript `String.length` conta UTF-16 code units. Diferença aparece em caracteres fora do BMP (emojis). Script usa `LENGTH(CAST(content AS BLOB))` para comparar bytes UTF-8 e `Buffer.byteLength(html, "utf8")` no lado local.');

const reportPath = path.join(ROOT, `relatorio-insercao-${TS}.md`);
fs.writeFileSync(reportPath, L.join('\n'), 'utf8');
console.log('Relatório gerado:', reportPath);
console.log('Tamanho:', Buffer.byteLength(L.join('\n'), 'utf8'), 'bytes');
