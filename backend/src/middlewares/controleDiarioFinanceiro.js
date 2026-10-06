const { obterEstadoBloqueioDiario } = require('../services/caixaDiarioConfigService');

function operacaoSujeitaAoControle(req) {
  const metodo = String(req.method || '').toUpperCase();
  const rota = String(req.path || '').split('?')[0];
  // Lista estreita para manter sessao e regularizar a pendencia. Nao concede
  // permissoes: cada endpoint continua usando seus guards originais.
  if (['GET', 'HEAD'].includes(metodo)) {
    if (/^\/auth\/(?:me|controle-diario-contas|dev-user-switch)$/.test(rota)) return false;
    if (/^\/configuracoes\/(?:modulos|tema|timeout-inatividade|suporte-whatsapp)$/.test(rota)) return false;
    if (rota === '/me/preferencias' || /^\/listas\/[^/]+\/preferencias(?:\/[^/]+)?$/.test(rota)) return false;
    if (rota === '/financeiro/contas-bancarias' || rota === '/financeiro/caixas-painel-diario') return false;
    if (/^\/financeiro\/caixas(?:\/\d+)?$/.test(rota)) return false;
  }
  if (metodo === 'POST') {
    if (/^\/auth\/(?:logout|heartbeat|dev-user-switch\/restore|mfa\/(?:setup|enable|disable))$/.test(rota)) return false;
    if (/^\/financeiro\/caixas\/(?:abrir|confirmar-conciliacao-dia|\d+\/(?:fechar|decidir-divergencia|movimentos(?:\/\d+\/estornar)?))$/.test(rota)) return false;
  }
  return true;
}

function mensagemBloqueio(estado) {
  if (estado.pendencias?.some((item) => item.motivo === 'DATA_INCONSISTENTE')) {
    return 'Existe um caixa com data futura. Contate o administrador para corrigir a data antes de continuar usando o sistema.';
  }
  if (estado.contas_sem_fechamento_anterior > 0) {
    return 'Feche o caixa do expediente anterior que ainda esta em aberto e abra um novo caixa de hoje para continuar usando o sistema. Se houver divergencia, aguarde a decisao de outro aprovador.';
  }
  if (estado.pendencias?.some((item) => item.motivo === 'DIVERGENCIA')) {
    return 'O caixa esta aguardando decisao de divergencia. Outro aprovador precisa regularizar o fechamento para voce continuar usando o sistema.';
  }
  return 'Abra um novo caixa para o dia de hoje na conta controlada para continuar usando o sistema.';
}

module.exports = async function controleDiarioFinanceiro(req, res, next) {
  try {
    if (!operacaoSujeitaAoControle(req)) return next();

    const estado = await obterEstadoBloqueioDiario(req.user);
    if (!estado.bloqueado) return next();

    return res.status(423).json({
      error: mensagemBloqueio(estado),
      codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE',
      ...estado
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao validar o controle diario de contas.' });
  }
};

module.exports.operacaoSujeitaAoControle = operacaoSujeitaAoControle;
module.exports.estado = async function estadoControleDiario(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const estado = await obterEstadoBloqueioDiario(req.user);
    return res.json({ ...estado, servidor_agora: new Date().toISOString(), mensagem: estado.bloqueado ? mensagemBloqueio(estado) : null });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'Nao foi possivel verificar o controle diario. Tente novamente ou contate o administrador.' });
  }
};
