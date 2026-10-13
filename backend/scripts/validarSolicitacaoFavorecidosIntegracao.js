'use strict';
// Servico e migration reais, modelos/queryInterface em memoria.
// Nao carrega models/index, .env, conexao, upload nem servidor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, DataTypes } = require('sequelize');
const domain = require('../src/services/solicitacaoFavorecidosDomain');
const { PIX_TEXTO_MAX } = require('../src/utils/pix');
const validators = require('../src/validators/operationalValidators');
const { ValidationError } = require('../src/middlewares/validation');
function carregar(relative, dependencias) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), {
    module, console, __dirname: path.dirname(path.resolve(__dirname, '..', relative)), require(id) {
      if (Object.hasOwn(dependencias, id)) return dependencias[id];
      throw Error(`Dependencia nao isolada: ${id}`);
    }
  }, { filename: relative });
  return module.exports;
}
const tx = { LOCK: { UPDATE: 'UPDATE' } };
let state, consultas, falhaAuditoria = false;
function reset() {
  state = { registros: [], historico: [] }; consultas = [];
  falhaAuditoria = false;
}
const modelos = {
  MedicaoParcela: { async findAll(options) { consultas.push(['vinculos', options]); return [{ contrato_parcela_id: 10, medicao_id: 7 }]; } },
  Parceiro: { async findAll(options) {
    consultas.push(['parceiros', options]);
    assert.equal(options.where.ativo, true);
    return [1, 2].filter(id => options.where.id[Op.in].includes(id)).map(id => ({ id, nome: `Pessoa ${id}`, cpf_cnpj: `doc-${id}` }));
  } },
  Solicitacao: { async findByPk(id, options) {
    consultas.push(['solicitacao', options]); assert.equal(id, 50);
    return { id, area_responsavel: 'GEO' };
  } },
  SolicitacaoFavorecido: {
    async bulkCreate(linhas, options) {
      assert.equal(options.transaction, tx);
      const novas = linhas.map((l, i) => ({ ...l, id: i + 1 }));
      state.registros.push(...novas); return novas;
    },
    async findAll(options) {
      consultas.push(['favorecidos', options]);
      if (options.where.contrato_parcela_id) return state.registros.filter(l => options.where.contrato_parcela_id[Op.in].includes(l.contrato_parcela_id));
      return state.registros.filter(l => l.solicitacao_id === options.where.solicitacao_id && l.medicao_id === options.where.medicao_id);
    }
  },
  Historico: { async bulkCreate(linhas, options) {
    assert.equal(options.transaction, tx);
    if (falhaAuditoria) throw Error('Falha de auditoria QA');
    state.historico.push(...linhas);
  } },
  TituloFinanceiro: { async findAll(options) {
    consultas.push(['titulos', options]);
    return [{ id: 20, valor_original: 600, valor_saldo: 0, valor_baixado: 600, status: 'QUITADO' },
      { id: 21, valor_original: 400, valor_saldo: 400, valor_baixado: 0, status: 'ABERTO' }]
      .filter(t => options.where.id[Op.in].includes(t.id));
  } }
};
const service = carregar('src/services/solicitacaoFavorecidosService.js', {
  sequelize: { Op }, './solicitacaoFavorecidosDomain': domain, '../models': modelos,
  './formasPagamentoMedicaoService': {
    formaPagamentoEhPix: f => f.tipo === 'PIX', formaPagamentoEhBoleto: f => f.tipo === 'BOLETO'
  }, './tituloRenegociacaoVinculos': { projetarOrigens: async titulos => titulos }
});
const formas = [{ id: 1, nome: 'Pix', tipo: 'PIX' }, { id: 2, nome: 'Boleto', tipo: 'BOLETO' }, { id: 3, nome: 'Transferencia', tipo: 'TED' }];
const lista = [{ favorecido_id: 1, valor: 600, forma_pagamento_id: 1, favorecido_chave_pix: '000201'.padEnd(PIX_TEXTO_MAX, '0') },
  { favorecido_id: 2, valor: 400, forma_pagamento_id: 2, boleto_nomes: ['boleto QA.pdf'] }];
async function transacao(acao) {
  const antes = JSON.parse(JSON.stringify(state));
  try { return await acao(tx); } catch (e) { state = antes; throw e; }
}
async function testarServico() {
  reset();
  assert.equal((await service.validarFavorecidos(undefined)).length, 0);
  assert.equal((await service.registrarFavorecidos([])).length, 0);
  assert.equal(consultas.length, 0, 'Sem + nao consulta novos modelos na criacao');
  const options = { valorTotal: 1000, formas, anexosPendentes: ['boleto QA.pdf'], transaction: tx };
  const linhas = await service.validarFavorecidos(lista, options);
  assert.equal(consultas.length, 1, 'Beneficiarios em lote, nao N+1');
  assert.equal(consultas[0][1].transaction, tx);
  assert.equal(linhas[0].nome_favorecido, 'Pessoa 1');
  assert.equal(linhas[0].cpf_cnpj, 'doc-1');
  assert.equal(linhas[1].favorecido_chave_pix, null);
  await assert.rejects(() => service.validarFavorecidos([{ ...lista[0], favorecido_id: 99 }, lista[1]], options), /inativo/);
  await assert.rejects(() => service.validarFavorecidos(lista, { ...options, formas: [formas[0]] }), /forma nao/);
  await assert.rejects(() => service.validarFavorecidos(lista, { ...options, anexosPendentes: [] }), /anexe os boletos/);
  await assert.rejects(() => service.validarFavorecidos([{ ...lista[0], favorecido_chave_pix: '' }, lista[1]], options), /chave PIX/);
  await assert.rejects(() => service.validarFavorecidos([lista[0], { ...lista[1], forma_pagamento_id: 3 }], options), /dados para pagamento/);
  await assert.rejects(() => service.registrarFavorecidos(linhas, { solicitacaoId: 50 }), /transacao/);
  await transacao(transaction => service.registrarFavorecidos(linhas, { solicitacaoId: 50, medicaoId: 7, usuarioId: 9, transaction }));
  assert.equal(state.registros.length, 2);
  assert.equal(state.historico.length, 2, 'Historico individual evita overflow de TEXT com PIX grandes');
  state.historico.forEach(h => {
    assert.equal(h.solicitacao_id, 50); assert.equal(h.medicao_id, 7); assert.equal(h.setor, 'GEO');
    assert.equal(h.acao, 'DADOS_PAGAMENTO_REGISTRADOS', 'Nao concede visibilidade por ENVIADA_SETOR');
    assert.ok(Buffer.byteLength(h.descricao, 'utf8') < 65535);
    assert.ok(Buffer.byteLength(h.metadata, 'utf8') < 65535);
  });
  falhaAuditoria = true;
  await assert.rejects(() => transacao(transaction => service.registrarFavorecidos(linhas, { solicitacaoId: 50, medicaoId: 8, transaction })), /auditoria QA/);
  assert.equal(state.registros.length, 2, 'Falha da trilha nao deixa instrucoes soltas');
  falhaAuditoria = false;
  consultas = [];
  assert.equal((await service.listarFavorecidos(51, { medicaoId: 7 })).length, 0);
  assert.equal((await service.listarFavorecidos(50)).length, 0, 'Nao mistura eventos no detalhe geral');
  assert.equal((await service.listarFavorecidos(50, { medicaoId: 7, transaction: tx, lock: true })).length, 2);
  assert.equal(consultas.at(-1)[1].lock, 'UPDATE');
  state.registros.forEach((l, i) => Object.assign(l, { contrato_parcela_id: 10, titulo_financeiro_id: 20 + i }));
  consultas = [];
  const grupos = await service.carregarDivisoesDasParcelas([{ id: 10 }], tx, { lock: true });
  assert.equal(grupos.get(10).resumo.valor_parcela_reconciliado, 1000);
  assert.equal(grupos.get(10).resumo.valor_saldo, 400);
  assert.equal(consultas.length, 3, 'Vinculos ativos, partes e titulos em lote');
  state.registros.push({ ...state.registros[0], medicao_id: 8, titulo_financeiro_id: 21 });
  assert.equal((await service.carregarDivisoesDasParcelas([{ id: 10 }], tx)).get(10).pagamentos.length, 2, 'Ciclo devolvido nao mistura titulos');
  assert.equal((await service.carregarDivisoesDasParcelas([{ id: 99 }], tx)).size, 0, 'Sem parcela fora do recorte');
}
async function testarMigration() {
  const existentes = new Set(['Solicitacoes', 'Parceiros']);
  const indices = new Set(); let created = 0, additions = 0, falharSegundo = true;
  const sequelize = { async query(sql, { replacements }) {
    if (sql.includes('COUNT')) return [[{ total: existentes.has(replacements[0]) ? 1 : 0 }]];
    return [replacements.filter(n => existentes.has(n)).map(TABLE_NAME => ({ TABLE_NAME }))];
  } };
  const queryInterface = {
    async createTable(nome, fields) {
      assert.equal(nome, 'solicitacoes_favorecidos'); assert.ok(!existentes.has(nome));
      assert.equal(fields.solicitacao_id.references.model, 'Solicitacoes');
      assert.equal(fields.favorecido_id.references.model, 'Parceiros');
      assert.equal(fields.forma_pagamento_id.references.model, 'financeiro_formas_pagamento');
      assert.equal(fields.titulo_financeiro_id.references.model, 'titulos_financeiros');
      assert.equal(fields.contrato_parcela_id.references.model, 'contrato_parcelas');
      assert.equal(fields.medicao_id.references.model, 'contrato_medicoes');
      assert.equal(fields.titulo_financeiro_id.unique, true);
      existentes.add(nome); created += 1;
    },
    async showIndex() { return [...indices].map(name => ({ name })); },
    async addIndex(nome, fields, { name }) {
      assert.equal(nome, 'solicitacoes_favorecidos'); assert.ok(!indices.has(name));
      if (name === 'sol_fav_parcela' && falharSegundo) { falharSegundo = false; throw Error('Interrupcao QA'); }
      indices.add(name); additions += 1;
    }
  };
  const migration = carregar('migrations/202610120001_solicitacao_favorecidos.js', {
    '../src/database/schemaUtils': require('../src/database/schemaUtils')
  });
  const args = { DataTypes, queryInterface, sequelize };
  await assert.rejects(() => migration.up(args), /Interrupcao QA/);
  await migration.up(args); await migration.up(args);
  assert.equal(created, 1); assert.equal(additions, 2, 'Retoma indice sem recriar ou repetir');
  await assert.rejects(() => migration.down(), /Rollback exige plano/);
}
function testarValidator() {
  const body = { obra_id: 10, tipo_solicitacao_id: 7, valor: 1000 };
  assert.equal(validators.validateSolicitacaoCreateBody(body).pagamentos_favorecidos, undefined);
  assert.equal(validators.validateSolicitacaoCreateBody({ ...body, pagamentos_favorecidos: lista }).pagamentos_favorecidos.length, 2);
  assert.throws(() => validators.validateSolicitacaoCreateBody({ ...body, pagamentos_favorecidos: [{ ...lista[0], titulo_financeiro_id: 500 }, lista[1]] }), ValidationError);
  assert.throws(() => validators.validateSolicitacaoCreateBody({ ...body, pagamentos_favorecidos: [{ ...lista[0], contrato_parcela_id: 99 }, lista[1]] }), ValidationError);
  assert.throws(() => validators.validateSolicitacaoCreateBody({ ...body, valor: 1001, pagamentos_favorecidos: lista }), ValidationError);
}
async function testarPersistenciaController() {
  // Callbacks transacionais REAIS usados pela abertura apos os guards existentes.
  // Nao executa rotas nem atribui qualquer permissao no servidor.
  reset();
  const validados = await service.validarFavorecidos(lista, { valorTotal: 1000, formas, anexosPendentes: ['boleto QA.pdf'] });
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
  const inicio = source.indexOf('      const criarSolicitacaoComRateio = async');
  const fim = source.indexOf('      const criarSolicitacaoCadastroObra = async', inicio);
  let criadas = 0, rateios = [], distribuicoes = [];
  const modulo = { exports: {} };
  const contexto = {
    module: modulo, dadosSolicitacao: { valor: 1000 }, usuarioId: 9, obra_id: 4,
    pagamentosFavorecidosValidados: validados,
    rateioApropriacoesDetalhado: [{ apropriacao_id: 3, valor_rateio: 1000 }],
    distribuicaoCentroCustoValidada: { linhas: [{ obra_id: 4, criterio: 'VALOR', valor_distribuido: 1000 }] },
    sequelize: { transaction: async callback => { const anteriores = [criadas, rateios, distribuicoes];
      try { return await transacao(callback); } catch (e) { [criadas, rateios, distribuicoes] = anteriores; throw e; } } },
    Solicitacao: { create: async (_dados, opts) => { assert.equal(opts.transaction, tx); criadas++; return { id: 50 }; } },
    SolicitacaoApropriacao: { bulkCreate: async (rows, opts) => { assert.equal(opts.transaction, tx); rateios = rows; } },
    SolicitacaoCentroCustoDistribuicao: { bulkCreate: async (rows, opts) => { assert.equal(opts.transaction, tx); distribuicoes = rows; } },
    require: id => { assert.equal(id, '../services/solicitacaoFavorecidosService'); return service; }
  };
  vm.runInNewContext(`${source.slice(inicio, fim)}\nmodule.exports={criarSolicitacaoComRateio,criarSolicitacaoComDistribuicao};`, contexto);
  falhaAuditoria = true;
  await assert.rejects(modulo.exports.criarSolicitacaoComRateio(), /auditoria QA/);
  assert.equal(criadas, 0); assert.equal(state.registros.length, 0); assert.equal(rateios.length, 0);
  falhaAuditoria = false;
  await modulo.exports.criarSolicitacaoComRateio();
  assert.equal(criadas, 1); assert.equal(state.registros.length, 2); assert.equal(rateios.length, 1);
  reset();
  await modulo.exports.criarSolicitacaoComDistribuicao();
  assert.equal(state.registros.length, 2); assert.equal(distribuicoes.length, 1);
  assert.ok(state.registros.every(p => p.solicitacao_id === 50 && p.medicao_id === null));
}
function testarGuardSchema() {
  const runner = carregar('src/database/runMigrations.js', {
    fs, path, sequelize: require('sequelize'), '../config/env': { validateRequiredEnv: () => { throw Error('Nao carregar ambiente real'); } }, './index': {}
  });
  for (const arquivo of ['202610120001_solicitacao_favorecidos.js', '202610120002_adiantamento_favorecidos.js']) {
    runner.assertMigrationSourceIsSchemaOnly(arquivo, fs.readFileSync(path.resolve(__dirname, '../migrations', arquivo), 'utf8'));
  }
  assert.throws(() => runner.assertMigrationSourceIsSchemaOnly('insegura.js', 'queryInterface.bulkUpdate("titulos", {})'), /bloqueada/);
}
(async () => {
  testarValidator(); await testarServico(); await testarPersistenciaController(); await testarMigration(); testarGuardSchema();
  console.log('OK: validator, snapshots confiaveis, Pix longo, formas/boletos, transacao/auditoria, leituras recortadas e migration idempotente retomavel. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
