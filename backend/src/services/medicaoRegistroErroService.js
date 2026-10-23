'use strict';
const { sanitizeControllerError } = require('../utils/controllerError');
const indices = ['medicao_parcelas_unico', 'medicao_parcelas_ativa_unica', 'medicao_parcelas_evento_unico'];
const codigosBanco = new Set(['ER_DUP_ENTRY', 'ER_BAD_FIELD_ERROR', 'ER_DATA_TOO_LONG', 'ER_NO_REFERENCED_ROW_2', 'ER_BAD_NULL_ERROR', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_QUERY_TIMEOUT']);
function responderErroRegistroMedicao(res, erro, contexto = {}, log = console.error) {
  const duplicado = erro?.name === 'SequelizeUniqueConstraintError' || erro?.original?.code === 'ER_DUP_ENTRY' || erro?.parent?.code === 'ER_DUP_ENTRY';
  const fonte = [erro?.parent?.sqlMessage, erro?.original?.sqlMessage, erro?.message, ...Object.keys(erro?.fields || {})].join(' ');
  const indice = duplicado ? indices.find(nome => fonte.includes(nome)) : null;
  let status, mensagem;
  if (duplicado) {
    status = 409;
    mensagem = indice === 'medicao_parcelas_unico'
      ? 'O vínculo histórico desta parcela exige a atualização da proteção de medições no banco. Avise o suporte; não exclua o histórico.'
      : indice === 'medicao_parcelas_ativa_unica'
        ? 'Esta parcela já possui uma medição ativa. Atualize o contrato antes de tentar novamente.'
        : 'Este vínculo de medição já foi registrado. Atualize o contrato para conferir antes de tentar novamente.';
  } else if (erro?.name === 'SequelizeValidationError') {
    status = 400; mensagem = 'Não foi possível validar os dados da medição. Confira os campos informados ou avise o suporte.';
  } else {
    ({ status, message: mensagem } = sanitizeControllerError(erro, 'Não foi possível registrar a medição. Atualize o contrato e avise o suporte se o erro persistir.'));
  }
  if (duplicado || erro?.name === 'SequelizeValidationError' || status >= 500) log('[MEDICAO_REGISTRO_FALHOU]', {
    motivo: duplicado ? 'VINCULO_DUPLICADO' : erro?.name === 'SequelizeValidationError' ? 'VALIDACAO' : 'ERRO_INTERNO',
    indice: indice || undefined,
    codigo_banco: codigosBanco.has(erro?.original?.code || erro?.parent?.code) ? erro.original?.code || erro.parent.code : undefined,
    usuario_id: Number(contexto.usuarioId) || null, contrato_id: Number(contexto.contratoId) || null,
    solicitacao_id: Number(contexto.solicitacaoId) || null
  });
  return res.status(status).json({ error: mensagem });
}
module.exports = { responderErroRegistroMedicao };
