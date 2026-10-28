'use strict';
// Politica de reorganizacao autorizada pelo proprietario em 28/10/2026.
// Novas obrigacoes sao intencionais; replay da mesma operacao nao cria outra.
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { Historico } = require('../models');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).filter(k => value[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function falhar(message) { throw Object.assign(new Error(message), { statusCode: 409, code: 'CRIACAO_TITULOS_OPERACAO_DIVERGENTE' }); }
function preparar(req, payload) {
  const chave = String(req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'] || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(chave)) throw Object.assign(new Error('Atualize o formulario antes de criar os novos titulos.'), { statusCode: 400 });
  return { idempotency_key: digest(`${req.user?.id}:${chave}`), request_hash: digest(canonical(payload)) };
}
async function buscarReplay({ solicitacaoId, usuarioId, operacao, transaction }) {
  // O chamador ja bloqueou a solicitacao na mesma transacao. A leitura corrente
  // evita que duas conexoes criem o mesmo envio, inclusive apos restart do Node.
  const row = await Historico.findOne({ where: { solicitacao_id: Number(solicitacaoId), usuario_responsavel_id: usuarioId,
    acao: 'TITULO_FINANCEIRO_CRIADO', metadata: { [Op.like]: `%"idempotency_key":"${operacao.idempotency_key}"%` } },
    transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'DESC']] });
  if (!row) return null;
  let metadata; try { metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; } catch { falhar('Historico da operacao precisa ser conferido.'); }
  if (metadata?.idempotency_key !== operacao.idempotency_key || metadata?.request_hash !== operacao.request_hash || !Array.isArray(metadata?.titulos_ids) || !metadata.titulos_ids.length
    || metadata.titulos_ids.some(id => !Number.isSafeInteger(id) || id <= 0)) falhar('Este envio ja foi registrado com outros dados. Atualize a tela e confira os titulos.');
  return metadata.titulos_ids;
}
module.exports = { preparar, buscarReplay };
