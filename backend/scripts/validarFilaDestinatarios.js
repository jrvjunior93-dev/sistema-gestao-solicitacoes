'use strict';
// Fixtures em memoria. Nunca carrega models reais nem conecta a banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Op } = require('sequelize');
const { anexarDestinatarios } = require('../src/services/pagamentoFilaDestinatarioService');
const nomeCredor = 'Credor contratual QA', nomeFav = 'Recebedor da medicao QA';
const medicao = (id, extra = {}) => ({ id, contrato_id: 5, solicitacao_id: 6345,
  favorecido_id: 9, favorecido_chave_pix: 'chave-medicao-1@example.test', forma_pagamento_id: 3, aprovada_em: '2026-10-14', ...extra });
const parcela = (id, titulo, medicoes, extra = {}) => ({ id, contrato_id: 5, titulo_financeiro_id: titulo,
  medicoes: medicoes.map(m => ({ medicao_id: m.id, solicitacao_id: m.solicitacao_id, medicao: m })), ...extra });
const parcelas = [parcela(1, 9886, [medicao(1)]), parcela(2, 25, [medicao(2, { favorecido_chave_pix: 'segunda-chave' })]),
  parcela(3, 33, [medicao(1)]), parcela(4, 44, [medicao(3), medicao(4)]),
  parcela(5, 55, [medicao(5, { contrato_id: 99 })]),
  parcela(6, 66, [medicao(6, { solicitacao_id: 999 })]),
  parcela(7, 77, [medicao(7)], { contrato_id: 5 })];
let consultas = [];
const leitura = findAll => new Proxy({ findAll }, { get(target, key) {
  if (!(key in target)) throw Error(`Operacao nao autorizada no teste: ${String(key)}`);
  return target[key];
} });
const db = {
  MedicaoParcela: {}, ContratoMedicao: {},
  ContratoParcela: leitura(async options => {
    consultas.push('parcelas');
    const alternativas = options.where[Op.or];
    const titulos = alternativas[0].titulo_financeiro_id[Op.in];
    const partes = alternativas[1]?.id[Op.in] || [];
    assert.equal(options.include[0].where.devolvido_em, null);
    assert.equal(options.include[0].include[0].where.aprovada_em[Op.ne], null);
    assert.equal(options.include[0].include[0].required, true);
    return structuredClone(parcelas.filter(p => titulos.includes(p.titulo_financeiro_id) || partes.includes(p.id)));
  }),
  ContratoCredor: leitura(async options => {
    consultas.push('credores'); assert.deepEqual(options.where.contrato_id[Op.in], [5]);
    return [{ contrato_id: 5, parceiro_id: 1 }, { contrato_id: 5, parceiro_id: 2 }];
  }),
  Parceiro: leitura(async options => {
    consultas.push('parceiros');
    return [{ id: 1, nome: nomeCredor }, { id: 2, nome: 'Segundo credor QA' }, { id: 9, nome: nomeFav }]
      .filter(p => options.where.id[Op.in].includes(p.id));
  })
};
const titulo = (id, extra = {}) => ({ id, codigo: `TIT-${id}`, parceiro_id: 9,
  solicitacao_id: 6345, solicitacao: { id: 6345, contrato_id: 5, parceiro: { nome: nomeCredor } },
  parceiro: { nome: nomeFav }, status: 'ABERTO', valor_saldo: '1000.00', ...extra });
async function validarOrmIsolado() {
  const { Sequelize, DataTypes } = require('sequelize');
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  sequelize.connectionManager.getConnection = () => { throw Error('Conexao real proibida'); };
  const orm = Object.fromEntries(['ContratoParcela', 'MedicaoParcela', 'ContratoMedicao', 'TituloFinanceiro']
    .map(nome => [nome, require(`../src/models/${nome}`)(sequelize, DataTypes)]));
  orm.ContratoParcela.hasMany(orm.MedicaoParcela, { foreignKey: 'contrato_parcela_id', as: 'medicoes' });
  orm.MedicaoParcela.belongsTo(orm.ContratoMedicao, { foreignKey: 'medicao_id', as: 'medicao' });
  let sqlGerado = '';
  sequelize.query = async sql => { sqlGerado = sql; return []; };
  await anexarDestinatarios([titulo(9886)], orm);
  assert.match(sqlGerado, /^SELECT /);
  assert(sqlGerado.includes('`medicoes->medicao`.`aprovada_em` IS NOT NULL'));
  assert(sqlGerado.includes('`medicoes`.`devolvido_em` IS NULL'));
  assert(sqlGerado.includes('`ContratoParcela`.`titulo_financeiro_id` IN (9886)'));
  // setDataValue nao cria getter: garantir que a instrucao imutavel nao seja
  // perdida ao receber uma instancia de verdade, em vez de JSON da fixture.
  const instance = orm.TituloFinanceiro.build({ id: 333, solicitacao_id: 6345 });
  instance.setDataValue('instrucao_favorecido', { medicao_id: 1, contrato_parcela_id: 3,
    nome_favorecido: 'Parte real Sequelize', favorecido_chave_pix: 'chave-preservada' });
  instance.update = instance.save = () => { throw Error('Escrita proibida'); };
  await anexarDestinatarios([instance], db);
  assert.equal(instance.toJSON().instrucao_medicao_fila, undefined);
  assert.equal(instance.toJSON().instrucao_favorecido.favorecido_chave_pix, 'chave-preservada');
  await sequelize.close();
}
async function run() {
  await anexarDestinatarios([], db); assert.equal(consultas.length, 0);
  const pagos = titulo(9886, { status: 'QUITADO', valor_baixado: '1000.00', valor_saldo: '0.00',
    baixa: { id: 801, status: 'ATIVO', data: '2026-10-15', valor: '1000.00' }, historico: ['pagamento registrado'] });
  pagos.solicitacao.boletos = [{ medicao_id: 1, nome: 'medicao-correta.pdf' }, { medicao_id: 2, nome: 'outra-medicao.pdf' }];
  const parte = titulo(333, { instrucao_favorecido: { medicao_id: 1, contrato_parcela_id: 3,
    nome_favorecido: 'Outro recebedor explicito', favorecido_chave_pix: 'chave-parte' } });
  const titulos = [pagos, titulo(250, { medicao_pagamento_origem_id: 25 }), parte,
    titulo(44), titulo(55), titulo(66), titulo(77, { solicitacao: { id: 6345, contrato_id: 99 } }),
    titulo(999), titulo(888, { pagamento_negociacao: { nome_favorecido: 'Negociacao', favorecido_chave_pix: 'chave-acordo' } })];
  const antes = structuredClone(titulos);
  await anexarDestinatarios(titulos, db);
  assert.deepEqual(consultas, ['parcelas', 'credores', 'parceiros']);
  assert.equal(pagos.instrucao_medicao_fila.favorecido_chave_pix, 'chave-medicao-1@example.test');
  assert.equal(pagos.instrucao_medicao_fila.nome_favorecido, nomeFav);
  assert.deepEqual(pagos.instrucao_medicao_fila.boleto_nomes, ['medicao-correta.pdf']);
  assert.equal(pagos.credor_fila.nome, `${nomeCredor} / Segundo credor QA`);
  assert.equal(titulos[1].instrucao_medicao_fila.favorecido_chave_pix, 'segunda-chave');
  assert.equal(parte.instrucao_medicao_fila, undefined);
  assert.equal(parte.instrucao_favorecido.favorecido_chave_pix, 'chave-parte');
  assert.match(titulos[3].instrucao_medicao_fila.pendencia, /Mais de uma/);
  for (const index of [4, 5, 6, 7, 8]) assert.equal(titulos[index].instrucao_medicao_fila, undefined);
  // Igualdade de TODO o estado anterior, inclusive baixa e historico. Somente DTOs novos.
  assert.deepEqual(titulos.map(t => Object.fromEntries(Object.entries(t)
    .filter(([key]) => !['credor_fila', 'instrucao_medicao_fila'].includes(key)))), antes);
  consultas = [];
  const lote = Array.from({ length: 500 }, () => titulo(9886));
  await anexarDestinatarios(lote, db);
  assert.equal(consultas.length, 3, 'Consultas em lote, sem N+1');
  // Instancia Sequelize: setDataValue projeta, sem chamar update/save.
  let dto = {};
  await anexarDestinatarios([{ ...titulo(9886), setDataValue: (key, value) => { dto[key] = value; } }], db);
  assert.equal(dto.instrucao_medicao_fila.medicao_id, 1);
  const service = fs.readFileSync(path.join(__dirname, '../src/services/pagamentoManualFilaService.js'), 'utf8');
  assert(service.indexOf('anexarDestinatarios') > service.indexOf('anexarInstrucoes'));
  assert(service.includes('getFinanceiroObraScopeIds(req.user)'));
  assert(service.includes('escopoCompletoSql'));
  await validarOrmIsolado();
  console.log('OK: favorecido/PIX da medicao exata, varias partes/credores, origem derivada, ambiguidades/escopo, 500 titulos/3 consultas e TIT-009886 quitado sem qualquer escrita. Fixtures isoladas.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
