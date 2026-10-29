const { Anexo, Historico, PagamentoManualFilaComprovante, TituloFinanceiro, TituloCompartilhadoOrigem } = require('../models');
const { Op } = require('sequelize');
const { normalizeOriginalName } = require('../utils/fileName');

// O planejamento faz apenas SELECTs. Leitura corrente e reservada para a
// transacao que ja bloqueou o item; evita snapshot antigo no MySQL.
async function planejarComprovantesFilaNoHistorico(item, transaction, { tituloCarregado, leituraCorrente = false } = {}) {
  if (leituraCorrente && !transaction) throw new Error('Leitura corrente exige transacao.');
  const lock = leituraCorrente ? transaction.LOCK.UPDATE : undefined;
  const plano = { fila_id: item?.id, titulo_id: item?.titulo_financeiro_id, solicitacao_id: null,
    movimento_id: item?.movimento_financeiro_id, arquivos: [] };
  if (!['BAIXADO', 'DIVERGENTE', 'RESOLVIDO'].includes(item?.status)
      || !(Number(item.movimento_financeiro_id) > 0)) return plano;
  const adicionais = await PagamentoManualFilaComprovante.findAll({
    where: { fila_id: item.id }, transaction, lock, order: [['id', 'ASC']]
  });
  const arquivos = [...adicionais];
  if (item.comprovante_url) arquivos.push({ nome: item.comprovante_nome,
    url: item.comprovante_url, hash: item.comprovante_hash,
    vinculado_por: item.comprovante_vinculado_por, vinculado_em: item.comprovante_vinculado_em });
  if (!arquivos.length) return plano;
  const titulo = tituloCarregado || await TituloFinanceiro.findByPk(item.titulo_financeiro_id, {
    attributes: ['id', 'codigo', 'solicitacao_id', 'compartilhamento_id'], transaction
  });
  if (!titulo) return plano;
  let destinos = titulo.solicitacao_id ? [Number(titulo.solicitacao_id)] : [];
  if (titulo.compartilhamento_id) {
    const origens = await TituloCompartilhadoOrigem.findAll({ where: {
      titulo_financeiro_id: titulo.id, lote_id: titulo.compartilhamento_id
    }, attributes: ['solicitacao_id'], transaction, lock, order: [['solicitacao_id', 'ASC']] });
    destinos = [...new Set(origens.map(o => Number(o.solicitacao_id)))].sort((a, b) => a - b);
    if (!destinos.length || destinos.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('Titulo compartilhado sem origens validas para o comprovante.');
    }
  }
  if (!destinos.length) return plano; // Manual sem origem continua sem publicacao.
  plano.solicitacao_ids = destinos;
  plano.compartilhamento_id = titulo.compartilhamento_id || null;
  plano.solicitacao_id = titulo.solicitacao_id;
  plano.titulo_codigo = titulo.codigo;
  for (const solicitacaoId of destinos) {
    const historicos = await Historico.findAll({ where: {
      solicitacao_id: solicitacaoId, acao: { [Op.in]: ['COMPROVANTE_ADICIONADO', 'ANEXO_ADICIONADO', 'ANEXO_REMOVIDO'] }
    }, attributes: ['acao', 'metadata'], transaction, lock });
    const metadados = historicos.map(h => {
      try { const metadata = typeof h.metadata === 'object' ? h.metadata : JSON.parse(h.metadata || '{}');
        return { ...(metadata && typeof metadata === 'object' ? metadata : {}), acao: h.acao }; }
      catch {
        if (h.acao === 'ANEXO_REMOVIDO') throw new Error('Historico de remocao invalido; confira o documento.');
        return {};
      }
    });
    const vistos = new Set();
    const urlsVistas = new Set();
    for (const arquivo of arquivos) {
      if (!arquivo.url) continue;
      const chave = arquivo.hash || arquivo.url;
      if (vistos.has(chave) || urlsVistas.has(arquivo.url)) continue;
      vistos.add(chave);
      urlsVistas.add(arquivo.url);
      const publicado = metadados.some(m => m.caminho === arquivo.url ||
        (Number(m.fila_id) === Number(item.id) && arquivo.hash && m.comprovante_hash === arquivo.hash));
      const removido = metadados.some(m => m.acao === 'ANEXO_REMOVIDO' && m.caminho === arquivo.url);
      // Inclui removidos na busca para nunca ressuscitar um arquivo excluido.
      const anexo = await Anexo.findOne({ where: { solicitacao_id: solicitacaoId,
        caminho_arquivo: arquivo.url }, transaction, lock });
      plano.arquivos.push({ solicitacao_id: solicitacaoId, nome: arquivo.nome, url: arquivo.url, hash: arquivo.hash || null,
        vinculado_por: arquivo.vinculado_por || null, vinculado_em: arquivo.vinculado_em || null,
        anexo_id: anexo?.id || null,
        situacao: anexo?.deleted_at || removido ? 'REMOVIDO' : publicado ? 'JA_REGISTRADO' : 'PENDENTE_HISTORICO' });
    }
  }
  return plano;
}

// Nao copia o PDF: anexo e fila apontam para o mesmo objeto permanente no S3.
async function registrarComprovantesFilaNoHistorico(req, item, transaction, tituloCarregado) {
  if (!transaction) throw new Error('Historico de comprovantes exige transacao.');
  // Serializa tambem filas diferentes do mesmo titulo, alem do lock de fila do chamador.
  const tituloAtual = await TituloFinanceiro.findByPk(item.titulo_financeiro_id, {
    attributes: ['id', 'codigo', 'solicitacao_id', 'compartilhamento_id'], transaction, lock: transaction.LOCK.UPDATE
  });
  if (!tituloAtual) throw new Error('Titulo da fila nao encontrado.');
  const plano = await planejarComprovantesFilaNoHistorico(item, transaction, { tituloCarregado: tituloAtual, leituraCorrente: true });
  let criados = 0;
  for (const arquivo of plano.arquivos.filter(a => a.situacao === 'PENDENTE_HISTORICO')) {
    const nome = normalizeOriginalName(arquivo.nome || 'Comprovante.pdf');
    const anexo = arquivo.anexo_id ? { id: arquivo.anexo_id } : await Anexo.create({ solicitacao_id: arquivo.solicitacao_id,
      tipo: 'COMPROVANTE', nome_original: nome, caminho_arquivo: arquivo.url,
      uploaded_by: arquivo.vinculado_por || req.user?.id,
      area_origem: 'FINANCEIRO'
    }, { transaction });
    const metadata = { ...(plano.compartilhamento_id ? { compartilhamento_id: plano.compartilhamento_id } : {}), anexo_id: anexo.id, caminho: arquivo.url, tipo_documento: 'COMPROVANTE',
      origem: 'FILA_PAGAMENTOS', fila_id: item.id, titulo_financeiro_id: plano.titulo_id,
      titulo_codigo: plano.titulo_codigo, movimento_financeiro_id: item.movimento_financeiro_id,
      comprovante_hash: arquivo.hash || null, comprovante_vinculado_por: arquivo.vinculado_por || null,
      comprovante_vinculado_em: arquivo.vinculado_em || null };
    await Historico.create({ solicitacao_id: arquivo.solicitacao_id,
      usuario_responsavel_id: req.user?.id || null,
      setor: req.user?.setor?.codigo || req.user?.area || 'FINANCEIRO',
      acao: 'COMPROVANTE_ADICIONADO', descricao: nome,
      observacao: `Comprovante da baixa do titulo ${plano.titulo_codigo || plano.titulo_id} na fila #${item.id}.`,
      metadata: JSON.stringify(metadata)
    }, { transaction });
    criados++;
  }
  return criados;
}

module.exports = { registrarComprovantesFilaNoHistorico, planejarComprovantesFilaNoHistorico };
