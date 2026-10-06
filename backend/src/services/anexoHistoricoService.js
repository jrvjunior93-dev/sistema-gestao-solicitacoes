const { Anexo, Historico } = require('../models');
const { Op, col, fn, where: sequelizeWhere } = require('sequelize');

function metadataHistorico(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

function caminhosHistorico(historico) {
  const m = metadataHistorico(historico?.metadata);
  return [m.caminho, m.caminho_arquivo, m.arquivo_url, m.url, m.file_url,
    m.download_url, m.comprovante_pdf_url].filter(Boolean);
}

function normalizarCaminho(value) {
  const caminho = String(value || '').split('?')[0].split('#')[0];
  try { return decodeURI(caminho); } catch { return caminho; }
}

function remocaoPertenceAoHistorico(historico, remocao) {
  if (String(remocao?.acao || '').toUpperCase() !== 'ANEXO_REMOVIDO') return false;
  if (Number(historico.solicitacao_id) !== Number(remocao.solicitacao_id)) return false;
  const original = metadataHistorico(historico.metadata);
  const removido = metadataHistorico(remocao.metadata);
  if (removido.historico_id && Number(removido.historico_id) === Number(historico.id)) return true;
  if (original.anexo_id && removido.anexo_id) return Number(original.anexo_id) === Number(removido.anexo_id);
  // Legado sem ID: nao invalidar um novo upload feito depois da remocao.
  if (historico.createdAt && remocao.createdAt &&
      new Date(remocao.createdAt).getTime() < new Date(historico.createdAt).getTime()) return false;
  const caminhos = caminhosHistorico(historico).map(normalizarCaminho);
  return caminhosHistorico(remocao).some(c => caminhos.includes(normalizarCaminho(c)));
}

async function arquivoHistoricoRemovido(historico, { transaction } = {}) {
  if (!historico) return true;
  const metadata = metadataHistorico(historico.metadata);
  if (historico.acao === 'ANEXO_REMOVIDO' || metadata.removido === true || metadata.removido_em) return true;
  // IDs sao conferidos na mesma solicitacao; nunca seguir referencia cruzada.
  if (metadata.anexo_id) {
    const anexo = await Anexo.findOne({ where: { id: metadata.anexo_id,
      solicitacao_id: historico.solicitacao_id }, transaction });
    if (anexo?.deleted_at) return true;
  }
  const remocoes = await Historico.findAll({ where: {
    solicitacao_id: historico.solicitacao_id, acao: 'ANEXO_REMOVIDO'
  }, transaction });
  if (remocoes.some(r => remocaoPertenceAoHistorico(historico, r))) return true;
  const caminhos = caminhosHistorico(historico);
  if (!metadata.anexo_id && caminhos.length) {
    const anexos = await Anexo.findAll({ where: { solicitacao_id: historico.solicitacao_id,
      caminho_arquivo: { [Op.in]: caminhos } }, transaction });
    return anexos.length > 0 && anexos.every(a => a.deleted_at);
  }
  return false;
}

async function arquivoLocalRemovido(caminho) {
  const normalizado = normalizarCaminho(caminho);
  const candidatos = [...new Set([caminho, normalizado, encodeURI(normalizado)])];
  const anexos = await Anexo.findAll({ where: { caminho_arquivo: { [Op.in]: candidatos } },
    attributes: ['id', 'deleted_at'] });
  if (anexos.some(a => !a.deleted_at)) return false;
  if (anexos.length) return true;
  // Legado cujo vinculo existe apenas no historico, sem linha em anexos.
  const campos = ['caminho', 'caminho_arquivo', 'arquivo_url', 'url', 'file_url', 'download_url'];
  // Ignora metadata nao JSON sem limitar a busca aos eventos recentes.
  const jsonValido = fn('IF', fn('JSON_VALID', col('metadata')), col('metadata'), '{}');
  const historicos = await Historico.findAll({ where: { [Op.or]: campos.flatMap(campo =>
    candidatos.map(candidato => sequelizeWhere(fn('JSON_UNQUOTE', fn('JSON_EXTRACT', jsonValido, `$.${campo}`)), candidato))
  ) }, attributes: ['id', 'solicitacao_id', 'acao', 'metadata', 'createdAt'] });
  const correspondentes = historicos.filter(h => caminhosHistorico(h).some(c => normalizarCaminho(c) === normalizado));
  if (!correspondentes.length) return false; // Nao muda uploads de outros modulos.
  for (const h of correspondentes) {
    if (!(await arquivoHistoricoRemovido(h))) return false;
  }
  return true;
}

module.exports = { metadataHistorico, caminhosHistorico, arquivoHistoricoRemovido, arquivoLocalRemovido };
