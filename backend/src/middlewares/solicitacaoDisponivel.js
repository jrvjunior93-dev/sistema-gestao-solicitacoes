'use strict';
const { Solicitacao } = require('../models');
const { solicitacaoIndisponivel } = require('../services/solicitacaoDisponibilidade');

// Montado somente em caminhos operacionais cujo parametro e a solicitacao
// principal. Nao concede acesso: todas as ACLs originais continuam depois.
module.exports = async (req, res, next) => {
  const id = String(req.params.solicitacaoOperacionalId || '');
  // Segmentos estaticos (filtros, resumo, centros-custo...) ficam intactos;
  // IDs numericos malformados sao recusados antes de qualquer coercao SQL.
  if (!/^\d+$/.test(id)) {
    // Nao deixar o MySQL converter "71abc" em ID 71 em um handler legado.
    if (/^[\s+\-\d]/.test(id)) return res.status(400).json({ error: 'Solicitacao invalida' });
    return next();
  }
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({ error: 'Solicitacao invalida' });
  }
  // Repetir DELETE mantem a idempotencia e a ACL original da exclusao.
  if (req.method === 'DELETE' && req.path === '/'
    && /^\/(?:api\/)?solicitacoes\//i.test(req.baseUrl)) return next();
  try {
    const solicitacao = await Solicitacao.findByPk(id, { attributes: ['id', 'cancelada'] });
    if (solicitacaoIndisponivel(solicitacao)) {
      return res.status(404).json({ error: 'Solicitacao nao encontrada' });
    }
    return next();
  } catch (error) {
    // Falha de leitura nunca deve liberar uma operacao.
    return res.status(500).json({ error: 'Erro ao verificar solicitacao' });
  }
};
