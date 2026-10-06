const { arquivoLocalRemovido } = require('../services/anexoHistoricoService');
const path = require('node:path');

// Nao altera a politica legada de arquivos ativos; somente impede servir tombstones.
module.exports = async function bloquearAnexoLocalRemovido(req, res, next) {
  try {
    // Normaliza exatamente o caminho que o servidor estatico vai resolver.
    const caminho = `/uploads${path.posix.normalize(decodeURIComponent(req.path))}`;
    if (await arquivoLocalRemovido(caminho)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'Arquivo removido do historico' });
    }
    return next();
  } catch (error) {
    console.error('Erro verificar anexo local removido:', error);
    return res.status(503).json({ error: 'Nao foi possivel validar o arquivo.' });
  }
};
