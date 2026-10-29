'use strict';

const { Op } = require('sequelize');
const { createHash } = require('node:crypto');
const { sequelize, RhColaborador, RhDocumento, RhDocumentoTipo } = require('../models');
const { getRhDpObraScopeIds, userHasAreaPermission } = require('./authorizationService');
const { ValidationError } = require('../middlewares/validation');
const { uploadToS3, getPresignedUrl } = require('./s3');
const { normalizeOriginalName } = require('../utils/fileName');
const plain = value => value?.get ? value.get({ plain: true }) : value;
const idValido = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;

function campos(data, permitidos) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || Object.keys(data).some(k => !permitidos.includes(k))) throw new ValidationError('Campos nao permitidos na edicao pela obra.');
}
function texto(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new ValidationError('Texto invalido ou maior que o permitido.');
  return value.trim();
}
async function colaboradorNoEscopo(req, id, transaction, escrita = false) {
  if (!idValido(id)) throw new ValidationError('Colaborador invalido.');
  const escopo = await getRhDpObraScopeIds(req.user);
  if (!Array.isArray(escopo) || (escrita && !await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.abrir']))) {
    throw new ValidationError('Acesso negado ao cadastro limitado da obra.', 403);
  }
  const c = await RhColaborador.findByPk(id, { attributes: ['id', 'nome', 'obra_id', 'tipo_vinculo', 'observacoes'],
    transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!c || !escopo.includes(Number(c.obra_id))) throw new ValidationError('Acesso negado ao colaborador deste local.', 403);
  return { colaborador: c, escopo };
}
const documentoDto = d => {
  const v = plain(d);
  return { id: v.id, nome_original: v.nome_original, status: v.status, validade: v.validade,
    tipo_nome: v.tipoDocumento?.nome, observacoes: v.observacoes, createdAt: v.createdAt };
};
async function mostrar(req, id) {
  const { colaborador: c, escopo } = await colaboradorNoEscopo(req, id);
  const documentos = await RhDocumento.findAll({ where: { colaborador_id: c.id, ativo: true, obra_origem_id: { [Op.in]: escopo } },
    attributes: ['id', 'nome_original', 'status', 'validade', 'observacoes', 'createdAt'],
    include: [{ model: RhDocumentoTipo, as: 'tipoDocumento', attributes: ['id', 'nome'] }], order: [['id', 'DESC']] });
  const tipos = await RhDocumentoTipo.findAll({ where: { ativo: true, [Op.or]: [{ tipo_vinculo: null }, { tipo_vinculo: c.tipo_vinculo }] },
    attributes: ['id', 'nome', 'exige_validade'], order: [['nome', 'ASC']] });
  return { colaborador: plain(c), documentos: documentos.map(documentoDto), tipos_documento: tipos.map(plain),
    pode_editar: await userHasAreaPermission(req.user, ['rh_dp.solicitacoes.abrir']) };
}
async function salvarObservacoes(req, id, data) {
  campos(data, ['observacoes']);
  if (!Object.hasOwn(data, 'observacoes')) throw new ValidationError('Informe as observacoes.');
  const observacoes = texto(data.observacoes, 4000);
  await sequelize.transaction(async tx => {
    const { colaborador: c } = await colaboradorNoEscopo(req, id, tx, true);
    if (String(c.observacoes || '') !== observacoes) await c.update({ observacoes: observacoes || null, atualizado_por: req.user.id }, { transaction: tx });
  });
  return mostrar(req, id);
}
async function enviarDocumento(req, id, data, file) {
  campos(data, ['tipo_documento_id', 'validade', 'observacoes', 'chave_idempotencia']);
  if (!file?.buffer?.length || !idValido(data.tipo_documento_id)) throw new ValidationError('Selecione o tipo e o arquivo do documento.');
  const chave = String(data.chave_idempotencia || '');
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(chave)) throw new ValidationError('Chave de envio invalida.');
  const observacoes = texto(data.observacoes, 4000), validade = data.validade || null;
  if (validade && (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || Number.isNaN(Date.parse(validade))
      || new Date(`${validade}T00:00:00Z`).toISOString().slice(0, 10) !== validade)) throw new ValidationError('Validade invalida.');
  const hash = createHash('sha256').update(file.buffer).update(JSON.stringify([Number(data.tipo_documento_id), validade, observacoes])).digest('hex');
  const chaveHash = `${chave}:${hash}`;
  return sequelize.transaction(async tx => {
    const { colaborador: c, escopo } = await colaboradorNoEscopo(req, id, tx, true);
    const anterior = await RhDocumento.findOne({ where: { colaborador_id: c.id, chave_envio_obra: { [Op.like]: `${chave}:%` } }, transaction: tx });
    if (anterior) {
      if (anterior.chave_envio_obra !== chaveHash || !escopo.includes(Number(anterior.obra_origem_id))) {
        throw new ValidationError('Esta chave de envio ja foi utilizada para outro documento.', 409);
      }
      return { documento: documentoDto(anterior), replay: true };
    }
    const tipo = await RhDocumentoTipo.findByPk(data.tipo_documento_id, { transaction: tx });
    if (!tipo?.ativo || (tipo.tipo_vinculo && tipo.tipo_vinculo !== c.tipo_vinculo)) throw new ValidationError('Tipo de documento indisponivel para este colaborador.');
    if (tipo.exige_validade && !validade) throw new ValidationError('Informe a validade deste documento.');
    const arquivo = await uploadToS3(file, `rh-documentos/${c.id}`);
    const doc = await RhDocumento.create({ colaborador_id: c.id, documento_tipo_id: tipo.id,
      obra_origem_id: c.obra_id, chave_envio_obra: chaveHash, nome_original: normalizeOriginalName(file.originalname),
      arquivo_url: arquivo, mimetype: file.mimetype, tamanho_bytes: file.buffer.length,
      validade, observacoes: observacoes || null, status: 'ENVIADO', ativo: true,
      criado_por: req.user.id, atualizado_por: req.user.id }, { transaction: tx });
    return { documento: documentoDto(doc), replay: false };
  });
}
async function linkDocumento(req, id, documentoId) {
  const { colaborador: c, escopo } = await colaboradorNoEscopo(req, id);
  if (!idValido(documentoId)) throw new ValidationError('Documento invalido.');
  const d = await RhDocumento.findOne({ where: { id: Number(documentoId), colaborador_id: c.id, ativo: true, obra_origem_id: { [Op.in]: escopo } },
    attributes: ['id', 'arquivo_url'] });
  if (!d) throw new ValidationError('Documento enviado pela obra nao encontrado.', 404);
  return { url: await getPresignedUrl(d.arquivo_url, 300) };
}
module.exports = { mostrar, salvarObservacoes, enviarDocumento, linkDocumento };
