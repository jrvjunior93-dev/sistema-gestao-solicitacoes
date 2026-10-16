'use strict';
const { Op, literal } = require('sequelize');
const { alocarBaixas } = require('./tituloRenegociacaoBaixas');
const { centavos, dinheiro } = require('./tituloRenegociacaoDomain');
const plain = v => v?.toJSON ? v.toJSON() : v;
const aliases = ['TituloFinanceiro', 'titulo'];
function condicao(campo, cond, alias = 'TituloFinanceiro') {
  if (!aliases.includes(alias) || !['obra_id', 'empresa_id', 'solicitacao_id', 'categoria_financeira_id'].includes(campo)) throw new Error('Escopo compartilhado inválido.');
  const valores = cond && typeof cond === 'object' ? cond[Op.in] : [cond];
  if (!Array.isArray(valores) || valores.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw new Error('Filtro compartilhado inválido.');
  return literal(`EXISTS (SELECT 1 FROM titulos_compartilhados_origens tc WHERE tc.titulo_financeiro_id = \`${alias}\`.id AND tc.${campo} IN (${valores.map(Number).join(',') || '0'}))`);
}
function whereOrigem(where = {}, alias = 'TituloFinanceiro') {
  const novo = {};
  for (const chave of Reflect.ownKeys(where)) {
    const v = where[chave];
    if ([Op.and, Op.or].includes(chave) && Array.isArray(v)) novo[chave] = [...(novo[chave] || []), ...v.map(c => c && Object.getPrototypeOf(c) === Object.prototype ? whereOrigem(c, alias) : c)];
    else if (['obra_id', 'empresa_id', 'solicitacao_id', 'categoria_financeira_id'].includes(chave)
      && (typeof v !== 'object' || v?.[Op.in])) {
      novo[Op.and] = [...(novo[Op.and] || []), { [Op.or]: [{ [chave]: v }, condicao(chave, v, alias)] }];
    } else novo[chave] = v;
  }
  return novo;
}
function escopoCompletoSql(obras, alias = 'TituloFinanceiro') {
  if (!aliases.includes(alias) || !Array.isArray(obras) || obras.some(v => !Number.isSafeInteger(Number(v)) || Number(v) <= 0)) throw new Error('Escopo inválido.');
  return literal(`NOT EXISTS (SELECT 1 FROM titulos_compartilhados_origens tc WHERE tc.titulo_financeiro_id = \`${alias}\`.id AND tc.obra_id NOT IN (${obras.map(Number).join(',') || '0'}))`);
}
function buscaSql(termo, escape, alias = 'TituloFinanceiro') {
  if (!aliases.includes(alias)) throw new Error('Alias de busca inválido.');
  const valor = escape(`%${String(termo).trim().toLocaleLowerCase('pt-BR').replace(/[\\%_]/g, '\\$&')}%`);
  return literal(`EXISTS (SELECT 1 FROM titulos_compartilhados_origens tc JOIN solicitacoes so ON so.id = tc.solicitacao_id
    WHERE tc.titulo_financeiro_id = \`${alias}\`.id AND (LOWER(COALESCE(so.codigo, '')) LIKE ${valor}
      OR LOWER(COALESCE(so.numero_pedido, '')) LIKE ${valor}
      OR LOWER(CONCAT('PC-', LPAD(tc.pedido_compra_id, 5, '0'))) LIKE ${valor}))`);
}
async function assertEscopo(req, titulo, transaction) {
  const db = require('../models');
  if (!titulo.compartilhamento_id) return;
  const obras = await require('./authorizationService').getFinanceiroObraScopeIds(req.user);
  if (obras === null) return;
  const linhas = await db.TituloCompartilhadoOrigem.findAll({ where: { titulo_financeiro_id: titulo.id }, transaction });
  if (!linhas.length || linhas.some(o => !obras.includes(Number(o.obra_id)))) {
    throw Object.assign(new Error('A operação exige acesso a todas as obras do título compartilhado.'), { statusCode: 403 });
  }
}
async function mapa(titulos, transaction) {
  const ids = [...new Set(titulos.filter(t => t?.compartilhamento_id).map(t => Number(t.id)))];
  if (!ids.length) return new Map();
  const db = require('../models');
  const linhas = await db.TituloCompartilhadoOrigem.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, order: [['id', 'ASC']], raw: true, transaction });
  const [obras, empresas, movimentos] = await Promise.all([
    db.Obra.findAll({ where: { id: { [Op.in]: [...new Set(linhas.map(a => a.obra_id))] } }, attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id'], transaction }),
    db.EmpresaGrupo.findAll({ where: { id: { [Op.in]: [...new Set(linhas.map(a => a.empresa_id))] } }, attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'], transaction }),
    db.MovimentoFinanceiro.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids }, tipo_movimento: 'BAIXA' }, order: [['id', 'ASC']], raw: true, transaction })
  ]);
  const porObra = new Map(obras.map(o => [Number(o.id), plain(o)])), porEmpresa = new Map(empresas.map(e => [Number(e.id), plain(e)]));
  const resultado = new Map();
  const agrupar = rows => { const mapa = new Map(); for (const r of rows) { const id = Number(r.titulo_financeiro_id); if (!mapa.has(id)) mapa.set(id, []); mapa.get(id).push(r); } return mapa; };
  const porTitulo = agrupar(linhas), movimentosPorTitulo = agrupar(movimentos);
  const unicos = new Map(titulos.filter(t => t?.compartilhamento_id).map(t => [Number(t.id), t]));
  for (const t of unicos.values()) {
    const alocacoes = (porTitulo.get(Number(t.id)) || []).map(a => ({ ...a,
      id: `tc-${a.id}`, compartilhamento_alocacao_id: a.id, obra: porObra.get(Number(a.obra_id)), empresa: porEmpresa.get(Number(a.empresa_id)), juros: 0, multa: 0 }));
    if (!alocacoes.length || alocacoes.reduce((s, a) => s + centavos(a.valor), 0) !== centavos(t.valor_original)) throw new Error('Título compartilhado sem participações consistentes.');
    alocacoes.baixas = alocarBaixas(alocacoes, movimentosPorTitulo.get(Number(t.id)) || [], t.valor_baixado);
    if (['CANCELADO', 'ESTORNADO'].includes(t.status)) alocacoes.baixas.saldo = alocacoes.map(() => 0);
    resultado.set(Number(t.id), alocacoes);
  }
  return resultado;
}
async function projetarPedido(vinculos, transaction) {
  const db = require('../models');
  const titulos = vinculos.map(v => plain(v.titulo)).filter(Boolean);
  const mapa = await module.exports.mapa(titulos, transaction);
  for (const v of vinculos) {
    const t = plain(v.titulo), linhas = mapa.get(Number(t?.id));
    if (!linhas) continue;
    const indices = linhas.map((a, i) => Number(a.pedido_compra_id) === Number(v.pedido_compra_id) ? i : -1).filter(i => i >= 0);
    const soma = campo => dinheiro(indices.reduce((s, i) => s + centavos(Number(campo(i)).toFixed(2)), 0));
    const valor = soma(i => linhas[i].valor), pago = soma(i => linhas.baixas.pago[i]), saldo = soma(i => linhas.baixas.saldo[i]);
    const projetado = { ...t, somente_participacao: true, valor_original: valor, valor_baixado: pago, valor_saldo: saldo,
      status: ['CANCELADO', 'ESTORNADO'].includes(t.status) ? t.status : Number(saldo) === 0 ? 'QUITADO' : Number(pago) > 0 ? 'PARCIAL' : 'ABERTO' };
    if (v.setDataValue) v.setDataValue('titulo', db.TituloFinanceiro.build(projetado, { isNewRecord: false, raw: true }));
    else v.titulo = projetado;
  }
}
async function anexarParticipacoes(titulos, { transaction } = {}) {
  const mapa = await module.exports.mapa(titulos.map(plain), transaction);
  for (const t of titulos) {
    const linhas = mapa.get(Number(t.id));
    if (!linhas) continue;
    const participacoes = linhas.map((a, i) => ({ solicitacao_id: a.solicitacao_id, pedido_compra_id: a.pedido_compra_id,
      obra_id: a.obra_id, obra_nome: a.obra?.nome, empresa_id: a.empresa_id, empresa_nome: a.empresa?.nome,
      empresa_cnpj: a.empresa?.cnpj, valor: a.valor, valor_baixado: linhas.baixas.pago[i], valor_saldo: linhas.baixas.saldo[i] }));
    if (t.setDataValue) t.setDataValue('participacoes', participacoes); else t.participacoes = participacoes;
  }
  return titulos;
}
async function buscarGestao(options, obraIds) {
  const db = require('../models');
  const where = { ...options.where, [Op.or]: [...(options.where?.[Op.or] || []), condicao('obra_id', { [Op.in]: obraIds })] };
  const titulos = await db.TituloFinanceiro.findAll({ ...options, where });
  const participacoes = await module.exports.mapa(titulos.map(plain), options.transaction);
  return titulos.flatMap(t => {
    const linhas = participacoes.get(Number(t.id));
    if (!linhas) return [t];
    return require('./tituloRenegociacaoLeitura').projetarTitulo({ ...plain(t), rateios: [] }, linhas)
      .filter(p => obraIds.includes(Number(p.obra_id)));
  });
}
module.exports = { condicao, whereOrigem, escopoCompletoSql, buscaSql, assertEscopo, mapa, projetarPedido, anexarParticipacoes, buscarGestao };
