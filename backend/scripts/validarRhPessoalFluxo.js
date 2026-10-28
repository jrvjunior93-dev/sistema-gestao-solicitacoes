'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Op } = require('sequelize');
const domain = require('../src/services/rhPessoalDomain');
const { ValidationError } = require('../src/middlewares/validation');

function carregar(nome, mocks) {
  const arquivo = path.join(__dirname, '../src/services', nome);
  const sandbox = { module: { exports: {} }, exports: {}, console, Date,
    require: key => { if (key === '../utils/pix') return require('../src/utils/pix'); if (key in mocks) return mocks[key]; throw new Error(`Dependencia nao simulada: ${key}`); } };
  vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), sandbox, { filename: arquivo });
  return sandbox.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const periodo = { inicio: '2026-09-01', fim: '2026-09-15' };
const empregado = { id: 1, data_admissao: '2026-08-01' };
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-09-10' }], empregado, periodo), 6);
assert.equal(domain.diasVinculados([
  { colaborador_id: 1, vigencia_inicio: '2026-08-01', vigencia_fim: '2026-09-05' },
  { colaborador_id: 1, vigencia_inicio: '2026-09-10' },
  { colaborador_id: 1, vigencia_inicio: '2026-09-12' },
  { colaborador_id: 2, vigencia_inicio: '2026-09-01' }
], empregado, periodo), 11, 'Nao duplicar retorno e sobreposicoes');
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-08-01' }],
  { ...empregado, data_admissao: '2026-09-03', data_demissao: '2026-09-07' }, periodo), 5);
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2026-10-01' }], empregado, periodo), 0);
assert.equal(domain.diasVinculados([{ colaborador_id: 1, vigencia_inicio: '2024-02-01' }], { id: 1 },
  { inicio: '2024-02-01', fim: '2024-02-29' }), 29);
assert.equal(domain.ehTransferencia({ tipo: 'TROCA_OBRA', obra_id: 1, dados_json: { primeira_lotacao: true } }), false);

const hoje = '2026-09-18';
const usuarios = [{ id: 11 }, { id: 22 }, { id: 33 }, { id: 44 }];
let requests = [], history = [], responsabilidades = [], colaborador, aberto, atualizacoes, ultimaConsulta;
let proximoId = 1, falharHistorico = false, filaTransacoes = Promise.resolve();
const obras = [1, 2, 3].map(id => ({ id, nome: `Obra ${id}`, codigo: String(id), ativo: true, tipo_centro_custo: 'OBRA',
  get() { return { id: this.id, nome: this.nome, codigo: this.codigo }; } }));
function instancia(d) { return { ...d, async update(p) { Object.assign(this, p); return this; }, get() { return { ...this }; } }; }
function reset() {
  requests = []; history = []; atualizacoes = 0; falharHistorico = false;
  responsabilidades = [{ obra_id: 1, user_id: 11 }, { obra_id: 2, user_id: 22 }];
  colaborador = instancia({ id: 7, nome: 'Ana', matricula: 'M7', cargo: 'Pedreira', status: 'ATIVO',
    obra_id: 1, setor_id: 2, salario_base: 9876, cpf: 'SECRETO', data_admissao: '2026-09-01' });
  aberto = instancia({ obra_id: 1, vigencia_inicio: '2026-09-01' });
}
const db = {
  sequelize: { transaction: async fn => {
    const anteriorNaFila = filaTransacoes;
    let liberar;
    filaTransacoes = new Promise(resolve => { liberar = resolve; });
    await anteriorNaFila;
    const anterior = plain({ requests, history, colaborador, aberto, atualizacoes, proximoId });
    try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (e) {
      requests = anterior.requests.map(instancia); history = anterior.history;
      colaborador = instancia(anterior.colaborador); aberto = anterior.aberto ? instancia(anterior.aberto) : null;
      atualizacoes = anterior.atualizacoes; proximoId = anterior.proximoId; throw e;
    } finally { liberar(); }
  },
    where: (campo, valor) => ({ comparacao: { campo, valor } }), cast: campo => ({ cast: campo }), json: caminho => ({ json: caminho }) },
  RhColaborador: {
    findByPk: async (id, options) => { assert.equal(options.lock, 'UPDATE'); return Number(id) === 7 ? colaborador : null; },
    findAndCountAll: async options => {
      ultimaConsulta = options;
      const campos = Object.fromEntries(options.attributes.map(k => [k, colaborador[k]]));
      return { count: 1, rows: [{ get: () => campos }] };
    }
  },
  RhSolicitacao: {
    findAndCountAll: async options => {
      ultimaConsulta = options;
      const filtradas = requests.filter(s => atende(s, options.where));
      return { count: filtradas.length, rows: filtradas.slice(options.offset, options.offset + options.limit) };
    },
    create: async dados => { const s = instancia({ ...dados, id: proximoId++ }); requests.push(s); return s; },
    findOne: async () => requests.find(s => ['ABERTA', 'RASCUNHO'].includes(s.situacao)),
    findByPk: async id => requests.find(s => s.id === Number(id)),
    findAll: async () => requests
  },
  RhSolicitacaoHistorico: { create: async d => {
    if (falharHistorico && ['APROVAR', 'APROVACAO_AUTOMATICA'].includes(d.acao)) throw new Error('Falha QA historico');
    const h = { ...d, id: history.length + 1 }; history.push(h); return h;
  }, findAll: async () => history },
  CrResponsavelObra: { findAll: async ({ where }) => {
    assert.equal(where.ativo, true); assert.equal(where.vigencia_inicio[Op.lte], hoje);
    assert.equal(where[Op.or][1].vigencia_fim[Op.gte], hoje);
    return responsabilidades.filter(r => !where.user_id || r.user_id === where.user_id);
  } },
  Obra: { findAll: async ({ where }) => obras.filter(o => o.ativo && (!where.id || where.id.includes(o.id))
    && (!where.tipo_centro_custo || where.tipo_centro_custo[Op.in].includes(o.tipo_centro_custo))), findByPk: async id => obras.find(o => o.id === Number(id)) }
};
function atende(s, where) {
  return Reflect.ownKeys(where).every(chave => {
    const valor = where[chave];
    if (chave === Op.and) return valor.every(v => atende(s, v));
    if (chave === Op.or) return valor.some(v => atende(s, v));
    if (chave === 'comparacao') return Number(s.dados_json.obra_destino_id) === Number(valor.valor);
    const campo = chave.startsWith('$colaborador.') ? s.colaborador[chave.slice(13, -1)] : s[chave];
    if (valor && typeof valor === 'object') {
      if (valor[Op.in]) return valor[Op.in].includes(campo);
      if (valor[Op.like]) return String(campo).toLowerCase().includes(valor[Op.like].slice(1, -1).toLowerCase());
      throw new Error('Operador nao coberto no teste');
    }
    return campo === valor;
  });
}
const service = carregar('rhTransferenciaService.js', {
  sequelize: { Op }, '../models': db, '../middlewares/validation': { ValidationError },
  './authorizationService': { getUserObraIds: async user => [33, 66, 99].includes(user.id) ? [] : user.id === 55 ? [2] : [1],
    isSuperadmin: u => u.id === 99, getRhDpObraScopeIds: async u => [44, 55, 67, 77].includes(u.id) ? [1] : null,
    userHasAreaPermission: async (u, keys) => keys.includes('rh_dp.solicitacoes.abrir') && ![68, 77].includes(u.id) },
  './setorCapabilityService': { userBelongsToDpSetor: async u => [66, 67, 68].includes(u.id),
    userHasSetorCapability: async u => [44, 55, 67, 77].includes(u.id) },
  './notificacoes': { criarNotificacaoDireta: async () => {} },
  './rhSolicitacaoCodigoService': { garantirCodigoRhSolicitacao: async () => {} },
  '../constants/centroCusto': require('../src/constants/centroCusto'),
  '../utils/codigoDoSetor': { codigoDoSetor: () => 'OBRA' },
  './rhPessoalDomain': { ...domain, hojeLocal: () => hoje },
  './rhVinculoObraService': { vinculoAberto: async () => aberto, registrarVinculo: async d => {
    assert.equal(d.vigenciaInicio, hoje, 'Ignorar vigencia enviada pelo cliente');
    atualizacoes++; aberto = instancia({ obra_id: d.obraId, vigencia_inicio: hoje });
  } },
  './rhSolicitacaoAtividadeService': { comAtividade: async s => s, marcarLida: async () => {} }
});

async function validarTransferencias() {
  reset();
  const payload = { colaborador_id: 7, obra_destino_id: 2, obra_solicitante_id: 1, justificativa: 'Enviar para outra obra', data_vigencia: '2000-01-01' };
  const divergentes = [
    ['SEM_VINCULO_ABERTO', () => { aberto = null; }],
    ['OBRA_DO_VINCULO_DIVERGENTE', () => { aberto.obra_id = 3; }],
    ['VINCULO_COM_INICIO_FUTURO', () => { aberto.vigencia_inicio = '2026-12-01'; }],
    ['ADMISSAO_FUTURA', () => { colaborador.data_admissao = '2026-12-01'; }],
    ['ADMISSAO_FUTURA', () => { colaborador.data_admissao = null; colaborador.data_inicio = '2026-12-01'; }],
    ['DATA_DESLIGAMENTO_ANTERIOR', () => { colaborador.data_demissao = '2026-09-01'; }]
  ];
  for (const [motivo, preparar] of divergentes) for (const administrativa of [false, true]) {
    reset(); preparar();
    const vinculoAntes = plain(aberto), cadastroAntes = plain(colaborador);
    const pedido = await service.abrir(administrativa ? { id: 66 } : usuarios[0], payload);
    if (!administrativa) {
      assert.equal(colaborador.obra_id, 1, 'Solicitar continua sem efetivar');
      await Promise.all([service.agir(usuarios[1], pedido.id, 'aprovar'), service.agir(usuarios[1], pedido.id, 'aprovar')]);
    }
    assert.equal(colaborador.obra_id, 2);
    assert.equal(requests[0].situacao, 'APROVADA');
    assert.equal(requests[0].dados_json.data_vigencia, hoje);
    assert.ok(requests[0].dados_json.lotacao_historica_preservada.motivos.includes(motivo));
    assert.deepEqual(plain(aberto), vinculoAntes, 'Nao reescrever periodos divergentes');
    assert.equal(colaborador.data_admissao, cadastroAntes.data_admissao);
    assert.equal(colaborador.data_demissao, cadastroAntes.data_demissao);
    const semLocalAtual = p => { const { obra_id, atualizado_por, ...demais } = p; return demais; };
    assert.deepEqual(semLocalAtual(plain(colaborador)), semLocalAtual(cadastroAntes), 'Nenhum outro dado do colaborador muda');
    assert.equal(atualizacoes, 0, 'Nao criar periodo sobre historico divergente');
    assert.equal(history.filter(h => h.acao === 'LOTACAO_HISTORICA_PRESERVADA').length, 1);
    assert.match(history.find(h => h.acao === 'LOTACAO_HISTORICA_PRESERVADA').descricao, /Pagamentos permanecem/);
  }
  for (const administrativa of [false, true]) {
    reset(); aberto = null;
    if (administrativa) {
      falharHistorico = true;
      await assert.rejects(service.abrir({ id: 66 }, payload), /Falha QA/);
      assert.equal(requests.length, 0); assert.equal(history.length, 0);
    } else {
      const pedido = await service.abrir(usuarios[0], payload);
      falharHistorico = true;
      await assert.rejects(service.agir(usuarios[1], pedido.id, 'aprovar'), /Falha QA/);
      assert.equal(requests[0].situacao, 'ABERTA'); assert.equal(history.length, 1);
    }
    assert.equal(colaborador.obra_id, 1, 'Falha posterior reverte mudanca e auditoria');
    assert.equal(aberto, null);
  }
  reset(); colaborador.status = 'DEMITIDO'; aberto = null;
  await assert.rejects(service.abrir({ id: 66 }, payload), /ativo/);
  assert.equal(requests.length, 0);
  reset();
  const antesDoDesligamento = await service.abrir(usuarios[0], payload);
  colaborador.status = 'DEMITIDO';
  await assert.rejects(service.agir(usuarios[1], antesDoDesligamento.id, 'aprovar'), /nao esta ativo/);
  assert.equal(requests[0].situacao, 'ABERTA'); assert.equal(colaborador.obra_id, 1);
  reset();
  await service.abrir({ id: 66 }, payload);
  const vinculoDoDia = aberto;
  await service.abrir({ id: 66 }, { ...payload, obra_destino_id: 3 });
  assert.equal(aberto, vinculoDoDia, 'Segunda troca no dia reutiliza o vinculo do dia');
  assert.equal(aberto.vigencia_inicio, hoje); assert.equal(aberto.obra_id, 3);
  assert.equal(atualizacoes, 1); assert.equal(requests.length, 2); assert.equal(history.length, 4);
  reset();
  await assert.rejects(service.abrir(usuarios[2], payload), /vinculado/);
  const p = await service.abrir(usuarios[0], payload);
  assert.equal(colaborador.obra_id, 1, 'Abrir nao transfere');
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 2);
  await assert.rejects(service.abrir(usuarios[0], payload), /em andamento/);
  await assert.rejects(service.agir(usuarios[0], p.id, 'aprovar'), /outro responsavel/);
  await assert.rejects(service.detalhe(usuarios[2], p.id), /restrito/);
  await service.agir(usuarios[1], p.id, 'aprovar');
  await service.agir(usuarios[1], p.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2); assert.equal(atualizacoes, 1, 'Duplo envio nao duplica efeito');
  assert.equal(requests[0].dados_json.data_vigencia, hoje);
  assert.equal(history.length, 2);

  reset();
  const recebe = await service.abrir(usuarios[1], { ...payload, obra_solicitante_id: 2 });
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 1);
  await assert.rejects(service.agir(usuarios[1], recebe.id, 'aprovar'), /outro responsavel/);
  await service.agir(usuarios[0], recebe.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2);

  reset();
  const rejeitada = await service.abrir(usuarios[0], payload);
  await assert.rejects(service.agir(usuarios[1], rejeitada.id, 'rejeitar'), /motivo/);
  await service.agir(usuarios[1], rejeitada.id, 'rejeitar', 'Ainda preciso na obra');
  assert.equal(colaborador.obra_id, 1);
  await assert.rejects(service.agir(usuarios[1], rejeitada.id, 'aprovar'), /ja foi decidida/);

  reset();
  const obsoleta = await service.abrir(usuarios[0], payload);
  colaborador.obra_id = 3;
  await assert.rejects(service.agir(usuarios[1], obsoleta.id, 'aprovar'), /mudou de obra/);
  assert.equal(atualizacoes, 0);

  reset();
  const semResponsavel = await service.abrir(usuarios[0], payload);
  responsabilidades = responsabilidades.filter(r => r.user_id !== 22);
  await assert.rejects(service.agir(usuarios[1], semResponsavel.id, 'aprovar'), /restrito/);
  assert.equal(colaborador.obra_id, 1, 'Responsavel revogado nao aprova');

  reset();
  responsabilidades.push({ obra_id: 2, user_id: 11 });
  const propria = await service.abrir(usuarios[0], payload);
  assert.equal(propria.aprovacao_automatica, true);
  assert.equal(colaborador.obra_id, 2);
  await service.agir(usuarios[1], propria.id, 'comentar', 'Chegada combinada');
  assert.equal(history.at(-1).acao, 'COMENTARIO');
  await assert.rejects(service.agir(usuarios[0], propria.id, 'cancelar'), /decidida/);

  reset();
  aberto.vigencia_inicio = hoje;
  const mesmoDia = await service.abrir(usuarios[0], payload);
  await service.agir(usuarios[1], mesmoDia.id, 'aprovar');
  assert.equal(aberto.obra_id, 2); assert.equal(atualizacoes, 0, 'Sem intervalo negativo no mesmo dia');

  reset();
  await assert.rejects(service.diretorio(usuarios[2]), /vinculados/);
  const diretorio = await service.diretorio(usuarios[0], { busca: 'Ana', obra_id: 99 });
  assert.equal(ultimaConsulta.where.obra_id, undefined, 'Diretorio lista todos os ativos mesmo na tela de uma obra');
  assert(!JSON.stringify(diretorio).includes('SECRETO'));
  assert(!JSON.stringify(diretorio).includes('salario'));
  assert.deepEqual(plain(ultimaConsulta.attributes), ['id', 'nome', 'matricula', 'cargo', 'obra_id']);
  assert.equal(ultimaConsulta.limit, 50);

  reset();
  colaborador.obra_id = null;
  aberto = null;
  await assert.rejects(service.abrir(usuarios[0], payload), /vinculado/);
  const inicial = await service.abrir(usuarios[1], payload);
  assert.equal(inicial.aprovacao_automatica, true);
  assert.equal(colaborador.obra_id, 2);
  assert.equal(requests[0].obra_id, null, 'Nao inventar obra de origem');
  assert.equal(aberto.obra_id, 2);
  assert.equal(atualizacoes, 1, 'Criar vinculo inicial uma unica vez');
  await assert.rejects(service.agir(usuarios[1], inicial.id, 'aprovar'), /outro responsavel/);
  await assert.rejects(service.abrir(usuarios[1], payload), /diferente/);
  assert.equal(atualizacoes, 1);

  reset();
  colaborador.obra_id = null;
  aberto = null;
  colaborador.status = 'INATIVO';
  await assert.rejects(service.abrir(usuarios[1], payload), /ativo/);

  reset();
  const pedidoObra = await service.abrir({ id: 44 }, payload);
  assert.equal(requests[0].dados_json.obra_solicitante_id, 1);
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 2);
  assert.equal(pedidoObra.aprovacao_automatica, false);
  assert.equal(colaborador.obra_id, 1, 'Usuario comum solicita, sem efetivar lotacao');
  assert.equal((await service.detalhe({ id: 44 }, pedidoObra.id)).pode_decidir, false);
  assert.equal((await service.detalhe({ id: 67 }, pedidoObra.id)).pode_decidir, false, 'Acumular DP nao amplia Obra operacional');
  await assert.rejects(service.agir({ id: 67 }, pedidoObra.id, 'aprovar'), /restrito/);
  await assert.rejects(service.agir({ id: 44 }, pedidoObra.id, 'aprovar'), /restrito/);
  await assert.rejects(service.agir(usuarios[0], pedidoObra.id, 'aprovar'), /outro responsavel/);
  await service.agir(usuarios[1], pedidoObra.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2);

  reset();
  const recebeUsuario = await service.abrir({ id: 55 }, payload);
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 1);
  await service.agir(usuarios[0], recebeUsuario.id, 'aprovar');
  assert.equal(colaborador.obra_id, 2);

  for (const adminId of [66, 99]) {
    reset();
    const pedido = await service.abrir({ id: 44 }, payload);
    assert.equal((await service.detalhe({ id: adminId }, pedido.id)).pode_decidir, true);
    if (adminId === 66) await assert.rejects(service.agir({ id: adminId }, pedido.id, 'cancelar'), /restrito/);
    await service.agir({ id: adminId }, pedido.id, 'aprovar');
    assert.equal(colaborador.obra_id, 2, 'DP/SUPERADMIN aprova sem cadastro de responsavel');
  }
  reset(); colaborador.obra_id = null; aberto = null;
  const semOrigem = await service.abrir({ id: 55 }, payload);
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 2);
  assert.equal(colaborador.obra_id, null);
  await service.agir(usuarios[1], semOrigem.id, 'aprovar'); assert.equal(colaborador.obra_id, 2);

  reset();
  await assert.rejects(service.abrir({ id: 77 }, payload), /permissao/);
  assert.equal((await service.configuracao({ id: 44 })).obras_solicitacao_ids[0], 1);
  const cancelavel = await service.abrir({ id: 44 }, payload);
  await service.agir({ id: 44 }, cancelavel.id, 'cancelar'); assert.equal(colaborador.obra_id, 1);
  reset();
  const destino = obras.find(o => o.id === 2); destino.tipo_centro_custo = 'CENTRO_CUSTO';
  assert.equal((await service.configuracao({ id: 44 })).obras.some(o => o.id === 2), true);
  const aoCentro = await service.abrir({ id: 44 }, payload);
  await assert.rejects(service.agir({ id: 44 }, aoCentro.id, 'aprovar'), /restrito|outro responsavel/);
  await service.agir({ id: 66 }, aoCentro.id, 'aprovar'); assert.equal(colaborador.obra_id, 2);
  reset(); colaborador.obra_id = 2; aberto.obra_id = 2;
  const doCentro = await service.abrir({ id: 55 }, { ...payload, obra_destino_id: 1 });
  await service.agir(usuarios[0], doCentro.id, 'aprovar'); assert.equal(colaborador.obra_id, 1);
  reset(); destino.ativo = false;
  await assert.rejects(service.abrir({ id: 44 }, payload), /ativos/);
  destino.ativo = true; destino.tipo_centro_custo = 'OBRA';
  // Uma unica obra vinculada habilita saida para TODOS os outros locais ativos.
  for (const destinoId of [2, 3]) for (const aprovadorId of [22, 66, 99]) {
    reset(); obras[2].tipo_centro_custo = 'CENTRO_CUSTO';
    responsabilidades.push({ obra_id: destinoId, user_id: 22 });
    const config = await service.configuracao({ id: 44 });
    assert.deepEqual(Array.from(config.obras_solicitacao_ids), [1]);
    assert.equal(config.obras.some(o => o.id === destinoId), true);
    const saida = await service.abrir({ id: 44 }, { ...payload, obra_destino_id: destinoId });
    assert.equal(saida.aprovacao_automatica, false);
    assert.equal(requests[0].dados_json.obra_solicitante_id, 1);
    assert.equal(requests[0].dados_json.obra_aprovadora_id, destinoId);
    assert.equal(colaborador.obra_id, 1, 'Saida nao efetiva antes de aprovar');
    await assert.rejects(service.agir({ id: 44 }, saida.id, 'aprovar'), /restrito/);
    await assert.rejects(service.agir({ id: 11 }, saida.id, 'aprovar'), /outro responsavel/);
    await service.agir({ id: aprovadorId }, saida.id, 'aprovar');
    await service.agir({ id: aprovadorId }, saida.id, 'aprovar');
    assert.equal(colaborador.obra_id, destinoId); assert.equal(atualizacoes, 1);
  }
  reset(); colaborador.obra_id = 3; aberto.obra_id = 3;
  responsabilidades.push({ obra_id: 3, user_id: 22 });
  const entrada = await service.abrir({ id: 44 }, { ...payload, obra_destino_id: 1 });
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 3);
  await service.agir({ id: 22 }, entrada.id, 'aprovar'); assert.equal(colaborador.obra_id, 1);
  reset(); colaborador.obra_id = 2; aberto.obra_id = 2;
  await assert.rejects(service.abrir({ id: 44 }, { ...payload, obra_destino_id: 3,
    obra_solicitante_id: 1, aprovacao_automatica: true }), /vinculado/);
  assert.equal(requests.length, 0, 'Sem transferencia entre dois locais de terceiros');
  reset(); responsabilidades.push({ obra_id: 2, user_id: 44 });
  const ambasLigadas = await service.abrir({ id: 44 }, payload);
  assert.equal(ambasLigadas.aprovacao_automatica, false, 'Ser usuario da origem e responsavel apenas do destino nao efetiva');
  assert.equal(requests[0].dados_json.obra_aprovadora_id, 2);
  await assert.rejects(service.agir({ id: 44 }, ambasLigadas.id, 'aprovar'), /outro responsavel/);
  await service.agir({ id: 22 }, ambasLigadas.id, 'aprovar'); assert.equal(colaborador.obra_id, 2);
  obras[2].tipo_centro_custo = 'OBRA';
  for (const id of [66, 99]) {
    reset(); responsabilidades = [];
    const config = await service.configuracao({ id });
    assert.equal(config.transferencia_administrativa, true);
    assert.deepEqual(Array.from(config.obras_solicitacao_ids), [1, 2, 3]);
    if (id === 66) assert.equal(config.obras_responsavel_ids.length, 0, 'DP nao vira responsavel ficticio');
    const automatica = await service.abrir({ id }, payload);
    assert.equal(automatica.situacao, 'APROVADA'); assert.equal(colaborador.obra_id, 2);
    assert.equal(requests[0].dados_json.aprovacao_administrativa, true);
    assert.match(history.at(-1).descricao, /administrativa autorizada/);
    await assert.rejects(service.abrir({ id }, payload), /diferente/); assert.equal(requests.length, 1);
    reset(); responsabilidades = []; colaborador.obra_id = null; aberto = null;
    const semOrigemDp = await service.abrir({ id }, payload); assert.equal(semOrigemDp.aprovacao_automatica, true);
  }
  reset(); assert.equal((await service.configuracao({ id: 68 })).transferencia_administrativa, false);
  await assert.rejects(service.abrir({ id: 68 }, payload), /permissao/);
  assert.equal((await service.configuracao({ id: 67 })).transferencia_administrativa, false);
  const forjada = await service.abrir({ id: 67 }, { ...payload, transferencia_administrativa: true, aprovacao_automatica: true });
  assert.equal(forjada.aprovacao_automatica, false); assert.equal(colaborador.obra_id, 1);
  reset(); colaborador.data_admissao = '2099-01-01';
  await service.abrir({ id: 66 }, payload);
  assert.equal(requests[0].situacao, 'APROVADA');
  assert.equal(colaborador.obra_id, 2); assert.equal(aberto.obra_id, 1);
  assert.equal(colaborador.data_admissao, '2099-01-01');
  assert.equal(atualizacoes, 0, 'Transferencia nao altera admissao nem periodos legados');
  reset();
  requests = Array.from({ length: 43 }, (_, i) => instancia({
    id: i + 1, tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA',
    situacao: i % 2 ? 'APROVADA' : 'ABERTA', obra_id: i === 42 ? 2 : 1,
    colaborador: { id: i + 1, nome: `Ana ${i}`, matricula: `M${i}` },
    criada_por: 11, dados_json: { obra_destino_id: 3, obra_aprovadora_id: 3 }
  }));
  const aprovadas = await service.listar({ id: 44 }, { grupo: 'TODAS', situacoes: 'APROVADA', pagina: 2 });
  assert.equal(aprovadas.total, 21); assert.equal(aprovadas.total_paginas, 2); assert.equal(aprovadas.itens.length, 1);
  assert(aprovadas.itens.every(s => s.situacao === 'APROVADA'));
  assert.equal(ultimaConsulta.offset, 20); assert.equal(ultimaConsulta.subQuery, false);
  const combinado = await service.listar({ id: 66 }, { grupo: 'TODAS', situacoes: 'ABERTA,APROVADA',
    obra_id: 1, origem_id: 1, destino_id: 3, busca: 'M41' });
  assert.equal(combinado.total, 1); assert.equal(combinado.itens[0].id, 42);
  const restrito = await service.listar({ id: 44 }, { grupo: 'TODAS', origem_id: 2, destino_id: 3 });
  assert.equal(restrito.total, 0, 'Filtrar terceiros nao substitui a ACL');
  assert.equal((await service.listar({ id: 66 }, { grupo: 'TODAS', origem_id: 2, destino_id: 3 })).total, 1);
  assert.equal((await service.listar({ id: 44 }, { grupo: 'TODAS' })).total, 42, 'Limpar conserva escopo');
  assert.equal((await service.listar({ id: 33 }, { grupo: 'TODAS' })).total, 0);
  for (const filtro of [{ situacoes: 'INVALIDA' }, { origem_id: '1 OR 1=1' }, { destino_id: '-2' }]) {
    await assert.rejects(service.listar({ id: 66 }, filtro), /invalido|invalida/);
  }
  const antesConsulta = ultimaConsulta;
  await service.listar({ id: 66 }, { grupo: 'TODAS', busca: "%' OR 1=1 --" });
  assert.notEqual(ultimaConsulta, antesConsulta);
  assert.equal(ultimaConsulta.where[Op.and].at(-1)[Op.or][0]['$colaborador.nome$'][Op.like], "%\\%' OR 1=1 --%");
}

async function validarAtividades() {
  let eventos = [{ solicitacao_id: 1, ultimo: 5, atividade_em: '2026-09-18T14:00:00Z', lido: 3 },
    { solicitacao_id: 2, ultimo: 9, atividade_em: '2026-09-18T15:00:00Z', lido: 9 }];
  const lidos = new Map();
  const atividade = carregar('rhSolicitacaoAtividadeService.js', { '../models': { sequelize: {
    query: async (sql, { replacements: r }) => {
      if (sql.startsWith('SELECT')) { assert.equal(r.usuarioId, 11); return [eventos]; }
      assert(sql.includes('GREATEST'));
      const k = `${r.solicitacaoId}:${r.usuarioId}`;
      lidos.set(k, Math.max(lidos.get(k) || 0, r.historicoId));
      return [];
    }
  } } });
  const lista = await atividade.comAtividade([{ id: 1 }, { id: 2 }], 11);
  assert.equal(lista[0].id, 2); assert.equal(lista[1].nao_lida, true);
  await atividade.marcarLida(1, 11, 5);
  await atividade.marcarLida(1, 11, 3);
  assert.equal(lidos.get('1:11'), 5, 'Leitura atrasada nao regride');
  assert.equal(lidos.has('1:22'), false, 'Leitura e individual');
  eventos = [{ solicitacao_id: 1, ultimo: 6, atividade_em: '2026-09-18T16:00:00Z', lido: 5 }];
  assert.equal((await atividade.comAtividade([{ id: 1 }], 11))[0].nao_lida, true, 'Interacao concorrente continua destacada');
}

async function validarJornada() {
  let gravadas = 0;
  const vinculos = [{ colaborador_id: 1, vigencia_inicio: '2026-09-10' }];
  const svc = carregar('rhJornadaFormularioService.js', {
    sequelize: { Op }, '../middlewares/validation': { ValidationError }, './rhPessoalDomain': domain,
    './rhVinculoObraService': { colaboradoresDaObraEm: async (...args) => { assert(args[3], 'Consulta de vinculos na mesma transacao'); return vinculos; } },
    '../models': {
      sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }) },
      Obra: { findByPk: async () => ({ id: 1 }) },
      RhColaborador: { findAll: async o => { assert.equal(o.lock, 'UPDATE'); return [{ id: 1, nome: 'Ana' }]; } },
      RhImportacao: { create: async () => ({ id: 1 }) },
      RhImportacaoLinha: { findAll: async () => [], create: async d => { gravadas++; return d; } },
      RhJornadaEdicao: {}, RhColaboradorVinculo: {}
    }
  });
  const payload = { obra_id: 1, competencia: '2026-09', periodicidade: 'QUINZENAL',
    periodo_inicio: periodo.inicio, periodo_fim: periodo.fim, dias_base: 30,
    linhas: [{ colaborador_id: 1, dias_trabalhados: 7 }] };
  await assert.rejects(svc.registrarJornada(payload), /6 dia/);
  assert.equal(gravadas, 0);
  await assert.rejects(svc.registrarJornada({ ...payload, dias_base: 999 }), /entre 1 e 31/);
  await assert.rejects(svc.registrarJornada({ ...payload, linhas: [{ colaborador_id: 1, dias_trabalhados: 5, faltas: 2 }] }), /6 dia/);
  await svc.registrarJornada({ ...payload, linhas: [{ colaborador_id: 1, dias_trabalhados: 5, faltas: 1 }] });
  assert.equal(gravadas, 1);
}

async function validarFilaDp() {
  const transfer = { id: 2, obra_id: 1, tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA' };
  const normal = { id: 1, obra_id: 1, tipo: 'ADMISSAO', get() { return { id: this.id, tipo: this.tipo, obra_id: this.obra_id }; } };
  const itens = [normal, { ...transfer, get() { return { ...this }; } }];
  let reconhecidos = [];
  const ctrl = carregar('../controllers/RhSolicitacaoController.js', {
    '../services/rhSolicitacaoService': { detalharSolicitacao: async () => ({ id: 1, historicos: [{ id: 10 }, { id: 11 }] }) },
    '../services/rhChecklistService': {}, sequelize: { Op },
    '../models': { RhSolicitacao: { findAll: async () => itens, findByPk: async id => itens.find(s => s.id === Number(id)) }, Obra: {}, RhColaborador: {} },
    '../utils/controllerError': { responderErroController: (res, e) => res.status(e.status || e.statusCode || 400).json({ erro: e.message }) },
    '../utils/codigoDoSetor': { codigoDoSetor: () => 'OBRA' },
    '../services/authorizationService': { getRhDpObraScopeIds: async () => [1], getUserObraIds: async () => [1], userHasAreaPermission: async () => false },
    '../middlewares/validation': { ValidationError },
    '../services/rhPessoalDomain': domain,
    '../services/rhSolicitacaoConsultaDomain': require('../src/services/rhSolicitacaoConsultaDomain'),
    '../services/rhSolicitacaoAtividadeService': { comAtividade: async s => s, marcarLida: async (...args) => { reconhecidos = args; } }
  });
  const res = { status(n) { this.codigo = n; return this; }, json(d) { this.dados = d; return d; } };
  const req = { user: { id: 11 }, params: { id: 1 }, query: {} };
  await ctrl.index(req, res);
  assert.deepEqual(plain(res.dados.map(s => s.id)), [1], 'Transferencias nao aparecem na fila DP');
  await ctrl.show(req, res);
  assert.deepEqual(reconhecidos, [1, 11, 11], 'Detalhe reconhece somente o snapshot visivel');
  await ctrl.show({ ...req, params: { id: 2 } }, res);
  assert.match(res.dados.erro, /Transferencias entre obras/);
  normal.obra_id = 9;
  await ctrl.show(req, res);
  assert.match(res.dados.erro, /Acesso negado/);
}

(async () => {
  await validarTransferencias();
  if (process.argv.includes('--transferencias')) {
    console.log('Transferencias: diretorio global, sem origem, permissao e protecao contra repeticao aprovados; nenhum banco acessado.');
    return;
  }
  await validarAtividades(); await validarJornada(); await validarFilaDp();
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/202609180003_rh_solicitacoes_leituras.js'), 'utf8');
  assert(!/\b(?:INSERT|UPDATE|DELETE)\s+/i.test(migration), 'Migration somente estrutural');
  console.log('OK: jornada por vinculo, transferencias bilaterais, permissoes, privacidade, idempotencia e leitura individual (sem banco).');
})().catch(e => { console.error(e); process.exitCode = 1; });
