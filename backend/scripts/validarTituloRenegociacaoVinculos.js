'use strict';
const assert = require('node:assert/strict');
const { Op, Sequelize, DataTypes } = require('sequelize');
// Instâncias reais do Sequelize, mas sem conexão nem credencial.
const sequelize = new Sequelize('fixture', 'fixture', 'fixture', { dialect: 'mysql', logging: false });
const Modelo = sequelize.define('FixtureTitulo', {
  id: { type: DataTypes.INTEGER, primaryKey: true }, status: DataTypes.STRING,
  valor_saldo: DataTypes.DECIMAL(14, 2), valor_baixado: DataTypes.DECIMAL(14, 2), valor_original: DataTypes.DECIMAL(14, 2),
  renegociado_por_id: DataTypes.INTEGER, renegociacao_id: DataTypes.INTEGER
}, { timestamps: false });
const titulos = [
  { id: 1, status: 'RENEGOCIADO', renegociado_por_id: 1, obra_id: 3, valor_original: '150.00', valor_baixado: '50.00', valor_saldo: '0.00' },
  { id: 2, status: 'RENEGOCIADO', renegociado_por_id: 1, obra_id: 4, valor_original: '200.00', valor_baixado: '0.00', valor_saldo: '0.00' },
  { id: 3, codigo: 'TIT-3', status: 'PARCIAL', renegociacao_id: 1, obra_id: null, valor_original: '330.00', valor_baixado: '100.00', valor_saldo: '230.00', data_vencimento: '2090-01-31' }
];
const alocacoes = [
  { id: 1, titulo_origem_id: 1, titulo_destino_id: 3, obra_id: 3, categoria_financeira_id: 10, considera_dre: true, solicitacao_id: 11, valor: '110.00', principal: '100.00', juros: '10.00', multa: '0.00' },
  { id: 2, titulo_origem_id: 2, titulo_destino_id: 3, obra_id: 4, categoria_financeira_id: 20, considera_dre: false, solicitacao_id: 12, valor: '220.00', principal: '200.00', juros: '20.00', multa: '0.00' }
];
const movimentos = [{ id: 1, titulo_financeiro_id: 3, tipo_movimento: 'BAIXA', status: 'ATIVO', valor: '100.00', valor_quitacao: '100.00' }];
function filtrar(rows, where = {}) {
  return rows.filter(row => Object.keys(where).every(k => {
    const esperado = where[k];
    if (esperado && typeof esperado === 'object') {
      if (esperado[Op.in]) return esperado[Op.in].includes(row[k]);
      if (Object.hasOwn(esperado, Op.ne)) return esperado[Op.ne] === null ? row[k] != null : row[k] !== esperado[Op.ne];
    }
    return row[k] === esperado;
  }));
}
const db = {
  TituloFinanceiro: { findAll: async ({ where }) => filtrar(titulos, where).map(t => Modelo.build(t, { raw: true, isNewRecord: false })) },
  TituloRenegociacaoAlocacao: { findAll: async ({ where }) => filtrar(alocacoes, where).map(a => ({ ...a })) },
  Obra: { findAll: async () => [{ id: 3, nome: 'Obra A' }, { id: 4, nome: 'Obra B' }] },
  CategoriaFinanceira: { findAll: async () => [{ id: 10, nome: 'Plano A' }, { id: 20, nome: 'Plano B' }] },
  MovimentoFinanceiro: { findAll: async ({ where, include }) => filtrar(movimentos, where)
    .map(m => ({ ...m, ...(include ? { titulo: { ...titulos.find(t => t.id === m.titulo_financeiro_id) } } : {}) })) }
};
require.cache[require.resolve('../src/models')] = { loaded: true, exports: db };
const { projetarOrigens, projetarAssociacoes } = require('../src/services/tituloRenegociacaoVinculos');
const leitura = require('../src/services/tituloRenegociacaoLeitura');
async function main() {
  let result = await projetarOrigens(titulos.slice(0, 2));
  assert.equal(result[0].valor_saldo, '76.67'); assert.equal(result[0].valor_baixado, '83.33');
  assert.equal(result[1].valor_saldo, '153.33');
  assert.equal(result[0].renegociacao_titulos[0].valor, '110.00');
  assert.equal(titulos[0].status, 'RENEGOCIADO'); assert.equal(titulos[0].valor_saldo, '0.00');
  const registros = [{ titulo: Modelo.build(titulos[0], { raw: true, isNewRecord: false }) }];
  await projetarAssociacoes(registros, 'titulo');
  assert.equal(registros[0].titulo.toJSON().renegociacao_titulos[0].id, 3);
  assert.equal(registros[0].titulo.valor_saldo, '76.67');
  const porObra = await leitura.buscarTitulos({ where: { id: 3, obra_id: 3 } });
  assert.equal(porObra.length, 1); assert.equal(porObra[0].valor_saldo, 76.67);
  assert.equal(porObra[0].categoriaFinanceira.nome, 'Plano A');
  const originaisRelatorio = await leitura.buscarTitulos({ where: { id: 1 } });
  const originaisDre = await leitura.buscarTitulos({ where: { id: 1 }, modoDre: true });
  assert.equal(originaisRelatorio[0].valor_original, '50.00'); assert.equal(originaisDre[0].valor_original, '150.00');

  movimentos.push({ id: 2, titulo_financeiro_id: 3, tipo_movimento: 'BAIXA', status: 'ATIVO', valor: '230.00', valor_quitacao: '235.00', juros: '5.00' });
  Object.assign(titulos[2], { valor_baixado: '330.00', valor_saldo: '0.00', status: 'QUITADO' });
  result = await projetarOrigens(titulos.slice(0, 2));
  assert.ok(result.every(t => t.status === 'QUITADO' && t.valor_saldo === '0.00'));
  assert.equal(result[0].valor_baixado, '160.00');
  const realizado = await leitura.buscarMovimentos({ where: { status: 'ATIVO' }, include: [{ as: 'titulo', where: { obra_id: 3 } }] });
  assert.equal(realizado.length, 2);
  assert.equal(realizado.reduce((s, m) => s + Math.round(m.valor * 100), 0), 11000);
  assert.equal(realizado.reduce((s, m) => s + Math.round(m.valor_quitacao * 100), 0), 11167);
  movimentos[1].status = 'ESTORNADO';
  Object.assign(titulos[2], { valor_baixado: '100.00', valor_saldo: '230.00', status: 'PARCIAL' });
  result = await projetarOrigens(titulos.slice(0, 2));
  assert.equal(result[0].valor_saldo, '76.67'); assert.equal(result[1].valor_saldo, '153.33');
  console.log('OK: vínculos multiobra/multiplano, cópias Sequelize, baixa parcial/integral, estorno, DRE sem principal repetido e relatório rateado. Sem banco.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
