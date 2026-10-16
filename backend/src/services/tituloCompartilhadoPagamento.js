'use strict';
const crypto = require('node:crypto');
const db = require('../models');
const falhar = mensagem => { throw Object.assign(new Error(mensagem), { statusCode: 400 }); };
async function empresas(titulo, transaction) {
  if (!titulo.compartilhamento_id) return titulo.empresa_id ? [Number(titulo.empresa_id)] : [];
  const linhas = await db.TituloCompartilhadoOrigem.findAll({ where: { titulo_financeiro_id: titulo.id }, attributes: ['empresa_id'], transaction, raw: true });
  if (!linhas.length) falhar('Título compartilhado sem devedores registrados.');
  return [...new Set(linhas.map(a => Number(a.empresa_id)))];
}
async function entreEmpresas(titulo, pagadora, transaction) {
  return (await empresas(titulo, transaction)).some(id => id !== Number(pagadora));
}
async function validarEntreEmpresas(titulo, payload, pagadora, transaction) {
  const devedoras = await empresas(titulo, transaction);
  const ativas = await db.EmpresaGrupo.findAll({ where: { id: { [require('sequelize').Op.in]: devedoras }, ativo: true }, attributes: ['id'], transaction });
  if (ativas.length !== devedoras.length) falhar('Regularize o cadastro de uma empresa devedora inativa antes da baixa.');
  const diferentes = devedoras.some(id => id !== Number(pagadora));
  if (!diferentes) {
    if (payload.intercompany) falhar('A conta pagadora pertence à única empresa devedora; não marque Entre Empresas.');
    return {};
  }
  // Pagamento ao fornecedor, não transferência fictícia entre contas.
  // Mantém a regra atual da fila: natureza operacional e identificação pela conta.
  if (!payload.intercompany) falhar('A conta pagará participações de outras empresas. Marque Entre Empresas para registrar a baixa compartilhada.');
  if (payload.natureza_intercompany_baixa !== 'OPERACIONAL_TERCEIRO') falhar('Título compartilhado exige natureza Pagamento operacional a terceiro. As participações identificam os devedores.');
  return { intercompany_group_id: payload.intercompany_group_id || `TC-BAIXA-${crypto.randomUUID()}`,
    empresa_origem_id: Number(pagadora), empresa_destino_id: devedoras.length === 1 ? devedoras[0] : null, tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
    motivo_intercompany: String(payload.motivo_intercompany || `Pagamento do lote compartilhado #${titulo.compartilhamento_id}`).slice(0, 255),
    elimina_consolidado: false, transferencia_interna: false };
}
module.exports = { empresas, entreEmpresas, validarEntreEmpresas };
