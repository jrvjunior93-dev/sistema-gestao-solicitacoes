'use strict';
// Servicos/ACL/controller reais em VM; apenas modelos em memoria, sem .env/DB/rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const ler = p => fs.readFileSync(path.resolve(__dirname, '../src', p), 'utf8');
const json = v => JSON.parse(JSON.stringify(v));
function funcao(file, nome) {
  const trecho = ler(file).replace(/\r\n/g, '\n').split(`async function ${nome}(`)[1];
  assert(trecho); return `async function ${nome}(` + trecho.slice(0, trecho.indexOf('\n}\n') + 2);
}
async function main() {
  let registros = [], queryFalha = false, aclFalha = false, consultas = 0, acessos = [], historicos = [];
  const solicitacoes = new Map([
    [6399, { id: 6399, codigo: 'SOL-6399', obra_id: 107, criado_por: 7, area_responsavel: 'OBRA', cancelada: false }],
    [6721, { id: 6721, codigo: 'SOL-6721', obra_id: 107, criado_por: 7, area_responsavel: 'GEO', cancelada: false }],
    [999, { id: 999, codigo: 'SOL-SEGREDO', obra_id: 999, criado_por: 99, area_responsavel: 'DP', cancelada: false }],
    [888, { id: 888, codigo: 'SOL-EXCLUIDA', obra_id: 107, criado_por: 7, area_responsavel: 'OBRA', cancelada: true }]
  ]);
  const models = {
    SolicitacaoRecargaCartao: { async findAll(o) {
      consultas++; if (queryFalha) throw Error('SQL privado');
      assert.deepEqual(json(o.attributes), ['id', 'solicitacao_id', 'cartao_recarga_id']);
      assert.equal(o.include[0].required, true); assert.equal(o.limit, 101);
      return registros.filter(r => o.where.cartao_recarga_id[Op.in].includes(r.cartao_recarga_id)
        && o.include[0].where.status[Op.in].includes(r.prestacao.status)).slice(0, o.limit);
    } }, CartaoRecargaPrestacao: {}, CartaoRecargaPrestacaoRateio: {},
    Solicitacao: { findByPk: async id => solicitacoes.get(Number(id)) }
  };
  const sandbox = { Op, Notificacao: {}, NotificacaoDestinatario: { findOne: async () => null },
    Historico: { findOne: async () => null, findAll: async () => historicos },
    obterAreaUsuario: async req => req.user.area, expandirTokensComAliasesGeo: t => t,
    obterTokensSetorPrincipalUsuario: async req => [req.user.area], isAdministrativoToken: s => s === 'ADMINISTRATIVO',
    isSetorObraGeral: async req => req.user.area === 'OBRA', obterSetoresExtrasVisiveisUsuario: async () => [],
    userHasConfiguredAreaPermissions: async () => true,
    PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS: 'minhas', PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR: 'setor',
    PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS: 'todas',
    userHasAreaPermission: async (u, keys) => u.perfil === 'SUPERADMIN' || keys[0] !== 'todas',
    podeVisualizarSolicitacaoPelaFila: async () => false,
    validarAcessoObra: async (req, s) => req.user.perfil === 'SUPERADMIN' || s.obra_id === 107,
    setorPertenceAoUsuario: (tokens, s) => tokens.includes(s), solicitacaoPertenceASetoresVisiveis: async () => false,
    isUsuarioSetorGeo: async req => req.user.area === 'GEO', obterModoRecebimentoPorSetorETipo: async () => 'ADMIN_PRIMEIRO',
    isGeoToken: s => s === 'GEO', ACOES_ENCAMINHAMENTO_SETOR: ['ENVIADA_SETOR'],
    solicitacaoAtendeEscopoOperacionalUsuario: async () => false };
  const verificar = vm.runInNewContext('(' + funcao('controllers/SolicitacaoController.js', 'verificarAcessoDetalheSolicitacao') + ')', sandbox);
  const assertReal = vm.runInNewContext('(' + funcao('services/solicitacaoRetornoService.js', 'assertPodeVisualizarSolicitacao') + ')', {
    Solicitacao: models.Solicitacao, solicitacaoIndisponivel: require('../src/services/solicitacaoDisponibilidade').solicitacaoIndisponivel,
    erro: (message, statusCode) => Object.assign(Error(message), { statusCode }),
    require: name => { assert.equal(name, '../controllers/SolicitacaoController'); return { _verificarAcessoDetalheSolicitacao: verificar }; }
  });
  const retorno = { assertPodeVisualizarSolicitacao: async (req, id) => {
    acessos.push(Number(id)); if (aclFalha) throw Error('Falha ACL privada'); return assertReal(req, id);
  }, montarContextoInteracao: async () => ({ pode_interagir: false }) };
  const modulo = { exports: {} };
  vm.runInNewContext(ler('services/recargaCartaoSaldoLeituraService.js'), { module: modulo, require: name => {
    if (name === 'sequelize') return { Op }; if (name === '../models') return models;
    if (name === './solicitacaoRetornoService') return retorno; throw Error(name);
  } });
  const enriquecer = modulo.exports.enriquecerOrigensSaldo;
  const obra = { user: { id: 7, perfil: 'USUARIO', area: 'OBRA' } };
  const geo = { user: { id: 8, perfil: 'ADMIN', area: 'GEO' } };
  const admin = { user: { id: 1, perfil: 'SUPERADMIN', area: 'GEO' } };
  const saldo = { creditos_efetivos: 2000, ajustes: 0, despesas_validadas: 0, despesas_pendentes: 1227.65,
    saldo_validado: 2000, saldo_disponivel: 772.35, revisao: 'INALTERADA' };
  const contexto = () => ({ ultima_recarga: { id: 20, cartao_recarga_id: 1, solicitacao_id: 6721,
    valor_solicitado: 1227.65, valor_efetivo: 0, titulo: { status: 'ABERTO', valor_baixado: 0 } }, saldo_cartao: { ...saldo } });
  const origem = (s = 6399, cartao = 1, status = 'REJEITADA', valor = 1227.65, p = 10) => ({ id: p,
    cartao_recarga_id: cartao, solicitacao_id: s, prestacao: { id: p, status, rateios: [{ valor_rateio: valor }] } });
  registros = [origem(), origem(6721, 1, 'PENDENTE'), origem(6721, 1, 'VALIDADA')];
  const original = contexto(), antes = JSON.stringify(original);
  let r = await enriquecer(original, obra);
  assert.equal(JSON.stringify(original), antes); assert.deepEqual(json(r.saldo_cartao), saldo);
  assert.equal(r.prestacoes_pendentes_saldo.length, 1); assert.equal(r.prestacoes_pendentes_saldo[0].solicitacao_codigo, 'SOL-6399');
  assert.equal(r.prestacoes_pendentes_saldo[0].valor, 1227.65); assert.equal(r.origens_prestacoes_incompletas, false);
  assert.equal(consultas, 1); assert.deepEqual(acessos, [6399]);
  // GEO nao recebe link so porque pode validar recargas; ACL real continua negando.
  r = await enriquecer(contexto(), geo); assert.equal(r.prestacoes_pendentes_saldo.length, 0);
  assert.equal(r.origens_prestacoes_incompletas, true); assert(!JSON.stringify(r).includes('SOL-6399'));
  historicos = [{ setor: 'GEO' }]; r = await enriquecer(contexto(), geo);
  assert.equal(r.prestacoes_pendentes_saldo.length, 1); historicos = [];
  registros = [origem(), origem(999), origem(888)]; r = await enriquecer(contexto(), obra);
  assert.equal(r.prestacoes_pendentes_saldo.length, 1);
  assert(!JSON.stringify(r).includes('SOL-SEGREDO')); assert(!JSON.stringify(r).includes('SOL-EXCLUIDA'));
  r = await enriquecer(contexto(), admin); assert.equal(r.prestacoes_pendentes_saldo.length, 2, 'Exclusao vale ate para SUPERADMIN');
  // Multi-cartao e multi-origem: consulta unica e ACL uma vez por solicitacao.
  registros = [origem(6399, 1, 'ENVIADA', 100, 1), origem(6399, 2, 'REJEITADA', 200, 2), origem(6721, 1, 'VALIDANDO', 50, 3)];
  const c1 = contexto(), c2 = contexto(); c1.saldo_cartao.despesas_pendentes = 150;
  c2.ultima_recarga.cartao_recarga_id = 2; c2.saldo_cartao.despesas_pendentes = 200;
  consultas = 0; acessos = [];
  r = await enriquecer({ ...c1, recargas: [c1, c2] }, admin);
  assert.equal(consultas, 1); assert.deepEqual(acessos, [6399, 6721]);
  assert.equal(r.recargas[0].prestacoes_pendentes_saldo.length, 2); assert.equal(r.recargas[1].prestacoes_pendentes_saldo.length, 1);
  assert.deepEqual(json(r.recargas[0].saldo_cartao), c1.saldo_cartao);
  const n = consultas;
  await enriquecer({ ...contexto(), historico_restrito: true }, admin);
  await enriquecer({ ultima_recarga: contexto().ultima_recarga }, admin);
  await enriquecer({ ...contexto(), saldo_cartao: { ...saldo, despesas_pendentes: 0 } }, admin);
  assert.equal(consultas, n, 'Nao buscar origem em contexto restrito/sem saldo/sem gastos');
  registros = [origem()]; aclFalha = true; r = await enriquecer(contexto(), obra); aclFalha = false;
  assert.equal(r.prestacoes_pendentes_saldo.length, 0); assert.equal(r.origens_prestacoes_incompletas, true);
  queryFalha = true; r = await enriquecer(contexto(), obra); queryFalha = false;
  assert.deepEqual(json(r.saldo_cartao), saldo); assert.equal(r.prestacoes_pendentes_saldo.length, 0);
  registros = Array.from({ length: 101 }, (_, i) => origem(6399, 1, 'ENVIANDO', 1, i + 1));
  r = await enriquecer(contexto(), obra); assert.equal(r.prestacoes_pendentes_saldo.length, 100); assert(r.origens_prestacoes_incompletas);
  // Integracao HTTP: origem inicial e origens relacionadas passam pela ACL.
  registros = [origem()]; const controller = { exports: {} };
  vm.runInNewContext(ler('controllers/RecargaCartaoController.js'), { module: controller, console: { error() {} }, require: name => {
    if (name === '../services/recargaCartaoService') return { obterContextoSolicitacao: async () => contexto(), obterContextoCartao: async () => contexto() };
    if (name === '../services/solicitacaoRetornoService') return retorno;
    if (name === '../services/recargaCartaoSaldoLeituraService') return modulo.exports; throw Error(name);
  } });
  async function chamar(acao, req) {
    let status = 200, body; const res = { json: b => { body = b; }, status: s => { status = s; return res; } };
    await controller.exports[acao](req, res); return { status, body };
  }
  r = await chamar('contextoSolicitacao', { ...obra, params: { id: 6721 } });
  assert.equal(r.status, 200); assert.equal(r.body.prestacoes_pendentes_saldo[0].solicitacao_id, 6399);
  r = await chamar('contextoSolicitacao', { ...geo, params: { id: 6721 } });
  assert.equal(r.status, 200); assert.equal(r.body.prestacoes_pendentes_saldo.length, 0);
  r = await chamar('contextoSolicitacao', { ...geo, params: { id: 999 } }); assert.equal(r.status, 403);
  r = await chamar('contextoCartao', { ...obra, params: { id: 1 }, query: { obra_id: 107 } });
  assert.equal(r.body.prestacoes_pendentes_saldo[0].solicitacao_id, 6399);
  // Motor financeiro ORIGINAL: recarga nao paga continua sem credito, gastos
  // rejeitados continuam abatidos. A projecao nao participa deste calculo.
  const financeiro = { exports: {} };
  const pagamentos = [{ titulo: { status: 'QUITADO', valor_baixado: 2000 }, prestacao: origem().prestacao },
    { titulo: { status: 'ABERTO', valor_baixado: 0 } }];
  vm.runInNewContext(ler('services/cartaoRecargaSaldoService.js'), { module: financeiro, require: name => {
    if (name === 'node:crypto') return require(name);
    if (name === '../models') return { SolicitacaoRecargaCartao: { findAll: async () => pagamentos }, CartaoRecargaSaldoAjuste: { findAll: async () => [] } };
    throw Error(name);
  } });
  const calculado = await financeiro.exports.obterSaldo(1);
  assert.equal(calculado.creditos_efetivos, 2000); assert.equal(calculado.saldo_disponivel, 772.35);
  assert.equal(calculado.despesas_pendentes, 1227.65); assert.equal(calculado.saldo_validado, 2000);
  pagamentos[0].prestacao.status = 'VALIDADA';
  const validado = await financeiro.exports.obterSaldo(1);
  assert.equal(validado.saldo_disponivel, 772.35); assert.equal(validado.despesas_pendentes, 0);
  assert.equal(validado.revisao, calculado.revisao); assert.equal(validado.saldo_validado, 772.35);
  console.log('OK saldo recarga: origem SOL-6399 distinta da nova SOL-6721, valores/revisao intactos, multicartoes/varias origens, ACL real OBRA/GEO/SUPERADMIN/exclusao, negativas/falhas fechadas, consulta limitada/cache, controller e calculo financeiro original. Sem banco/rede/escrita.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
