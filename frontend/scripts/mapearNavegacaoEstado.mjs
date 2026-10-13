// Inventario estatico somente leitura das fontes. Gera apenas documentos/artefatos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'frontend/src');
const output = path.join(root, 'outputs/mapa-navegacao-estado-20261011');
const rel = p => path.relative(root, p).replaceAll('\\', '/');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? files(path.join(dir, e.name)) : /\.(?:jsx?|mjs|cjs|tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []);
function visit(node, cb, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (node.type) cb(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(v => visit(v, cb, node.type ? [...parents, node] : parents));
    else if (value && typeof value === 'object') visit(value, cb, node.type ? [...parents, node] : parents);
  }
}
function resolve(from, request) {
  if (!request?.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), request);
  return [base, ...['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '/index.js', '/index.jsx'].map(x => base + x)]
    .find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}
const asts = new Map();
const modules = new Map();
const errors = [];
function inspect(file, backend = false) {
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', ...( /\.tsx?$/.test(file) ? ['typescript'] : [])] }); }
  catch (error) { errors.push({ file: rel(file), error: error.message }); return; }
  const snippet = (n, limit = 320) => n ? source.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, limit) : '';
  const record = { file: rel(file), sha256: createHash('sha256').update(source).digest('hex'), imports: [], unresolvedImports: [], states: [], effects: [], fields: [], actions: [], navigation: [], requests: [], storage: [], permissions: [], background: [], backendRoutes: [], mounts: [] };
  const navigationAliases = new Set(['navigate', 'navigateBack', 'openTab', 'openWorkspaceTab']);
  visit(ast, n => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /(?:useNavigate|useSafeNavigateBack)$/.test(snippet(n.init?.callee))) navigationAliases.add(n.id.name);
  });
  const push = (key, n, details = {}) => record[key].push({ line: n.loc.start.line, source: snippet(n), ...details });
  visit(ast, (n, parents) => {
    const dependency = n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration'
      ? n.source?.value : n.type === 'CallExpression' && ['Import', 'Identifier'].includes(n.callee?.type)
        && (n.callee.type === 'Import' || n.callee.name === 'require') ? n.arguments[0]?.value : null;
    if (dependency?.startsWith('.')) {
      const target = resolve(file, dependency);
      if (target) record.imports.push(rel(target));
      else record.unresolvedImports.push({ line: n.loc.start.line, request: dependency });
    }
    if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
      const name = snippet(n.callee, 100);
      if (/^(?:useState|useReducer)$/.test(name)) push('states', n, { bindings: snippet(parents.findLast(p => p.type === 'VariableDeclarator')?.id) });
      if (/^(?:useEffect|useLayoutEffect)$/.test(name)) push('effects', n, { dependencies: snippet(n.arguments[1]) });
      if (navigationAliases.has(name) || /navigate|openTab|openWorkspaceTab|activateTab|closeTab|navigateBack|goBack|history\.(?:push|replace|go|back)|location\.(?:assign|replace|reload)|window\.open/i.test(name)) push('navigation', n);
      if (/^(?:fetch|apiFetch|apiRequest|fetchJson|request|requestJson)$/.test(name) || /(?:api|axios|client|http)\.(?:get|post|put|patch|delete|request)$/i.test(name)) {
        const memberMethod = name.match(/\.(get|post|put|patch|delete)$/i)?.[1]?.toUpperCase();
        const methodProperty = n.arguments[1]?.properties?.find(p => p.key?.name === 'method' || p.key?.value === 'method');
        push('requests', n, { destination: snippet(n.arguments[0], 500), method: memberMethod || (methodProperty ? methodProperty.value?.value || 'DYNAMIC' : name === 'fetch' && (!n.arguments[1] || n.arguments[1]?.type === 'ObjectExpression') ? 'GET' : 'DYNAMIC'), methodExpression: snippet(methodProperty?.value), dynamic: n.arguments[0]?.type !== 'StringLiteral' });
      }
      if (/Storage\.|Draft|rascunho|Preferencia|lerJson|gravarJson|IndexedDB|indexedDB/i.test(name)) push('storage', n);
      if (/^(?:can[A-Z]|hasPermissao|hasEnabledModule|isSuperadmin|isAdmin|assertPode)/.test(name)) push('permissions', n);
      if (/setInterval|setTimeout|subscribe|useLiveUpdates|use.*Realtime|addEventListener|IntersectionObserver|registerNativeBackButtonHandler/i.test(name)) push('background', n);
      if (backend && /^(?:router|routes|app)\.(?:get|post|put|patch|delete|use|all|options|head)$/.test(name)) {
        push(name.endsWith('.use') ? 'mounts' : 'backendRoutes', n, { path: snippet(n.arguments[0]), method: name.split('.').at(-1).toUpperCase(), handlers: n.arguments.slice(1).map(a => snippet(a, 160)) });
      }
    }
    if (n.type === 'AssignmentExpression' && /(?:window\.)?location\.(?:href|pathname)/.test(snippet(n.left))) push('navigation', n);
    if (n.type === 'ObjectProperty') {
      const key = n.key?.name || n.key?.value;
      if (['to', 'href', 'route', 'rota', 'voltar'].includes(key)) push('navigation', n, { component: 'ObjectProperty' });
      if (['onClick', 'onSubmit', 'onChange', 'executar'].includes(key)) push('actions', n);
    }
    if (n.type === 'JSXOpeningElement') {
      const name = snippet(n.name);
      if (['input', 'select', 'textarea'].includes(name)) push('fields', n, { tag: name });
      for (const attr of n.attributes) {
        if (attr.type === 'JSXAttribute' && ['to', 'href', 'voltar'].includes(attr.name?.name)) push('navigation', attr, { component: name });
        if (attr.type === 'JSXAttribute' && /^on(?:Click|Submit|Change|Blur|KeyDown|AuxClick)/.test(attr.name?.name)) {
          push('actions', attr, { component: name });
          if (navigationAliases.has(attr.value?.expression?.name)) push('navigation', attr, { component: name });
        }
      }
    }
  });
  record.imports = [...new Set(record.imports)];
  asts.set(rel(file), { ast, source }); modules.set(rel(file), record);
}
files(src).forEach(f => inspect(f));
const frontendFiles = [...modules.keys()];
files(path.join(root, 'backend/src')).forEach(f => inspect(f, true));
if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
const app = asts.get('frontend/src/App.jsx');
const bindings = new Map();
const local = new Map();
visit(app.ast, n => {
  if (n.type === 'ImportDeclaration') for (const spec of n.specifiers) {
    const found = resolve(path.join(root, 'frontend/src/App.jsx'), n.source.value);
    if (found) bindings.set(spec.local.name, rel(found));
  }
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') visit(n.init, child => {
    if (child.type === 'CallExpression' && child.callee.type === 'Import') {
      const found = resolve(path.join(root, 'frontend/src/App.jsx'), child.arguments[0]?.value);
      if (found) bindings.set(n.id.name, rel(found));
    }
  });
  if (n.type === 'FunctionDeclaration' && n.id) local.set(n.id.name, n);
});
function closure(seeds) {
  const found = new Set(); const todo = [...seeds];
  while (todo.length) { const f = todo.pop(); if (found.has(f) || !modules.has(f)) continue; found.add(f); todo.push(...modules.get(f).imports.filter(x => x.startsWith('frontend/'))); }
  return [...found].sort();
}
const routes = [];
function phase(route, scope) {
  if (scope !== 'PRIVATE') return 'E7';
  if (/^\/(?:solicitacoes(?:\/|$)|nova-solicitacao|solicitacoes-arquivadas)/.test(route)) return 'E2';
  if (/compra|cotac|gestao-(?:insumos|unidades|categorias|fornecedores)/.test(route) && !route.startsWith('/configuracoes')) return 'E3';
  if (/^\/(?:financeiro|comprovantes|upload-comprovantes|provisoes-financeiras)/.test(route)) return 'E4';
  if (/^\/rh-dp/.test(route)) return 'E5';
  if (/^\/(?:custos-recebiveis|comercial|crm|contratos|gestao-contratos|obras|gestao-apropriacoes)/.test(route)) return 'E6';
  return 'E7';
}
visit(app.ast, (n, parents) => {
  if (n.type !== 'JSXElement' || n.openingElement.name?.name !== 'Route') return;
  const attrs = n.openingElement.attributes;
  const attr = key => attrs.find(a => a.type === 'JSXAttribute' && a.name.name === key);
  if (!attr('path') && !attr('index')) return;
  const nested = parents.some(p => p.type === 'JSXElement' && p.openingElement?.name?.name === 'Route');
  const route = attr('index') ? '/' : '/' + String(attr('path').value?.value || '').replace(/^\//, '');
  const expression = attr('element')?.value?.expression;
  const roots = new Set(); const guards = []; const expanded = new Set();
  const expand = (tree) => visit(tree, child => {
    if (child.type !== 'JSXOpeningElement' || !child.name?.name) return;
    const name = child.name.name;
    if (bindings.has(name)) roots.add(bindings.get(name));
    else if (local.has(name) && !expanded.has(name)) { expanded.add(name); guards.push(name); expand(local.get(name)); }
  });
  expand(expression);
  const dependencies = closure(roots);
  const totals = {};
  for (const key of ['states', 'fields', 'navigation', 'requests', 'storage', 'background']) totals[key] = dependencies.reduce((sum, f) => sum + modules.get(f)[key].length, 0);
  const directTotals = {};
  for (const key of ['states', 'fields', 'navigation', 'requests', 'storage', 'background']) directTotals[key] = [...roots].reduce((sum, f) => sum + (modules.get(f)?.[key]?.length || 0), 0);
  const scope = nested ? 'PRIVATE' : route === '/' ? 'SHELL' : 'PUBLIC';
  const guardContracts = guards.map(name => ({ name, line: local.get(name).loc.start.line, source: app.source.slice(local.get(name).start, local.get(name).end) }));
  routes.push({ route, line: n.loc.start.line, scope, phase: phase(route, scope), element: app.source.slice(expression?.start || 0, expression?.end || 0).replace(/\s+/g, ' '), roots: [...roots], guards, guardContracts, dependencies, totals, directTotals });
});
const mounts = [...modules.values()].filter(m => m.mounts.length).flatMap(m => m.mounts.map(x => ({ file: m.file, ...x })));
const backendRoutes = [...modules.values()].filter(m => m.backendRoutes.length).flatMap(m => m.backendRoutes.map(x => ({ file: m.file, ...x })));
const appTags = (app.source.match(/<Route(?:\s|>)/g) || []).length;
if (appTags !== routes.length) throw new Error(`Rotas faltantes: ${appTags} declaracoes, ${routes.length} entradas`);
const routeDeps = new Set(routes.flatMap(r => r.dependencies));
const data = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), staticOnly: true,
  coverage: { routeDeclarations: appTags, routes: routes.length, frontendFiles: frontendFiles.length, backendFiles: modules.size - frontendFiles.length, frontendNotInRouteClosure: frontendFiles.filter(f => !routeDeps.has(f)), parseErrors: errors, unresolvedImports: [...modules.values()].flatMap(m => m.unresolvedImports.map(x => ({ file: m.file, ...x }))) },
  routes, modules: [...modules.values()], backendRoutes, mounts };
const serialized = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(output, 'inventario.json'), 'utf8') !== serialized) throw new Error('Inventario desatualizado; regenerar antes de planejar alteracoes.');
  console.log(`OK: ${routes.length}/${appTags} rotas e hashes de ${modules.size} fontes conferidos; somente leitura, sem banco/rede.`);
  process.exit(0);
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'inventario.json'), serialized);
const code = s => '`' + String(s || '-').replaceAll('|', '\\|').replaceAll('`', "'") + '`';
const lines = ['# Inventario de navegacao e estado por rota', '',
  `Base ${data.commit}. ${routes.length} declaracoes de rota, ${frontendFiles.length} arquivos de codigo frontend e ${data.coverage.backendFiles} arquivos backend analisados por AST, sem executar a aplicacao ou conectar ao banco.`, '',
  'Cobertura estatica nao equivale a homologacao funcional. Contagens sao sinais de codigo, nao quantidade de telas defeituosas. Cada dependencia pode ser compartilhada; nao somar colunas entre rotas. Formularios em componentes filhos constam no JSON. Expressoes dinamicas e chamadas indiretas exigem resolucao na etapa de contrato do fluxo, antes de implementar.', '',
  'Fonte completa com linhas, entradas, importacoes, destinos, metodos, guardas, efeitos e registros de API: outputs/mapa-navegacao-estado-20261011/inventario.json. Regenerar com node frontend/scripts/mapearNavegacaoEstado.mjs.', '',
  'Estados/campos abaixo referem-se somente aos componentes raiz; dependencias/APIs incluem os filhos e servicos importados. PRIVATE herda PrivateRoute; guardas e atributos especificos permanecem no campo element do JSON.', '',
  'Etapas E2 a E7 referem-se ao plano 2026-10-11-plano-navegacao-estado.md. E0 e E1 sao transversais. E7 inclui portas publicas e shell somente para testar a exclusao da retencao autenticada.', '',
  '| Rota | Linha App | Escopo | Etapa | Componentes raiz | Estados locais | Campos diretos | Dependencias | Chamadas API candidatas |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...routes.map(r => `| ${code(r.route)} | ${r.line} | ${r.scope} | ${r.phase} | ${r.roots.map(code).join('<br>')} | ${r.directTotals.states} | ${r.directTotals.fields} | ${r.dependencies.length} | ${r.totals.requests} |`), '',
  '## Fontes fora do fechamento das rotas', '',
  'Inclui infraestrutura de entrada, componentes desacoplados e possiveis legados. Todos foram analisados; ausencia no fechamento nao autoriza excluir o arquivo.', '',
  ...data.coverage.frontendNotInRouteClosure.map(f => '- ' + code(f)), '',
  '## Registros de endpoints e montagem de routers', '',
  `${backendRoutes.length} registros candidatos e ${mounts.length} montagens localizados em router/routes/app. Caminhos de subrouters precisam do prefixo da montagem; os handlers estao no JSON. Chamadas com aliases diferentes devem ser cruzadas com o catalogo de rotas do backend na etapa de contrato.`, '',
  '## Limites e criterio de encerramento', '',
  ...data.coverage.unresolvedImports.map(x => `- Importacao local nao resolvida: ${code(x.file)} linha ${x.line}, ${code(x.request)}. Classificar uso/legado antes da etapa do modulo; nao corrigir fora de escopo.`), '',
  'O arquivo JSON conserva todas as fontes analisadas, incluindo componentes e servicos nao alcancados por rota. Nenhum endpoint foi chamado. A cobertura executavel de cada combinacao de permissao, parametro, query e modal deve ser preenchida antes de aprovar o modulo. Nenhuma tela esta marcada como homologada apenas por aparecer neste inventario.', ''];
fs.writeFileSync(path.join(root, 'docs/arquitetura/2026-10-11-inventario-navegacao.md'), lines.join('\n'));
console.log(JSON.stringify({ ...data.coverage, backendRoutes: backendRoutes.length, mounts: mounts.length, output: rel(output) }, null, 2));
