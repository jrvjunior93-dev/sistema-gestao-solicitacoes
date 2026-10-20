'use strict';
// Fila, baixa, estorno e reconciliacao de contrato REAIS; somente models em
// memoria. Sem dotenv, database, conexao externa ou operacao financeira real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const h = require('./validarCartaoOpcionalSolicitacao');
const { state, models, dependencies, queueDependencies, registro } = h;
const { validateManualPaymentQueueProcessBody: validar } = require('../src/validators/paymentValidators');
const cents = value => Math.round(Number(value || 0) * 100);
function load(nome, deps, transformar = texto => texto) {
  const module = { exports: {} };
  vm.runInNewContext(transformar(fs.readFileSync(path.join(__dirname, `../src/services/${nome}.js`), 'utf8')), {
    module, console, Date, Intl, require(id) {
      if (!(id in deps)) throw Error(`Dependencia nao isolada: ${nome}/${id}`);
      return deps[id];
    }
  }, { filename: nome });
  return module.exports;
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    const valor = where[key];
    if (key === Symbol.for('or')) return valor.some(clause => matches(row, clause));
    if (Array.isArray(valor)) return valor.includes(row[key]);
    if (valor && typeof valor === 'object') return Reflect.ownKeys(valor).every(op =>
      op === Symbol.for('in') ? valor[op].includes(row[key]) : op === Symbol.for('ne') ? row[key] !== valor[op] : false);
    return row[key] === valor;
  });
}
models.PagamentoFilaLiquidacao = {
  findOne: async ({ where }) => state.grupos.find(row => matches(row, where)),
  findByPk: async id => state.grupos.find(row => row.id === Number(id)),
  create: async data => { const row = registro({ id: state.grupos.length + 1, ...data }); state.grupos.push(row); return row; }
};
models.PagamentoManualFilaItem.create = async data => {
  const row = registro({ id: state.fila.length + 1, ...data }); state.fila.push(row); return row;
};
models.MovimentoFinanceiro.findOne = async ({ where }) => state.movimentos.find(row => matches(row, where));
models.MovimentoFinanceiro.findByPk = async id => state.movimentos.find(row => row.id === Number(id));
models.MovimentoFinanceiro.findAll = async ({ where }) => state.movimentos.filter(row => matches(row, where));
models.ChequeTerceiro.findByPk = async id => state.cheques.find(row => row.id === Number(id));
models.SecurityEventLog = { create: async data => state.eventos.push(data) };
function parcelaInst(row) {
  if (!row) return null;
  const instance = { ...row, titulo: state.titulos.find(t => t.id === row.titulo_financeiro_id),
    async update(changes) { await row.update(changes); Object.assign(this, changes); return this; } };
  return instance;
}
models.Contrato = {
  findByPk: async id => state.contratos.find(row => row.id === Number(id))
};
models.ContratoParcela = {
  findOne: async ({ where }) => parcelaInst(state.parcelas.find(row => matches(row, where))),
  findByPk: async id => parcelaInst(state.parcelas.find(row => row.id === Number(id))),
  findAll: async ({ where, transaction }) => {
    assert(transaction, 'Reconciliacao deve usar a transacao da fila');
    return state.parcelas.filter(row => matches(row, where)).map(parcelaInst);
  }
};
models.MedicaoParcela = { findAll: async ({ where }) => state.medidas.filter(row => matches(row, where)) };
const contrato = load('medicaoContratoService', {
  sequelize: dependencies.sequelize, '../models': models,
  '../utils/codigoDoSetor': require('../src/utils/codigoDoSetor'),
  './contratoParcelasService': require('../src/services/contratoParcelasService'),
  './formasPagamentoMedicaoService': {}, './setorCapabilityService': {}, './medicaoAtualContratoService': {},
  './solicitacaoFavorecidosService': { projetarDivisoesNasParcelas: async () => {} }
});
const status = dependencies['./solicitacaoFinanceiroStatusService'];
status.sincronizarStatusSolicitacaoPorBaixaTitulos = async dados => {
  assert(dados.transaction, 'Sincronizacao deve ocorrer antes do commit');
  state.sincronizacoes.push({ id: dados.solicitacaoId, usuario: dados.usuarioId,
    principal: state.titulos.map(t => cents(t.valor_baixado)),
    ativos: state.movimentos.filter(m => m.status === 'ATIVO').length });
  // Mesmo destino do sincronizador canonico para contrato do fluxo novo.
  if (dados.solicitacaoId === 100) await contrato.reconciliarParcelasComOPago(3,
    { usuarioId: dados.usuarioId, setor: dados.setor }, dados.transaction);
  if (state.falharSincronizacao) throw Error('Falha simulada na sincronizacao final');
};
dependencies['./medicaoContratoService'] = contrato;
const tituloService = load('tituloFinanceiroService', dependencies);
queueDependencies['./tituloFinanceiroService'] = tituloService;
const fila = load('pagamentoManualFilaService', queueDependencies);
function liquidacao(legado = false) {
  return load('pagamentoFilaLiquidacaoService', { ...queueDependencies,
    './pagamentoFilaRateioDomain': require('../src/services/pagamentoFilaRateioDomain') },
  texto => legado ? texto.replace('adiarSincronizacaoSolicitacao: true', 'adiarSincronizacaoSolicitacao: false') : texto);
}
const corrigida = liquidacao();
const operador = { user: { id: 99, perfil: 'USUARIO', area: 'FINANCEIRO', setor: { codigo: 'FINANCEIRO' }, scope: [1] } };
const originais = [2740, 17300, 13500, 7483.11];
const pagos = [1653.09, 10437.41, 8144.80, 4514.70];
const descontos = [1086.91, 6862.59, 5355.20, 2968.41];
async function preparar({ legado = false, carteira = false, usuario = operador } = {}) {
  h.reset(); Object.assign(state, { grupos: [], contratos: [], parcelas: [], medidas: [], sincronizacoes: [], falharSincronizacao: false });
  h.solicitacao.valor = 41023.11;
  await h.gerar(originais.map(valor => h.pagamento(3, undefined, valor)));
  state.titulos.forEach(h.colocarNaFila);
  state.titulos[2].origem_titulo = 'CONTRATO';
  state.contratos.push(registro({ id: 3, codigo: 'CT-0003', fluxo_novo: true, solicitacao_id: 100 }));
  state.parcelas.push(registro({ id: 3, numero: 1, contrato_id: 3, titulo_financeiro_id: 3, valor: 13500, status: 'APROVADA' }));
  state.medidas.push(registro({ id: 1, contrato_parcela_id: 3, valor_medido: 13500, devolvido_em: null }));
  queueDependencies['./pagamentoFilaLiquidacaoService'] = legado ? liquidacao(true) : corrigida;
  if (carteira) state.cheques.push(registro({ id: 77, empresa_id: 1, status: 'EM_CARTEIRA', valor: 8250 }));
  const payload = validar({ idempotency_key: 'cheques-contrato-descontos',
    itens: state.fila.map((row, i) => h.itemFila(row, { valor_pago: pagos[i], desconto: descontos[i] })),
    instrumentos_lote: { tipo: 'CHEQUE', forma_pagamento_id: 4, componentes: [0, 1, 2].map(i =>
      carteira && i === 2 ? { valor_pago: 8250, usar_cheque_terceiro: true, cheque_terceiro_id: 77 }
        : { valor_pago: 8250, cheque_numero: `000${i + 1}`, cheque_emitente: 'Empresa QA', data_emissao: '2026-10-20', data_vencimento: '2026-11-20' }) }
  });
  return { payload, usuario };
}
// Log de seguranca da tentativa pode crescer em replay, sem duplicar financeiro.
const financeiro = () => JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => !['commits', 'rollbacks', 'eventos'].includes(key))));
async function main() {
  // Prova do defeito com servicos reais e o mesmo rateio de centavos do print.
  let { payload } = await preparar({ legado: true });
  let antes = financeiro();
  await assert.rejects(fila.registrarBaixasFila(operador, payload), /O valor pago passa em R\$ 4499\.99/);
  assert.equal(financeiro(), antes, 'Falha antiga tambem deve reverter toda escrita');
  assert.equal(state.movimentos.length, 0);

  for (const usuario of [operador, { user: { ...operador.user, id: 1, perfil: 'SUPERADMIN' } }]) {
    ({ payload } = await preparar({ usuario }));
    const retorno = await fila.registrarBaixasFila(usuario, payload);
    assert.equal(retorno.baixados, 4); assert.equal(state.movimentos.length, 12);
    assert(state.titulos.every(t => t.status === 'QUITADO' && cents(t.valor_saldo) === 0));
    assert.equal(state.movimentos.reduce((s, m) => s + cents(m.valor), 0), 4102311);
    assert.equal(state.movimentos.reduce((s, m) => s + cents(m.desconto), 0), 1627311);
    for (const numero of ['0001', '0002', '0003']) assert.equal(state.movimentos.filter(m => m.cheque_numero === numero)
      .reduce((s, m) => s + cents(m.valor) - cents(m.desconto), 0), 825000);
    assert.equal(state.parcelas[0].valor, 13500); assert.equal(state.medidas[0].valor_medido, 13500);
    assert.equal(state.historico.filter(e => e.acao === 'TITULO_FINANCEIRO_BAIXADO').length, 12);
    assert.equal(state.historico.filter(e => e.acao === 'PARCELA_AJUSTADA_PELA_BAIXA').length, 0);
    assert.equal(state.sincronizacoes.length, 1, 'Uma sincronizacao por solicitacao do grupo, nao por cheque');
    assert.equal(state.sincronizacoes[0].ativos, 12);
    assert.equal(state.sincronizacoes[0].usuario, usuario.user.id);
    antes = financeiro();
    await fila.registrarBaixasFila(usuario, payload);
    assert.equal(financeiro(), antes, 'Replay nao cria movimentos, historicos ou reconciliacoes');
    await assert.rejects(tituloService.estornarMovimentoTitulo(usuario, 3, state.movimentos[6].id, {}), /grupo completo/);
    await assert.rejects(fila.estornarBaixaFila({ user: { ...usuario.user, scope: [] } }, 1,
      { motivo: 'QA negado' }), /Acesso negado/);
    assert.equal(financeiro(), antes, 'Negativa de escopo preserva todo o grupo');
    const result = await fila.estornarBaixaFila(usuario, 1, { motivo: 'QA grupo integral' });
    assert.equal(result.reaberto_ids.length, 4);
    assert(state.movimentos.every(m => m.status === 'ESTORNADO'));
    state.titulos.forEach((t, i) => { assert.equal(cents(t.valor_saldo), cents(originais[i])); assert.equal(cents(t.valor_baixado), 0); });
    assert.equal(state.parcelas[0].valor, 13500); assert.equal(state.medidas[0].valor_medido, 13500);
    assert.equal(state.sincronizacoes.length, 2); assert.equal(state.sincronizacoes[1].ativos, 0);
    assert.equal(state.historico.filter(e => e.acao === 'TITULO_FINANCEIRO_ESTORNADO').length, 12);
    state.fila.slice(4).forEach((row, i) => assert.equal(cents(row.valor_previsto), cents(originais[i])));
    antes = financeiro();
    await fila.estornarBaixaFila(usuario, 2, { motivo: 'Replay grupo' });
    assert.equal(financeiro(), antes);
  }

  // Solicitacoes distintas: nenhuma observa titulos apenas parcialmente baixados.
  ({ payload } = await preparar());
  state.titulos.forEach((titulo, i) => { titulo.solicitacao_id = [6253, 6286, 100, 5669][i]; });
  await fila.registrarBaixasFila(operador, payload);
  assert.equal(state.sincronizacoes.length, 4);
  assert.deepEqual(state.sincronizacoes.map(s => s.id), [100, 5669, 6253, 6286]);
  assert(state.sincronizacoes.every(s => s.ativos === 12 && s.principal.every((valor, i) => valor === cents(originais[i]))));
  await fila.estornarBaixaFila(operador, 1, { motivo: 'Estorno entre solicitacoes' });
  assert.equal(state.sincronizacoes.length, 8);
  assert(state.sincronizacoes.slice(4).every(s => s.ativos === 0 && s.principal.every(valor => valor === 0)));

  // Falha final depois de consumir a carteira desfaz grupo/cheques/auditoria.
  ({ payload } = await preparar({ carteira: true })); state.falharSincronizacao = true;
  antes = financeiro();
  await assert.rejects(fila.registrarBaixasFila(operador, payload), /sincronizacao final/);
  assert.equal(financeiro(), antes); assert.equal(state.cheques[0].status, 'EM_CARTEIRA');
  state.falharSincronizacao = false;
  await fila.registrarBaixasFila(operador, payload);
  assert.equal(state.cheques[0].status, 'UTILIZADO'); assert.equal(state.chequeEventos.length, 1);
  state.falharSincronizacao = true; antes = financeiro();
  await assert.rejects(fila.estornarBaixaFila(operador, 1, { motivo: 'Falha final estorno' }), /sincronizacao final/);
  assert.equal(financeiro(), antes); assert(state.movimentos.every(m => m.status === 'ATIVO'));
  state.falharSincronizacao = false;
  await fila.estornarBaixaFila(operador, 1, { motivo: 'Estorno grupo' });
  assert.equal(state.cheques[0].status, 'EM_CARTEIRA'); assert.equal(state.chequeEventos.length, 2);

  // Adiamento nao libera valor acima do saldo nem cheque repetido.
  ({ payload } = await preparar()); payload.itens[0].desconto += 0.01; antes = financeiro();
  await assert.rejects(fila.registrarBaixasFila(operador, payload), /acima do saldo|baixados juntos/);
  assert.equal(financeiro(), antes);
  ({ payload } = await preparar());
  payload.instrumentos_lote.componentes[1].cheque_numero = '0001'; antes = financeiro();
  await assert.rejects(fila.registrarBaixasFila(operador, payload), /mesmo cheque/);
  assert.equal(financeiro(), antes);

  // Baixa avulsa continua usando a regra de contrato atual; nao transformamos
  // pagamento parcial definitivo em novo comportamento geral.
  await preparar();
  await tituloService.baixarTitulo(operador, 3, { empresa_id: 1, conta_bancaria_id: 5,
    forma_pagamento_id: 4, valor: 4499.99, desconto: 1785.06,
    cheque_numero: 'avulso', cheque_emitente: 'Empresa QA', data_movimento: '2026-10-20' });
  assert.equal(state.sincronizacoes.length, 1);
  assert.equal(state.parcelas[0].valor, 4499.99);
  assert.equal(state.titulos[2].valor_saldo, 0, 'Regra legada avulsa mantida');

  // Opcao interna nao e payload publico e nao pode dispensar transacao/grupo.
  await assert.rejects(tituloService.baixarTitulo(operador, 1, {}, { adiarSincronizacaoSolicitacao: true }), /liquidacao interna/);
  await assert.rejects(tituloService.baixarTitulo(operador, 1, {}, { filaLiquidacaoId: 1, adiarSincronizacaoSolicitacao: true }), /transacao interna/);
  await assert.rejects(tituloService.estornarMovimentoTitulo(operador, 1, 1, {}, { adiarSincronizacaoSolicitacao: true }), /estorno interno/);
  assert.throws(() => validar({ ...payload, adiarSincronizacaoSolicitacao: true }));
  const rotas = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert(rotas.split(/\r?\n/).find(l => l.includes("'/financeiro/fila-pagamentos/baixar'")).includes('allowFilaPagamentosBaixa'));
  console.log('Contrato/cheques: defeito4499.99 reproduzido; 4 titulos41023.11, descontos16273.11, 3 cheques8250, centavos/historico/Financeiro e superadmin, sincronizacao final unica, replay, estorno integral/escopo e rollback final/carteira aprovados. Sem banco/rede.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
