const { Op } = require('sequelize');
const { SecurityEventLog } = require('../models');
const { env } = require('../config/env');

function getRequestIp(req) {
  const headers = req?.headers || {};
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
}

async function registrarEventoSeguranca({
  req,
  usuarioId = null,
  tipoEvento,
  recursoTipo = null,
  recursoId = null,
  status = 'INFO',
  descricao = null,
  metadata = null
}) {
  if (!tipoEvento) {
    return null;
  }

  try {
    const headers = req?.headers || {};
    const impersonationMetadata = req?.dev_user_switch ? {
      dev_user_switch: true,
      actor_id: Number(req.dev_user_switch.actor_id) || null,
      target_id: Number(req.dev_user_switch.target_id) || null
    } : null;
    return await SecurityEventLog.create({
      usuario_id: usuarioId,
      tipo_evento: String(tipoEvento).trim().toUpperCase(),
      recurso_tipo: recursoTipo ? String(recursoTipo).trim().toUpperCase() : null,
      recurso_id: recursoId != null ? String(recursoId) : null,
      status: String(status || 'INFO').trim().toUpperCase(),
      descricao: descricao || null,
      ip_origem: req ? getRequestIp(req) : null,
      user_agent: req ? String(headers['user-agent'] || '').slice(0, 255) : null,
      metadata: impersonationMetadata
        ? { ...impersonationMetadata, ...(metadata || {}) }
        : (metadata || null)
    });
  } catch (error) {
    console.error('Falha ao registrar evento de seguranca:', error.message);
    return null;
  }
}

async function limparEventosSegurancaAntigos(diasRetencao = env.securityLogRetentionDays) {
  const dias = Number(diasRetencao);
  if (!Number.isFinite(dias) || dias <= 0) {
    return 0;
  }

  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  return SecurityEventLog.destroy({
    where: {
      createdAt: {
        [Op.lt]: cutoff
      }
    }
  });
}

function iniciarRetencaoEventosSeguranca() {
  const executar = async () => {
    try {
      const removidos = await limparEventosSegurancaAntigos();
      if (removidos > 0) {
        console.log(`[security-log-retention] ${removidos} eventos antigos removidos.`);
      }
    } catch (error) {
      console.error('[security-log-retention] Falha ao limpar logs antigos:', error.message);
    }
  };

  void executar();
  const timer = setInterval(() => {
    void executar();
  }, 24 * 60 * 60 * 1000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

module.exports = {
  getRequestIp,
  registrarEventoSeguranca,
  limparEventosSegurancaAntigos,
  iniciarRetencaoEventosSeguranca
};
