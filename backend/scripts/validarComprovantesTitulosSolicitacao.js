'use strict';
// Funcao real isolada em VM: nenhuma inicializacao de models/.env/banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Model, Op } = require('sequelize');
// Reproduz a consolidacao usada pelo ORM, sem conexao SQL.
const duplicated = { include: [
  { model: { name: 'Fila' }, as: 'filaPagamentosManuais', where: { status: { [Op.in]: ['PENDENTE'] } } },
  { model: { name: 'Fila' }, as: 'filaPagamentosManuais', attributes: ['comprovante_hash'] }
] };
Model._uniqIncludes(duplicated);
assert.equal(duplicated.include.length, 1);
assert(duplicated.include[0].where.status[Op.in].includes('PENDENTE'), 'Alias repetido preservava filtro de fila ativa');
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'), 'utf8');
const start = source.indexOf('async function listarTitulosPorSolicitacao(');
const end = source.indexOf('\nasync function criarTituloPorSolicitacao(', start);
assert(start > 0 && end > start);
let full = true, allowed = true, scope = true, titleReads = 0, proofReads = 0, query;
const doc = { id: 30, nome_original: 'SOL-6278.pdf', caminho_arquivo: 'isolado://arquivo' };
const title = { id: 1, filaPagamentosManuais: [{ id: 9, status: 'BAIXADO', comprovante_hash: 'hash', comprovante_nome: 'pago.pdf', comprovantes: [] }] };
const models = { PagamentoManualFilaItem: {}, PagamentoManualFilaComprovante: {},
  Comprovante: { findAll: async options => {
    proofReads++; assert.equal(options.where.solicitacao_id, 6278);
    assert.equal(options.where.deleted_at, null); assert.equal(options.where.status, 'VINCULADO');
    assert(!options.attributes.includes('valor'), 'Valor extraido do nome nao prova valor pago');
    return [{ toJSON: () => doc }];
  } } };
const context = vm.createContext({
  canAccessFinanceiro: async () => full, canViewSolicitacaoFinanceiro: async () => allowed,
  registrarEventoSeguranca: async () => {}, createHttpError: (status, message) => Object.assign(new Error(message), { status }),
  carregarSolicitacaoFinanceira: async () => { if (!scope) throw Object.assign(new Error('fora do escopo'), { status: 403 }); return { id: 6278 }; },
  buildTituloInclude: () => [{ as: 'parceiro' }, { as: 'filaPagamentosManuais', where: { status: 'PENDENTE' } }],
  Parceiro: {}, FormaPagamentoFinanceira: {}, TituloFinanceiro: { findAll: async options => { titleReads++; query = options; return [title]; } },
  require: id => {
    if (id === '../models') return models;
    if (id === './tituloRenegociacaoVinculos') return { projetarOrigens: async titles => titles };
    throw Error(`Dependencia nao isolada: ${id}`);
  }
});
vm.runInContext(source.slice(start, end), context);
(async () => {
  for (full of [true, false]) {
    const result = await context.listarTitulosPorSolicitacao({ user: { id: 1 } }, 6278);
    const includes = query.include.filter(item => item.as === 'filaPagamentosManuais');
    assert.equal(includes.length, 1); assert.equal(includes[0].where, undefined);
    assert(includes[0].attributes.includes('comprovante_hash'));
    assert.equal(includes[0].include[0].as, 'comprovantes');
    assert.equal(result[0].filaPagamentosManuais[0].status, 'BAIXADO');
    assert.equal(result[0].comprovantesSolicitacao[0].nome_original, 'SOL-6278.pdf');
    assert(!('titulo_financeiro_id' in result[0].comprovantesSolicitacao[0]), 'Nao inventar vinculo de importacao');
    if (!full) {
      assert(!query.attributes.includes('conta_bancaria_id'));
      assert(query.attributes.includes('forma_pagamento_id'));
      const forma = query.include.find(item => item.as === 'formaPagamento');
      assert(forma, 'Leitura operacional tambem mostra a forma cadastrada no titulo');
      assert.deepEqual(Array.from(forma.attributes), ['id', 'nome'], 'Somente o rotulo, sem dados de banco/cartao');
      assert(!query.include.some(item => ['cartao', 'contaBancaria', 'beneficiarios'].includes(item.as)));
    }
  }
  allowed = false;
  await assert.rejects(context.listarTitulosPorSolicitacao({ user: { id: 1 } }, 6278), error => error.status === 403);
  allowed = true; scope = false;
  await assert.rejects(context.listarTitulosPorSolicitacao({ user: { id: 1 } }, 6278), error => error.status === 403);
  assert.equal(titleReads, 2); assert.equal(proofReads, 2);
  console.log('OK: alias unico sem filtro ativo, comprovantes de baixas, importacao vinculada a solicitacao, escopo e permissoes preservados. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
