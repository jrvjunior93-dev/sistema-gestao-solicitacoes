'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const MODULOS_OBRA = /^\/(solicitacoes|compras|contratos|rh|financeiro|obras|apropriacoes|recargas-cartao|boletos|prioridades-diretoria|custos-recebiveis|sst|comercial|provisoes-financeiras)(\/|$)/i;
const CADASTROS_GLOBAIS = /^\/compras\/(unidades|categorias|insumos|fornecedores|anexos-temporarios)(\/|$)/i;
const FORMULARIOS_OBRA = new Set(['/apropriacoes/importar-xlsx', '/apropriacoes/importar-xlsx/preview']);
function regularizacao(req) {
  if (req.method !== 'POST') return false;
  const path = req.path.toLowerCase();
  if (/^\/solicitacoes\/\d+\/pedidos-compra\/\d+\/itens\/\d+\/recebimentos\/?$/.test(path)) return true;
  return /^\/solicitacoes\/\d+\/pedidos-compra\/\d+\/entregas\/?$/.test(path)
    && ['RECEBER', 'NAO_ENTREGUE'].includes(req.body?.acao);
}
function numeros(valor) {
  const lista = Array.isArray(valor) ? valor : valor == null || valor === '' ? [] : [valor];
  if (lista.length > 5000 || lista.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw Object.assign(new Error('Identificadores de obra/recurso inválidos.'), { statusCode: 400 });
  }
  return [...new Set(lista.map(Number))];
}
async function obrasDaOperacao(req, models = db) {
  const path = req.path.toLowerCase(), body = req.body || {}, obras = new Set();
  const adicionar = (ids) => numeros(ids).forEach((id) => obras.add(id));
  const buscar = async (model, ids, referenciaContrato = false) => {
    ids = numeros(ids); if (!ids.length) return;
    const linhas = await models[model].findAll({ where: { id: { [Op.in]: ids } },
      attributes: referenciaContrato ? ['id', 'contrato_id'] : ['id', 'obra_id'], raw: true });
    if (linhas.length !== ids.length) throw Object.assign(new Error('Recurso não encontrado para verificar a obra.'), { statusCode: 404 });
    if (referenciaContrato) await buscar('Contrato', linhas.map((r) => r.contrato_id));
    else linhas.forEach((r) => { if (r.obra_id) adicionar(r.obra_id); });
  };
  let match;
  if ((match = path.match(/^\/solicitacoes\/(\d+)(\/|$)/))) await buscar('Solicitacao', match[1]);
  else if ((match = path.match(/^\/recargas-cartao\/solicitacoes\/(\d+)(\/|$)/))) await buscar('Solicitacao', match[1]);
  else if ((match = path.match(/^\/compras\/solicitacoes\/(\d+)(\/|$)/))) await buscar('SolicitacaoCompra', match[1]);
  else if ((match = path.match(/^\/compras\/pedidos\/(\d+)(\/|$)/))) await buscar('PedidoCompra', match[1]);
  else if ((match = path.match(/^\/contratos\/(?:fluxo-novo\/)?aditivos\/(\d+)(\/|$)/))) await buscar('ContratoAditivo', match[1], true);
  else if ((match = path.match(/^\/contratos\/medicoes\/(\d+)(\/|$)/))) await buscar('ContratoMedicao', match[1], true);
  else if ((match = path.match(/^\/contratos\/(?:fluxo-novo\/)?(\d+)(\/|$)/))) await buscar('Contrato', match[1]);
  else if ((match = path.match(/^\/financeiro\/titulos\/(\d+)(\/|$)/))) await buscar('TituloFinanceiro', match[1]);
  else if ((match = path.match(/^\/boletos\/titulos\/(\d+)(\/|$)/))) await buscar('TituloFinanceiro', match[1]);
  else if ((match = path.match(/^\/provisoes-financeiras\/(\d+)(\/|$)/))) await buscar('ProvisaoFinanceira', match[1]);
  else if ((match = path.match(/^\/(?:compras\/)?apropriacoes\/(\d+)(\/|$)/))) await buscar('Apropriacao', match[1]);
  else if ((match = path.match(/^\/rh\/solicitacoes\/(\d+)(\/|$)/))) await buscar('RhSolicitacao', match[1]);
  else if ((match = path.match(/^\/obras\/(\d+)(\/|$)/))) adicionar(match[1]);
  else if ((match = path.match(/^\/custos-recebiveis\/(?:obras|planejamento)\/(\d+)(\/|$)/))) adicionar(match[1]);

  // O corpo nunca substitui o vínculo persistido encontrado na URL. Mudanças de obra verificam origem e destino.
  const criacao = ['/solicitacoes', '/compras/solicitacoes', '/compras/solicitacoes-diretas', '/contratos', '/contratos/fluxo-novo', '/rh/solicitacoes', '/financeiro/titulos', '/provisoes-financeiras', '/apropriacoes', '/compras/apropriacoes', '/apropriacoes/importar-xlsx', '/apropriacoes/importar-xlsx/preview'].includes(path.replace(/\/$/, ''));
  if (criacao || match) adicionar(body.obra_id);
  if (criacao) {
    if (body.contrato_id) await buscar('Contrato', body.contrato_id);
    if (body.solicitacao_id) await buscar('Solicitacao', body.solicitacao_id);
  }
  // Todos os recursos de lotes são verificados antes de qualquer escrita, não apenas o primeiro.
  const ids = body.ids ?? body.solicitacao_ids ?? body.solicitacoes_ids ?? body.pedido_ids ?? body.pedidos_ids ?? body.titulo_ids ?? body.titulos_ids;
  if (ids != null) {
    if (path.startsWith('/solicitacoes')) await buscar('Solicitacao', ids);
    else if (path.startsWith('/compras/solicitacoes')) await buscar('SolicitacaoCompra', ids);
    else if (path.startsWith('/compras/pedidos')) await buscar('PedidoCompra', ids);
    else if (path.startsWith('/financeiro/titulos')) await buscar('TituloFinanceiro', ids);
  }
  return [...obras];
}
module.exports = { MODULOS_OBRA, CADASTROS_GLOBAIS, FORMULARIOS_OBRA, regularizacao, obrasDaOperacao };
