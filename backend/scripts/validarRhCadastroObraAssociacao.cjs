'use strict';
// Modelos/associacao e gerador SQL reais; nenhum banco, app, .env ou S3.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { ValidationError } = require('../src/middlewares/validation');

function fixture(withDocument) {
  const sequelize = new Sequelize('qa_sem_banco', 'qa', 'qa', { dialect: 'mysql', logging: false });
  sequelize.connectionManager.getConnection = async () => { throw Error('CONEXAO_PROIBIDA_NO_TESTE'); };
  const db = {
    RhDocumento: require('../src/models/RhDocumento')(sequelize, DataTypes),
    RhDocumentoTipo: require('../src/models/RhDocumentoTipo')(sequelize, DataTypes)
  };
  const registry = fs.readFileSync(path.join(__dirname, '../src/models/index.js'), 'utf8');
  const registration = registry.match(/db\.RhDocumento\.belongsTo\(db\.RhDocumentoTipo,\s*\{[^}]*\}\);/g);
  assert.equal(registration?.length, 1);
  vm.runInNewContext(registration[0], { db });
  const sqls = [];
  sequelize.query = async (sql, options) => {
    sqls.push(sql);
    assert(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sql));
    if (options.model === db.RhDocumento) {
      assert.match(sql, /AS `tipoDocumento`/);
      assert.match(sql, /`obra_origem_id` IN \(10\)/);
      assert.match(sql, /`colaborador_id` = 7/);
      assert(!sql.includes('arquivo_url'));
      return withDocument ? [db.RhDocumento.build({ id: 9, nome_original: 'documento.pdf', status: 'ENVIADO',
        tipoDocumento: { id: 5, nome: 'Documento da obra' } }, { include: [{ model: db.RhDocumentoTipo, as: 'tipoDocumento' }] })] : [];
    }
    assert.equal(options.model, db.RhDocumentoTipo);
    return [db.RhDocumentoTipo.build({ id: 5, nome: 'Documento da obra', exige_validade: false })];
  };
  db.RhColaborador = { async findByPk(id, opts) {
    assert.deepEqual(Array.from(opts.attributes), ['id', 'nome', 'obra_id', 'tipo_vinculo', 'observacoes']);
    return { id: 7, nome: 'Pessoa QA', obra_id: 10, tipo_vinculo: 'CLT', observacoes: 'Observacao' };
  } };
  db.sequelize = sequelize;
  const deps = { sequelize: { Op }, '../models': db,
    './authorizationService': { getRhDpObraScopeIds: async () => [10], userHasAreaPermission: async () => true },
    '../middlewares/validation': { ValidationError },
    './s3': { uploadToS3: () => { throw Error('S3_PROIBIDO'); }, getPresignedUrl: () => { throw Error('S3_PROIBIDO'); } },
    '../utils/fileName': { normalizeOriginalName: s => s }, 'node:crypto': require('node:crypto') };
  const sandbox = { module: { exports: {} }, require: n => { assert(n in deps, n); return deps[n]; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/rhColaboradorObraService.js'), 'utf8'), sandbox);
  return { db, sqls, service: sandbox.module.exports };
}

for (const withDocument of [false, true]) test(`cadastro limitado com associacao real, documentos=${withDocument}`, async () => {
  const { db, sqls, service } = fixture(withDocument);
  const result = await service.mostrar({ user: { id: 41 } }, 7);
  assert.equal(result.colaborador.observacoes, 'Observacao');
  assert.equal(result.documentos.length, withDocument ? 1 : 0);
  if (withDocument) {
    assert.equal(result.documentos[0].tipo_nome, 'Documento da obra');
    assert(!Object.hasOwn(result.documentos[0], 'arquivo_url'));
  }
  assert.equal(result.pode_editar, true);
  assert.equal(sqls.length, 2);
  // Reproduz a causa antiga antes de qualquer consulta, ate com lista vazia.
  await assert.rejects(db.RhDocumento.findAll({ include: [{ model: db.RhDocumentoTipo, as: 'tipo' }] }), /alias|aliased/i);
  assert.equal(sqls.length, 2);
});
