'use strict';

const {
  ehAberturaDeSolicitacao,
  guardMode,
  mensagemSolicitacaoNova,
  mensagemTravada,
  obrasDaAbertura,
  obrasTravadasDoUsuario,
  rotaRegularizacaoBloqueada,
  travaDasObras
} = require('../services/bloqueioObraService');

/*
  Bloqueio por obra (reforma de 29/09/2026, Fase 3, revisto no mesmo dia).
  Substitui o guard antigo, que travava o usuario no sistema inteiro.
  1. Abrir solicitacao NOVA para obra travada: recusado para qualquer usuario
     (so a liberacao temporaria do administrador abre excecao).
  2. Dentro de Custos e Recebiveis, o engenheiro responsavel pela obra travada
     so acessa o que regulariza.
  Todo o resto (solicitacoes existentes, titulos, pagamentos, baixas) segue
  normal. Falha inesperada e fail-open, como antes.
*/
function recusar(res, item, code, error) {
  return res.status(403).json({ error, code, obra_travada: item });
}

// Em observacao nada e barrado, mas a abertura que SERIA barrada fica no log
// (sem atrasar a requisicao), para medir o impacto antes de ligar o enforce.
function registrarSeriaBarrada(req) {
  if (!ehAberturaDeSolicitacao(req)) return;
  obrasDaAbertura(req)
    .then((obraIds) => (obraIds.length ? travaDasObras(obraIds).then((travas) => ({ obraIds, travas })) : null))
    .then((result) => {
      if (!result) return;
      const obras = result.obraIds.filter((id) => result.travas.has(id));
      if (obras.length) {
        console.info(`[custos-recebiveis] observe: abertura seria barrada (${req.method} ${req.path}) usuario=${req.user?.id || '-'} obras=${obras.join(',')}`);
      }
    })
    .catch(() => null);
}

async function requireCustosRecebiveisCompletion(req, res, next) {
  if (guardMode() === 'observe') {
    registrarSeriaBarrada(req);
    return next();
  }
  try {
    const path = String(req.path || '').split('?')[0];
    if (ehAberturaDeSolicitacao(req)) {
      const obraIds = await obrasDaAbertura(req);
      if (!obraIds.length) return next();
      const travas = await travaDasObras(obraIds);
      const hit = obraIds.map((id) => travas.get(id)).find((item) => item?.bloqueando);
      return hit
        ? recusar(res, hit, 'OBRA_TRAVADA_SOLICITACAO_NOVA', mensagemSolicitacaoNova(hit))
        : next();
    }
    if (path === '/custos-recebiveis' || path.startsWith('/custos-recebiveis/')) {
      const travadas = (await obrasTravadasDoUsuario(req.user)).filter((item) => item.bloqueando);
      if (!travadas.length) return next();
      const obraId = rotaRegularizacaoBloqueada(req, new Set(travadas.map((item) => Number(item.obra_id))));
      const hit = obraId ? travadas.find((item) => Number(item.obra_id) === obraId) : null;
      return hit
        ? recusar(res, hit, 'OBRA_TRAVADA_CUSTOS_RECEBIVEIS', mensagemTravada(hit))
        : next();
    }
    return next();
  } catch (error) {
    console.error('Falha segura ao avaliar bloqueio de obra (Custos e Recebiveis):', error.message);
    return next();
  }
}

module.exports = requireCustosRecebiveisCompletion;
