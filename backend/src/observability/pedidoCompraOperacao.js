'use strict';
const { randomUUID } = require('node:crypto');

// Lista fechada: nunca imprimir error.message/stack/sql/body, que podem conter
// documentos, parametros SQL, senhas ou dados pessoais. Sem banco/rede/timers.
function classificarErro(error) {
  const code = String(error?.original?.code || error?.parent?.code || error?.code || '');
  const seguros = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR',
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOMEM', 'REABERTURA_EXIGE_APROVACAO_GEO', 'APROVACAO_GEO_INVALIDA'];
  if (seguros.includes(code)) return code;
  const name = String(error?.name || '');
  if (/ConnectionAcquireTimeout/.test(name)) return 'POOL_BANCO_TIMEOUT';
  if (/Connection/.test(name)) return 'CONEXAO_BANCO';
  if (/Database/.test(name)) return 'BANCO_DADOS';
  const msg = String(error?.message || '');
  if (/previs[aã]o.*entrega|entrega.*previs[aã]o/i.test(msg)) return 'PREVISAO_ENTREGA_PENDENTE';
  if (/cancelado.*n[aã]o pode/i.test(msg)) return 'PEDIDO_CANCELADO';
  if (/motivo.*reabertura/i.test(msg)) return 'MOTIVO_REABERTURA_OBRIGATORIO';
  if (/status.*inv[aá]lido|status.*inativo/i.test(msg)) return 'STATUS_INVALIDO_OU_INATIVO';
  return 'FALHA_INTERNA';
}

function iniciarOperacaoPedido({ acao, pedidoId, logger = console.log } = {}) {
  const inicio = process.hrtime.bigint();
  const operacaoId = randomUUID();
  let etapa = 'INICIO', resultado = 'NAO_CONCLUIDO', confirmada = false;
  function registrar(evento, extra = {}) {
    try {
      const memoria = process.memoryUsage();
      logger(`[PEDIDO_OPERACAO] ${JSON.stringify({
        instante: new Date().toISOString(), operacao_id: operacaoId, pid: process.pid,
        acao: ['REABRIR', 'STATUS'].includes(acao) ? acao : 'PEDIDO',
        pedido_id: Number.isSafeInteger(Number(pedidoId)) && Number(pedidoId) > 0 ? Number(pedidoId) : null,
        evento, etapa, resultado, confirmada,
        duracao_ms: Math.round(Number(process.hrtime.bigint() - inicio) / 1e6),
        rss_mb: Math.round(memoria.rss / 1048576), heap_usado_mb: Math.round(memoria.heapUsed / 1048576),
        heap_total_mb: Math.round(memoria.heapTotal / 1048576), ...extra
      })}`);
    } catch { /* Diagnostico nunca pode impedir ou desfazer uma operacao. */ }
  }
  registrar('INICIO');
  return {
    id: operacaoId,
    etapa(valor) { etapa = valor;
      if (['SINCRONIZAR_SALDOS', 'LEITURA_APOS_COMMIT', 'COMMIT'].includes(valor)) registrar('ETAPA'); },
    confirmar() { confirmada = true; resultado = 'GRAVADA'; },
    negar(causa) { resultado = 'NEGADA'; registrar('NEGADA', { causa }); },
    falha(error) { resultado = confirmada ? 'GRAVADA_DETALHE_INDISPONIVEL' : 'FALHOU';
      registrar('FALHA', { causa: classificarErro(error) }); },
    finalizar() { registrar('FIM'); }
  };
}

module.exports = { iniciarOperacaoPedido, classificarErro };
