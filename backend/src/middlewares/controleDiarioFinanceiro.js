const { obterEstadoBloqueioDiario } = require('../services/caixaDiarioConfigService');

function operacaoSujeitaAoControle(req) {
  const metodo = String(req.method || '').toUpperCase();
  const rota = String(req.path || '').replace(/^\/financeiro(?=\/)/, '');
  if (/^\/cheques-terceiros(?:\/|$)/.test(rota)) return true;
  if (metodo !== 'POST') return false;
  return /^\/fila-pagamentos\/(?:baixar|aprovar-divergencias|\d+\/resolver)$/.test(rota);
}

module.exports = async function controleDiarioFinanceiro(req, res, next) {
  try {
    if (!operacaoSujeitaAoControle(req)) return next();

    const estado = await obterEstadoBloqueioDiario(req.user);
    if (!estado.bloqueado) return next();

    return res.status(423).json({
      error: `Controle diario pendente: feche o expediente anterior e abra hoje ${estado.contas_pendentes} de ${estado.total_contas} conta(s) controlada(s) antes de baixar pagamentos ou acessar a carteira de cheques.`,
      codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE',
      ...estado
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao validar o controle diario de contas.' });
  }
};

module.exports.operacaoSujeitaAoControle = operacaoSujeitaAoControle;
