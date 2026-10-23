'use strict';
const { LogExclusao } = require('../models');
// Consultado somente APOS o ACL da auditoria do titulo. O recibo nao depende
// da retencao dos logs operacionais e nao cria acesso a solicitacoes.
async function listarEventos(tituloId) {
  const rows = await LogExclusao.findAll({ where: { entidade: 'TITULO_FAVORECIDO_EDITADO', entidade_id: Number(tituloId) },
    order: [['id', 'DESC']], limit: 50 });
  return rows.map(r => {
    const dados = JSON.parse(r.payload_json);
    return { id: `FAVORECIDO-${r.id}`, tipo_evento: 'TITULO_FAVORECIDO_EDITADO', status: 'SUCCESS',
      descricao: 'Favorecido e dados de pagamento corrigidos; valores preservados', createdAt: r.createdAt,
      usuario: dados.usuario, metadata: dados };
  });
}
module.exports = { listarEventos };
