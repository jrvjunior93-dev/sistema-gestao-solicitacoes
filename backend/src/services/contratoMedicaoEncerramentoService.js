'use strict';
const { sequelize, Contrato, SecurityEventLog, LogExclusao } = require('../models');
const { isSuperadmin, canViewContratos, canManageContratos, canAccessContratosGlobal, getUserObraScopeIds } = require('./authorizationService');
const { userHasSetorCapability } = require('./setorCapabilityService');
const { estado } = require('./contratoMedicaoEncerramentoDomain');
const EVENTO = 'CONTRATO_MEDICAO_MARCACAO';
const erro = (texto, statusCode = 400) => Object.assign(new Error(texto), { statusCode });

async function podeAlterar(usuario) {
  return isSuperadmin(usuario) || (await userHasSetorCapability(usuario, 'eh_setor_geo') && await canManageContratos(usuario));
}
async function acesso(contrato, usuario) {
  if (!usuario?.id) throw erro('Sessao obrigatoria.', 401);
  if (!await canViewContratos(usuario)) throw erro('Acesso negado aos contratos.', 403);
  if (!contrato) throw erro('Contrato nao encontrado.', 404);
  const ids = await getUserObraScopeIds(usuario);
  if (!(ids === null || ids.includes(Number(contrato.obra_id)) || (!ids.length && await canAccessContratosGlobal(usuario)))) {
    throw erro('Acesso negado para esta obra.', 403);
  }
}
async function consultar(id, usuario) {
  if (!usuario?.id || !await canViewContratos(usuario)) throw erro('Acesso negado aos contratos.', 403);
  const contrato = await Contrato.findByPk(Number(id));
  await acesso(contrato, usuario);
  // Recibo permanente separado de Historico da solicitacao: autoria/setor ali
  // podem ampliar a visibilidade. SecurityEventLog tem retencao limitada.
  const registros = await LogExclusao.findAll({
    where: { entidade: EVENTO, entidade_id: Number(contrato.id) },
    attributes: ['id', 'usuario_id', 'payload_json', 'createdAt'], order: [['id', 'DESC']], limit: 50
  });
  return { contrato_id: contrato.id, codigo: contrato.codigo, estado: estado(contrato),
    pode_alterar: await podeAlterar(usuario) && contrato.ativo !== false
      && !contrato.rescindido_em && !['RESCINDIDO', 'ENCERRADO'].includes(contrato.status_contrato)
      && (!contrato.fluxo_novo || contrato.status_contrato === 'ATIVO'),
    historico: registros.map(r => {
      let dados;
      try { dados = JSON.parse(r.payload_json); if (!dados?.novo) throw Error(); }
      catch { throw erro('Trilha da marcacao inconsistente. Confira a auditoria do contrato.', 409); }
      return { id: r.id, usuario_id: r.usuario_id, data: r.createdAt,
        finalizado: dados.novo.finalizado === true, motivo: dados.novo.motivo || '', revisao: dados.novo.revisao };
    }) };
}
function validar(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw erro('Marcacao invalida.');
  if (Object.keys(payload).some(k => !['finalizado', 'revisao', 'motivo'].includes(k))) throw erro('Campo nao permitido na marcacao.');
  if (typeof payload.finalizado !== 'boolean' || !Number.isSafeInteger(payload.revisao) || payload.revisao < 0) throw erro('Marcacao/revisao invalida. Atualize o contrato.');
  const motivo = typeof payload.motivo === 'string' ? payload.motivo.trim() : '';
  if (!motivo || motivo.length > 2000) throw erro('Informe o motivo, com ate 2000 caracteres.');
  return { ...payload, motivo };
}
async function alterar(id, payload, usuario) {
  if (!usuario?.id || !await podeAlterar(usuario)) throw erro('Somente GEO autorizado a editar contratos ou SUPERADMIN pode alterar esta marcacao.', 403);
  const dados = validar(payload);
  return sequelize.transaction(async transaction => {
    const contrato = await Contrato.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    await acesso(contrato, usuario);
    if (contrato.ativo === false || contrato.rescindido_em || ['RESCINDIDO', 'ENCERRADO'].includes(contrato.status_contrato)
      || (contrato.fluxo_novo && contrato.status_contrato !== 'ATIVO')) throw erro('A marcacao exige contrato ativo e aprovado, sem rescisao.', 409);
    const anterior = estado(contrato);
    // Replay imediato e seguro. Pedido anterior a uma reversao nunca pode remarcar.
    if (dados.revisao !== anterior.revisao) {
      if (anterior.revisao === dados.revisao + 1 && anterior.finalizado === dados.finalizado
        && Number(anterior.atualizado_por) === Number(usuario.id) && anterior.motivo === dados.motivo) return { estado: anterior, repetida: true };
      throw erro('A marcacao mudou. Atualize o contrato antes de confirmar novamente.', 409);
    }
    if (anterior.finalizado === dados.finalizado) return { estado: anterior, repetida: true };
    const novo = { finalizado: dados.finalizado, revisao: anterior.revisao + 1,
      atualizado_em: new Date().toISOString(), atualizado_por: usuario.id, motivo: dados.motivo };
    await contrato.update({ medicao_encerramento: novo }, { transaction });
    // Auditoria obrigatoria e atomica tambem para legados sem solicitacao-mae.
    await SecurityEventLog.create({ usuario_id: usuario.id, tipo_evento: EVENTO,
      recurso_tipo: 'CONTRATO', recurso_id: String(contrato.id), status: 'SUCCESS',
      descricao: novo.finalizado ? 'Contrato marcado como totalmente medido' : 'Marcacao de totalmente medido desfeita',
      metadata: { obra_id: contrato.obra_id, anterior, novo } }, { transaction });
    await LogExclusao.create({ entidade: EVENTO, entidade_id: Number(contrato.id), solicitacao_id: null,
      usuario_id: usuario.id, perfil: String(usuario.perfil || 'USUARIO').slice(0, 50),
      setor: String(usuario.setor?.codigo || usuario.area || usuario.setor?.nome || '').slice(0, 100),
      motivo: novo.motivo.slice(0, 255), payload_json: JSON.stringify({ obra_id: contrato.obra_id, anterior, novo }) }, { transaction });
    return { estado: novo, repetida: false };
  });
}
module.exports = { consultar, alterar, podeAlterar, validar };
