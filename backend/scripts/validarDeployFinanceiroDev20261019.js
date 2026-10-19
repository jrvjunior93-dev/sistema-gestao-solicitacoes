'use strict';
// Guardas do roteiro DEV; apenas arquivos/fixtures locais, sem executar deploy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const shell = read('ops/deploy/atualizar-dev-financeiro-20261019.sh');
for (const texto of ['set -euo pipefail', 'flock -n 9', 'git merge --ff-only',
  'git status --porcelain --untracked-files=no', 'git merge-base --is-ancestor HEAD',
  'scripts/configurarSessao12hDev.js --verificar', 'scripts/verificarPermutasMySqlDev.js --verificar',
  'test:fila-multiplas-fontes', 'test:titulo-cancelamento', 'scripts/validarCompraCentroCusto.js',
  'http://127.0.0.1:8001/health']) assert(shell.includes(texto), texto);
assert(shell.indexOf('p.watch') < shell.indexOf('git merge --ff-only'));
assert(shell.indexOf('scripts/configurarSessao12hDev.js --verificar') < shell.indexOf('git merge --ff-only'));
assert(shell.indexOf('scripts/verificarPermutasMySqlDev.js --verificar') < shell.indexOf('pm2 restart backend-dev'));
assert.deepEqual(shell.match(/^pm2\s+.+$/gm), ['pm2 restart backend-dev']);
assert(!/--update-env|npm run migrate|--aplicar\b|\bssh\b|backend-solicitacoes|sistema-gestao-solicitacoes-main/.test(shell));
assert(read('backend/src/services/tituloCancelamentoAuditoriaService.js').includes("const ENTIDADE = 'TITULO_CANCELAMENTO'"));
assert(read('backend/src/models/LogExclusao.js').includes("tableName: 'logs_exclusao'"));
assert(read('backend/src/models/TituloFinanceiro.js').includes('type: DataTypes.STRING(20)'));
assert(read('backend/src/models/PagamentoFilaLiquidacao.js').includes("tableName: 'pagamento_fila_liquidacoes'"));
console.log('Roteiro DEV aprovado: SHA fixo, identidade/schema/sessao antes de atualizar, testes/SQL somente leitura antes do restart, processo DEV exclusivo e sem migration/configuracao. Nao executou deploy.');
