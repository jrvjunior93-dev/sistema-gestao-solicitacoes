'use strict';

const {
  guardMode,
  mensagemTravada,
  obrasDaRequisicao,
  obrasTravadasDoUsuario
} = require('../services/bloqueioObraService');

/*
  Bloqueio por obra (reforma de 29/09/2026, Fase 3). Substitui o guard
  antigo, que travava o usuario no sistema inteiro: agora so a OBRA atrasada
  fica fechada para o engenheiro responsavel por ela; as demais seguem livres.
  Continua liberado o que regulariza (todo o modulo Custos e Recebiveis) e o
  basico da sessao. Falha inesperada e fail-open, como antes.
*/
const ALWAYS_ALLOWED_PREFIXES = Object.freeze([
  '/auth/logout',
  '/auth/heartbeat',
  '/auth/me',
  '/usuarios/me',
  '/perfil',
  '/ajuda',
  '/suporte',
  '/live-updates',
  '/custos-recebiveis'
]);

function isAllowedRoute(req) {
  const path = String(req.path || req.originalUrl || '').split('?')[0];
  return ALWAYS_ALLOWED_PREFIXES.some((prefix) => (
    path === prefix || path.startsWith(`${prefix}/`)
  ));
}

async function requireCustosRecebiveisCompletion(req, res, next) {
  if (guardMode() === 'observe') return next();
  try {
    if (isAllowedRoute(req)) return next();
    const travadas = (await obrasTravadasDoUsuario(req.user)).filter((item) => item.bloqueando);
    if (!travadas.length) return next();
    const obraIds = await obrasDaRequisicao(req);
    const hit = travadas.find((item) => obraIds.includes(Number(item.obra_id)));
    if (!hit) return next();
    return res.status(403).json({
      error: mensagemTravada(hit),
      code: 'OBRA_TRAVADA_CUSTOS_RECEBIVEIS',
      obra_travada: hit
    });
  } catch (error) {
    console.error('Falha segura ao avaliar bloqueio de obra (Custos e Recebiveis):', error.message);
    return next();
  }
}

module.exports = requireCustosRecebiveisCompletion;
module.exports.ALWAYS_ALLOWED_PREFIXES = ALWAYS_ALLOWED_PREFIXES;
module.exports.isAllowedRoute = isAllowedRoute;
