'use strict';
const db = require('../models');
const { Op } = require('sequelize');
const { canAccessFilaPagamentos, getFinanceiroObraScopeIds } = require('./authorizationService');
const { getPresignedUrl } = require('./s3');
const plain = value => value?.toJSON ? value.toJSON() : value;
const idValido = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const erro = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

// DTO exclusivo da fila. Nao transforma anexos de um pedido em boletos de uma
// parcela, nem concede acesso geral as solicitacoes participantes.
async function anexarBoletosPedidos(req, titulos) {
  const arquivosPermitidos = new Map();
  const unicos = new Map(titulos.filter(t => t?.compartilhamento_id && idValido(t.id)).map(t => [Number(t.id), t]));
  for (const t of unicos.values()) t.boletos_pedidos = [];
  if (!unicos.size) return arquivosPermitidos;
  const scope = await getFinanceiroObraScopeIds(req.user);
  const obrasPermitidas = scope === null ? null : new Set(scope.map(Number));
  const linhas = await db.TituloCompartilhadoOrigem.findAll({ where: {
    titulo_financeiro_id: { [Op.in]: [...unicos.keys()] }
  }, attributes: ['titulo_financeiro_id', 'lote_id', 'pedido_compra_id', 'solicitacao_id', 'obra_id'], raw: true });
  const permitidas = new Map();
  for (const [id, t] of unicos) {
    const origens = linhas.filter(o => Number(o.titulo_financeiro_id) === id);
    if (!origens.length || origens.some(o => Number(o.lote_id) !== Number(t.compartilhamento_id)
      || !idValido(o.solicitacao_id)
      || (obrasPermitidas !== null && !obrasPermitidas.has(Number(o.obra_id))))) continue;
    permitidas.set(id, origens.filter(o => idValido(o.pedido_compra_id)));
  }
  const origens = [...permitidas.values()].flat();
  if (!origens.length) return arquivosPermitidos;
  const pedidoIds = [...new Set(origens.map(o => Number(o.pedido_compra_id)))];
  const solicitacaoIds = [...new Set(origens.map(o => Number(o.solicitacao_id)))];
  const [docs, solicitacoes] = await Promise.all([
    db.PedidoCompraDocumentoFinanceiro.findAll({ where: { pedido_compra_id: { [Op.in]: pedidoIds },
      tipo: 'BOLETO_COMPRA', arquivo_url: { [Op.ne]: null } },
    attributes: ['id', 'pedido_compra_id', 'tipo', 'arquivo_url', 'arquivo_nome', 'createdAt'], order: [['id', 'ASC']], raw: true }),
    db.Solicitacao.findAll({ where: { id: { [Op.in]: solicitacaoIds } }, attributes: ['id', 'codigo'], raw: true })
  ]);
  const caminhos = [...new Set(docs.map(d => d.arquivo_url).filter(p => typeof p === 'string' && p.trim()))];
  if (!caminhos.length) return arquivosPermitidos;
  // Exige o espelho ativo. Documento removido do pedido ou anexo excluido nao
  // pode reaparecer. Arquivos de outro pedido/solicitacao nao entram por nome.
  const anexos = await db.Anexo.findAll({ where: { solicitacao_id: { [Op.in]: solicitacaoIds },
    caminho_arquivo: { [Op.in]: caminhos }, tipo: 'BOLETO_COMPRA', deleted_at: null },
  attributes: ['id', 'solicitacao_id', 'caminho_arquivo', 'tipo', 'deleted_at'], raw: true });
  const codigos = new Map(solicitacoes.map(s => [Number(s.id), s.codigo]));
  for (const [id, partes] of permitidas) {
    const porArquivo = new Map();
    for (const d of docs) {
      if (!d.arquivo_url?.trim()) continue;
      for (const o of partes.filter(o => Number(o.pedido_compra_id) === Number(d.pedido_compra_id))) {
        const anexo = anexos.find(a => Number(a.solicitacao_id) === Number(o.solicitacao_id)
          && a.caminho_arquivo === d.arquivo_url && a.tipo === 'BOLETO_COMPRA' && !a.deleted_at);
        if (!anexo) continue;
        if (!porArquivo.has(d.arquivo_url)) porArquivo.set(d.arquivo_url, { documento_id: Number(d.id),
          nome: d.arquivo_nome || 'Boleto da compra', tipo: d.tipo, origens: [] });
        const arquivo = porArquivo.get(d.arquivo_url);
        if (!arquivo.origens.some(p => p.pedido_compra_id === Number(o.pedido_compra_id) && p.solicitacao_id === Number(o.solicitacao_id))) {
          arquivo.origens.push({ pedido_compra_id: Number(o.pedido_compra_id), solicitacao_id: Number(o.solicitacao_id),
            solicitacao_codigo: codigos.get(Number(o.solicitacao_id)) || null });
        }
      }
    }
    unicos.get(id).boletos_pedidos = [...porArquivo.values()];
    for (const [caminho, dto] of porArquivo) arquivosPermitidos.set(`${id}:${dto.documento_id}`, caminho);
  }
  // A mesma instancia pode aparecer mais de uma vez numa resposta.
  for (const t of titulos) if (t?.compartilhamento_id) t.boletos_pedidos = unicos.get(Number(t.id))?.boletos_pedidos || [];
  return arquivosPermitidos;
}

async function abrirBoletoPedido(req, filaId, documentoId) {
  if (!idValido(filaId) || !idValido(documentoId)) erro(400, 'Identificacao do boleto invalida.');
  if (!(await canAccessFilaPagamentos(req.user))) erro(403, 'Sem acesso a fila de pagamentos.');
  const fila = await db.PagamentoManualFilaItem.findByPk(Number(filaId), { attributes: ['id', 'titulo_financeiro_id'] });
  if (!fila) erro(404, 'Item da fila nao encontrado.');
  const titulo = plain(await db.TituloFinanceiro.findByPk(fila.titulo_financeiro_id, { attributes: ['id', 'compartilhamento_id'] }));
  if (!titulo?.compartilhamento_id) erro(404, 'Boleto de pedido nao disponivel neste fluxo.');
  const permitidos = await anexarBoletosPedidos(req, [titulo]);
  const dto = titulo.boletos_pedidos.find(d => d.documento_id === Number(documentoId));
  if (!dto) erro(404, 'Boleto removido ou nao vinculado a este titulo acessivel.');
  const documento = await db.PedidoCompraDocumentoFinanceiro.findByPk(Number(documentoId), {
    attributes: ['id', 'pedido_compra_id', 'tipo', 'arquivo_url']
  });
  if (!documento?.arquivo_url || documento.arquivo_url !== permitidos.get(`${titulo.id}:${Number(documentoId)}`) || documento.tipo !== 'BOLETO_COMPRA'
    || !dto.origens.some(o => o.pedido_compra_id === Number(documento.pedido_compra_id))) erro(404, 'Boleto indisponivel.');
  return { nome: dto.nome, url: await getPresignedUrl(documento.arquivo_url, 300, { strict: true }) };
}
module.exports = { anexarBoletosPedidos, abrirBoletoPedido };
