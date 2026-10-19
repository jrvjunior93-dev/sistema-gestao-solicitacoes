'use strict';
// Servicos reais; modelos, transacoes/locks e fronteiras externas simulados.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const h = require('./validarCartaoOpcionalSolicitacao');
const { validarFilaBaixaComposta: validar } = require('../src/validators/filaBaixaCompostaValidator');
const { state, models, dependencies: deps, queueDependencies: qdeps, registro, req } = h;
function load(nome, dependencias) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', nome + '.js'), 'utf8'), {
    module, Date, Intl, console, require: id => { if (!(id in dependencias)) throw Error('Dependencia nao isolada: ' + id); return dependencias[id]; }
  }, { filename: nome });
  return module.exports;
}
const Op = deps.sequelize.Op;
const matches = (row, where = {}) => Reflect.ownKeys(where).every(k => k === Op.or ? where[k].some(c => matches(row, c))
  : where[k] && typeof where[k] === 'object' ? Reflect.ownKeys(where[k]).every(op => op === Op.in ? where[k][op].includes(row[k]) : false) : row[k] === where[k]);
const perms = ['financeiro.baixas_compostas.criar', 'financeiro.baixas_compostas.confirmar', 'financeiro.baixas_compostas.estornar', 'financeiro.permutas.usar'];
const auth = { canAccessFinanceiro: async u => u.finance !== false, canBaixarFilaPagamentos: async u => u.fila !== false,
  userHasAreaPermission: async (u, keys) => keys.some(k => u.perms.includes(k)),
  userHasStrictAreaPermission: async (u, keys) => keys.every(k => u.perms.includes(k)), getFinanceiroObraScopeIds: async u => u.scope ?? null };
const contas = [h.conta, { id: 6, nome: 'Caixa QA', empresa_id: 1, ativo: true, tipo_operacional: 'CAIXA_INTERNO', exige_abertura_fechamento: true },
  { id: 7, nome: 'Conta empresa2', empresa_id: 2, ativo: true }];
h.formas.push({ id: 8, tipo: 'DINHEIRO', nome: 'Dinheiro', ativo: true }, { id: 9, tipo: 'PERMUTA', nome: 'Permuta', ativo: true });
models.FormaPagamentoFinanceira.findAll = async ({ where, lock, transaction }) => {
  assert.equal(lock, transaction.LOCK.UPDATE, 'Catalogo revalidado com lock na transacao');
  return h.formas.filter(f => matches(f, where));
};
models.ContaBancaria.findAll = async ({ where }) => contas.filter(c => matches(c, where));
models.ContaBancaria.findByPk = async id => contas.find(c => c.id === Number(id));
models.CartaoFinanceiro.findAll = async ({ where }) => h.cartoes.filter(c => matches(c, where));
models.EmpresaGrupo.findByPk = async id => [1, 2].includes(Number(id)) ? { id: Number(id), ativo: true } : null;
models.EmpresaGrupo.findAll = async ({ where }) => [1, 2].map(id => ({ id, ativo: true })).filter(e => matches(e, where));
models.TituloCompartilhadoOrigem = { findOne: async () => null, findAll: async ({ where }) => (state.origens || []).filter(o => matches(o, where)) };
models.PagamentoFilaLiquidacao = { findOne: async ({ where }) => state.grupos.find(g => matches(g, where)),
  findByPk: async id => state.grupos.find(g => g.id === Number(id)),
  create: async data => { const r = registro({ id: state.grupos.length + 1, ...data }); state.grupos.push(r); return r; } };
models.MovimentoFinanceiro.findAll = async ({ where }) => state.movimentos.filter(m => matches(m, where));
models.MovimentoFinanceiro.findOne = async ({ where }) => state.movimentos.find(m => matches(m, where));
models.MovimentoFinanceiro.findByPk = async id => state.movimentos.find(m => m.id === Number(id));
models.ChequeTerceiro.findByPk = async id => state.cheques.find(c => c.id === Number(id));
models.PagamentoManualFilaItem.create = async data => { const r = registro({ id: state.fila.length + 1, ...data }); state.fila.push(r); return r; };
// Sequelize nao compartilha uma identidade de instancia entre SELECTs. A lista
// inicial deve permanecer um snapshot, mesmo apos o processador reler/atualizar.
const listarFilas = models.PagamentoManualFilaItem.findAll;
models.PagamentoManualFilaItem.findAll = async options => (await listarFilas(options)).map(row => ({ ...row }));
models.SecurityEventLog = { create: async e => { state.eventos.push(e); return e; } };
const caixa = { contaExigeSessao: c => c?.tipo_operacional === 'CAIXA_INTERNO',
  obterSessaoAbertaParaConta: async (c, data, options) => {
    if ((options.exigir || caixa.contaExigeSessao(c)) && !state.caixaAberto) throw Error('Abra o caixa antes de registrar');
    return caixa.contaExigeSessao(c) ? { id: 1, empresa_id: c.empresa_id } : null;
  } };
deps['./financeiroCaixaSessionHelper'] = caixa;
const permuta = load('permutaOperacionalDomain', { './authorizationService': auth });
deps['./permutaOperacionalDomain'] = permuta;
qdeps['./authorizationService'] = { ...qdeps['./authorizationService'], ...auth };
const compartilhadoPagamento = load('tituloCompartilhadoPagamento', { 'node:crypto': require('node:crypto'), '../models': models, sequelize: deps.sequelize });
const compartilhadoLeitura = load('tituloCompartilhadoLeitura', { sequelize: deps.sequelize, './tituloRenegociacaoBaixas': {},
  './tituloRenegociacaoDomain': {}, '../models': models, './authorizationService': auth });
// Projecao visual fora deste teste. A guarda de todas as obras e o pagamento
// entre devedoras usam os servicos reais, nao stubs que liberam o escopo.
compartilhadoLeitura.anexarParticipacoes = async titulos => titulos;
deps['./tituloCompartilhadoLeitura'] = compartilhadoLeitura;
deps['./tituloCompartilhadoPagamento'] = compartilhadoPagamento;
qdeps['./tituloCompartilhadoLeitura'] = compartilhadoLeitura;
qdeps['./tituloCompartilhadoPagamento'] = compartilhadoPagamento;
const canonico = load('tituloFinanceiroService', deps);
qdeps['./tituloFinanceiroService'] = canonico;
qdeps['./permutaOperacionalDomain'] = permuta;
qdeps['./securityLogService'].getRequestIp = () => null;
const fila = load('pagamentoManualFilaService', qdeps);
const liquidacao = load('pagamentoFilaLiquidacaoService', { ...qdeps, './tituloFinanceiroService': canonico,
  './pagamentoFilaRateioDomain': require('../src/services/pagamentoFilaRateioDomain') });
qdeps['./pagamentoFilaLiquidacaoService'] = liquidacao;
const composto = load('chequeTerceiroService', { crypto: require('node:crypto'), exceljs: {}, sequelize: deps.sequelize, '../models': models,
  './tituloFinanceiroService': canonico, './parceiroService': {}, './securityLogService': qdeps['./securityLogService'],
  './conciliacaoEstornoService': {}, './financeiroCaixaSessionHelper': caixa, './comercialService': {} });
const servico = load('filaBaixaCompostaService', { 'node:crypto': require('node:crypto'), sequelize: deps.sequelize, '../models': models,
  './authorizationService': auth, '../validators/filaBaixaCompostaValidator': { validarFilaBaixaComposta: validar },
  './chequeTerceiroService': composto, './pagamentoManualFilaService': fila, './tituloFinanceiroService': canonico,
  './tituloBloqueioRetornoObraService': qdeps['./tituloBloqueioRetornoObraService'],
  './pagamentoFilaChequesDomain': require('../src/services/pagamentoFilaChequesDomain'),
  './pagamentoFilaComprovanteDomain': require('../src/services/pagamentoFilaComprovanteDomain'), './permutaOperacionalDomain': permuta,
  './tituloCompartilhadoLeitura': compartilhadoLeitura, './tituloCompartilhadoPagamento': compartilhadoPagamento,
  './securityLogService': qdeps['./securityLogService'] });
async function preparar(n = 1) {
  h.reset(); state.grupos = []; state.origens = []; state.caixaAberto = true; req.user.perms = [...perms]; req.user.finance = true; req.user.fila = true; delete req.user.scope;
  for (let i = 0; i < n; i++) { const t = await h.gerar([h.pagamento(3)]); h.colocarNaFila(t); }
  return { fila_ids: state.fila.map(f => f.id), data_movimento: '2026-10-18', empresa_id: 1,
    componentes: [{ empresa_id: 1, forma_pagamento_id: 3, conta_bancaria_id: 5, valor: 120 * n },
      { empresa_id: 1, forma_pagamento_id: 8, conta_bancaria_id: 6, valor: 80 * n }],
    alocacoes: state.titulos.flatMap(t => [{ componente_index: 0, titulo_financeiro_id: t.id, valor: 120 }, { componente_index: 1, titulo_financeiro_id: t.id, valor: 80 }]) };
}
const revisar = async body => ({ ...body, versao_revisao: (await servico.previewFilaBaixaComposta(req, body)).versao_revisao });
const semEscrita = () => { assert.equal(state.movimentos.length, 0); assert.equal(state.grupos.length, 0); assert(state.fila.every(f => f.status === 'PENDENTE')); };
(async () => {
  let body = await preparar(2);
  state.fila[1].comprovante_hash = null; state.fila[1].comprovante_url = null;
  const inicial = JSON.stringify(state);
  const previa = await revisar(body);
  assert.equal(JSON.stringify({ ...state, commits: 0 }), JSON.stringify({ ...JSON.parse(inicial), commits: 0 }), 'Preview nao grava registros');
  assert.equal(previa.versao_revisao.length, 64);
  const result = await servico.confirmarFilaBaixaComposta(req, previa, 'qa-2titulos');
  assert.equal(result.baixados, 2); assert.equal(result.pendentes_comprovante, 1); assert.equal(result.divergentes, 0);
  assert.equal(state.movimentos.length, 4); assert.equal(state.grupos.length, 1);
  assert(state.titulos.every(t => t.valor_saldo === 0)); assert(state.fila.every(f => f.status === 'BAIXADO'));
  assert.deepEqual(state.movimentos.map(m => m.valor), [120, 80, 120, 80]);
  assert.equal(state.grupos[0].dados.componentes[0].valor, 240);
  assert.equal(state.fila[0].instrumento_pagamento_json.instrumentos[0].valor, 120, 'Snapshot da linha nao expoe total de outras obras');
  assert(state.movimentos.every(m => m.fila_liquidacao_id === state.grupos[0].id));
  assert(state.eventos.some(e => e.tipo_evento === 'MANUAL_PAYMENT_QUEUE_COMPOSED_SETTLED'));
  const replay = await servico.confirmarFilaBaixaComposta(req, previa, 'qa-2titulos');
  assert(replay.idempotente); assert.equal(state.movimentos.length, 4);
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, { ...previa, observacoes: 'outro' }, 'qa-2titulos'), /Chave ja/);
  await assert.rejects(canonico.estornarMovimentoTitulo(req, 1, state.movimentos[0].id, {}), /grupo completo/);
  req.user.perms = perms.filter(p => !p.endsWith('.estornar'));
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'r' }), /Permissao/);
  assert(state.movimentos.every(m => m.status === 'ATIVO')); req.user.perms = [...perms];
  const reversao = await fila.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'r' });
  assert.equal(reversao.reaberto_ids.length, 2); assert(state.titulos.every(t => t.valor_saldo === 200));
  await fila.estornarBaixaFila(req, 2, { motivo: 'QA', idempotency_key: 'r2' }); assert.equal(state.fila.length, 4);
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, previa, 'qa-2titulos'), /Chave ja/);
  for (const permission of perms.slice(0, 2)) {
    body = await preparar(); const p = await revisar(body); req.user.perms = perms.filter(k => k !== permission);
    await assert.rejects(servico.confirmarFilaBaixaComposta(req, p, 'negado'), /Acesso negado/); semEscrita();
  }
  for (const field of ['finance', 'fila']) {
    body = await preparar(); req.user[field] = false; await assert.rejects(revisar(body), /Acesso negado/); semEscrita();
  }
  body = await preparar(); req.user.scope = [2]; await assert.rejects(revisar(body), /Acesso negado/); semEscrita();
  for (const mudanca of [{ bloqueio_pagamento_proprietario: true }, { bloqueado_retorno_obra: true },
    { origem_titulo: 'RH_DP', status_interno_pagar: 'EM EDICAO DP' }, { status: 'QUITADO' }, { status: 'EXCLUIDO' }]) {
    body = await preparar(); Object.assign(state.titulos[0], mudanca); await assert.rejects(revisar(body)); semEscrita();
  }
  body = await preparar(); state.caixaAberto = false; await assert.rejects(revisar(body), /caixa/); semEscrita();
  body = await preparar(); body.componentes[1] = { empresa_id: 1, forma_pagamento_id: 2, cartao_id: 20, conta_bancaria_id: 5, valor: 80 };
  await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'debito'); assert.equal(state.movimentos[1].forma_recebimento, 'CARTAO_DEBITO');
  body = await preparar(); body.componentes[1] = { empresa_id: 1, forma_pagamento_id: 1, cartao_id: 10, conta_bancaria_id: 5, valor: 80 };
  await assert.rejects(revisar(body), /credito|fatura/i); semEscrita();
  body = await preparar(); body.componentes[1] = { empresa_id: 1, forma_pagamento_id: 9, valor: 80, documento_referencia: 'Acordo' };
  req.user.perms = perms.filter(k => k !== 'financeiro.permutas.usar'); await assert.rejects(revisar(body), /Acesso negado/); semEscrita();
  req.user.perms = [...perms]; await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'permuta');
  assert.equal(state.movimentos[1].conta_bancaria_id, null); assert.equal(state.movimentos[1].forma_recebimento, 'PERMUTA');
  body = await preparar(); body.componentes[0].conta_bancaria_id = 7; body.componentes[0].empresa_id = 2;
  await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'empresas');
  assert.equal(state.movimentos[0].empresa_id, 2); assert.equal(state.titulos[0].empresa_id, 1, 'Nao reclassifica a divida pela fonte');
  body = await preparar(); state.titulos[0].compartilhamento_id = 10; state.titulos[0].empresa_id = null;
  state.origens = [{ titulo_financeiro_id: 1, empresa_id: 1, obra_id: 1 }, { titulo_financeiro_id: 1, empresa_id: 2, obra_id: 2 }];
  req.user.scope = [1]; await assert.rejects(revisar(body), /todas as obras/); semEscrita();
  req.user.scope = [1, 2]; await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'compartilhado');
  assert.equal(state.titulos[0].empresa_id, null); assert.equal(state.titulos[0].valor_saldo, 0);
  assert(state.movimentos.every(m => m.empresa_destino_id === null && m.empresa_origem_id === 1));
  body = await preparar(); body.componentes[1] = { empresa_id: 1, forma_pagamento_id: 4, conta_bancaria_id: 5, valor: 80, cheque_numero: '003', cheque_emitente: 'QA' };
  await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'cheque-proprio'); assert.equal(state.movimentos[1].cheque_numero, '003');
  body = await preparar(2); body.componentes[1] = { empresa_id: 1, forma_pagamento_id: 4, cheque_terceiro_id: 77, valor: 160 };
  state.cheques.push(registro({ id: 77, empresa_id: 1, status: 'EM_CARTEIRA', valor: 160 }));
  await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'carteira'); assert.equal(state.chequeEventos.length, 1); assert.equal(state.cheques[0].status, 'UTILIZADO');
  await fila.estornarBaixaFila(req, 1, { motivo: 'QA carteira', idempotency_key: 'rc' });
  assert.equal(state.cheques[0].status, 'EM_CARTEIRA'); assert.equal(state.chequeEventos.length, 2);
  body = await preparar(); let p = await revisar(body); state.titulos[0].valor_saldo = 201;
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, p, 'stale'), /parcial|mudaram/); semEscrita();
  body = await preparar(); p = await revisar(body); contas[0].empresa_id = 2;
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, p, 'fonte-stale'), /mudaram/); contas[0].empresa_id = 1; semEscrita();
  body = await preparar(); body.componentes[1].valor = 30; body.alocacoes[1].valor = 30;
  state.fila[0].comprovante_hash = null; state.fila[0].comprovante_url = null;
  await assert.rejects(revisar(body), /justificativa/); body.observacoes = 'Saldo para proximo pagamento';
  const parcial = await servico.confirmarFilaBaixaComposta(req, await revisar(body), 'parcial');
  assert.equal(parcial.divergentes, 1); assert.equal(parcial.pendentes_comprovante, 1);
  assert.equal(state.titulos[0].valor_saldo, 50); assert.equal(state.fila[0].status, 'DIVERGENTE');
  body = await preparar(); p = await revisar(body); const criar = models.MovimentoFinanceiro.create; let count = 0;
  models.MovimentoFinanceiro.create = async (...args) => { if (++count === 2) throw Error('Falha segunda fonte'); return criar(...args); };
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, p, 'rollback'), /segunda fonte/); models.MovimentoFinanceiro.create = criar; semEscrita();
  body = await preparar(); p = await revisar(body); const auditar = models.SecurityEventLog.create;
  models.SecurityEventLog.create = async () => { throw Error('Falha auditoria'); };
  await assert.rejects(servico.confirmarFilaBaixaComposta(req, p, 'audit'), /auditoria/); models.SecurityEventLog.create = auditar; semEscrita();
  for (const alterar of [b => b.fila_ids.push(b.fila_ids[0]), b => b.fila_ids = [-1], b => b.autorizadoPorFilaPagamento = true,
    b => b.componentes[0].filaLiquidacaoId = 1, b => b.alocacoes.push(b.alocacoes[0]), b => b.componentes[0].valor = Infinity,
    b => b.data_movimento = '2026-02-31', b => b.componentes[0].juros = 1, b => b.alocacoes[0].componente_index = null]) {
    const b = structuredClone(await preparar()); alterar(b); assert.throws(() => validar(b));
  }
  body = await preparar(); body.alocacoes[0].titulo_financeiro_id = 99999;
  await assert.rejects(revisar(body), /somente os titulos/); semEscrita();
  body = await preparar(); state.fila[0].juros = 1;
  await assert.rejects(revisar(body), /encargos/); semEscrita();
  body = await preparar(); p = await revisar(body);
  await servico.confirmarFilaBaixaComposta(req, p, 'x'.repeat(80)); assert.equal(state.grupos[0].idempotency_key.length, 64);
  // Duas chamadas simultaneas compartilham o lock de titulo no MySQL. A
  // fronteira abaixo serializa transacoes em memoria para conferir o replay;
  // nao e uma medicao de concorrencia em um MySQL real.
  body = await preparar(); p = await revisar(body);
  const txReal = models.sequelize.transaction; let anterior = Promise.resolve();
  models.sequelize.transaction = cb => { const proxima = anterior.then(() => txReal(cb)); anterior = proxima.catch(() => {}); return proxima; };
  try {
    const respostas = await Promise.all([1, 2].map(() => servico.confirmarFilaBaixaComposta(req, p, 'simultaneo')));
    assert.equal(respostas.filter(r => r.idempotente).length, 1); assert.equal(state.movimentos.length, 2);
  } finally { models.sequelize.transaction = txReal; }
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("'/financeiro/fila-pagamentos/baixas-compostas/preview', allowFilaPagamentosBaixa, allowBaixaCompostaCriar"));
  assert(routes.includes("'/financeiro/fila-pagamentos/baixas-compostas/confirmar', allowFilaPagamentosBaixa, allowBaixaCompostaCriar, allowBaixaCompostaConfirmar"));
  console.log('Fila multiplas fontes: servicos reais, PIX+dinheiro/debito/permuta/carteira, parcial, ACL/escopo/estorno, bloqueios, preview sem escrita, revisao obsoleta, replay, grupo/estorno integral e rollback aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
