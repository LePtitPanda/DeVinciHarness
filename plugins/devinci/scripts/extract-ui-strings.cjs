// Collects the app's visible English UI strings (JSX text and string literals in
// components/, app/, lib/) into a JSON map {english: ""} for the French dictionary.
// Usage: node plugins/devinci/scripts/extract-ui-strings.cjs <out.json>   (run from repo root)
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
const fs = require('fs');
const path = require('path');

const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (!/node_modules/.test(p)) walk(p); }
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) files.push(p);
  }
};
['components', 'app', 'lib'].forEach(walk);

const looksLikeUi = (s) => s.length > 1 && s.length < 400
  && /[A-Za-z]{2}/.test(s) && /[a-z]/.test(s) && /^[A-Z0-9"“(¿…]/.test(s)
  && !/[{}<>;=\\]|^https?:|\.(tsx?|js|css|json|md)$|^[A-Z][a-z]+[A-Z]\w*$|^[A-Z][a-zA-Z0-9]*\.[a-z]/.test(s);

const out = {};
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n) => {
    let s = null;
    if (ts.isJsxText(n)) s = n.text.replace(/\s+/g, ' ').trim();
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isExternalModuleReference(n.parent)) s = n.text.trim();
    if (s && looksLikeUi(s) && !(s in out)) out[s] = '';
    ts.forEachChild(n, visit);
  };
  visit(src);
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'strings from', files.length, 'files');
