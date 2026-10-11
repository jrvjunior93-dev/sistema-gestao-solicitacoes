'use strict';
// Modulos reais com modelos/transportes isolados. Sem .env, SQL, rede ou dados reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/adiantamentoDomain');
function carregar(arquivo, dependencias) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', arquivo), 'utf8'), {
    module, exports: module.exports, console, Date, Set, Map, Number, String, JSON, Promise,
    require: nome => { if (!(nome in dependencias)) throw Error(`Dependencia nao isolada: ${nome}`); return dependencias[nome]; }
  }, { filename: arquivo });
  return module.exports;
}
const row = data => Object.assign(data, {
  get() { return { ...this }; }, toJSON() { return { ...this }; }, async update(values) { Object.assign(this, values); return this; }
});
async function centros() {
  let origem = row({ id: 30, nome: 'ADMINISTRATIVO / ESCRITORIO', ativo: true, tipo_centro_custo: 'CENTRO_CUSTO' });
  let config = null, consultasVinculos = 0, whereObras;
  const obras = [row({ id: 1, nome: 'Publica', ativo: true, tipo_centro_custo: 'OBRA', classificacao: 'PUBLICA' }), row({ id: 2, nome: 'Privada', ativo: true, tipo_centro_custo: 'OBRA', classificacao: 'PRIVADA' })];
  const filtrar = where => obras.filter(o => (!where.classificacao || o.classificacao === where.classificacao) && (!where.id || (where.id[Op.in] || []).includes(o.id)));
  const models = {
    Obra: { findByPk: async () => origem, findAll: async ({ where }) => { whereObras = where; return filtrar(where); }, count: async ({ where }) => filtrar(where).length },
    UsuarioObra: { findAll: async () => { consultasVinculos++; return [{ obra_id: 2 }]; } },
    ConfiguracaoSistema: { findOne: async () => config, create: async data => { config = row(data); } },
    sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }) }
  };
  const service = carregar('services/centroCustoDistribuicaoService.js', {
    sequelize: { Op }, '../models': models, '../constants/centroCusto': require('../src/constants/centroCusto'),
    './usuariosSetores': { obterTokensSetoresUsuario: async user => [user.area] },
    './setorCapabilityService': { userHasSetorCapability: async user => user.area === 'OBRA' },
    './authorizationService': { hasObraAccess: async user => user.acesso !== false, userCanCreateInAllObras: async () => false }
  });
  const user = { id: 9, area: 'RH_DP', perfil: 'USUARIO' };
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).obras.length, 2);
  assert.equal(consultasVinculos, 0, 'Admin/DP nao exige nem escreve vinculos usuario-obra');
  origem.nome = 'DP';
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).regra, 'TODAS');
  origem.nome = 'DEPARTAMENTO PESSOAL';
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).regra, 'TODAS');
  for (const nome of ['Comercial', 'Marketing']) {
    origem.nome = nome;
    assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).obras[0].id, 2);
    assert.equal(whereObras.classificacao, 'PRIVADA');
  }
  const admin = { ...user, perfil: 'SUPERADMIN' };
  await assert.rejects(service.configurarObrasDistribuicao(30, { obras_ids: [1] }, admin), /elegiveis/);
  await assert.rejects(service.configurarObrasDistribuicao(30, { obras_ids: [2] }, user), /SUPERADMIN/);
  for (const ids of [undefined, [2, 2], [-1], ['2'], {}, [999]]) await assert.rejects(service.configurarObrasDistribuicao(30, { obras_ids: ids }, admin));
  await service.configurarObrasDistribuicao(30, { obras_ids: [2] }, admin);
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).regra, 'CONFIGURADAS_CENTRO_CUSTO');
  await service.configurarObrasDistribuicao(30, { obras_ids: [] }, admin);
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user })).obras.length, 0);
  config.valor = 'invalida';
  await assert.rejects(service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: user }), /invalida/);
  config = null; origem.nome = 'Administrativo';
  const obraUser = { ...user, area: 'OBRA' };
  assert.equal((await service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: obraUser })).obras.length, 1);
  await assert.rejects(service.listarObrasElegiveisDistribuicao({ centroCustoId: 30, usuario: { ...user, acesso: false } }), /Acesso negado/);
  const todas = await service.validarDistribuicaoCentroCusto({ centroCustoId: 30, usuario: user, valorTotal: 100, distribuicao: { todas: true } });
  assert.equal(todas.linhas.length, 1); assert.equal(todas.linhas[0].obra_id, null, 'TODAS preserva o agrupamento gerencial existente');
}
async function fluxo() {
  let principal, ciclo, titulo, titulos, anexos, rateios;
  let fila = Promise.resolve();
  const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
  const reset = () => {
    principal = row({ id: 10, codigo: 'SOL-TESTE', obra_id: 30, tipo_sub_id: 7, area_responsavel: 'ADMINISTRATIVO', status_global: 'PRESTACAO PENDENTE' });
    ciclo = row({ id: 1, solicitacao_id: 10, titulo_financeiro_id: 100, valor_solicitado: 1000, valor_prestado: 0, status: 'PRESTACAO_PENDENTE' });
    titulo = row({ id: 100, status: 'QUITADO', tipo: 'PAGAR', origem_titulo: 'ADIANTAMENTO', valor_original: 1000, valor_baixado: 1000, valor_saldo: 0, categoria_financeira_id: 4, considera_dre: false, parceiro_id: 5, empresa_id: 2 });
    titulos = [titulo]; anexos = [{ id: 1 }]; rateios = [];
  };
  reset();
  const models = {
    sequelize: { transaction(fn) { const executar = async () => fn(tx); const trabalho = fila.then(executar); fila = trabalho.catch(() => {}); return trabalho; } },
    Solicitacao: { findByPk: async () => principal }, TipoSubContrato: { findByPk: async () => ({ usa_fluxo_adiantamento: true }) },
    SolicitacaoAdiantamento: { findOne: async () => ciclo },
    Obra: { findByPk: async () => row({ id: 30, nome: 'Administrativo', tipo_centro_custo: 'CENTRO_CUSTO', ativo: true }) },
    Apropriacao: { findOne: async ({ where }) => where.id === 8 ? { id: 8, obra_id: 2, ativo: true, somadora: false } : null, findAll: async () => [] },
    Anexo: { count: async ({ where }) => where.id[Op.in].every(id => anexos.some(a => a.id === id)) ? where.id[Op.in].length : 0, findAll: async () => anexos },
    TituloFinanceiro: { findByPk: async id => titulos.find(t => t.id === id), create: async data => { const t = row({ id: 101, ...data }); titulos.push(t); return t; } },
    TituloFinanceiroRateio: { destroy: async () => { rateios = []; }, bulkCreate: async data => { rateios = data; } },
    CategoriaFinanceira: { findByPk: async () => ({ considera_dre: true }) }, Historico: { create: async () => {} }, StatusArea: { create: async () => {} }
  };
  const service = carregar('services/adiantamentoService.js', {
    sequelize: { Op }, '../models': models, './adiantamentoDomain': domain,
    './solicitacaoRetornoService': { assertPodeVisualizarSolicitacao: async () => ({ solicitacao: principal }), assertPodeInteragirSolicitacao: async req => { if (req.negado) throw domain.erro('Acesso negado.', 403); } },
    './centroCustoDistribuicaoService': { listarObrasElegiveisDistribuicao: async () => ({ obras: [{ id: 2, nome: 'Privada' }] }) },
    './recargaCartaoService': { isGerenciaProcessos: user => user.area === 'GEO', resolverDestinoPrestacaoAposBaixa: async () => 'ADMINISTRATIVO' },
    './setorCapabilityService': { findSetorByCapability: async cap => ({ codigo: cap === 'eh_setor_financeiro' ? 'FINANCEIRO' : 'GEO' }), resolveSetorPersistenciaValue: setor => setor.codigo },
    './apropriacaoSelecaoService': require('../src/services/apropriacaoSelecaoService')
  });
  const body = { itens: [{ obra_id: 2, apropriacao_id: 8, descricao: 'Material', valor: 800 }], anexo_ids: [1] };
  const req = { params: { id: 10 }, user: { id: 9, area: 'ADMINISTRATIVO' }, body };
  await assert.rejects(service.atualizarPrincipalComProtecao(principal, { valor: 999 }), /ja possui titulo/);
  await assert.rejects(service.atualizarPrincipalComProtecao(principal, { valor: null }), /monetario/);
  await assert.rejects(service.atualizarPrincipalComProtecao(principal, { status_global: 'PAGA' }), /ja possui titulo/);
  assert.equal(principal.status_global, 'PRESTACAO PENDENTE');
  for (const invalido of [{ ...body, anexo_ids: [999] }, { ...body, anexo_ids: [] }, { ...body, itens: [{ ...body.itens[0], obra_id: 999 }] }, { ...body, itens: [{ ...body.itens[0], apropriacao_id: 999 }] }, { ...body, itens: [{ ...body.itens[0], valor: 1000.01 }] }]) {
    await assert.rejects(service.enviar({ ...req, body: invalido })); assert.equal(ciclo.status, 'PRESTACAO_PENDENTE');
  }
  await assert.rejects(service.enviar({ ...req, negado: true }), /Acesso/);
  titulo.status = 'PARCIAL'; await assert.rejects(service.enviar(req), /Conclua/); titulo.status = 'QUITADO';
  await service.enviar(req); assert.equal(ciclo.status, 'PRESTACAO_ENVIADA'); assert.equal(principal.area_responsavel, 'GEO'); assert.equal(titulo.considera_dre, false);
  await assert.rejects(service.enviar(req), /ja enviada/);
  const geo = { ...req, user: { id: 4, area: 'GEO' }, body: { decisao: 'APROVAR', data_devolucao: '2099-12-01' } };
  await assert.rejects(service.decidir({ ...geo, user: req.user }), /Somente GEO/);
  await assert.rejects(service.decidir({ ...geo, body: { decisao: 'APROVAR', data_devolucao: '2099-02-30' } }), /vencimento/);
  const decisoes = await Promise.allSettled([service.decidir(geo), service.decidir(geo)]);
  assert.equal(decisoes.filter(d => d.status === 'fulfilled').length, 1, 'Duplo clique nao gera segunda devolucao');
  assert.equal(titulos.length, 2); assert.equal(titulos[1].tipo, 'RECEBER'); assert.equal(titulos[1].valor_original, 200); assert.equal(titulos[1].considera_dre, false);
  assert.equal(ciclo.status, 'DEVOLUCAO_PENDENTE'); assert.equal(titulo.valor_despesa_prestacao, 800); assert.equal(titulo.valor_original, 1000); assert.equal(titulo.valor_baixado, 1000);
  assert.equal(rateios.reduce((sum, r) => sum + r.valor_rateio, 0), 800); assert.equal(rateios[0].percentual, 80);
  titulos[1].status = 'QUITADO'; titulos[1].valor_saldo = 0;
  await service.sincronizarBaixa({ solicitacao: principal, titulos, usuarioId: 4, transaction: tx });
  assert.equal(ciclo.status, 'VALIDADA'); assert.equal(principal.status_global, 'PAGA');
  titulos[1].status = 'ABERTO'; titulos[1].valor_saldo = 200;
  await service.sincronizarBaixa({ solicitacao: principal, titulos, usuarioId: 4, transaction: tx }); assert.equal(ciclo.status, 'DEVOLUCAO_PENDENTE');
  titulo.status = 'ABERTO'; await assert.rejects(service.sincronizarBaixa({ solicitacao: principal, titulos, usuarioId: 4, transaction: tx }), /nao permite estorno/);
  reset(); ciclo.status = 'AGUARDANDO_PAGAMENTO'; principal.area_responsavel = 'FINANCEIRO';
  await service.sincronizarBaixa({ solicitacao: principal, titulos, usuarioId: 4, transaction: tx }); assert.equal(ciclo.status, 'PRESTACAO_PENDENTE'); assert.equal(principal.area_responsavel, 'ADMINISTRATIVO');
  reset(); await service.enviar(req);
  await service.decidir({ ...geo, body: { decisao: 'REJEITAR', motivo: 'Falta nota' } }); assert.equal(ciclo.status, 'REJEITADA'); assert.equal(titulos.length, 1);
  reset(); await service.enviar({ ...req, body: { itens: [], anexo_ids: [] } }); await service.decidir(geo); assert.equal(titulos[1].valor_original, 1000); assert.equal(titulo.considera_dre, false);
  reset(); await service.enviar({ ...req, body: { ...body, itens: [{ ...body.itens[0], valor: 1000 }] } }); await service.decidir(geo); assert.equal(titulos.length, 1); assert.equal(ciclo.status, 'VALIDADA');
  const realizado = carregar('modules/custosRecebiveis/services/realizadoService.js', { sequelize: { Op }, '../../../models': {}, './planoMicroService': {}, '../policies/obraScopePolicy': {} });
  const base = { id: 100, obra_id: 30, origem_titulo: 'ADIANTAMENTO', valor_original: 1000, valor_baixado: 1000, status: 'QUITADO', valor_saldo: 0, possui_rateio: true, rateios: [{ obra_id: 2, valor_rateio: 800 }] };
  assert.equal(realizado.serializeAllocatedTitle(base, 2, '2026-10'), null);
  const custo = realizado.serializeAllocatedTitle({ ...base, valor_despesa_prestacao: 800 }, 2, '2026-10');
  assert.equal(custo.valor_alocado, 800);
  assert.equal(realizado.resolveNaturalAllocations({ valor: 1000, valor_quitacao: 1050 }, base).length, 0);
  const alocacao = realizado.resolveNaturalAllocations({ valor: 1000, valor_quitacao: 1050 }, { ...base, valor_despesa_prestacao: 800 });
  assert.equal(alocacao[0].valor, 800, 'Somente despesa conferida, sem renormalizar saldo/encargos como custo');
}
(async () => {
  assert(domain.tipoPermiteAdiantamento({ nome: 'DESPESA DE MARKETING' })); assert(!domain.tipoPermiteAdiantamento({ nome: 'CONTRATO' }));
  for (const valor of ['', null, -1, NaN, {}, '1.001']) assert.throws(() => domain.centavos(valor));
  assert.equal(domain.saldoAdiantamento('1000.00', 800, 200), 0); assert.throws(() => domain.normalizarPrestacao({ itens: [null] }));
  await centros(); await fluxo(); console.log('OK: centros, escopo sem vinculos/visibilidade, privadas, configuracao, negativas; adiantamento, prestacao, saldo/devolucao, concorrencia e custo isolado. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
