'use strict';
// Funcoes reais em VM e SQL Sequelize/MySQL gerado; sem banco, env ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, Sequelize } = require('sequelize');
const helper = require('../src/services/historicoEncaminhamentoCompraService');
const root = path.resolve(__dirname, '..');
const geral = fs.readFileSync(path.join(root, 'src/controllers/SolicitacaoController.js'), 'utf8');
const compras = fs.readFileSync(path.join(root, 'src/controllers/SolicitacaoCompraController.js'), 'utf8');
const arquivo = fs.readFileSync(path.join(root, 'src/services/fileAccessService.js'), 'utf8');

function declaration(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const next = /\n(?:async )?function |\nconst |\nmodule\.exports/.exec(tail);
  assert.ok(next, name);
  return tail.slice(0, next.index);
}
const normalize = value => String(value || '').trim().toUpperCase();
const geo = value => ['GEO', 'GERENCIA DE PROCESSOS', 'GERENCIA_PROCESSOS', 'GERENCIA_DE_PROCESSOS'].includes(normalize(value));
const corresponde = (tokens, value) => tokens.some(token => normalize(token) === normalize(value) || (geo(token) && geo(value)));
let historicos = [];
let principalVisivel = true;
let consultasHistorico = 0;
const user = { id: 2, perfil: 'ADMIN', geo: true, visualizar: true };
const compra = { id: 591, origem: 'SOLICITACAO', status: 'LIBERADO_PARA_COMPRA', solicitacao_principal_id: 6300, solicitante_id: 39 };
const evento = { acao: helper.ACAO_ENCAMINHAMENTO_COMPRA, setor: '2', solicitacao_id: 6300,
  metadata: JSON.stringify({ area_anterior: 'GEO', area_nova: 'COMPRAS', origem: 'REVISAO_GEO' }) };
const sandbox = {
  ...helper, Op, Sequelize,
  parseHistoricoMetadata: value => { try { return typeof value === 'object' ? value : JSON.parse(value); } catch { return {}; } },
  parseObservacaoEnvioSetor: value => { const m = String(value || '').match(/^De (.+) para (.+)$/i); return m ? { origem: m[1], destino: m[2] } : null; },
  setorPertenceAoUsuario: corresponde,
  normalizeAccessToken: normalize, tokensContainAreaValue: corresponde,
  isGeoToken: geo, normalizeFluxoTokenCompra: normalize,
  isSolicitacaoCompraDireta: value => value?.origem === 'COMPRA_DIRETA',
  userHasSetorCapability: async value => value.geo,
  canViewCompraSolicitacoes: async value => value.visualizar,
  buscarSetorGerenciaProcessos: async () => 'GEO',
  assertPodeVisualizarSolicitacao: async (req, id) => {
    assert.equal(Number(id), 6300);
    if (!principalVisivel) throw Object.assign(new Error('Sem acesso'), { statusCode: 403 });
  },
  Historico: { findAll: async options => {
    consultasHistorico += 1;
    assert.equal(Number(options.where.solicitacao_id), 6300);
    return historicos;
  } },
  podeGerenciarCompraNaFilaGeo: async () => false,
  podeAcessarCompraDiretaNaFilaGeo: async () => false,
  canAccessSolicitacaoCompraByScope: async () => false,
  SolicitacaoCompra: { findByPk: async () => compra },
  solicitacaoPertenceADiretoriaAprovadora: () => false
};
vm.createContext(sandbox);
for (const name of ['normalizarTokensHistoricoSetores', 'montarLiteralHistoricoSetoresEnvolvidos', 'extrairSetoresEnvioHistorico', 'historicoPertenceASetoresVisiveis', 'solicitacaoPertenceASetoresVisiveis']) {
  vm.runInContext(declaration(geral, name), sandbox);
}
for (const name of ['podeAcompanharCompraEncaminhadaGeo', 'validarEscopoSolicitacaoCompra']) {
  vm.runInContext(declaration(compras, name), sandbox);
}
const files = vm.createContext({ ...sandbox });
for (const name of ['extrairSetoresEnvioHistorico', 'historicoPertenceAoEscopoSetor']) {
  vm.runInContext(declaration(arquivo, name), files);
}
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

(async () => {
  historicos = [evento];
  assert.equal(sandbox.historicoPertenceASetoresVisiveis(evento, ['GEO']), true);
  assert.equal(sandbox.historicoPertenceASetoresVisiveis(evento, ['GERENCIA DE PROCESSOS']), true);
  assert.equal(sandbox.historicoPertenceASetoresVisiveis(evento, ['FINANCEIRO']), false);
  assert.equal(files.historicoPertenceAoEscopoSetor(evento, ['GEO']), true);
  assert.equal(await sandbox.solicitacaoPertenceASetoresVisiveis({ id: 6300, area_responsavel: 'COMPRAS' }, ['GEO']), true);
  assert.equal(await sandbox.solicitacaoPertenceASetoresVisiveis({ id: 6300, area_responsavel: 'COMPRAS', historicos: [evento] }, ['GEO']), true);

  const literal = sandbox.montarLiteralHistoricoSetoresEnvolvidos(['GEO']);
  assert.match(literal.val, /SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS/);
  assert.match(literal.val, /ENVIADA_SETOR/);
  assert.match(literal.val, /CHAR\(36\)/);
  assert.doesNotMatch(literal.val, /\$\./);
  assert.match(literal.val, /JSON_VALID/);
  assert.match(literal.val, /JSON_TYPE/);
  const sequelize = new Sequelize('fixture', 'fixture', 'fixture', { dialect: 'mysql', logging: false });
  const sql = sequelize.dialect.queryGenerator.selectQuery('solicitacoes', { attributes: ['id'], where: { id: { [Op.in]: literal } } });
  assert.match(sql, /area_anterior/);
  assert.doesNotMatch(sql, /\$\./);
  await sequelize.close();

  assert.equal(await sandbox.validarEscopoSolicitacaoCompra(user, compra, response()), false, 'Nao amplia o escopo geral de escrita');
  assert.equal(await sandbox.validarEscopoSolicitacaoCompra(user, compra, response(), null, { permitirAcompanhamentoGeo: true }), true);
  assert.equal(await sandbox.validarEscopoSolicitacaoCompra(user, compra, response(), { LOCK: {} }, { permitirAcompanhamentoGeo: true }), false, 'Transacao de escrita nao usa excecao');
  for (const alteracao of [
    () => { user.geo = false; },
    () => { user.visualizar = false; },
    () => { principalVisivel = false; },
    () => { historicos = []; },
    () => { historicos = [{ ...evento, metadata: '{invalido' }]; },
    () => { historicos = [{ ...evento, metadata: JSON.stringify({ area_anterior: 'DP', area_nova: 'COMPRAS' }) }]; }
  ]) {
    user.geo = true; user.visualizar = true; principalVisivel = true; historicos = [evento];
    alteracao();
    assert.equal(await sandbox.podeAcompanharCompraEncaminhadaGeo(user, compra), false);
  }
  for (const metadata of ['{invalido', '{}', '{"area_anterior":"GEO"}', '{"area_anterior":2,"area_nova":"COMPRAS"}']) {
    const invalido = { ...evento, metadata };
    assert.equal(helper.extrairEncaminhamentoCompra(invalido), null);
    assert.equal(sandbox.historicoPertenceASetoresVisiveis(invalido, ['GEO']), false);
    assert.equal(files.historicoPertenceAoEscopoSetor(invalido, ['GEO']), false);
  }
  assert.equal(sandbox.historicoPertenceASetoresVisiveis({ ...evento, acao: 'COMENTARIO' }, ['GEO']), false);
  assert.equal(sandbox.historicoPertenceASetoresVisiveis({ acao: 'ENVIADA_SETOR', setor: 'OBRA', observacao: 'De GEO para OBRA' }, ['GEO']), true);
  assert.equal((compras.match(/permitirAcompanhamentoGeo: true/g) || []).length, 2, 'Somente dois handlers de leitura optam pelo acompanhamento');
  assert.ok(consultasHistorico > 0);
  console.log('OK: SOL-6265/ID6300, historico existente, SQL MySQL, aliases, anexos e leitura GEO; negativas de permissao, setor, metadata e escrita preservadas. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
