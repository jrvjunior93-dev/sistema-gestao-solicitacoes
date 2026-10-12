'use strict';
// Inventario estatico local; NAO certifica ACL e nao carrega o servidor.
// Usa o parser ja instalado para QA do frontend; nao e script de deploy.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../../frontend/node_modules/@babel/parser');
const root = path.resolve(__dirname, '../src');
const declarations = [], mounts = [], dynamic = [];
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.js') ? [file] : [];
  });
}
function paths(node) {
  if (node?.type === 'StringLiteral') return [node.value];
  if (node?.type === 'ArrayExpression') return node.elements.flatMap(paths);
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return [node.quasis[0].value.cooked];
  return [];
}
for (const file of files(root)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/\b(?:router|app)\.(?:get|post|put|patch|delete|head|options|use|all)\s*\(/.test(source)) continue;
  const ast = parse(source, { sourceType: 'unambiguous' });
  const relative = 'backend/src/' + path.relative(root, file).replace(/\\/g, '/');
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && ['router', 'app'].includes(node.callee.object?.name)) {
      const method = node.callee.property.name;
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'use', 'all'].includes(method)) {
        const routePaths = paths(node.arguments[0]);
        const base = { file: relative, line: node.loc.start.line, method: method.toUpperCase(),
          // Cadeia explicita; heranca de middleware e regras dentro do handler
          // precisam ser conferidas manualmente, sem inferir "seguro" daqui.
          chain: node.arguments.slice(method === 'use' && !routePaths.length ? 0 : 1)
            .map(arg => source.slice(arg.start, arg.end).replace(/\s+/g, ' ').slice(0, 300)),
          review: 'PENDENTE_DE_VERIFICACAO_DO_HANDLER_E_ESCOPO' };
        if (method === 'use') mounts.push({ ...base, paths: routePaths });
        else if (!routePaths.length) dynamic.push(base);
        else for (const routePath of routePaths) declarations.push({ ...base, path: routePath,
          parameterized: /:[A-Za-z]/.test(routePath), readOnlyMethod: ['get', 'head', 'options'].includes(method) });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
}
const counts = {};
for (const route of declarations) {
  const value = counts[route.file] ||= { routes: 0, parameterized: 0, writes: 0 };
  value.routes++;
  if (route.parameterized) value.parameterized++;
  if (!route.readOnlyMethod) value.writes++;
}
const summary = { declarations: declarations.length,
  parameterized: declarations.filter(route => route.parameterized).length,
  mounts: mounts.length, unresolvedDynamic: dynamic.length, files: counts,
  warning: 'Inventario estatico de declaracoes, nao auditoria concluida nem contagem de URLs efetivas apos mounts.' };
console.log(JSON.stringify(process.argv.includes('--resumo') ? summary
  : { summary, declarations, mounts, dynamic }, null, 2));
