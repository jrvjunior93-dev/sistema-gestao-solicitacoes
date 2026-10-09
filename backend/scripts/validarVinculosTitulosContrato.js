'use strict';
// Servicos reais com fronteiras em memoria. Sem .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Op, Sequelize } = require('sequelize');
const root = path.resolve(__dirname, '../src');
let state, falhaAuditoria = false, mudarDuranteLock = false;
const locks = [], mutacoes = [];
const names = ['TituloFinanceiro', 'PagamentoManualFilaItem', 'ContratoParcela', 'Contrato', 'ContratoMedicao',
  'Solicitacao', 'Historico', 'StatusArea', 'User', 'SecurityEventLog', 'PagamentoAutorizacaoItem', 'SolicitacaoPedidoRetorno'];
const models = {};
const tx = { LOCK: { UPDATE: 'UPDATE' } };
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every(op =>
      op === Op.in ? value[op].includes(row[key]) : op === Op.gt ? row[key] > value[op] : false);
    return row[key] === value;
  });
}
function instance(row) {
  return { ...row, async update(values, options) {
    assert.equal(options.transaction, tx); mutacoes.push(values);
    Object.assign(row, values); Object.assign(this, values); return this;
  } };
}
for (const name of names) models[name] = {
  async findAll(options = {}) {
    if (options.lock) { assert.equal(options.transaction, tx); locks.push(name); }
    if (name === 'TituloFinanceiro' && options.lock && mudarDuranteLock) {
      state.PagamentoManualFilaItem[0].status = 'NAO_PAGO'; mudarDuranteLock = false;
    }
    let rows = state[name].filter(row => matches(row, options.where)).sort((a, b) => a.id - b.id);
    if (options.limit) rows = rows.slice(0, options.limit);
    return rows.map(row => {
      const result = instance(row);
      if (name === 'ContratoParcela' && options.include) {
        const contrato = state.Contrato.find(c => c.id === row.contrato_id);
        result.contrato = contrato ? instance(contrato) : null;
      }
      return result;
    });
  },
  async findByPk(id, options = {}) { return (await this.findAll({ ...options, where: { id: Number(id) } }))[0] || null; },
  async create(values, options) {
    assert.equal(options.transaction, tx);
    assert(!['TituloFinanceiro', 'PagamentoManualFilaItem'].includes(name), 'Nao pode criar titulo/fila');
    if (name === 'SecurityEventLog' && falhaAuditoria) throw Error('Auditoria indisponivel QA');
    mutacoes.push(values); const row = { id: state[name].length + 1, ...values }; state[name].push(row); return instance(row);
  }
};
models.sequelize = { async transaction(action) {
  const antes = structuredClone(state);
  try { return await action(tx); } catch (error) { state = antes; throw error; }
} };
const services = new Map();
function load(name) {
  if (services.has(name)) return services.get(name);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'services', `${name}.js`), 'utf8'), {
    module, console, require(dep) {
      if (dep === '../models') return models;
      if (dep === 'sequelize') return { Op };
      if (dep === 'node:crypto') return crypto;
      if (dep === './setorCapabilityService') return {
        findSetorByCapability: async cap => ({ codigo: cap === 'eh_setor_obra' ? 'OBRA' : 'FINANCEIRO' }),
        resolveSetorPersistenciaValue: setor => setor.codigo
      };
      if (dep.startsWith('./')) return load(dep.slice(2));
      throw Error(`Dependencia nao simulada: ${dep}`);
    }
  }, { filename: name });
  services.set(name, module.exports); return module.exports;
}
function reset() {
  state = Object.fromEntries(names.map(name => [name, []])); locks.length = 0; mutacoes.length = 0;
  falhaAuditoria = false; mudarDuranteLock = false;
  state.User = [{ id: 1, ativo: true, perfil: 'SUPERADMIN' }];
  state.TituloFinanceiro = [{ id: 190, codigo: 'TIT-000194', tipo: 'PAGAR', obra_id: 7, solicitacao_id: null,
    status: 'ABERTO', status_interno_pagar: 'ENVIADO PARA PAGAMENTO', valor_saldo: '1000.00', valor_baixado: '0.00' }];
  state.Contrato = [{ id: 3, codigo: 'CT-0003', fluxo_novo: true, obra_id: 7, solicitacao_id: 2011 }];
  state.ContratoParcela = [{ id: 10, contrato_id: 3, titulo_financeiro_id: 190, status: 'APROVADA' }];
  state.Solicitacao = [{ id: 2011, obra_id: 7, codigo: 'SOL-1978', status_global: 'LIBERADO', area_responsavel: 'OBRA' }];
  state.PagamentoManualFilaItem = [{ id: 16, titulo_financeiro_id: 190, status: 'PENDENTE', movimento_financeiro_id: null }];
}
const resolver = load('tituloSolicitacaoContratoService');
const recon = load('tituloContratoReconService');
const financeiro = load('solicitacaoFinanceiroStatusService');
const conferencia = () => recon.conferirVinculosTitulosContrato({ tituloIds: [190] });
const aplicar = confirmacao => recon.aplicarVinculosTitulosContrato({ tituloIds: [190], confirmacao, usuarioId: 1, habilitado: true });
// Predicados REAIS de acompanhamento no detalhe e anexos, sem ampliar grants.
function declaration(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`)); assert(start >= 0, name);
  const tail = source.slice(start), next = /\n(?:async )?function |\nconst |\nmodule\.exports/.exec(tail);
  assert(next, name); return tail.slice(0, next.index);
}
const normalize = value => String(value || '').trim().toUpperCase();
const sandbox = vm.createContext({ Op, Sequelize,
  ACOES_ENCAMINHAMENTO_SETOR: ['ENVIADA_SETOR', 'SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS'],
  extrairEncaminhamentoCompra: () => null,
  parseHistoricoMetadata: value => JSON.parse(value || '{}'),
  parseObservacaoEnvioSetor: value => {
    const m = String(value || '').match(/^De (.+) para (.+)$/i); return m ? { origem: m[1], destino: m[2] } : null;
  }, normalizeAccessToken: normalize,
  tokensContainAreaValue: (tokens, value) => tokens.map(normalize).includes(normalize(value)),
  setorPertenceAoUsuario: (tokens, value) => tokens.map(normalize).includes(normalize(value))
});
const fonteArquivos = fs.readFileSync(path.join(root, 'services/fileAccessService.js'), 'utf8');
const fonteLista = fs.readFileSync(path.join(root, 'controllers/SolicitacaoController.js'), 'utf8');
for (const name of ['extrairSetoresEnvioHistorico', 'historicoPertenceAoEscopoSetor']) vm.runInContext(declaration(fonteArquivos, name), sandbox);
for (const name of ['normalizarTokensHistoricoSetores', 'historicoPertenceASetoresVisiveis']) vm.runInContext(declaration(fonteLista, name), sandbox);

(async () => {
  reset(); const antes = structuredClone(state);
  const resolvido = await resolver.resolverSolicitacoesDosTitulos(state.TituloFinanceiro, tx);
  assert.equal(resolvido.get(190).solicitacao_id, 2011);
  assert.equal(resolvido.get(190).origem, 'CONTRATO'); assert.deepEqual(state, antes);
  const conf = await conferencia(); assert.deepEqual(state, antes); assert.equal(mutacoes.length, 0);
  assert.equal(conf.planos[0].preencher_vinculo, true); assert.equal(conf.planos[0].setor_destino, 'OBRA');
  assert.equal(conf.planos[0].setor_registro, 'FINANCEIRO');
  await assert.rejects(recon.aplicarVinculosTitulosContrato({ tituloIds: [190], confirmacao: conf.confirmacao, usuarioId: 1 }), /bloqueada/);
  await assert.rejects(recon.conferirVinculosTitulosContrato({ tituloIds: [190, 190] }), /distintos/);
  state.User[0].perfil = 'GEO'; await assert.rejects(aplicar(conf.confirmacao), /Superadmin/); state.User[0].perfil = 'SUPERADMIN';
  await assert.rejects(aplicar('0'.repeat(64)), /divergente/);
  falhaAuditoria = true; await assert.rejects(aplicar(conf.confirmacao), /Auditoria/); assert.deepEqual(state, antes);
  falhaAuditoria = false; const result = await aplicar(conf.confirmacao);
  assert.equal(result.quantidade, 1); assert.equal(state.TituloFinanceiro[0].solicitacao_id, 2011);
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO'); assert.equal(state.TituloFinanceiro[0].valor_saldo, '1000.00');
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO'); assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert.deepEqual(state.PagamentoManualFilaItem, antes.PagamentoManualFilaItem); assert.deepEqual(state.ContratoParcela, antes.ContratoParcela);
  const envios = state.Historico.filter(h => h.acao === 'ENVIADA_SETOR');
  assert.equal(envios.length, 2); assert.equal(envios[0].observacao, 'De OBRA para FINANCEIRO');
  assert.equal(envios[1].observacao, 'De FINANCEIRO para OBRA');
  assert.equal(state.StatusArea[0].setor, 'FINANCEIRO');
  assert(envios.some(h => sandbox.historicoPertenceASetoresVisiveis(h, ['FINANCEIRO'])));
  assert(envios.some(h => sandbox.historicoPertenceAoEscopoSetor(h, ['FINANCEIRO'])));
  assert(envios.every(h => !sandbox.historicoPertenceASetoresVisiveis(h, ['COMPRAS'])));
  assert(locks.includes('TituloFinanceiro') && locks.includes('ContratoParcela') && locks.includes('Solicitacao') && locks.includes('PagamentoManualFilaItem'));
  await assert.rejects(aplicar(conf.confirmacao), /divergente/);
  const contagemHistorico = state.Historico.length;
  const atual = await conferencia(); const replay = await aplicar(atual.confirmacao);
  assert.equal(replay.quantidade, 0); assert.equal(state.Historico.length, contagemHistorico);
  for (const modificar of [
    () => { state.TituloFinanceiro[0].obra_id = 8; },
    () => { state.Solicitacao[0].obra_id = 8; },
    () => { state.Contrato[0].fluxo_novo = false; },
    () => { state.Contrato.push({ ...state.Contrato[0], id: 4 }); state.ContratoParcela.push({ ...state.ContratoParcela[0], id: 11, contrato_id: 4 }); },
    () => { state.TituloFinanceiro[0].status = 'QUITADO'; state.TituloFinanceiro[0].valor_saldo = '0'; },
    () => { state.TituloFinanceiro[0].valor_baixado = '10'; },
    () => { state.TituloFinanceiro[0].fatura_cartao_id = 1; },
    () => { state.TituloFinanceiro[0].renegociado_por_id = 99; },
    () => { state.PagamentoManualFilaItem[0].status = 'BAIXADO'; },
    () => { state.PagamentoManualFilaItem[0].movimento_financeiro_id = 1; },
    () => { state.PagamentoManualFilaItem.push({ ...state.PagamentoManualFilaItem[0], id: 17 }); },
    () => { state.PagamentoAutorizacaoItem.push({ id: 1, titulo_financeiro_id: 190, status: 'AUTORIZADO' }); },
    () => { state.ContratoParcela = []; }
  ]) {
    reset(); modificar(); const revisao = await conferencia(); assert.equal(revisao.planos[0].preencher_vinculo, false);
    const estado = structuredClone(state); await aplicar(revisao.confirmacao); assert.deepEqual(state, estado);
  }
  reset(); state.ContratoMedicao.push({ id: 2, contrato_id: 3, aprovada_em: null });
  const comMedicao = await conferencia(); assert.equal(comMedicao.planos[0].atualizar_status_solicitacao, false);
  await aplicar(comMedicao.confirmacao); assert.equal(state.TituloFinanceiro[0].solicitacao_id, 2011);
  assert.equal(state.Solicitacao[0].status_global, 'LIBERADO');
  reset(); state.Solicitacao[0].status_global = 'NEC. DE MEDICAO';
  const outroFluxo = await conferencia(); await aplicar(outroFluxo.confirmacao);
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO');
  reset(); state.SolicitacaoPedidoRetorno.push({ id: 1, solicitacao_id: 2011, status: 'APROVADO' });
  const retorno = await conferencia(); await aplicar(retorno.confirmacao);
  assert.equal(state.Solicitacao[0].status_global, 'LIBERADO', 'Retorno aprovado nao e sobrescrito');
  reset(); const concorrente = await conferencia(); mudarDuranteLock = true;
  await assert.rejects(aplicar(concorrente.confirmacao), /Dados mudaram/); assert.equal(state.TituloFinanceiro[0].solicitacao_id, null);
  reset(); state.TituloFinanceiro[0].solicitacao_id = 55;
  const direto = await resolver.resolverSolicitacoesDosTitulos(state.TituloFinanceiro, tx);
  assert.equal(direto.get(190).solicitacao_id, 55, 'Nunca sobrescrever vinculo direto');
  reset(); state.ContratoParcela = [];
  assert.equal((await resolver.resolverSolicitacoesDosTitulos(state.TituloFinanceiro, tx)).size, 0, 'Titulo avulso preservado');
  reset(); state.TituloFinanceiro[0].obra_id = 99;
  await assert.rejects(resolver.resolverSolicitacoesDosTitulos(state.TituloFinanceiro, tx), { statusCode: 409 });
  reset(); await financeiro.encaminharSolicitacaoParaFinanceiroAoEnfileirar({ solicitacao: instance(state.Solicitacao[0]), usuarioId: 1, transaction: tx });
  assert.equal(state.Solicitacao[0].area_responsavel, 'FINANCEIRO', 'Nao altera fluxo avulso/recarga');
  console.log('OK: caso TIT-000194/SOL-1978, leitura sem escrita, vinculo unico/obra, opt-in/assinatura/ator, rollback/auditoria, replay, concorrencia, medicao pendente, Financeiro historico e retorno Obra; sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
