'use strict';

/**
 * Valida o "olho" do Painel do Gestor sem banco:
 * - PIN (formato, hash bcrypt, nunca devolvido), abrir com PIN errado/certo, limite 429,
 *   fechar idempotente, estado por usuario, cache invalidado ao fechar/abrir;
 * - mascaramento das 3 respostas REAIS (os servicos rodam de verdade sobre models falsos):
 *   nenhum numero financeiro sobra, nenhum "R$" sobra, ids/nomes/contagens preservados;
 * - controller: cabecalho X-Painel-Valores-Ocultos, POST saldos 423 com olho fechado;
 * - rotas e permissoes presentes em routes.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const authorizationService = require('../src/services/authorizationService');
const db = require('../src/models');

// resolverEscopo (painelGestorService) le a permissao no require: fixa "todas as obras".
const originalPermissionResolver = authorizationService.getAreaPermissionStateForUser;
authorizationService.getAreaPermissionStateForUser = async () => ({ bypass: true, permissions: [] });
delete require.cache[require.resolve('../src/services/painelGestorService')];

const painelGestorService = require('../src/services/painelGestorService');
const { gerarResultadoObras } = require('../src/services/resultadoObrasService');
const planejamentoService = require('../src/modules/custosRecebiveis/services/planejamentoService');
const renegociacaoLeitura = require('../src/services/tituloRenegociacaoLeitura');
const {
  criarPainelGestorOlhoService,
  mascararValores,
  chaveFinanceira,
  chaveOlho,
  CHAVE_PIN
} = require('../src/services/painelGestorOlhoService');
const { criarPainelGestorController } = require('../src/controllers/PainelGestorController');

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

function criarConfiguracaoFake() {
  const rows = [];
  let nextId = 1;
  const wrap = (row) => ({
    ...row,
    async update(values) {
      Object.assign(row, values, { updatedAt: new Date() });
      Object.assign(this, values);
      return this;
    }
  });
  return {
    rows,
    async findOne({ where }) {
      const found = rows.filter((item) => item.chave === where.chave).sort((a, b) => b.id - a.id)[0];
      return found ? wrap(found) : null;
    },
    async create(values) {
      const row = { id: nextId++, ...values, createdAt: new Date(), updatedAt: new Date() };
      rows.push(row);
      return wrap(row);
    },
    async destroy({ where }) {
      let removed = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].chave === where.chave) {
          rows.splice(index, 1);
          removed += 1;
        }
      }
      return removed;
    }
  };
}

function criarRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; }
  };
}

async function esperarErro(promise, statusCode, code) {
  try {
    await promise;
  } catch (error) {
    assert.strictEqual(error.statusCode, statusCode, `status esperado ${statusCode}, veio ${error.statusCode} (${error.code})`);
    assert.strictEqual(error.code, code);
    return error;
  }
  throw new Error(`Era esperado erro ${code}`);
}

/** Chaves numericas que podem sobrar apos o mascaramento (contagens/ids/prioridade). */
const NUMEROS_PERMITIDOS = new Set([
  'id', 'quantidade', 'quantidade_contratos_venda', 'itens', 'alertas', 'prioridade', 'total_obras',
  'contas_informadas', 'contas_total', 'contas_pendentes', 'vgv_unidades_total', 'vgv_unidades_sem_valor',
  'obras_com_custo_acima', 'movimentos_sem_mapeamento', 'recebiveis_vencidos'
]);

/** Percorre o JSON mascarado e falha se sobrar dinheiro. */
function assertSemValorFinanceiro(masked, sentinelas, rotulo) {
  const texto = JSON.stringify(masked);
  assert(!texto.includes('R$'), `${rotulo}: sobrou "R$" no JSON mascarado`);
  sentinelas.forEach((valor) => {
    const variantes = [
      String(valor),
      valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      valor.toFixed(2)
    ];
    variantes.forEach((v) => assert(!texto.includes(v), `${rotulo}: sentinela ${v} vazou`));
  });
  const walk = (node, key, trilha) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, key, `${trilha}[${index}]`));
      return;
    }
    if (typeof node === 'object') {
      Object.entries(node).forEach(([childKey, value]) => walk(value, childKey, `${trilha}.${childKey}`));
      return;
    }
    if (typeof node === 'number') {
      const k = String(key || '');
      const permitido = NUMEROS_PERMITIDOS.has(k) || k.endsWith('_id');
      assert(permitido, `${rotulo}: numero ${node} sobrou em ${trilha}`);
      assert(!chaveFinanceira(k), `${rotulo}: numero em chave financeira ${trilha}`);
    }
    if (typeof node === 'string' && chaveFinanceira(key)) {
      assert(!/^\s*-?[\d.,]+\s*$/.test(node), `${rotulo}: string numerica em chave financeira ${trilha}`);
    }
  };
  walk(masked, null, rotulo);
}

function mesmaEstrutura(a, b, trilha = '$') {
  if (Array.isArray(a)) {
    assert(Array.isArray(b), `${trilha}: deveria ser lista`);
    assert.strictEqual(a.length, b.length, `${trilha}: tamanho da lista mudou`);
    a.forEach((item, index) => mesmaEstrutura(item, b[index], `${trilha}[${index}]`));
    return;
  }
  if (a && typeof a === 'object') {
    assert(b && typeof b === 'object', `${trilha}: deveria ser objeto`);
    assert.deepStrictEqual(Object.keys(b).sort(), Object.keys(a).sort(), `${trilha}: chaves mudaram`);
    Object.keys(a).forEach((key) => mesmaEstrutura(a[key], b[key], `${trilha}.${key}`));
  }
}

// ---------------------------------------------------------------------------
// Fixtures REAIS: os servicos rodam com models falsos
// ---------------------------------------------------------------------------

const S = {
  vgv: 7340001.11,
  planilha: 5230002.22,
  pagarOriginal: 1210003.33,
  pagarBaixado: 980004.44,
  pagarSaldo: 230005.55,
  receberOriginal: 1650006.66,
  receberBaixado: 1120007.77,
  receberSaldo: 530008.88,
  historico: 45009.99,
  vendido: 2890010.1,
  custoPrevisto: 310011.21,
  receitaPrevista: 420012.32,
  medido: 380013.43,
  custoRealizado: 355014.54,
  recebidoCr: 210015.65,
  saldoManual: 87016.76,
  saldoCaixa: 12017.87,
  saldoAnterior: 80018.98,
  saldoInicial: 5019.09
};
const SENTINELAS = Object.values(S);

async function fixtureResultadoObras() {
  const originals = {
    Obra: db.Obra.findAll,
    TituloFinanceiro: db.TituloFinanceiro.findAll,
    TituloFinanceiroRateio: db.TituloFinanceiroRateio.findAll,
    ObraCustoHistorico: db.ObraCustoHistorico.findAll,
    ContratoComercial: db.ContratoComercial.findAll,
    buscarTitulos: renegociacaoLeitura.buscarTitulos
  };
  try {
    db.Obra.findAll = async () => [
      { id: 11, codigo: 'OB-11', nome: 'Obra Privada Alfa', cidade: 'Vitoria', classificacao: 'PRIVADA', vgv: S.vgv, planilha_geral: null, margem_custo_esperada: 18.5 },
      { id: 12, codigo: 'OB-12', nome: 'Obra Publica Beta', cidade: 'Serra', classificacao: 'PUBLICA', vgv: null, planilha_geral: S.planilha, margem_custo_esperada: 12 }
    ];
    db.TituloFinanceiro.findAll = async () => [
      { obra_id: 11, tipo: 'PAGAR', total_valor_original: S.pagarOriginal, total_valor_baixado: S.pagarBaixado, total_valor_saldo: S.pagarSaldo, quantidade: 7 },
      { obra_id: 11, tipo: 'RECEBER', total_valor_original: S.receberOriginal, total_valor_baixado: S.receberBaixado, total_valor_saldo: S.receberSaldo, quantidade: 4 },
      { obra_id: 12, tipo: 'PAGAR', total_valor_original: S.pagarOriginal, total_valor_baixado: S.pagarBaixado, total_valor_saldo: S.pagarSaldo, quantidade: 3 },
      { obra_id: 12, tipo: 'RECEBER', total_valor_original: S.receberOriginal, total_valor_baixado: S.receberBaixado, total_valor_saldo: S.receberSaldo, quantidade: 2 }
    ];
    db.TituloFinanceiroRateio.findAll = async () => [];
    db.ObraCustoHistorico.findAll = async () => [
      { obra_id: 12, tipo: 'PAGAR', valor: S.historico, data_pagamento: '2025-01-10' }
    ];
    db.ContratoComercial.findAll = async () => [
      { obra_id: 11, valor_vendido: S.vendido, quantidade_contratos: 9 }
    ];
    renegociacaoLeitura.buscarTitulos = async () => [];
    return await gerarResultadoObras({ query: {}, obraIdsEscopo: null });
  } finally {
    db.Obra.findAll = originals.Obra;
    db.TituloFinanceiro.findAll = originals.TituloFinanceiro;
    db.TituloFinanceiroRateio.findAll = originals.TituloFinanceiroRateio;
    db.ObraCustoHistorico.findAll = originals.ObraCustoHistorico;
    db.ContratoComercial.findAll = originals.ContratoComercial;
    renegociacaoLeitura.buscarTitulos = originals.buscarTitulos;
  }
}

async function fixtureCustosRecebiveis() {
  const competencia = '2026-09';
  const obras = [
    { id: 21, codigo: 'OB-21', nome: 'Obra Publica Gama', classificacao: 'PUBLICA', tipo_centro_custo: 'OBRA' },
    { id: 22, codigo: 'OB-22', nome: 'Obra Privada Delta', classificacao: 'PRIVADA', tipo_centro_custo: 'OBRA' }
  ];
  const chamadasTitulo = [];
  const deps = {
    Obra: { findAll: async () => obras },
    CrCompetencia: {
      findAll: async () => [
        { id: 301, obra_id: 21, competencia, estado: 'EM_ANDAMENTO', total_custo_previsto: S.custoPrevisto, total_receita_prevista: S.receitaPrevista },
        { id: 302, obra_id: 22, competencia, estado: 'FINALIZADA', total_custo_previsto: S.custoPrevisto, total_receita_prevista: S.receitaPrevista }
      ]
    },
    CrRealizado: { findAll: async () => [{ competencia_id: 301, estado: 'NAO_MAPEADO', plano_item_id: null }] },
    CrMedicaoConsolidada: { findAll: async () => [{ competencia_id: 301, valor_medido: S.medido }] },
    CrMedicaoSemRegistro: { findAll: async () => [] },
    TituloFinanceiroRateio: { findAll: async () => [] },
    TituloFinanceiro: {
      // Custo (PAGAR) e recebido (RECEBER) sao buscados uma vez por obra, na ordem das obras.
      findAll: async ({ where }) => {
        const sequencia = chamadasTitulo.filter((tipo) => tipo === where.tipo).length;
        chamadasTitulo.push(where.tipo);
        const obraId = obras[sequencia % obras.length].id;
        if (where.tipo === 'PAGAR') {
          return [{ id: 900 + obraId, obra_id: obraId, possui_rateio: false, status: 'ABERTO', valor_original: S.custoRealizado, valor_saldo: S.custoRealizado, valor_baixado: 0, data_emissao: `${competencia}-10`, rateios: [] }];
        }
        return [{ id: 800 + obraId, obra_id: obraId, rateios: [], movimentos: [{ id: 1, valor: S.recebidoCr, data_movimento: `${competencia}-15` }] }];
      }
    },
    ContratoComercialParcela: { findAll: async () => [] },
    ContratoComercial: {},
    MovimentoFinanceiro: {},
    listarMinhasObrigacoes: async () => ({ items: [] }),
    resolverEscopoObras: async () => ({ todas: true, obraIds: [] })
  };
  const payload = await planejamentoService.obterDashboard({ id: 1 }, competencia, null, null, null, deps);
  // Macros so aparecem com obra selecionada (buildComparison): anexa com o formato real.
  payload.macros = [{
    codigo: '01', previsto: S.custoPrevisto, realizado: S.custoRealizado, itens: 3,
    nome: 'Fundacoes', delta: 44003.33, percentual_execucao: 114.2, estado: 'ACIMA'
  }];
  return payload;
}

async function fixtureSaldos() {
  const originals = {
    ContaBancaria: db.ContaBancaria.findAll,
    SaldoDiario: db.PainelGestorSaldoDiario.findAll,
    Sessao: db.CaixaFinanceiroSessao.findAll,
    Historico: db.PainelGestorSaldoHistorico.findAll
  };
  const hoje = painelGestorService.dateInSaoPaulo();
  try {
    db.ContaBancaria.findAll = async () => [
      { id: 41, nome: 'Conta Movimento', empresa_id: 3, tipo_operacional: 'BANCO', banco: '001', agencia: '1234', conta: '99999-1', saldo_inicial: S.saldoInicial, exige_abertura_fechamento: false, empresa: { id: 3, nome: 'Empresa A' } },
      { id: 42, nome: 'Caixa Obra', empresa_id: 3, tipo_operacional: 'CAIXA_INTERNO', banco: null, agencia: null, conta: null, saldo_inicial: S.saldoInicial, exige_abertura_fechamento: true, empresa: { id: 3, nome: 'Empresa A' } },
      { id: 43, nome: 'Conta Pendente', empresa_id: 4, tipo_operacional: 'BANCO', banco: '237', agencia: '1', conta: '2', saldo_inicial: S.saldoInicial, exige_abertura_fechamento: false, empresa: { id: 4, nome: 'Empresa B' } }
    ];
    db.PainelGestorSaldoDiario.findAll = async () => [{
      id: 501, conta_bancaria_id: 41, saldo_disponivel: String(S.saldoManual), corrigido: false,
      createdAt: `${hoje}T10:00:00.000Z`, updatedAt: `${hoje}T11:00:00.000Z`,
      informadoPor: { id: 7, nome: 'Ana' }, atualizadoPor: { id: 7, nome: 'Ana' }
    }];
    db.CaixaFinanceiroSessao.findAll = async () => [{
      id: 601, conta_bancaria_id: 42, status: 'ABERTO', data_abertura: hoje, data_fechamento: null,
      saldo_abertura: S.saldoAnterior, saldo_sistema: S.saldoCaixa, saldo_informado: null, updatedAt: `${hoje}T09:00:00.000Z`
    }];
    db.PainelGestorSaldoHistorico.findAll = async () => [{
      id: 701, saldo_diario_id: 501, conta_bancaria_id: 41, saldo_anterior: String(S.saldoAnterior),
      saldo_novo: String(S.saldoManual), acao: 'ATUALIZADO', justificativa: null,
      createdAt: `${hoje}T11:00:00.000Z`, usuario: { id: 7, nome: 'Ana' }
    }];
    return await painelGestorService.carregarSaldosDaData({ id: 1 }, hoje, { incluirPendentes: true });
  } finally {
    db.ContaBancaria.findAll = originals.ContaBancaria;
    db.PainelGestorSaldoDiario.findAll = originals.SaldoDiario;
    db.CaixaFinanceiroSessao.findAll = originals.Sessao;
    db.PainelGestorSaldoHistorico.findAll = originals.Historico;
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

async function testarPinEOlho() {
  const ConfiguracaoSistema = criarConfiguracaoFake();
  const eventos = [];
  let agora = Date.parse('2026-09-29T12:00:00Z');
  const olho = criarPainelGestorOlhoService({
    ConfiguracaoSistema,
    bcrypt,
    registrarEventoSeguranca: async (evento) => { eventos.push(evento); },
    now: () => agora,
    cacheTtlMs: 3000
  });
  const admin = { id: 1 };
  const gestor = { id: 2 };
  const outro = { id: 3 };
  const req = { ip: '10.0.0.5', headers: {} };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  // Estado inicial: aberto, sem PIN.
  assert.deepStrictEqual(await olho.obterEstado(gestor), { fechado: false, pin_configurado: false });
  assert.deepStrictEqual(await olho.obterConfiguracaoPin(), { configurado: false, atualizado_em: null });

  // Formato do PIN.
  for (const invalido of ['123', '12345', 'abcd', '12a4', '', null, 1234, ' 1234', '1234\n']) {
    await esperarErro(olho.definirPin(admin, invalido, req), 400, 'PIN_FORMATO_INVALIDO');
  }
  assert.strictEqual(ConfiguracaoSistema.rows.length, 0, 'PIN invalido nao pode gravar nada');

  // Hash bcrypt, nunca devolvido.
  const resposta = await olho.definirPin(admin, '0427', req);
  assert.deepStrictEqual(resposta, { configurado: true });
  const pinRow = ConfiguracaoSistema.rows.find((row) => row.chave === CHAVE_PIN);
  const armazenado = JSON.parse(pinRow.valor);
  assert(!pinRow.valor.includes('0427'), 'PIN em texto puro no banco');
  assert(/^\$2[aby]\$/.test(armazenado.hash), 'PIN deve ser hash bcrypt');
  assert(await bcrypt.compare('0427', armazenado.hash));
  const config = await olho.obterConfiguracaoPin();
  assert.strictEqual(config.configurado, true);
  assert(config.atualizado_em);
  assert(!JSON.stringify(config).includes(armazenado.hash), 'hash nao pode sair na configuracao');
  assert(!JSON.stringify(await olho.obterEstado(gestor)).includes('$2'), 'hash nao pode sair no estado');
  await flush();
  assert(eventos.some((e) => e.tipoEvento === 'PAINEL_GESTOR_PIN_ALTERADO'));

  // Abrir com olho ja aberto: nao exige PIN.
  assert.deepStrictEqual(await olho.abrir(gestor, undefined, req), { fechado: false });

  // Fechar idempotente e por usuario.
  assert.deepStrictEqual(await olho.fechar(gestor, req), { fechado: true });
  assert.deepStrictEqual(await olho.fechar(gestor, req), { fechado: true });
  const linhasOlho = ConfiguracaoSistema.rows.filter((row) => row.chave === chaveOlho(2));
  assert.strictEqual(linhasOlho.length, 1, 'fechar duas vezes nao duplica registro');
  const valorOlho = JSON.parse(linhasOlho[0].valor);
  assert.strictEqual(valorOlho.fechado, true);
  assert(valorOlho.fechado_em);
  assert.strictEqual(await olho.estaFechado(gestor), true);
  assert.strictEqual(await olho.estaFechado(outro), false, 'estado e por usuario');
  assert.deepStrictEqual(await olho.obterEstado(gestor), { fechado: true, pin_configurado: true });
  await flush();
  assert.strictEqual(eventos.filter((e) => e.tipoEvento === 'PAINEL_GESTOR_OLHO_FECHADO').length, 1, 'fechar repetido audita uma vez');

  // Outro "navegador" (outra instancia do servico = outro processo) le do banco.
  const outraInstancia = criarPainelGestorOlhoService({ ConfiguracaoSistema, bcrypt, registrarEventoSeguranca: async () => {} });
  assert.strictEqual(await outraInstancia.estaFechado(gestor), true, 'estado fechado vem do banco');

  // PIN errado: 403 com tentativas restantes.
  const erro = await esperarErro(olho.abrir(gestor, '1111', req), 403, 'PIN_INVALIDO');
  assert.strictEqual(erro.tentativas_restantes, 4);
  await esperarErro(olho.abrir(gestor, 'abcd', req), 403, 'PIN_INVALIDO');
  assert.strictEqual(await olho.estaFechado(gestor), true);

  // PIN certo abre, remove o registro e zera o contador.
  assert.deepStrictEqual(await olho.abrir(gestor, '0427', req), { fechado: false });
  assert.strictEqual(ConfiguracaoSistema.rows.filter((row) => row.chave === chaveOlho(2)).length, 0);
  assert.strictEqual(await olho.estaFechado(gestor), false, 'cache invalidado ao abrir');
  await flush();
  assert(eventos.some((e) => e.tipoEvento === 'PAINEL_GESTOR_OLHO_ABERTO'));
  assert(eventos.some((e) => e.tipoEvento === 'PAINEL_GESTOR_PIN_INVALIDO'));

  // Limite: 5 erradas em 15 min -> 429 com tempo restante; nem o PIN certo passa.
  await olho.fechar(gestor, req);
  for (let i = 0; i < 4; i += 1) {
    await esperarErro(olho.abrir(gestor, String(1000 + i), req), 403, 'PIN_INVALIDO');
  }
  const bloqueio = await esperarErro(olho.abrir(gestor, '1004', req), 429, 'PIN_BLOQUEADO');
  assert(bloqueio.tempo_restante_segundos > 0 && bloqueio.tempo_restante_segundos <= 900);
  assert(bloqueio.bloqueado_ate);
  await esperarErro(olho.abrir(gestor, '0427', req), 429, 'PIN_BLOQUEADO');
  await flush();
  assert(eventos.some((e) => e.tipoEvento === 'PAINEL_GESTOR_PIN_BLOQUEADO'));
  // Tentativas paralelas nao furam o limite (reserva antes do bcrypt).
  const olhoParalelo = criarPainelGestorOlhoService({ ConfiguracaoSistema, bcrypt, registrarEventoSeguranca: async () => {} });
  await olhoParalelo.fechar(outro, req);
  const rajada = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => olhoParalelo.abrir(outro, String(2000 + i), { ip: '10.0.0.9' })));
  const aceitas = rajada.filter((r) => r.status === 'rejected' && r.reason.code === 'PIN_INVALIDO').length;
  assert(aceitas <= 5, `rajada paralela testou ${aceitas} PINs (limite 5)`);
  // Janela expira -> libera.
  agora += 15 * 60 * 1000 + 1000;
  assert.deepStrictEqual(await olho.abrir(gestor, '0427', req), { fechado: false });

  // Limite por IP: varios usuarios do mesmo IP.
  const olhoIp = criarPainelGestorOlhoService({ ConfiguracaoSistema, bcrypt, registrarEventoSeguranca: async () => {}, maxTentativasIp: 6 });
  const reqIp = { ip: '10.9.9.9' };
  await olhoIp.fechar({ id: 50 }, reqIp);
  await olhoIp.fechar({ id: 51 }, reqIp);
  for (let i = 0; i < 4; i += 1) await esperarErro(olhoIp.abrir({ id: 50 }, '9999', reqIp), 403, 'PIN_INVALIDO');
  await esperarErro(olhoIp.abrir({ id: 51 }, '9999', reqIp), 403, 'PIN_INVALIDO');
  await esperarErro(olhoIp.abrir({ id: 51 }, '9999', reqIp), 429, 'PIN_BLOQUEADO');

  // PIN nao configurado com olho fechado -> 409.
  const semPin = criarPainelGestorOlhoService({ ConfiguracaoSistema: criarConfiguracaoFake(), bcrypt, registrarEventoSeguranca: async () => {} });
  await semPin.fechar(gestor, req);
  await esperarErro(semPin.abrir(gestor, '0427', req), 409, 'PIN_NAO_CONFIGURADO');

  // Nenhum evento de auditoria carrega o PIN ou o hash.
  const auditoria = JSON.stringify(eventos.map(({ req: _req, ...rest }) => rest));
  assert(!auditoria.includes('0427') && !auditoria.includes(armazenado.hash), 'auditoria nao pode carregar PIN/hash');
  console.log('  ok PIN, abrir/fechar, limite de tentativas, estado por usuario, auditoria');
}

async function testarMascaramento() {
  const resultado = await fixtureResultadoObras();
  const custos = await fixtureCustosRecebiveis();
  const saldos = await fixtureSaldos();

  // As fixtures precisam de fato carregar os valores (senao o teste nao prova nada).
  assert.strictEqual(resultado.length, 2);
  assert.strictEqual(resultado[0].vgv, S.vgv);
  assert.strictEqual(resultado[1].planilha_geral, S.planilha);
  assert(resultado[0].receber.recebido > 0 && resultado[0].valor_vendido === S.vendido);
  assert(custos.cards.custo_planejado > 0 && custos.cards.medicao_aprovada === S.medido);
  assert.strictEqual(custos.obras_resumo.length, 12, '2 obras x 6 competencias');
  const descricoesComReal = custos.alertas.filter((a) => a.descricao.includes('R$'));
  assert(descricoesComReal.length >= 2, 'fixture deve gerar alertas com R$ (custo acima, glosa, a receber)');
  assert(saldos.resumo.saldo_informado > 0 && saldos.contas.length === 3);
  assert(saldos.historico.length === 1 && saldos.empresas.length === 1);

  const casos = [
    ['resultado-obras', resultado],
    ['custos-recebiveis', custos],
    ['saldos', saldos]
  ];
  casos.forEach(([rotulo, original]) => {
    const antes = JSON.stringify(original);
    const mascarado = JSON.parse(JSON.stringify(mascararValores(original)));
    assert.strictEqual(JSON.stringify(original), antes, `${rotulo}: mascarar nao pode alterar o original`);
    mesmaEstrutura(JSON.parse(antes), mascarado);
    assertSemValorFinanceiro(mascarado, SENTINELAS, rotulo);
  });

  // Preservacoes (identidade, situacao, contagens, datas).
  const r = JSON.parse(JSON.stringify(mascararValores(resultado)));
  assert.deepStrictEqual(r.map((o) => [o.id, o.codigo, o.nome, o.cidade, o.classificacao]), [
    [11, 'OB-11', 'Obra Privada Alfa', 'Vitoria', 'PRIVADA'],
    [12, 'OB-12', 'Obra Publica Beta', 'Serra', 'PUBLICA']
  ]);
  assert.strictEqual(r[0].pagar.quantidade, 7);
  assert.strictEqual(r[0].quantidade_contratos_venda, 9);
  assert.strictEqual(r[0].vgv_origem, 'CADASTRO');
  assert.strictEqual(r[0].vgv, null);
  assert.strictEqual(r[0].margem_custo_esperada, null, 'percentual de margem e ocultado');
  assert.strictEqual(r[0].pagar.historico.valor, null);

  const c = JSON.parse(JSON.stringify(mascararValores(custos)));
  assert.strictEqual(c.competencia, '2026-09');
  assert.strictEqual(c.escopo.total_obras, 2);
  assert.deepStrictEqual(c.obras.map((o) => o.nome), ['Obra Publica Gama', 'Obra Privada Delta']);
  assert.strictEqual(c.cards.percentual_custo, null, 'percentual de custo e ocultado');
  assert.strictEqual(c.cards.tem_medicao_aprovada, true);
  assert.strictEqual(c.cards.obras_com_custo_acima, custos.cards.obras_com_custo_acima);
  assert.strictEqual(c.cards.movimentos_sem_mapeamento, 1);
  c.obras_resumo.forEach((row, index) => {
    assert.strictEqual(row.estado_competencia, custos.obras_resumo[index].estado_competencia);
    assert.strictEqual(row.alertas, custos.obras_resumo[index].alertas);
    assert.strictEqual(row.custo_realizado, null);
  });
  c.alertas.forEach((alerta, index) => {
    assert.strictEqual(alerta.titulo, custos.alertas[index].titulo);
    assert.strictEqual(alerta.tipo, custos.alertas[index].tipo);
    assert.strictEqual(alerta.prioridade, custos.alertas[index].prioridade);
    if (custos.alertas[index].descricao.includes('R$')) assert(alerta.descricao.includes('••••••'));
    else assert.strictEqual(alerta.descricao, custos.alertas[index].descricao);
  });
  assert.strictEqual(c.macros[0].nome, 'Fundacoes');
  assert.strictEqual(c.macros[0].estado, 'ACIMA');
  assert.strictEqual(c.macros[0].itens, 3);
  assert.strictEqual(c.macros[0].delta, null);

  const s = JSON.parse(JSON.stringify(mascararValores(saldos)));
  assert.strictEqual(s.data_referencia, saldos.data_referencia);
  assert.deepStrictEqual(
    [s.resumo.contas_informadas, s.resumo.contas_total, s.resumo.contas_pendentes, s.resumo.completo],
    [2, 3, 1, false]
  );
  assert.strictEqual(s.resumo.saldo_informado, null);
  assert.strictEqual(s.contas[0].saldo.valor, null);
  assert.strictEqual(s.contas[0].saldo.id, 501, 'id do saldo preservado');
  assert.strictEqual(s.contas[0].conta, '99999-1', 'numero da conta nao e valor');
  assert.strictEqual(s.contas[1].saldo.status_caixa, 'ABERTO');
  assert.strictEqual(s.contas[2].saldo, null, 'conta pendente continua pendente');
  assert.strictEqual(s.empresas[0].saldo, null);
  assert.strictEqual(s.empresas[0].contas_informadas, 2);
  assert.strictEqual(s.historico[0].conta_nome, 'Conta Movimento');
  assert.strictEqual(s.historico[0].saldo_novo, null);
  assert.strictEqual(s.historico[0].saldo_anterior, null);
  assert.strictEqual(s.historico[0].acao, 'ATUALIZADO');

  // Unidade: string numerica em chave financeira, lista de valores, texto negativo.
  const unit = mascararValores({ valor: '1.234,56', valores: [1, 2], nota: 'Saldo -R$ 1.234,56 hoje', data_pagamento: '2026-09-01' });
  assert.deepStrictEqual(unit, { valor: null, valores: [null, null], nota: 'Saldo •••••• hoje', data_pagamento: '2026-09-01' });
  console.log('  ok mascaramento das 3 respostas reais (nenhum numero financeiro, nenhum R$)');
  return { resultado, custos, saldos };
}

async function testarController({ resultado, custos, saldos }) {
  const estados = new Map();
  const chamadasSalvar = [];
  const olho = {
    estaFechado: async (user) => estados.get(Number(user.id)) === true,
    obterEstado: async (user) => ({ fechado: estados.get(Number(user.id)) === true, pin_configurado: true }),
    fechar: async (user) => { estados.set(Number(user.id), true); return { fechado: true }; },
    abrir: async (user, pin) => {
      if (pin !== '0427') {
        const error = new Error('Senha incorreta.');
        error.statusCode = 429; error.code = 'PIN_BLOQUEADO'; error.tempo_restante_segundos = 120;
        throw error;
      }
      estados.set(Number(user.id), false);
      return { fechado: false };
    },
    obterConfiguracaoPin: async () => ({ configurado: true, atualizado_em: '2026-09-29T12:00:00.000Z' }),
    definirPin: async () => ({ configurado: true })
  };
  const permissoesPedidas = [];
  const controller = criarPainelGestorController({
    assertPermission: async (user, permission) => { permissoesPedidas.push(permission); },
    resolverEscopo: async () => ({ todas: true, obraIds: null }),
    listarObras: async () => [{ id: 1, codigo: 'OB', nome: 'Obra', cidade: 'X', classificacao: 'PUBLICA', empresa_grupo_id: 1 }],
    gerarResultadoObras: async () => resultado,
    obterDashboard: async () => custos,
    carregarSaldosDaData: async () => saldos,
    salvarSaldos: async (user, body) => { chamadasSalvar.push(body); return { criados: 1 }; },
    olho
  });
  const user = { id: 2 };

  // Aberto: valores reais e cabecalho 0.
  let res = criarRes();
  await controller.resultadoObras({ user, query: {} }, res);
  assert.strictEqual(res.headers['x-painel-valores-ocultos'], '0');
  assert.strictEqual(res.headers['cache-control'], 'no-store');
  assert.strictEqual(res.body[0].vgv, S.vgv);

  res = criarRes();
  await controller.olhoFechar({ user, body: {} }, res);
  assert.deepStrictEqual(res.body, { fechado: true });
  assert(permissoesPedidas.includes('painel_gestor.acessar'), 'olho usa a permissao de acessar o painel');

  const gets = [
    ['resultado-obras', 'resultadoObras'],
    ['custos-recebiveis', 'custosRecebiveis'],
    ['saldos', 'saldos'],
    ['saldos/preenchimento', 'preenchimentoSaldos']
  ];
  for (const [rotulo, metodo] of gets) {
    res = criarRes();
    await controller[metodo]({ user, query: {} }, res);
    assert.strictEqual(res.statusCode, 200, rotulo);
    assert.strictEqual(res.headers['x-painel-valores-ocultos'], '1', `${rotulo}: cabecalho`);
    assertSemValorFinanceiro(res.body, SENTINELAS, `controller ${rotulo}`);
  }

  // Outro usuario continua vendo valores.
  res = criarRes();
  await controller.saldos({ user: { id: 9 }, query: {} }, res);
  assert.strictEqual(res.headers['x-painel-valores-ocultos'], '0');
  assert.strictEqual(res.body.resumo.saldo_informado, saldos.resumo.saldo_informado);

  // /obras nao tem valor (so cadastro).
  res = criarRes();
  await controller.obras({ user, query: {} }, res);
  assertSemValorFinanceiro(res.body, SENTINELAS, 'controller obras');

  // POST saldos com olho fechado -> 423 e nada gravado.
  res = criarRes();
  await controller.salvarSaldos({ user, body: { data_referencia: '2026-09-29', contas: [] } }, res);
  assert.strictEqual(res.statusCode, 423);
  assert.strictEqual(res.body.code, 'PAINEL_FECHADO');
  assert.strictEqual(chamadasSalvar.length, 0);

  // 429 devolve tempo restante e Retry-After.
  res = criarRes();
  await controller.olhoAbrir({ user, body: { pin: '1111' } }, res);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.code, 'PIN_BLOQUEADO');
  assert.strictEqual(res.body.tempo_restante_segundos, 120);
  assert.strictEqual(res.headers['retry-after'], '120');

  res = criarRes();
  await controller.olhoAbrir({ user, body: { pin: '0427' } }, res);
  assert.deepStrictEqual(res.body, { fechado: false });
  res = criarRes();
  await controller.salvarSaldos({ user, body: { data_referencia: '2026-09-29', contas: [] } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(chamadasSalvar.length, 1);

  res = criarRes();
  await controller.pinConfiguracao({ user }, res);
  assert.deepStrictEqual(Object.keys(res.body).sort(), ['atualizado_em', 'configurado']);
  console.log('  ok controller: cabecalho, 423 no POST de saldos, 429 com tempo restante');
}

function testarRotas() {
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  const esperadas = [
    "router.get('/painel-gestor/olho', PainelGestorController.olhoEstado)",
    "router.post('/painel-gestor/olho/fechar', criticalRateLimit, PainelGestorController.olhoFechar)",
    "router.post('/painel-gestor/olho/abrir', criticalRateLimit, PainelGestorController.olhoAbrir)",
    "router.get('/configuracoes/painel-gestor/pin', allowConfiguracoesStatusVinculos, PainelGestorController.pinConfiguracao)",
    "router.put('/configuracoes/painel-gestor/pin', allowConfiguracoesStatusVinculos, criticalRateLimit, PainelGestorController.pinDefinir)",
    "router.get('/painel-gestor/resultado-obras', PainelGestorController.resultadoObras)",
    "router.get('/painel-gestor/custos-recebiveis', PainelGestorController.custosRecebiveis)",
    "router.get('/painel-gestor/saldos', PainelGestorController.saldos)",
    "router.get('/painel-gestor/saldos/preenchimento', PainelGestorController.preenchimentoSaldos)",
    "router.post('/painel-gestor/saldos', criticalRateLimit, PainelGestorController.salvarSaldos)"
  ];
  esperadas.forEach((linha) => assert(routes.includes(linha), `Rota ausente: ${linha}`));
  const controllerSource = fs.readFileSync(path.resolve(__dirname, '../src/controllers/PainelGestorController.js'), 'utf8');
  ['olhoEstado', 'olhoFechar', 'olhoAbrir'].forEach((metodo) => {
    const trecho = controllerSource.slice(controllerSource.indexOf(`async ${metodo}(`));
    assert(/assertPermission\(req\.user, PERMISSIONS\.ACCESS\)/.test(trecho.slice(0, 300)), `${metodo} deve exigir painel_gestor.acessar`);
  });
  assert.strictEqual(painelGestorService.PERMISSIONS.ACCESS, 'painel_gestor.acessar');
  // Isolamento: mascaramento so no controller do painel.
  ['../src/controllers/ResultadoObrasController.js', '../src/services/resultadoObrasService.js', '../src/modules/custosRecebiveis/services/planejamentoService.js']
    .forEach((arquivo) => {
      const source = fs.readFileSync(path.resolve(__dirname, arquivo), 'utf8');
      assert(!source.includes('mascararValores'), `${arquivo} nao pode mascarar`);
    });
  console.log('  ok rotas e permissoes em routes.js');
}

async function main() {
  try {
    await testarPinEOlho();
    const fixtures = await testarMascaramento();
    await testarController(fixtures);
    testarRotas();
    console.log('Olho do Painel do Gestor validado com sucesso.');
  } finally {
    authorizationService.getAreaPermissionStateForUser = originalPermissionResolver;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
