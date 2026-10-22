'use strict';
// Service real, persistencia/locks em memoria. Nenhuma conexao ou baixa real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Op } = require('sequelize');
const grupos = require('../src/services/conciliacaoGruposMatch');
const arquivo = path.resolve(__dirname, '../src/services/conciliacaoBancariaService.js');
const realRequire = createRequire(arquivo);
const clone = obj => structuredClone(obj);
const banco = id => ({ id, conta_bancaria_id: 9, empresa_id: 2, valor: -100,
  data_movimento: '2026-10-22', descricao_banco: 'Pagamento fornecedor', status: 'PENDENTE',
  deleted_at: null, movimento_financeiro_id: null, titulo_financeiro_id: null,
  transferencia_financeira_id: null, fatura_cartao_id: null, createdAt: id });
const titulo = (id = 77) => ({ id, codigo: `TIT-009${id}`, tipo: 'PAGAR', obra_id: 3,
  descricao: 'Compra QA', numero_documento: 'NF QA', valor_saldo: 400, valor_baixado: 200,
  parceiro: { id: 1, nome: 'Parceiro QA' } });
const movimento = (id, tituloId = 77) => ({ id, titulo_financeiro_id: tituloId,
  conta_bancaria_id: 9, empresa_id: 2, valor: 100, valor_quitacao: 100,
  data_movimento: '2026-10-22', tipo_movimento: 'BAIXA', status: 'ATIVO',
  forma_recebimento: 'PIX', conciliacao_bancaria_id: null });

function atende(row, where = {}) {
  return Reflect.ownKeys(where).every(k => {
    const cond = where[k];
    if (k === Op.or) return cond.some(w => atende(row, w));
    if (k === Op.and) return cond.every(w => atende(row, w));
    const value = row[k] ?? null;
    if (cond && typeof cond === 'object') return Reflect.ownKeys(cond).every(op => {
      if (op === Op.in) return cond[op].includes(value);
      if (op === Op.ne) return value !== cond[op];
      if (op === Op.between) return value >= cond[op][0] && value <= cond[op][1];
      if (op === Op.gte) return value >= cond[op];
      if (op === Op.lte) return value <= cond[op];
      if (op === Op.like) return String(value || '').includes(cond[op].replaceAll('%', ''));
      throw Error('Operador QA nao implementado: ' + String(op));
    });
    return value === cond;
  });
}

function ambiente(bancos, movimentos, titulos = [titulo()]) {
  const stores = { ConciliacaoBancaria: clone(bancos), MovimentoFinanceiro: clone(movimentos),
    TituloFinanceiro: clone(titulos), ContaBancaria: [{ id: 9, empresa_id: 2, nome: 'Conta QA', ativo: true }],
    User: [{ id: 1, nome: 'QA' }] };
  const logs = [], queries = [], locks = new Map(), ordemLocks = [];
  let alterarAntesLock = null, falharCheque = null;
  const sequelize = { async transaction() {
    const staged = new Map(), held = new Map();
    return { LOCK: { UPDATE: 'UPDATE' }, finished: null, staged,
      async lock(key) {
        if (held.has(key)) return;
        const anterior = locks.get(key) || Promise.resolve();
        let release;
        const atual = new Promise(resolve => { release = resolve; });
        locks.set(key, atual); await anterior; held.set(key, release); ordemLocks.push(key);
      },
      async commit() {
        for (const [key, row] of staged) {
          const [name, id] = key.split(':');
          const index = stores[name].findIndex(r => r.id === Number(id));
          stores[name][index] = clone(row);
        }
        this.finished = 'commit'; for (const release of held.values()) release();
      },
      async rollback() { this.finished = 'rollback'; for (const release of held.values()) release(); }
    };
  } };
  const models = { sequelize };
  function ler(name, id, transaction) {
    return transaction?.staged.get(`${name}:${id}`) || stores[name]?.find(r => r.id === id);
  }
  function wrapper(name, original, options) {
    if (!original) return null;
    const row = clone(original), tx = options.transaction;
    if (name === 'MovimentoFinanceiro' && options.include) {
      row.titulo = clone(ler('TituloFinanceiro', row.titulo_financeiro_id, tx));
      row.contaBancaria = clone(stores.ContaBancaria[0]);
    }
    return Object.assign(row, { toJSON() { const out = { ...this }; delete out.update; delete out.reload; delete out.toJSON; return clone(out); },
      async reload() { return this; },
      async update(changes, updateOptions = {}) {
        const key = `${name}:${row.id}`, transaction = updateOptions.transaction;
        assert(transaction, 'Toda escrita deste fluxo deve estar em transacao');
        assert(['ConciliacaoBancaria', 'MovimentoFinanceiro'].includes(name), 'Nao pode alterar titulos/valores');
        if (name === 'MovimentoFinanceiro') assert.deepEqual(Object.keys(changes), ['conciliacao_bancaria_id']);
        transaction.staged.set(key, { ...ler(name, row.id, transaction), ...clone(changes) });
        Object.assign(this, changes); return this;
      }
    });
  }
  for (const name of ['ConciliacaoBancaria', 'MovimentoFinanceiro', 'TituloFinanceiro', 'ContaBancaria', 'User',
    'ConciliacaoBancariaImportacao', 'CategoriaFinanceira', 'FaturaCartaoFinanceiro', 'CartaoFinanceiro',
    'ChequeTerceiro', 'ChequeTerceiroMovimento', 'Obra', 'Parceiro', 'TransferenciaFinanceira']) {
    models[name] = {
      async findAll(options = {}) {
        queries.push({ name, options });
        let rows = (stores[name] || []).map(r => ler(name, r.id, options.transaction)).filter(r => atende(r, options.where));
        for (const include of options.include || []) {
          if (name === 'MovimentoFinanceiro' && include.as === 'titulo' && include.required)
            rows = rows.filter(r => atende(ler('TituloFinanceiro', r.titulo_financeiro_id, options.transaction) || {}, include.where));
        }
        if (options.group) return ['PENDENTE', 'CONCILIADO'].map(status => {
          const grupo = rows.filter(r => r.status === status);
          return { status, total: grupo.length, valor_total: grupo.reduce((s, r) => s + r.valor, 0),
            valor_absoluto_total: grupo.reduce((s, r) => s + Math.abs(r.valor), 0) };
        });
        if (options.order) rows.sort((a, b) => {
          for (const [campo, direcao] of options.order) {
            if (a[campo] !== b[campo]) return (a[campo] > b[campo] ? 1 : -1) * (direcao === 'DESC' ? -1 : 1);
          } return 0;
        });
        rows = rows.slice(options.offset || 0, options.limit ? (options.offset || 0) + options.limit : undefined);
        return rows.map(r => options.raw ? clone(r) : wrapper(name, r, options));
      },
      async findOne(options = {}) { return (await this.findAll(options))[0] || null; },
      async count(options) { return (await this.findAll({ ...options, raw: true })).length; },
      async findByPk(id, options = {}) {
        if (options.lock) {
          if (alterarAntesLock) { const alterar = alterarAntesLock; alterarAntesLock = null; alterar(stores); }
          await options.transaction.lock(`${name}:${id}`);
        }
        return wrapper(name, ler(name, Number(id), options.transaction), options);
      }
    };
  }
  const naoChamar = () => { throw Error('Operacao financeira fora do escopo QA'); };
  const stubs = {
    '../models': models,
    './authorizationService': { canAccessFinanceiro: async u => u.allow !== false, getFinanceiroObraScopeIds: async u => u.obras ?? null },
    './securityLogService': { registrarEventoSeguranca: async e => logs.push(e) },
    './chequeTerceiroService': { confirmarCompensacaoChequePorMovimento: async ({ movimentoId, transaction }) => {
      assert(transaction); if (movimentoId === falharCheque) throw Error('Falha controlada no ultimo movimento');
    } },
    './faturaCartaoFinanceiroService': { baixarFaturaCartao: naoChamar },
    './financeiroCaixaSessionHelper': { obterSessaoAbertaParaConta: naoChamar },
    './financeiroCadastroService': { listarTarifasBancariasConfig: naoChamar },
    './tituloFinanceiroService': { criarTituloManualComBaixaAtomica: naoChamar, estornarMovimentoTitulo: naoChamar },
    './transferenciaFinanceiraService': { criarTransferenciaFinanceira: naoChamar }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), {
    module, exports: module.exports, require: id => stubs[id] || realRequire(id), console, Buffer, Date, Set, Map
  }, { filename: arquivo });
  return { service: module.exports, stores, logs, queries, ordemLocks,
    alterar(fn) { alterarAntesLock = fn; }, falhar(id) { falharCheque = id; } };
}

const req = { user: { id: 1 }, originalUrl: '/qa-isolado' };
const listar = a => a.service.listarConciliacoes(req, { status: 'PENDENTE' });
const confirmar = (a, bancoId, id) => a.service.confirmarConciliacao(req, bancoId,
  Array.isArray(id) ? { movimento_financeiro_ids: id } : { movimento_financeiro_id: id });
(async () => {
  let a = ambiente([banco(1), banco(2)], [movimento(101)]);
  let r = await listar(a);
  assert(r.itens.every(i => i.total_candidatos === 1 && i.associacao_manual_recomendada && !i.sugestao_automatica));
  assert.equal(r.meta.grupos_match[0].candidatos[0].titulo_codigo, titulo().codigo);
  assert.equal(a.queries.filter(q => q.name === 'MovimentoFinanceiro' && q.options.include?.some(i => i.as === 'titulo') && !q.options.where.forma_recebimento).length, 1, 'Consulta unica por grupo');
  await confirmar(a, 1, 101); r = await listar(a);
  assert.equal(r.itens[0].total_candidatos, 0);
  const confirmado = await a.service.listarConciliacoes(req, { status: 'CONCILIADO' });
  assert.equal(confirmado.itens[0].titulo.codigo, titulo().codigo);
  assert(a.queries.filter(q => q.name === 'TituloFinanceiro').every(q => q.options.attributes.includes('codigo')));
  assert(a.queries.filter(q => q.name === 'MovimentoFinanceiro' && q.options.include?.some(i => i.as === 'titulo'))
    .every(q => q.options.include.find(i => i.as === 'titulo').attributes.includes('codigo')), 'SELECTs das sugestoes incluem o codigo real');
  await assert.rejects(confirmar(a, 2, 101), /ja foi usado|ja esta vinculado/);
  await assert.rejects(confirmar(a, 1, 101), /pendentes/);
  assert.equal(a.logs.length, 1);

  a = ambiente([banco(1), banco(2), banco(3)], [movimento(101), movimento(102)]);
  r = await listar(a); assert(r.itens.every(i => i.total_candidatos === 2 && !i.sugestao_automatica));
  const snapshotTitulos = clone(a.stores.TituloFinanceiro);
  await confirmar(a, 1, 101); r = await listar(a);
  assert.equal(r.itens[0].sugestao_automatica.movimento_financeiro_id, 102);
  assert.equal(r.itens[1].total_candidatos, 0);
  await confirmar(a, 2, 102); assert.equal((await listar(a)).itens[0].total_candidatos, 0);
  assert.deepEqual(a.stores.TituloFinanceiro, snapshotTitulos, 'Mesmo titulo, movimentos parciais diferentes; sem recalcular baixa ou saldo');
  assert.deepEqual(clone(a.logs.map(e => e.metadata.movimento_financeiro_ids)), [[101], [102]]);

  a = ambiente([banco(1), banco(2)], [movimento(101)]);
  const concorrentes = await Promise.allSettled([confirmar(a, 1, 101), confirmar(a, 2, 101)]);
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(a.stores.ConciliacaoBancaria.filter(r => r.status === 'CONCILIADO').length, 1);
  assert.equal(a.logs.length, 1, 'Concorrencia nao duplica historico');
  a = ambiente([banco(1)], [movimento(101), movimento(102)]);
  const mesmoBanco = await Promise.allSettled([confirmar(a, 1, 101), confirmar(a, 1, 102)]);
  assert.equal(mesmoBanco.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(a.stores.MovimentoFinanceiro.filter(r => r.conciliacao_bancaria_id).length, 1);
  assert.equal(a.logs.length, 1);

  a = ambiente([banco(1)], [movimento(101), movimento(102)]);
  a.stores.ConciliacaoBancaria[0].valor = -200;
  await confirmar(a, 1, [102, 101]);
  assert.deepEqual(a.ordemLocks.filter(k => k.startsWith('Movimento')), ['MovimentoFinanceiro:101', 'MovimentoFinanceiro:102']);
  assert.equal(a.stores.ConciliacaoBancaria[0].movimento_financeiro_id, 102, 'Principal preserva ordem do payload');
  assert.deepEqual(clone(a.logs[0].metadata.movimento_financeiro_ids), [102, 101]);

  a = ambiente([{ ...banco(1), valor: -200 }], [movimento(101), movimento(102)]); a.falhar(102);
  await assert.rejects(confirmar(a, 1, [101, 102]), /Falha controlada/);
  assert(a.stores.MovimentoFinanceiro.every(r => r.conciliacao_bancaria_id === null));
  assert.equal(a.stores.ConciliacaoBancaria[0].status, 'PENDENTE'); assert.equal(a.logs.length, 0);

  for (const alterar of [s => { s.MovimentoFinanceiro[0].valor_quitacao = 101; },
    s => { s.MovimentoFinanceiro[0].data_movimento = '2026-10-21'; },
    s => { s.ConciliacaoBancaria[0].valor = -101; },
    s => { s.TituloFinanceiro[0].obra_id = 99; }]) {
    a = ambiente([banco(1)], [movimento(101)]); a.alterar(alterar);
    await assert.rejects(a.service.confirmarConciliacao({ user: { id: 1, obras: [3] } }, 1, { movimento_financeiro_id: 101 }), /alterad|Acesso negado/);
    assert.equal(a.stores.MovimentoFinanceiro[0].conciliacao_bancaria_id, null);
    assert.equal(a.logs.length, 0);
  }
  a = ambiente([banco(1)], [movimento(101)]);
  assert.equal((await a.service.listarConciliacoes({ user: { obras: [] } })).meta.grupos_match[0].candidatos.length, 0);
  await assert.rejects(a.service.listarConciliacoes({ user: { allow: false } }), e => e.statusCode === 403);
  await assert.rejects(a.service.confirmarConciliacao({ user: { obras: [99] } }, 1, { movimento_financeiro_id: 101 }), e => e.statusCode === 403);
  a = ambiente([banco(1)], [movimento(101)]); a.stores.MovimentoFinanceiro[0].conta_bancaria_id = 8;
  await assert.rejects(confirmar(a, 1, 101), /outra conta/);

  a = ambiente(Array.from({ length: 30 }, (_, i) => banco(i + 1)), Array.from({ length: 24 }, (_, i) => movimento(i + 101)));
  r = await listar(a); assert.equal(r.itens[0].total_candidatos, 24); assert.equal(r.itens[0].sugestoes.length, 20);
  assert.equal(r.meta.grupos_match[0].candidatos.length, 24);
  assert.equal(r.meta.grupos_match[0].pendentes_ids.length, 30);
  // O primeiro pendente global continua sendo dono da sugestao mesmo fora da pagina atual.
  a = ambiente([{ ...banco(0), status: 'CONCILIADO', movimento_financeiro_id: 100 },
    ...Array.from({ length: 30 }, (_, i) => banco(i + 1))], [movimento(101)]);
  r = await a.service.listarConciliacoes(req, { page: 2, page_size: 25 });
  assert(r.itens.every(i => !i.sugestao_automatica));
  assert.equal(r.meta.grupos_match[0].pendentes_ids[0], 1);
  const separado = ambiente([banco(1), { ...banco(2), conta_bancaria_id: 8 },
    { ...banco(3), data_movimento: '2026-10-21' }, { ...banco(4), valor: 100 }], [movimento(101)]);
  assert.equal((await listar(separado)).meta.grupos_match.length, 4);
  assert.equal(grupos.chaveGrupo(banco(1)), '9|2026-10-22|-10000');
  a = ambiente([banco(1), banco(2), banco(3)], [movimento(101), movimento(102)]);
  assert.equal((await a.service.conciliarSugeridos(req)).resumo.total_conciliadas, 0, 'Lote nao escolhe ambiguos');
  await confirmar(a, 1, 101);
  assert.equal((await a.service.conciliarSugeridos(req)).resumo.total_conciliadas, 1);
  assert.equal(a.stores.ConciliacaoBancaria.find(r => r.id === 2).status, 'CONCILIADO');
  assert.equal(a.stores.ConciliacaoBancaria.find(r => r.id === 3).status, 'PENDENTE');
  a = ambiente([banco(1), { ...banco(2), status: 'CONCILIADO', movimento_financeiro_id: 101 }], [movimento(101)]);
  assert.equal((await listar(a)).itens[0].total_candidatos, 0, 'Vinculo legado do banco tambem exclui movimento');
  a = ambiente([banco(1)], [{ ...movimento(101), conciliacao_bancaria_id: 999 }]);
  assert.equal((await listar(a)).itens[0].total_candidatos, 0, 'Vinculo inverso exclui mesmo fora do extrato atual');
  const chunks = [], entradas = Array.from({ length: 205 }, (_, i) => ({ ...banco(i + 1), valor: -i - 1 }));
  const carregados = await grupos.carregarGrupos(entradas, { async findAll(q) { chunks.push(q.where[Op.or].length); assert(q.raw); return entradas.filter(r => atende(r, q.where)); } });
  assert.deepEqual(chunks, [100, 100, 5]); assert.equal(carregados.size, 205);
  console.log('OK OFX: 2/1, 3/2, contagem >20, pagina global, pools por grupo, codigo TIT, movimentos parciais, replay/concorrencia, locks ordenados, rollback, alteracoes concorrentes, ACL/escopo/conta. Service real; somente memoria.');
})().catch(error => { console.error(error); process.exitCode = 1; });
