// Somente fixtures/VM: nao executar EC2, Git remoto, PM2 ou banco.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../ops/deploy/atualizar-dev-fila-filtros-arranjo-20261023.sh', import.meta.url), 'utf8');
const blocos = [...source.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m => m[1]);
assert.equal(blocos.length, 1);
const merge = source.indexOf('git merge --ff-only');
for (const token of ['[[ "$versao_dev" =~ ^[0-9a-f]{40}$ ]]', 'base_dev=ae9df9d36a0ab81dd3fb8126a24801deefe5d393',
  'test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev', 'test "$(git branch --show-current)" = refactor/frontend',
  'test -z "$(git status --porcelain --untracked-files=no)"', 'flock -n 9',
  'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend', 'git merge-base --is-ancestor "$base_dev" "$versao_dev"',
  'test "$head_dev" = "$base_dev" || test "$head_dev" = "$versao_dev"', 'assert.deepEqual(arquivos, [', 'assert.deepEqual(depois, antes,']) {
  assert(source.indexOf(token) > 0 && source.indexOf(token) < merge, token);
}
assert(source.indexOf('node frontend/scripts/validarFiltrosOrdenaveis.mjs') > merge);
assert(source.includes('test "$env_hash_dev" = "$(sha256sum backend/.env)"'));
assert(!/\bpm2\b|--aplicar|runMigrations|backend-solicitacoes|npm (?:ci|install|run)|\bgit (?:reset|checkout|clean)\b|\b(?:chmod|chown)\b/.test(source));
const arquivos = [
  'A\tdocs/handoffs/2026-10-23-fila-filtros-arranjo.md', 'M\tdocs/modulos/financeiro/README.md',
  'M\tdocs/workspace/OWNERSHIP_ATIVO.md', 'M\tfrontend/package.json',
  'A\tfrontend/scripts/filaFiltrosArranjoQA.mjs', 'A\tfrontend/scripts/validarDeployFilaFiltrosArranjoDev.mjs',
  'M\tfrontend/scripts/validarFilaInstrumentosUI.mjs', 'A\tfrontend/scripts/validarFiltrosOrdenaveis.mjs',
  'M\tfrontend/src/components/financeiro/FiltrosFilaPagamentos.jsx', 'M\tfrontend/src/components/padrao/PainelFiltrosVisiveis.jsx',
  'M\tfrontend/src/components/ui/ApropriacaoAutocomplete.jsx', 'A\tops/deploy/atualizar-dev-fila-filtros-arranjo-20261023.sh'
];
function conferir(alterar = () => {}) {
  const dados = { arquivos: arquivos.join('\n'), antes: { scripts: { build: 'vite build' }, dependencies: { react: '18' } } };
  dados.depois = structuredClone(dados.antes);
  dados.depois.scripts['test:fila-filtros-arranjo'] = 'node scripts/validarFiltrosOrdenaveis.mjs && node scripts/validarFilaInstrumentosUI.mjs --filtros-arranjo';
  alterar(dados);
  vm.runInNewContext(blocos[0], { process: { argv: ['node', '-', 'base', 'versao'] }, require(nome) {
    if (nome === 'node:assert/strict') return { equal: assert.equal,
      deepEqual(a, b, m) { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); } };
    assert.equal(nome, 'node:child_process'); return { execFileSync(cmd, params) {
      assert.equal(cmd, 'git');
      if (params[0] === 'diff') { assert.deepEqual(Array.from(params), ['diff', '--name-status', 'base', 'versao']); return dados.arquivos; }
      assert.equal(params[0], 'show'); return JSON.stringify(params[1] === 'base:frontend/package.json' ? dados.antes : dados.depois);
    } };
  } });
}
conferir(); conferir(d => { d.arquivos = d.arquivos.replaceAll('\n', '\r\n'); });
for (const extra of ['M\tbackend/src/app.js', 'A\tbackend/migrations/indevida.js', 'M\tfrontend/package-lock.json', 'M\tbackend/.env']) {
  assert.throws(() => conferir(d => { d.arquivos += '\n' + extra; }));
}
for (const alterar of [d => { d.arquivos = ''; }, d => { d.depois.dependencies.react = '19'; },
  d => { d.depois.scripts.build = 'outra coisa'; }, d => { delete d.depois.scripts['test:fila-filtros-arranjo']; }]) assert.throws(() => conferir(alterar));
console.log('OK deploy filtros DEV: SHA/base/branch/cwd/lock/HEAD/ff, allowlist12, manifesto somente QA, .env preservado e nenhum backend/migration/reinicio. Sem EC2/rede.');
