'use strict';
const { Op } = require('sequelize');
const { Transform } = require('node:stream');
const { once } = require('node:events');
const archiver = require('archiver');
const { RhColaborador, RhDocumento, RhSolicitacaoAnexo, PagamentoManualFilaItem, PagamentoManualFilaComprovante } = require('../models');
const { canViewRhDpDocumentos } = require('./authorizationService');
const { ValidationError } = require('../middlewares/validation');
const { listarDossieColaboradorRh } = require('./rhDossieService');
const { abrirStreamStorage } = require('./s3');

const LIMITE_PESSOAS = 10, LIMITE_ARQUIVOS = 1000, LIMITE_BYTES = 256 * 1024 * 1024;
const ativos = new Set();
function inteiro(valor, nome, opcional = true) {
  if (opcional && (valor == null || valor === '')) return null;
  if (!/^\d+$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) throw new ValidationError(`${nome} invalido.`);
  return Number(valor);
}
function nomeSeguro(nome) {
  return String(nome || 'arquivo').normalize('NFKC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '_').replace(/[. ]+$/g, '').slice(0, 110) || 'arquivo';
}
async function prepararExportacao(filtros, user) {
  if (!await canViewRhDpDocumentos(user)) throw new ValidationError('Acesso negado aos documentos RH/DP.', 403);
  const empresa = inteiro(filtros.empresa_id, 'Empresa');
  const colaborador = inteiro(filtros.colaborador_id, 'Colaborador');
  const obra = inteiro(filtros.obra_id, 'Obra');
  const cursor = inteiro(filtros.apos_id, 'Cursor');
  if (!empresa && !colaborador) throw new ValidationError('Selecione uma empresa ou colaborador para exportar.');
  const where = { ...(empresa ? { empresa_grupo_id: empresa } : {}), ...(obra ? { obra_id: obra } : {}),
    ...(colaborador ? { id: colaborador } : cursor ? { id: { [Op.gt]: cursor } } : {}) };
  const pessoas = await RhColaborador.findAll({ where,
    attributes: ['id', 'nome', 'matricula', 'empresa_grupo_id', 'obra_id', 'status', 'data_admissao', 'data_demissao', 'data_inicio_efetivo_obra'],
    order: [['id', 'ASC']], limit: LIMITE_PESSOAS + 1, raw: true });
  if (colaborador && !pessoas.length) throw new ValidationError('Colaborador nao encontrado neste recorte.', 404);
  const itens = pessoas.slice(0, LIMITE_PESSOAS);
  return { itens, proximo_cursor: pessoas.length > LIMITE_PESSOAS ? itens.at(-1).id : null, limite: LIMITE_PESSOAS };
}

async function arquivosDaPessoa(colaborador, modo) {
  const dossie = await listarDossieColaboradorRh(colaborador.id);
  const itens = modo === 'COMPROVANTES' ? dossie.itens.filter(i => i.origem === 'COMPROVANTE_PAGAMENTO') : dossie.itens;
  const documentos = modo === 'COMPLETO' ? await RhDocumento.findAll({ where: { colaborador_id: colaborador.id },
    attributes: ['id', 'nome_original', 'arquivo_url', 'status', 'ativo', 'validade', 'documento_anterior_id', 'createdAt'], raw: true }) : [];
  const anexosIds = itens.filter(i => i.origem === 'SOLICITACAO').map(i => i.arquivo_id);
  const anexos = anexosIds.length ? await RhSolicitacaoAnexo.findAll({ where: { id: { [Op.in]: anexosIds } },
    attributes: ['id', 'arquivo_url'], raw: true }) : [];
  const filaIds = [...new Set(itens.filter(i => i.origem === 'COMPROVANTE_PAGAMENTO').map(i => i.fila_id))];
  const filas = filaIds.length ? await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: filaIds } },
    attributes: ['id', 'comprovante_url'], include: [{ model: PagamentoManualFilaComprovante, as: 'comprovantes',
      attributes: ['id', 'url'], separate: true }] }) : [];
  const arquivos = documentos.map(d => ({ origem: 'DOCUMENTO_OFICIAL', arquivo_id: d.id, nome: d.nome_original,
    situacao: d.status, ativo: d.ativo, validade: d.validade, documento_anterior_id: d.documento_anterior_id, data: d.createdAt, url: d.arquivo_url }));
  for (const item of itens) {
    const fila = filas.find(f => Number(f.id) === Number(item.fila_id));
    const url = item.origem === 'SOLICITACAO' ? anexos.find(a => Number(a.id) === Number(item.arquivo_id))?.arquivo_url
      : item.legado ? fila?.comprovante_url : fila?.comprovantes?.find(c => Number(c.id) === Number(item.arquivo_id))?.url;
    if (!url) throw new ValidationError('Um arquivo listado nao esta mais disponivel. Atualize e tente novamente.', 409);
    arquivos.push({ ...item, url });
  }
  return arquivos;
}

async function exportarZip(filtros, user, res) {
  const chave = Number(user?.id);
  if (ativos.has(chave) || ativos.size >= 2) throw new ValidationError('Ja existe uma exportacao em andamento. Aguarde e tente novamente.', 429);
  const modo = String(filtros.modo || '').toUpperCase();
  if (!['COMPROVANTES', 'COMPLETO'].includes(modo)) throw new ValidationError('Tipo de exportacao invalido.');
  ativos.add(chave);
  const abort = new AbortController();
  let archive, corrente, totalBytes = 0, terminou = false;
  const interromper = () => { if (!terminou) { abort.abort(); corrente?.destroy(); archive?.abort(); } };
  const timer = setTimeout(interromper, 240000);
  res.once('close', interromper);
  try {
    const pagina = await prepararExportacao(filtros, user);
    if (!pagina.itens.length) throw new ValidationError('Nenhum colaborador neste recorte.', 404);
    const arquivos = [], manifesto = { gerado_em: new Date().toISOString(), modo, proximo_cursor: pagina.proximo_cursor,
      aviso: 'Documentos e comprovantes disponiveis no sistema neste instante; nao certifica ausencia de documentos externos. Arquivos compartilhados podem aparecer em mais de uma pasta.', colaboradores: [] };
    for (const pessoa of pagina.itens) {
      if (abort.signal.aborted) throw Error('Exportacao cancelada.');
      const lista = await arquivosDaPessoa(pessoa, modo);
      const pasta = `${pessoa.id}-${nomeSeguro(pessoa.nome)}`;
      const registros = lista.map((a, index) => {
        const caminho = `${pasta}/${a.origem}/${a.fila_id || 0}-${a.arquivo_id}-${index}-${nomeSeguro(a.nome)}`;
        arquivos.push({ url: a.url, caminho });
        const { url, ...meta } = a; return { ...meta, caminho };
      });
      manifesto.colaboradores.push({ ...pessoa, arquivos: registros });
      if (arquivos.length > LIMITE_ARQUIVOS) throw new ValidationError('Lote excede 1000 arquivos. Exporte por colaborador.', 413);
    }
    if (abort.signal.aborted) throw Error('Exportacao cancelada.');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="rh-${modo.toLowerCase()}-${pagina.itens[0].id}-${pagina.itens.at(-1).id}.zip"`);
    res.setHeader('X-RH-Proximo-Cursor', pagina.proximo_cursor == null ? 'FIM' : String(pagina.proximo_cursor));
    res.setHeader('X-RH-Quantidade-Colaboradores', String(pagina.itens.length));
    res.setHeader('Access-Control-Expose-Headers', [res.getHeader?.('Access-Control-Expose-Headers'),
      'Content-Disposition', 'X-RH-Proximo-Cursor', 'X-RH-Quantidade-Colaboradores'].filter(Boolean).join(', '));
    res.setHeader('Cache-Control', 'no-store');
    archive = archiver('zip', { store: true });
    archive.on('error', erro => { abort.abort(); corrente?.destroy(); res.destroy(erro); });
    archive.on('warning', erro => archive.emit('error', erro));
    archive.pipe(res);
    for (const arquivo of arquivos) {
      if (abort.signal.aborted) throw Error('Exportacao cancelada.');
      const aberto = await abrirStreamStorage(arquivo.url, { signal: abort.signal });
      corrente = aberto.stream;
      if (aberto.tamanho && totalBytes + aberto.tamanho > LIMITE_BYTES) throw new ValidationError('Lote excede 256 MiB. Exporte por colaborador.', 413);
      let bytesArquivo = 0;
      const medidor = new Transform({ transform(chunk, encoding, done) {
        totalBytes += chunk.length; bytesArquivo += chunk.length;
        done(bytesArquivo > 128 * 1024 * 1024 ? Error('Arquivo excede 128 MiB.')
          : totalBytes > LIMITE_BYTES ? Error('Exportacao excede 256 MiB.') : null, chunk);
      } });
      const falha = erro => archive.emit('error', erro);
      corrente.once('error', falha); medidor.once('error', falha);
      const concluida = once(archive, 'entry', { signal: abort.signal });
      archive.append(corrente.pipe(medidor), { name: arquivo.caminho });
      await concluida;
      corrente = null;
    }
    archive.append(JSON.stringify(manifesto, null, 2), { name: 'manifesto.json' });
    const fim = once(res, 'finish', { signal: abort.signal });
    await Promise.all([archive.finalize(), fim]); terminou = true;
  } catch (erro) {
    interromper();
    if (res.headersSent) res.destroy(erro);
    else { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); throw erro; }
  } finally {
    clearTimeout(timer); res.off('close', interromper); ativos.delete(chave);
  }
}
module.exports = { prepararExportacao, exportarZip, arquivosDaPessoa, nomeSeguro };
