const fs = require('node:fs');
const path = require('node:path');
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}
walkDir('c:/Users/leona/lcv-workspace/admin-app/functions/api', (filePath) => {
  if (!filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = content.replace(/context\.env/g, '((context as any).data?.env || context.env)');
  if (content.includes('((context as any).data?.env || ((context as any).data?.env || context.env))')) {
    content = content.replace(
      /\(\(context as any\)\.data\?\.env \|\| \(\(context as any\)\.data\?\.env \|\| context\.env\)\)/g,
      '((context as any).data?.env || context.env)',
    );
  }
  if (content.includes('context.data?.env || ((context as any).data?.env || context.env)')) {
    content = content.replace(
      /context\.data\?\.env \|\| \(\(context as any\)\.data\?\.env \|\| context\.env\)/g,
      'context.data?.env || context.env',
    );
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
});
