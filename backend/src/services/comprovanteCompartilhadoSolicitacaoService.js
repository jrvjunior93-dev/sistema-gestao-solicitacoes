'use strict';
const db = require('../models');
const { Op } = require('sequelize');
const { canAccessSolicitacaoFile } = require('./fileAccessService');
const { getPresignedUrl } = require('./s3');
const falhar = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const idValido = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

// Chamador da listagem ja validou acesso a solicitacao. Nenhuma URL sai do DTO.
async function arquivosDaOrigem(tituloId, solicitacaoId, transaction) {
  const titulo = await db.TituloFinanceiro.findByPk(tituloId, { attributes: ['id', 'compartilhamento_id'], transaction });
  if (!titulo?.compartilhamento_id || Number(titulo.id) !== Number(tituloId)) return [];
  const origem = await db.TituloCompartilhadoOrigem.findOne({ where: {
    titulo_financeiro_id: tituloId, lote_id: titulo.compartilhamento_id, solicitacao_id: solicitacaoId
  }, attributes: ['id'], transaction });
  if (!origem) return [];
  const filas = await db.PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: tituloId },
    attributes: ['id', 'comprovante_nome', 'comprovante_url', 'comprovante_hash'], transaction,
    include: [{ model: db.PagamentoManualFilaComprovante, as: 'comprovantes',
      attributes: ['id', 'nome', 'url', 'hash'], separate: true }], order: [['id', 'DESC']] });
  const arquivos = [], vistos = new Set(), urls = new Set();
  for (const f of filas) {
    const candidatos = [...(f.comprovantes || []).map(c => ({ id: c.id, nome: c.nome, url: c.url, hash: c.hash })),
      { id: null, nome: f.comprovante_nome, url: f.comprovante_url, hash: f.comprovante_hash }];
    for (const c of candidatos) {
      if (!c.url || (c.hash && vistos.has(c.hash)) || urls.has(c.url)) continue;
      if (c.hash) vistos.add(c.hash); urls.add(c.url);
      arquivos.push({ ...c, filaId: f.id });
    }
  }
  if (!arquivos.length) return [];
  const [anexos, removidos] = await Promise.all([
    db.Anexo.findAll({ where: { solicitacao_id: solicitacaoId, caminho_arquivo: { [Op.in]: arquivos.map(a => a.url) } },
      attributes: ['caminho_arquivo', 'deleted_at'], transaction }),
    db.Historico.findAll({ where: { solicitacao_id: solicitacaoId, acao: 'ANEXO_REMOVIDO' }, attributes: ['metadata'], transaction })
  ]);
  const caminhosRemovidos = new Set(anexos.filter(a => a.deleted_at).map(a => a.caminho_arquivo));
  for (const h of removidos) {
    try { const m = typeof h.metadata === 'string' ? JSON.parse(h.metadata) : h.metadata;
      if (m?.caminho) caminhosRemovidos.add(m.caminho);
    } catch { falhar(409, 'Historico de remocao invalido; solicite conferencia do documento.'); }
  }
  return arquivos.filter(a => !caminhosRemovidos.has(a.url));
}
async function listar(tituloId, solicitacaoId, transaction) {
  return (await arquivosDaOrigem(tituloId, solicitacaoId, transaction))
    .map(a => ({ id: a.id, filaId: a.filaId, nome: a.nome || 'Comprovante' }));
}
async function abrir(req, solicitacaoId, tituloId, filaId, comprovanteId) {
  if (![solicitacaoId, tituloId, filaId].every(idValido) || (comprovanteId != null && !idValido(comprovanteId))) falhar(400, 'Identificador de comprovante invalido.');
  const acesso = await canAccessSolicitacaoFile(req, Number(solicitacaoId));
  if (!acesso.allowed) falhar(acesso.status || 403, 'Acesso negado ao comprovante desta solicitacao.');
  const arquivos = await arquivosDaOrigem(Number(tituloId), Number(solicitacaoId));
  const a = arquivos.find(a => Number(a.filaId) === Number(filaId)
    && (comprovanteId == null ? a.id === null : Number(a.id) === Number(comprovanteId)));
  if (!a) falhar(404, 'Comprovante nao encontrado nesta solicitacao.');
  return { nome: a.nome || 'Comprovante', url: await getPresignedUrl(a.url, 300, { strict: true }) };
}
module.exports = { listar, abrir };
