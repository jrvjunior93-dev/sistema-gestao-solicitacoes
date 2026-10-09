// Testes isolados: não carrega configuração nem conecta a banco externo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../src/services/pedidoEntregaDomain');
const { Op, QueryTypes } = require('sequelize');

assert.equal(domain.adicionarDiasUteis('2026-09-18', 2), '2026-09-22');
assert.equal(domain.adicionarDiasUteis('2026-09-18', 2, ['2026-09-21']), '2026-09-23');
assert.equal(domain.adicionarDiasUteis('2026-12-31', 2, ['2027-01-01']), '2027-01-05');
assert.equal(domain.dataValida('2026-02-30'), false);
assert.equal(domain.hojeBrasil(new Date('2026-09-19T01:30:00Z')), '2026-09-18');
const itemBase = { quantidade_pedido: 10, quantidade_cancelada: 0 };
assert.equal(domain.situacaoEntrega(itemBase, 4).situacao, 'PARCIAL');
assert.equal(domain.situacaoEntrega(itemBase, 11).situacao, 'DIVERGENCIA');
assert.equal(domain.situacaoEntrega(itemBase, 10).situacao, 'ENTREGUE');
assert.equal(domain.situacaoEntrega(itemBase, 0).informar_obrigatorio, false, 'Legado sem previsão não bloqueia');
assert.equal(domain.situacaoEntrega(itemBase, 0, { previsao: '2026-09-18', estado: 'OBRA' }, '2026-09-18').informar_obrigatorio, false);
assert.equal(domain.situacaoEntrega(itemBase, 0, { previsao: '2026-09-18', estado: 'OBRA' }, '2026-09-19').informar_obrigatorio, true);
assert.equal(domain.situacaoEntrega(itemBase, 3, { previsao: '2026-09-18', estado: 'COMPRAS', prazo_compras: '2026-09-22' }, '2026-09-23').reprogramacao_vencida, true);
assert.equal(domain.situacaoEntrega(itemBase, 3, { estado: 'COMPRAS', prazo_compras: '2026-09-22' }, '2026-09-22').reprogramacao_vencida, false);

let state = { itens: [1, 2].map((id) => ({ id, pedido_compra_id: 8, descricao: `Item ${id}`, ...itemBase, removido: false })), controles: [], recebimentos: [], operacoes: [], historicos: [], prazos: [] };
let prazosAtivos = true, itensAcompanhados = [];
let fila = Promise.resolve();
const instancia = (row) => row && ({ ...row, toJSON: () => ({ ...row }), update: async (values) => { Object.assign(row, values); return Object.assign(instancia(row), values); } });
// Sequelize muta a instância no update, necessário para o snapshot de saída.
function wrap(row) {
  if (!row) return null;
  const obj = instancia(row);
  obj.update = async (values) => { Object.assign(row, values); Object.assign(obj, values); return obj; };
  return obj;
}
let pendenciasQuery = [];
let ultimoSql = '';
const models = {
  sequelize: {
    async query(sql, options) { ultimoSql = sql; return pendenciasQuery.filter((r) => !options.replacements.obraId || r.obra_id === options.replacements.obraId); },
    transaction(fn) {
      const executar = async () => { const backup = structuredClone(state); try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { state = backup; throw e; } };
      const atual = fila.then(executar); fila = atual.catch(() => {}); return atual;
    }
  },
  PedidoCompra: { findOne: async ({ where }) => Number(where.id) === 8 && Number(where.solicitacao_compra_id) === 9 ? wrap({ id: 8, status: 'ABERTO', obra_id: 3 }) : null },
  PedidoCompraItem: { findAll: async ({ where }) => state.itens.filter((i) => i.pedido_compra_id === Number(where.pedido_compra_id) && !i.removido && (!where.id || where.id[Op.in].includes(i.id))).map(wrap) },
  PedidoCompraEntrega: {
    findByPk: async (id) => wrap(state.controles.find((r) => r.pedido_compra_item_id === id)),
    create: async (r) => { const row = { estado: 'OBRA', previsao: null, prazo_compras: null, versao: 0, ...r }; state.controles.push(row); return wrap(row); }
  },
  PedidoCompraItemRecebimento: {
    sum: async (_, { where }) => state.recebimentos.filter((r) => r.pedido_compra_item_id === where.pedido_compra_item_id).reduce((s, r) => s + r.quantidade, 0),
    create: async (r) => { state.recebimentos.push(r); return wrap(r); }
  },
  PedidoCompraEntregaOperacao: {
    findOne: async ({ where }) => wrap(state.operacoes.find((r) => r.chave === where.chave)),
    create: async (r) => { state.operacoes.push(r); return wrap(r); }
  },
  ConfiguracaoSistema: { findOne: async () => null },
  ObrigacaoOperacional: { findAll: async () => itensAcompanhados.map((referencia_id) => ({ referencia_id })) },
  Historico: { create: async (r) => { state.historicos.push(r); } }
};
const arquivo = path.resolve(__dirname, '../src/services/pedidoEntregaService.js');
const sandbox = { module: { exports: {} }, console, require: (id) => {
  if (id === '../models') return models;
  if (id === './pedidoEntregaDomain') return domain;
  if (id === './avisoPendenciasEntregaService') return require('../src/services/avisoPendenciasEntregaService');
  if (id === './prazosOperacionaisService') return {
    configuracao: async () => ({ ativo: prazosAtivos, revisao: 0 }),
    registrarEntrega: async ({ itemId, versao, transaction }) => {
      assert.equal(transaction.LOCK.UPDATE, 'UPDATE'); state.prazos.push({ acao: 'REGISTRAR', itemId, versao });
    },
    encerrarItem: async (itemId, status, usuarioId, motivo, transaction) => {
      assert.equal(transaction.LOCK.UPDATE, 'UPDATE'); state.prazos.push({ acao: 'ENCERRAR', itemId, status, motivo });
    }
  };
  if (id === './pedidoCompraService') return { cancelarSaldoNaoRecebido: async ({ item, recebido, motivo }) => item.update({ quantidade_pedido: recebido, removido: !recebido, motivo_cancelamento: motivo }) };
  return require(id);
} };
vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), sandbox, { filename: arquivo });
const service = sandbox.module.exports;
let seq = 0;
const operar = (acao, itens, extras = {}) => service.operarEntrega({ pedidoId: 8, compraId: 9, solicitacaoId: 10, usuarioId: 20,
  payload: { acao, itens, motivo: 'Teste auditável', idempotency_key: `operacao_teste_${++seq}`, ...extras } });

(async () => {
  const hoje = domain.hojeBrasil();
  await operar('PREVISAO', [{ id: 1, versao: 0, previsao: hoje }, { id: 2, versao: 0, previsao: hoje }]);
  const resposta = await operar('RECEBER', [{ id: 1, versao: 1, quantidade: 4 }], { idempotency_key: 'chave_idempotente_1' });
  assert.equal(resposta[0].entrega.situacao, 'PARCIAL');
  assert.equal(resposta[0].entrega.responsavel, 'COMPRAS');
  assert.equal(state.prazos.length, 3, 'Duas previsões abrem ciclos e a parcial encerra somente o seu item');
  assert.equal(state.prazos.at(-1).status, 'CUMPRIDA', 'Parcial cumpre a obrigação da Obra');
  const prazoOriginal = resposta[0].entrega.prazo_compras;
  await operar('RECEBER', [{ id: 1, versao: 1, quantidade: 4 }], { idempotency_key: 'chave_idempotente_1' });
  assert.equal(state.recebimentos.length, 1, 'Replay não duplica');
  assert.equal(state.prazos.length, 3, 'Replay não altera novamente a obrigação');
  await assert.rejects(operar('RECEBER', [{ id: 1, versao: 2, quantidade: 5 }], { idempotency_key: 'chave_idempotente_1' }), /outra operação/);
  await assert.rejects(operar('RECEBER', [{ id: 1, versao: 1, quantidade: 2 }]), /outro usuário/);
  const parcial = await operar('RECEBER', [{ id: 1, versao: 2, quantidade: 1 }]);
  assert.equal(parcial[0].entrega.prazo_compras, prazoOriginal, 'Nova parcial não reinicia o SLA de Compras');
  await operar('PREVISAO', [{ id: 1, versao: 3, previsao: hoje }]);
  const divergente = await operar('RECEBER', [{ id: 1, versao: 4, quantidade: 6 }]);
  assert.equal(divergente[0].entrega.situacao, 'DIVERGENCIA');
  assert.equal(divergente[0].entrega.recebido, 11);
  await assert.rejects(operar('DEVOLVER_EXCESSO', [{ id: 1, versao: 5, quantidade: 2 }]), /excesso/);
  const devolucao = await operar('DEVOLVER_EXCESSO', [{ id: 1, versao: 5, quantidade: 1 }]);
  assert.equal(devolucao[0].entrega.situacao, 'ENTREGUE');
  const corrigido = await operar('CORRIGIR_RECEBIDO', [{ id: 1, versao: 6, quantidade: 8 }]);
  assert.equal(corrigido[0].entrega.recebido, 8);
  assert.equal(corrigido[0].entrega.responsavel, 'COMPRAS');
  const antes = state.recebimentos.length;
  await assert.rejects(operar('RECEBER', [{ id: 1, versao: 7, quantidade: 1 }, { id: 2, versao: 999, quantidade: 1 }]), /outro usuário/);
  assert.equal(state.recebimentos.length, antes, 'Lote é atômico');
  await operar('NAO_ENTREGUE', [{ id: 2, versao: 1 }]);
  assert.equal(state.prazos.at(-1).status, 'CUMPRIDA', 'Não entrega informada cumpre a obrigação da Obra');
  assert.equal(state.recebimentos.length, antes, 'Não entregue não fabrica recebimento zero');
  const corrida = await Promise.allSettled([operar('RECEBER', [{ id: 2, versao: 2, quantidade: 3 }]), operar('RECEBER', [{ id: 2, versao: 2, quantidade: 3 }])]);
  assert.equal(corrida.filter((r) => r.status === 'fulfilled').length, 1, 'Versão protege duas telas concorrentes');
  await operar('CANCELAR_SALDO', [{ id: 2, versao: 3 }]);
  assert.equal(state.prazos.at(-1).status, 'CANCELADA');
  assert.equal(state.itens[1].quantidade_pedido, 3, 'Preserva o que já chegou');
  assert.ok(state.historicos.every((h) => h.usuario_responsavel_id === 20 && JSON.parse(h.metadata).anterior));
  await assert.rejects(service.operarEntrega({ pedidoId: 8, compraId: 99, payload: { acao: 'RECEBER', itens: [{ id: 1 }], idempotency_key: 'teste_outra_compra' } }), /não pertence/);
  await assert.rejects(operar('PREVISAO', [{ id: 999, versao: 0, previsao: hoje }]), /não pertence/);
  prazosAtivos = false;
  pendenciasQuery = [
    { solicitacao_id: 10, solicitacao_codigo: 'SOL-6265', pedido_id: 227, item_id: 1, obra_id: 3 },
    { solicitacao_id: 10, solicitacao_codigo: 'SOL-6265', pedido_id: 227, item_id: 2, obra_id: 3 },
    { solicitacao_id: 10, solicitacao_codigo: 'SOL-6265', pedido_id: 228, item_id: 3, obra_id: 3 },
    { solicitacao_id: 11, solicitacao_codigo: 'SOL-6300', pedido_id: 229, item_id: 4, obra_id: 3 },
    { solicitacao_id: 12, solicitacao_codigo: 'SOL-OUTRA-OBRA', pedido_id: 230, item_id: 5, obra_id: 4 }
  ];
  await assert.rejects(service.assertObraPodeCriarCompra(3), (erro) => {
    assert.equal(erro.statusCode, 409);
    assert.equal(erro.code, 'COMPRA_ENTREGA_PENDENTE');
    assert.deepEqual(erro.details.solicitacoes, [
      { solicitacao_id: 10, codigo: 'SOL-6265', pedidos: [227, 228], itens_pendentes: 3 },
      { solicitacao_id: 11, codigo: 'SOL-6300', pedidos: [229], itens_pendentes: 1 }
    ]);
    return true;
  });
  assert.match(ultimoSql, /LEFT JOIN solicitacoes es ON es.id = ec.solicitacao_principal_id/);
  assert.match(ultimoSql, /es.codigo AS solicitacao_codigo/);
  pendenciasQuery = pendenciasQuery.slice(0, 1);
  await assert.rejects(service.assertObraPodeCriarCompra(3), /SOL-6265/);
  pendenciasQuery = [{ pedido_id: 8, item_id: 1, obra_id: 3, vencida: 1, prazo_compras: '2026-09-01' }];
  await assert.rejects(service.assertObraPodeCriarCompra(3), (erro) => {
    assert.match(erro.message, /Informe a entrega.*pedido #8/);
    assert.equal(erro.details.solicitacoes[0].codigo, null, 'Nao inventa codigo SOL com ID');
    return true;
  });
  await service.assertObraPodeCriarCompra(4);
  prazosAtivos = true; itensAcompanhados = [1];
  await service.assertObraPodeCriarCompra(3); // Novo ciclo usa prazo e tolerância, não o guard legado por data.
  await assert.rejects(service.assertComprasPodeGerarPedido(), /novos pedidos estão bloqueados/);
  assert.match(ultimoSql, /e.estado IN \('COMPRAS', 'DIVERGENCIA'\)/);
  assert.match(service.sqlPendenciaEntrega('OBRA'), /previsao </);
  console.log('OK: calendário, legado, parcial, total, excesso, devolução, correção, ciclo, idempotência, rollback de lote, versões concorrentes, escopo e bloqueios. Persistência simulada, sem banco externo.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
