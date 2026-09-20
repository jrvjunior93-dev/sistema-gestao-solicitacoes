const { obterEstadoBloqueioDiario } = require('../services/caixaDiarioConfigService');

const ROTAS_DE_REGULARIZACAO = [
  /^\/(?:financeiro\/)?caixas(?:\/|$)/,
  /^\/(?:financeiro\/)?caixas-painel-diario(?:\/|$)/,
  /^\/(?:financeiro\/)?conciliacoes(?:\/|$)/
];

module.exports = async function controleDiarioFinanceiro(req, res, next) {
  try {
    if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase())) return next();
    if (ROTAS_DE_REGULARIZACAO.some((pattern) => pattern.test(req.path))) return next();

    const estado = await obterEstadoBloqueioDiario(req.user);
    if (!estado.bloqueado) return next();

    return res.status(423).json({
      error: `Controle diario pendente: abra e confira ${estado.contas_pendentes} de ${estado.total_contas} conta(s) antes de executar novas acoes financeiras.`,
      codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE',
      ...estado
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao validar o controle diario de contas.' });
  }
};
