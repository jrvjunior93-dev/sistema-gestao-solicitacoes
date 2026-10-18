'use strict';
// Servicos reais em VM, modelos e storage em memoria. Nao carrega .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Writable, Readable } = require('node:stream');
const { Sequelize, Op } = require('sequelize');
const PizZip = require('pizzip');
const { ValidationError } = require('../src/middlewares/validation');
function load(file, deps, globals = {}) {
  const sandbox = { module: { exports: {} }, console, AbortController, setTimeout, clearTimeout,
    __dirname: path.dirname(path.resolve(__dirname, '../src', file)), ...globals,
    require(id) { if (id in deps) return deps[id]; if (id.startsWith('node:') || ['archiver', 'sequelize'].includes(id)) return require(id); throw Error('Dependencia nao simulada: ' + id); } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'), sandbox);
  return sandbox.module.exports;
}
async function catalogo() {
  let scope = null, consultas = 0;
  const service = load('services/rhCatalogoConsultaService.js', {
    '../models': { RhColaborador: { findAll: async o => { assert.deepEqual(Array.from(o.where.obra_id[Op.in]), [7]); return [{ empresa_grupo_id: 3 }]; } },
      RhEmpresaGrupo: { findAll: async o => { consultas++; assert.deepEqual(Array.from(o.attributes), ['id', 'nome', 'cnpj']);
        if (scope) assert.deepEqual(Array.from(o.where.id[Op.in]), [3]); return [{ id: 3, nome: 'Empresa QA', cnpj: 'fixture', segredo: 'oculto' }]; } } },
    './authorizationService': { getRhDpObraScopeIds: async () => scope }
  });
  assert.equal((await service.empresasConsulta({}))[0].segredo, undefined);
  scope = [7]; assert.equal((await service.empresasConsulta({})).length, 1);
  scope = []; assert.equal((await service.empresasConsulta({})).length, 0); assert.equal(consultas, 2);
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /'\/rh\/documentos\/empresas-consulta', allowRhDpDocumentosRead/);
  assert.match(routes, /'\/rh\/colaboradores\/empresas-consulta', allowRhDpColaboradoresRead/);
  assert(routes.indexOf("'/rh/colaboradores/empresas-consulta'") < routes.indexOf("'/rh/colaboradores/:id'"));
  assert.match(routes, /'\/rh\/empresas-grupo', allowRhDpEmpresasManage/);
  assert.match(routes, /'\/rh\/documentos\/exportacao\/zip', allowRhDpDocumentosRead, criticalRateLimit, RhDocumentoController.exportarZip/);
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/RhDocumentoController.js'), 'utf8');
  assert.match(controller, /res\.once\('finish'/);
}
async function vinculos() {
  const sql = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  let consulta;
  const service = load('services/rhDossieVinculosService.js', { '../models': { sequelize: sql,
    RhTicketLoteItem: { findAll: async () => [{ titulo_financeiro_id: 30 }] },
    RhSolicitacao: { findAll: async o => { consulta = o; return [{ dados_json: { titulos: [
      { id: 20, colaborador_id: 11 }, { id: 21, colaborador_id: 99 }, { id: 22, origens: [{ colaborador_id: 11 }] }, null ] } },
    { dados_json: 'malformado' }]; } } } });
  assert.deepEqual(Array.from(await service.titulosAdicionaisDoColaborador(11)), [30, 20, 22]);
  const gerado = sql.getQueryInterface().queryGenerator.selectQuery('rh_solicitacoes', consulta);
  assert.match(gerado, /JSON_CONTAINS\(`dados_json`,/);
  assert(gerado.includes("'$.titulos'")); assert(!gerado.includes('$$'));
  assert(gerado.includes('colaborador_id')); assert(gerado.includes(':11'));
  assert.match(gerado, /PAGAMENTO_POR_SOLICITACAO/);
  assert.match(gerado, /JORNADA/);
  await sql.close(); // Nao abriu conexao; apenas gerador MySQL.
}
async function dossie() {
  const legado = { id: 1, titulo_financeiro_id: 20, status: 'BAIXADO', comprovante_url: 'storage/legado.pdf', comprovante_nome: 'legado.pdf' };
  const novo = { id: 2, titulo_financeiro_id: 21, status: 'BAIXADO', comprovante_hash: 'h', comprovante_url: 'storage/novo.pdf',
    comprovantes: [{ id: 8, nome: 'novo.pdf', hash: 'h', url: 'storage/novo.pdf' }] };
  const models = { RhColaborador: { findByPk: async id => Number(id) === 11 ? { id: 11, nome: 'Pessoa QA' } : null },
    RhSolicitacaoAnexo: { findAll: async () => [], findOne: async () => null },
    RhFechamentoTitulo: { findAll: async () => [{ tituloFinanceiro: { id: 20, filaPagamentosManuais: [legado] } }] },
    PagamentoManualFilaItem: {
      findAll: async () => [legado, novo], findOne: async () => null,
      findByPk: async id => Number(id) === 2 ? novo : { id: 3, titulo_financeiro_id: 99 }
    },
    PagamentoManualFilaComprovante: { findOne: async o => o.where.id === 8 && o.where.fila_id === 2 ? novo.comprovantes[0] : null }
  };
  const service = load('services/rhDossieService.js', { '../models': models, '../middlewares/validation': { ValidationError },
    './s3': { getPresignedUrl: async (url, segundos, o) => { assert.equal(segundos, 300); assert(o.strict); return 'assinada:' + url; } },
    './rhDossieVinculosService': { titulosAdicionaisDoColaborador: async () => [20, 21] }
  });
  const lista = await service.listarDossieColaboradorRh(11);
  assert.equal(lista.itens.length, 2, 'Sem duplicar fila antiga nem comprovante multianexo espelhado');
  assert.equal((await service.obterLinkArquivoDossieRh(11, 'COMPROVANTE_PAGAMENTO', 8, 2)).url, 'assinada:storage/novo.pdf');
  await assert.rejects(service.obterLinkArquivoDossieRh(11, 'COMPROVANTE_PAGAMENTO', 9, 2), /nao encontrado/);
  await assert.rejects(service.obterLinkArquivoDossieRh(11, 'COMPROVANTE_PAGAMENTO', 8, 3), /nao encontrado/);
  await assert.rejects(service.obterLinkArquivoDossieRh(11, 'SOLICITACAO', 99), /nao encontrado/);
}
class Resposta extends Writable {
  constructor() { super(); this.headers = {}; this.chunks = []; this.headersSent = false; this.on('error', () => {}); }
  setHeader(k, v) { this.headers[k] = v; } removeHeader(k) { delete this.headers[k]; }
  _write(chunk, _encoding, done) { this.headersSent = true; this.chunks.push(chunk); done(); }
}
async function exportacao() {
  const people = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, nome: 'Pessoa /.. QA', empresa_grupo_id: 3, obra_id: 7, status: index % 2 ? 'ATIVO' : 'INATIVO' }));
  let falhar = false, abertos = 0, maxAbertos = 0;
  const service = load('services/rhDocumentosExportacaoService.js', {
    '../models': {
      RhColaborador: { findAll: async o => { assert.equal(o.limit, 11); return people.filter(p => (!o.where.empresa_grupo_id || o.where.empresa_grupo_id === p.empresa_grupo_id)
        && (!o.where.obra_id || o.where.obra_id === p.obra_id) && (!o.where.id || (typeof o.where.id === 'number' ? p.id === o.where.id : p.id > o.where.id[Op.gt]))).slice(0, o.limit); } },
      RhDocumento: { findAll: async o => { assert(o.where.colaborador_id); assert.equal(o.where.ativo, undefined, 'Completo inclui historico'); return [{ id: 11, arquivo_url: 'storage/doc.pdf', nome_original: '../assinada.pdf', status: 'SUBSTITUIDO', ativo: false }]; } },
      RhSolicitacaoAnexo: { findAll: async () => [{ id: 12, arquivo_url: 'storage/anexo.pdf' }] },
      PagamentoManualFilaItem: { findAll: async () => [{ id: 2, comprovante_url: 'storage/recibo.pdf', comprovantes: [] }] }
    },
    './authorizationService': { canViewRhDpDocumentos: async u => u.permitido },
    '../middlewares/validation': { ValidationError },
    './rhDossieService': { listarDossieColaboradorRh: async () => ({ itens: [
      { origem: 'SOLICITACAO', arquivo_id: 12, nome: 'pedido.pdf', situacao: 'PENDENTE' },
      { origem: 'COMPROVANTE_PAGAMENTO', arquivo_id: 2, fila_id: 2, legado: true, nome: 'recibo.pdf', titulo_id: 42, situacao: 'BAIXADO' }
    ] }) },
    './s3': { abrirStreamStorage: async (url, o) => {
      assert(!o.signal.aborted); if (falhar) throw Error('Storage indisponivel fixture');
      abertos++; maxAbertos = Math.max(abertos, maxAbertos);
      const stream = Readable.from([Buffer.from('conteudo-fixture')]); stream.once('end', () => abertos--);
      return { stream, tamanho: 16 };
    } }
  });
  const user = { id: 1, permitido: true };
  await assert.rejects(service.prepararExportacao({ empresa_id: 3 }, { permitido: false }), /Acesso negado/);
  await assert.rejects(service.prepararExportacao({}, user), /Selecione/);
  await assert.rejects(service.prepararExportacao({ empresa_id: '3 OR 1=1' }, user), /invalido/);
  let cursor = null, todos = [];
  do {
    const p = await service.prepararExportacao({ empresa_id: 3, apos_id: cursor }, user);
    todos.push(...p.itens.map(i => i.id)); cursor = p.proximo_cursor;
  } while (cursor);
  assert.equal(new Set(todos).size, 25); assert.equal(todos.length, 25);
  for (const modo of ['COMPROVANTES', 'COMPLETO']) {
    const res = new Resposta(); await service.exportarZip({ colaborador_id: 1, modo }, user, res);
    const zip = new PizZip(Buffer.concat(res.chunks));
    const manifest = JSON.parse(zip.file('manifesto.json').asText());
    assert.equal(manifest.colaboradores.length, 1);
    assert.equal(manifest.colaboradores[0].arquivos.length, modo === 'COMPROVANTES' ? 1 : 3);
    assert(manifest.colaboradores[0].arquivos.every(a => !a.url && !a.caminho.includes('../')));
    assert(manifest.colaboradores[0].arquivos.every(a => zip.file(a.caminho).asText() === 'conteudo-fixture'));
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.equal(maxAbertos, 1, 'Storage serial; nao acumula arquivos em memoria');
  falhar = true;
  const res = new Resposta();
  await assert.rejects(service.exportarZip({ colaborador_id: 1, modo: 'COMPROVANTES' }, user, res), /indisponivel/);
  falhar = false;
  await service.exportarZip({ colaborador_id: 1, modo: 'COMPROVANTES' }, user, new Resposta());
  const concorrentes = await Promise.allSettled([service.exportarZip({ colaborador_id: 1, modo: 'COMPROVANTES' }, user, new Resposta()),
    service.exportarZip({ colaborador_id: 1, modo: 'COMPROVANTES' }, user, new Resposta())]);
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(concorrentes.find(r => r.status === 'rejected').reason.message, /andamento/);
}
async function storage() {
  let chamadas = 0, tamanho = 16, ultimo;
  const raiz = path.resolve(__dirname, '../uploads');
  class Comando { constructor(input) { this.input = input; } }
  const service = load('services/s3.js', {
    fs: { promises: {
      realpath: async p => p.endsWith('link.pdf') ? path.resolve(raiz, '../fora.pdf') : p,
      stat: async () => ({ size: 16, isFile: () => true })
    }, createReadStream: () => Readable.from(['arquivo local']) },
    path: require('node:path'), crypto: require('node:crypto'),
    '@aws-sdk/client-s3': { S3Client: class { async send(cmd) {
      chamadas++; assert.equal(cmd.input.Bucket, 'qa-uploads');
      ultimo = Readable.from(['arquivo remoto']); return { Body: ultimo, ContentLength: tamanho };
    } }, GetObjectCommand: Comando },
    '@aws-sdk/s3-request-presigner': {}, '../utils/fileName': { sanitizeFileNameForStorage: n => n }
  }, { URL, process: { env: { AWS_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AWS_S3_BUCKET: 'qa-uploads' } } });
  await assert.rejects(service.abrirStreamStorage('https://externo.invalid/arquivo'), /storage configurado/);
  assert.equal(chamadas, 0, 'Nao buscar URL arbitraria');
  const remoto = await service.abrirStreamStorage('https://qa-uploads.s3.us-east-2.amazonaws.com/arquivo.pdf'); remoto.stream.destroy();
  tamanho = 200 * 1024 * 1024;
  await assert.rejects(service.abrirStreamStorage('arquivo.pdf'), /limite/); assert(ultimo.destroyed);
  await assert.rejects(service.abrirStreamStorage('/uploads/%2e%2e/fora.pdf'), /invalido/);
  await assert.rejects(service.abrirStreamStorage('/uploads/link.pdf'), /fora do storage/);
  const local = await service.abrirStreamStorage('/uploads/doc.pdf'); assert.equal(local.tamanho, 16); local.stream.destroy();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(service.abrirStreamStorage('arquivo.pdf', { signal: abort.signal }), /cancelada/);
}
async function migration() {
  let existe = false, alteracoes = 0;
  const sandbox = { module: { exports: {} }, require: () => ({ columnExists: async () => existe }) };
  const source = fs.readFileSync(path.resolve(__dirname, '../migrations/202610180001_rh_inicio_efetivo_obra.js'), 'utf8');
  assert(!/\b(?:UPDATE|INSERT|DELETE)\s+/i.test(source));
  vm.runInNewContext(source, sandbox);
  const args = { sequelize: {}, DataTypes: { DATEONLY: 'DATEONLY' }, queryInterface: { addColumn: async (t, c, o) => {
    assert.equal(t, 'rh_colaboradores'); assert.equal(c, 'data_inicio_efetivo_obra'); assert.equal(o.allowNull, true); existe = true; alteracoes++;
  } } };
  await sandbox.module.exports.up(args); await sandbox.module.exports.up(args); assert.equal(alteracoes, 1);
}
(async () => {
  await catalogo(); await vinculos(); await dossie(); await exportacao(); await storage(); await migration();
  const validator = require('../src/validators/rhValidators');
  assert.equal(validator.validateRhColaboradorUpdateBody({ data_inicio_efetivo_obra: '2026-10-10' }).data_inicio_efetivo_obra, '2026-10-10');
  assert.equal(validator.validateRhColaboradorUpdateBody({ data_inicio_efetivo_obra: null }).data_inicio_efetivo_obra, null);
  assert.throws(() => validator.validateRhColaboradorUpdateBody({ data_inicio_efetivo_obra: '2026-02-30' }), /invalido/);
  console.log('RH documentos: catalogo/ACL, SQL MySQL gerado sem conexao, comprovantes novos/ticket/legado, vinculo de arquivo, ZIP real/manifesto, historico, empresa/cursor25, storage serial e falha sem avancar aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
