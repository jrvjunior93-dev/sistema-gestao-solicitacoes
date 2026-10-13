'use strict';
// Controller/token/interacoes reais; banco, S3, sessao e transporte isolados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'), {
    module, console, Date, Map, Set, require(id) {
      if (!(id in deps)) throw Error(`Dependencia nao isolada: ${id}`);
      return deps[id];
    }
  });
  return module.exports;
}
const secret = 'somente-teste-isolado-nao-usa-env';
const token = load('services/solicitacaoCriacaoUploadTokenService.js', {
  jsonwebtoken: jwt, '../config/env': { env: { jwtSecret: secret } }
});
let historicos, anexos, interacoes, uploads, acesso, permiteInteragir;
const interacao = load('services/solicitacaoInteracoesService.js', {
  sequelize: { Op },
  '../models': { Solicitacao: { findByPk: async () => ({ id: 42 }) },
    SolicitacaoInteracaoUsuario: { bulkCreate: async rows => interacoes.push(...rows) } },
  './solicitacaoAtencaoService': { destinatariosAtencao: async () => [9] },
  './liveUpdatesBroker': { publishToUsers() {} }
});
const controller = load('controllers/AnexoController.js', {
  '../models': {
    User: { findByPk: async () => ({ id: 3, setor_id: 7, nome: 'QA' }) },
    Solicitacao: { findByPk: async () => ({ id: 42, codigo: 'SOL-QA', criado_por: 3 }) },
    ContratoMedicao: { findOne: async () => ({ id: 8, solicitacao_id: 42 }) },
    Anexo: { create: async data => { const row = { id: anexos.length + 1, ...data }; anexos.push(row); return row; } },
    Historico: { create: async data => {
      const row = { id: historicos.length + 1, ...data }; historicos.push(row);
      await interacao.registrarInteracao(row); return row;
    } }
  },
  '../services/notificacoes': { criarNotificacao: async () => {} },
  '../services/s3': { uploadToS3: async () => { uploads++; return 'isolado://arquivo'; } },
  '../services/fileAccessService': { canAccessSolicitacaoFile: async () => ({ allowed: acesso }) },
  '../utils/fileName': { normalizeOriginalName: value => value },
  '../services/authorizationService': {}, '../services/securityLogService': {},
  '../services/solicitacaoRealtimeService': { publishSolicitacaoRealtimeEvent: async () => {} },
  '../services/solicitacaoRetornoService': { assertPodeInteragirSolicitacao: async () => {
    if (!permiteInteragir) throw Object.assign(Error('Setor sem permissao de interagir'), { statusCode: 403 });
  } },
  '../services/solicitacaoCriacaoUploadTokenService': token,
  '../services/setorCapabilityService': { userHasSetorCapability: async () => false },
  '../services/anexoHistoricoService': {}
});
function reset() { historicos = []; anexos = []; interacoes = []; uploads = 0; acesso = true; permiteInteragir = false; }
const mint = extra => token.gerarTokenUploadCriacaoSolicitacao({ solicitacaoId: 42, usuarioId: 3, tipos: ['BOLETO', 'SOLICITACAO'], ...extra });
async function upload(chave, extra = {}, count = 1) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.upload({ user: { id: 3 }, body: { solicitacao_id: 42, tipo: 'BOLETO', criacao_upload_token: chave, ...extra },
    files: Array.from({ length: count }, (_, i) => ({ originalname: `boleto-${i}.pdf` })) }, res);
  return res;
}
async function run() {
  reset();
  const novo = mint({ solicitacaoNova: true });
  assert.equal((await upload(novo, {}, 2)).code, 201);
  assert.equal(historicos.length, 2); assert.equal(anexos.length, 2); assert.equal(interacoes.length, 0);
  assert(historicos.every(row => row.acao === 'ANEXO_ADICIONADO' && JSON.parse(row.metadata).origem === 'CRIACAO_SOLICITACAO'));
  assert.equal(uploads, 2, 'Sem apagar historico ou arquivos');
  reset();
  assert.equal((await upload(mint({ solicitacaoNova: false }), { medicao_id: 8 })).code, 201);
  assert.equal(interacoes.length, 1, 'Medicao em solicitacao existente segue como interacao');
  assert.equal(JSON.parse(historicos[0].metadata).origem, undefined);
  reset(); permiteInteragir = true;
  assert.equal((await upload(null, { origem: 'CRIACAO_SOLICITACAO', solicitacao_nova: true })).code, 201);
  assert.equal(interacoes.length, 1, 'Flag arbitraria no corpo nao esconde anexo posterior');
  assert.equal(JSON.parse(historicos[0].metadata).origem, undefined);
  const legado = jwt.sign({ escopo: 'SOLICITACAO_CRIACAO_UPLOAD', solicitacao_id: 42, usuario_id: 3, tipos: ['BOLETO'] }, secret,
    { audience: 'solicitacao-criacao-upload', expiresIn: '10m' });
  reset(); assert.equal((await upload(legado)).code, 201); assert.equal(interacoes.length, 1, 'Token antigo mantem acesso, sem presumir criacao nova');
  for (const invalido of [null, mint({ usuarioId: 99, solicitacaoNova: true }), mint({ solicitacaoId: 99, solicitacaoNova: true }),
    mint({ tipos: ['SOLICITACAO'], solicitacaoNova: true }), novo.replace(/^[^.]+/, 'adulterado'),
    jwt.sign({ escopo: 'SOLICITACAO_CRIACAO_UPLOAD', solicitacao_id: 42, usuario_id: 3, tipos: ['BOLETO'], solicitacao_nova: true }, secret,
      { audience: 'solicitacao-criacao-upload', expiresIn: -1 })]) {
    reset(); assert.equal((await upload(invalido)).code, 403); assert.equal(uploads, 0); assert.equal(historicos.length, 0);
  }
  reset(); acesso = false;
  assert.equal((await upload(novo)).code, 403); assert.equal(uploads, 0, 'Token valido nao ignora escopo de visibilidade');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
  const criacao = source.slice(source.indexOf('const criacaoUploadToken = gerarTokenUploadCriacaoSolicitacao('), source.indexOf('const respostaSolicitacaoBase'));
  const medicao = source.slice(source.indexOf('const criacaoUploadTokenMedicao ='), source.indexOf('return res.status(201).json({', source.indexOf('const criacaoUploadTokenMedicao =')));
  assert(criacao.includes('solicitacaoNova: true')); assert(!medicao.includes('solicitacaoNova: true'));
  console.log('OK: criacao/anexos iniciais sem balao, historico preservado, posteriores/medicao notificados, assinatura/expiracao/tipo/usuario/escopo negativos. Sem banco/rede.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
