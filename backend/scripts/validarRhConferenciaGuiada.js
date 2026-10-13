'use strict';

// Servicos reais com modelos em memoria. Nao carrega .env, Sequelize real ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { revisaoItem, alteraConferencia } = require('../src/services/rhApuracaoConferenciaDomain');
const { validateRhApuracaoItemUpdateBody } = require('../src/validators/rhValidators');
assert.equal(validateRhApuracaoItemUpdateBody({ observacoes: '' }).observacoes, null);
assert.throws(() => validateRhApuracaoItemUpdateBody({ status: 'CONFERIDO', revisao_conferencia: 'invalida' }), /Revisao/);
class ValidationError extends Error { constructor(message, status) { super(message); this.status = status; } }
const raiz = path.resolve(__dirname, '..');
const locks = [];
let geracoes = 0;
let retornoPendente = false;
let etapaFonte = 'DIARIA';
const item = { id: 4, status: 'PENDENTE', ajuste_credito_manual: 0, ajuste_debito_manual: 0,
  valor_bruto: 1000, valor_descontos: 0, valor_liquido: 1000, observacoes: '',
  detalhes_json: { importacao_ids: [19] },
  async update(payload) { Object.assign(this, payload); } };
const apuracao = { id: 12, status: 'RASCUNHO', competencia: '2026-10', etapa_pagamento: 'DIARIA', obra_id: 7,
  itens: [item], async update(payload) { Object.assign(this, payload); } };
let candidatas = [];
let transactionCount = 0;
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const models = {
  Obra: { findByPk: async (_id, opts) => { assert.equal(opts.lock, 'UPDATE'); locks.push('OBRA'); return { id: 7 }; } },
  sequelize: { transaction: async (callback) => { transactionCount++; return callback(transaction); } },
  RhApuracao: {
    findByPk: async (_id, opts) => { locks.push(opts.lock); return apuracao; },
    findAll: async (opts) => { assert.equal(opts.where.etapa_pagamento, etapaFonte); return candidatas; },
    findOne: async () => null
  },
  RhApuracaoEvento: { findOne: async () => item, findAll: async () => [item] },
  RhSolicitacao: { findByPk: async (_id, opts = {}) => {
    if (opts.lock) assert.equal(opts.lock, 'UPDATE');
    return { id: 55, tipo: 'JORNADA', situacao: 'ABERTA', obra_id: 7, dados_json: { importacao_id: 19, dias_base: 30 } };
  } },
  RhImportacao: { findByPk: async () => ({ id: 19, status: 'CONFIRMADA', competencia: '2026-10', etapa_pagamento: etapaFonte, obra_id: 7 }) }
};
function carregarServico(nome, complemento) {
  const codigo = fs.readFileSync(path.join(raiz, 'src/services', nome), 'utf8');
  const sandbox = { module: { exports: {} }, process: { env: { RH_JORNADA_40_60_ETAPAS: 'ON' } }, console, Date, Set, Map,
    require(id) {
      if (id === '../models') return models;
      if (id === 'sequelize') return { Op: { in: Symbol('in'), lt: Symbol('lt') } };
      if (id === '../middlewares/validation') return { ValidationError };
      if (id === '../utils/pix') return require('../src/utils/pix');
      if (id === './rhApuracaoConferenciaDomain') return { revisaoItem, alteraConferencia };
      if (id === './rhJornadaFormularioService') return { exigirJornadasSemRetornoPendente: async () => {
        if (retornoPendente) throw new ValidationError('Retorno de jornada pendente', 409);
      } };
      return {};
    }
  };
  vm.runInNewContext(codigo + complemento, sandbox, { filename: nome });
  return sandbox.module.exports;
}

async function main() {
  // O sandbox compartilha objetos somente nesta fixture, sem carregar o DB.
  const codigo = fs.readFileSync(path.join(raiz, 'src/services/rhApuracaoService.js'), 'utf8');
  const sandbox = { module: { exports: {} }, process: { env: { RH_JORNADA_40_60_ETAPAS: 'ON' } }, console,
    apuracaoMock: apuracao, itemMock: item,
    prepararMock: async (recorte) => { geracoes++; assert.equal(recorte.importacao_id, 19); assert.equal(recorte.obra_id, 7); candidatas = [apuracao]; return { ...apuracao, itens: [item] }; },
    require(id) {
      if (id === '../models') return models;
      if (id === 'sequelize') return { Op: { in: Symbol('in'), lt: Symbol('lt') } };
      if (id === '../middlewares/validation') return { ValidationError };
      if (id === './rhApuracaoConferenciaDomain') return { revisaoItem, alteraConferencia };
      if (id === './rhJornadaFormularioService') return { exigirJornadasSemRetornoPendente: async () => { if (retornoPendente) throw new ValidationError('Retorno de jornada pendente', 409); } };
      return {};
    }
  };
  vm.runInNewContext(codigo + `
    recalcularResumoApuracao = async () => {};
    detalharApuracaoPorPk = async () => enrichApuracao({ ...apuracaoMock, itens: [{ ...itemMock }] });
    gerarApuracaoRecorteRh = prepararMock;
  `, sandbox);
  const api = sandbox.module.exports;
  const consulta = await api.contextoApuracaoJornadaRh(55);
  assert.equal(consulta.apuracoes.length, 0);
  assert.equal(geracoes, 0, 'GET nunca prepara registros');
  await api.contextoApuracaoJornadaRh(55, { preparar: true, user: { id: 2 } });
  await api.contextoApuracaoJornadaRh(55, { preparar: true, user: { id: 2 } });
  assert.equal(geracoes, 1, 'Retomar nunca regera ou apaga conferencia');
  // Mensais tambem sao isoladas por fonte, nao por toda a competencia da obra.
  etapaFonte = 'ADIANTAMENTO_40'; apuracao.etapa_pagamento = etapaFonte; candidatas = [];
  const mensal = await api.contextoApuracaoJornadaRh(55, { preparar: true, user: { id: 2 } });
  assert.equal(mensal.recorte.importacao_id, 19);
  assert.equal(mensal.compartilhadas.length, 0);
  item.detalhes_json.importacao_ids = [19, 20];
  const legada = await api.contextoApuracaoJornadaRh(55);
  assert.deepEqual(Array.from(legada.compartilhadas), [12], 'Apuracao que mistura pedidos e identificada sem regerar');
  const antesLegada = geracoes;
  await api.contextoApuracaoJornadaRh(55, { preparar: true, user: { id: 2 } });
  assert.equal(geracoes, antesLegada, 'Preparar nao duplica nem substitui apuracao legada');
  etapaFonte = 'DIARIA'; apuracao.etapa_pagamento = etapaFonte; item.detalhes_json.importacao_ids = [19];

  const revisaoAntes = revisaoItem(item);
  await api.atualizarItemApuracaoRh(12, 4, { status: 'CONFERIDO', revisao_conferencia: revisaoAntes }, { id: 2 });
  assert.equal(item.status, 'CONFERIDO');
  assert.equal(locks.at(-1), 'UPDATE');
  await assert.rejects(api.atualizarItemApuracaoRh(12, 4, { ajuste_credito_manual: 3, revisao_conferencia: revisaoAntes }, { id: 3 }), /outro usuario/);
  await api.atualizarItemApuracaoRh(12, 4, { ajuste_credito_manual: 20, status: 'CONFERIDO', revisao_conferencia: revisaoItem(item) }, { id: 2 });
  assert.equal(item.status, 'PENDENTE', 'Editar e conferir no mesmo PATCH nao dispensa revisao');
  assert.equal(item.valor_liquido, 1020);
  await assert.rejects(api.conferirApuracaoRh(12, { id: 2 }), /itens pendentes/);
  await api.atualizarItemApuracaoRh(12, 4, { status: 'CONFERIDO' }, { id: 2 });
  retornoPendente = true;
  await assert.rejects(api.conferirApuracaoRh(12, { id: 2 }), /Retorno/);
  retornoPendente = false;
  await api.conferirApuracaoRh(12, { id: 2 });
  assert.equal(apuracao.status, 'CONFERIDA');
  assert.equal(locks.at(-1), 'UPDATE');
  await assert.rejects(api.atualizarItemApuracaoRh(12, 4, { status: 'PENDENTE' }, { id: 2 }), /rascunho/);

  apuracao.fechamentoRh = { id: 77, status: 'FECHADO' };
  const fechamento = carregarServico('rhFechamentoService.js', '');
  await assert.rejects(fechamento.fecharApuracaoRh(12, {}, { id: 2 }), /ja foi fechada/);
  assert.ok(locks.includes('UPDATE'), 'Fechamento usa o mutex da apuracao');
  const rotas = fs.readFileSync(path.join(raiz, 'src/routes.js'), 'utf8');
  assert.match(rotas, /get\('\/rh\/apuracoes\/jornada\/:id', allowRhDpApuracaoRead/);
  assert.match(rotas, /post\('\/rh\/apuracoes\/jornada\/:id', allowRhDpApuracaoWrite, criticalRateLimit/);
  assert.match(rotas, /post\('\/rh\/apuracoes\/:id\/fechar', requireEnabledModule\('FINANCEIRO'\), allowRhDpFechamentoExecute/);
  assert.ok(transactionCount > 0);
  console.log('Conferencia guiada: persistencia, invalidacao, conflito, retorno, recorte, retomada e fechamento protegido validados sem banco.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
