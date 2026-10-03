'use strict';

const {
  extractResponseResource,
  recordHttpEvent
} = require('../modules/governanca/services/auditoriaOperacionalService');

// Rotas fora da trilha de auditoria de NEGOCIO. Todo metodo nao-GET
// grava uma linha aqui; estas nao descrevem ato de negocio nenhum, e sem
// a excecao a trilha ficaria enterrada em ruido.
//
// `/listas` e `/me/preferencias` sao preferencia de exibicao do proprio
// usuario (colunas, larguras, blocos, filtros de tela, filtros nomeados):
// redimensionar UMA coluna arrastando o mouse ja renderia dezenas de
// linhas de auditoria, e nenhuma delas diz nada sobre uma solicitacao,
// um titulo ou um contrato. As rotas continuam gateadas por
// autenticacao e so leem e escrevem o registro do proprio usuario.
const SKIP_PATHS = [
  '/auth/heartbeat',
  '/live-updates',
  '/governanca/auditoria-operacional/navegacao',
  '/listas',
  '/me/preferencias'
];

module.exports = function auditoriaOperacional(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || SKIP_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  let recorded = false;
  let responseResource = null;
  const originalJson = res.json.bind(res);
  res.json = function auditedJson(payload) {
    if (!responseResource && res.statusCode < 400) {
      responseResource = extractResponseResource(payload);
    }
    return originalJson(payload);
  };
  res.on('finish', () => {
    if (recorded || !req.user?.id) return;
    recorded = true;
    recordHttpEvent(req, res.statusCode, responseResource).catch(() => {});
  });
  return next();
};
