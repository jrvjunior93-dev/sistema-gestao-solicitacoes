'use strict';
const { Op, literal, where: sqlWhere } = require('sequelize');
const { sequelize, TituloFinanceiro, PagamentoManualFilaItem, EmpresaGrupo, Obra, Parceiro, PaymentBeneficiary } = require('../models');
const auth = require('./authorizationService');
const { ValidationError, ensureAllowedKeys, sanitizeString } = require('../middlewares/validation');
const { MODOS, ORIGENS_DP, recebimentoDpSql } = require('./pagamentoFilaFiltrosDomain');

function validarConsulta(q = {}) {
  ensureAllowedKeys(q, ['competencia', 'empresa_id', 'obra_id', 'q', 'recebimento_dp', 'status_titulo', 'status_fila', 'somente_suspeitos', 'pagina', 'limite'], 'Relatorio de envios DP');
  const result = {};
  for (const campo of ['empresa_id', 'obra_id']) if (q[campo]) {
    const id = Number(q[campo]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${campo} invalido.`);
    result[campo] = id;
  }
  if (q.competencia) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.competencia)) throw new ValidationError('Competencia invalida.');
    result.competencia = q.competencia;
  }
  for (const [campo, valores] of [['recebimento_dp', MODOS],
    ['status_titulo', ['PREVISAO', 'ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO', 'ESTORNADO', 'RENEGOCIADO']],
    ['status_fila', ['PENDENTE', 'EM_EDICAO', 'DIVERGENTE', 'NAO_PAGO', 'BAIXADO', 'RESOLVIDO', 'CANCELADO', 'ESTORNADO']]]) {
    if (q[campo]) {
      if (!valores.includes(q[campo])) throw new ValidationError(`${campo} invalido.`);
      result[campo] = q[campo];
    }
  }
  if (q.somente_suspeitos != null && !['', '0', '1', 'true', 'false'].includes(String(q.somente_suspeitos))) throw new ValidationError('Filtro de suspeitas invalido.');
  result.somente_suspeitos = ['1', 'true'].includes(String(q.somente_suspeitos));
  result.q = q.q ? sanitizeString(q.q, 'Busca', { max: 120 }) : '';
  for (const [campo, padrao, max] of [['pagina', 1, 100000], ['limite', 50, 100]]) {
    const n = q[campo] == null || q[campo] === '' ? padrao : Number(q[campo]);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ValidationError(`${campo} invalido.`);
    result[campo] = n;
  }
  return result;
}

function chaveSuspeita(t) {
  if (!['ABERTO', 'PARCIAL', 'QUITADO'].includes(t.status)) return null;
  const m = String(t.numero_documento || '').match(/^RHDP-(\d{4}-\d{2})-COL-(\d+)-(?:SOL-\d+-)?(SALARIO|INTEGRAL|ADIANTAMENTO_40|SALDO_60)$/);
  if (!m) return null; // Vales/pensao/favorecidos diferentes nao sao salarios duplicados.
  const parcela = m[3] === 'SALARIO' ? String(t.descricao || '').match(/Salario (\d+)%/i)?.[1]
    : m[3] === 'ADIANTAMENTO_40' ? '40' : m[3] === 'SALDO_60' ? '60' : '100';
  if (!parcela) return null;
  return [m[1], m[2], t.empresa_id, parcela, Math.round(Number(t.valor_original) * 100)].join(':');
}

function projetar(titulos, filas, filters) {
  const porTitulo = new Map(), grupos = new Map();
  const codigos = new Map(titulos.map(t => [Number(t.id), t.codigo || '#' + t.id]));
  for (const fila of filas) {
    const id = Number(fila.titulo_financeiro_id);
    if (!porTitulo.has(id)) porTitulo.set(id, []);
    porTitulo.get(id).push({ id: fila.id, status: fila.instrumento_pagamento_json?.estorno ? 'ESTORNADO' : fila.status,
      enviado_em: fila.selecionado_em, processado_em: fila.processado_em || null,
      valor_previsto: Number(fila.valor_previsto || 0), valor_informado: Number(fila.valor_informado || 0) });
  }
  for (const t of titulos) {
    if (!porTitulo.has(Number(t.id))) continue;
    const chave = chaveSuspeita(t);
    if (chave) { if (!grupos.has(chave)) grupos.set(chave, new Set()); grupos.get(chave).add(Number(t.id)); }
  }
  const empresas = new Map(), obras = new Map();
  const todos = titulos.filter(t => porTitulo.has(Number(t.id))).map(t => {
    if (t.empresa?.id) empresas.set(t.empresa.id, { id: t.empresa.id, nome: t.empresa.nome });
    if (t.obra?.id) obras.set(t.obra.id, { id: t.obra.id, nome: t.obra.nome });
    const envios = porTitulo.get(Number(t.id)).sort((a, b) => Number(b.id) - Number(a.id));
    const outros = [...(grupos.get(chaveSuspeita(t)) || [])].filter(id => id !== Number(t.id));
    const solicitacao = String(t.numero_documento || '').match(/-SOL-(\d+)-/);
    return { id: t.id, codigo: t.codigo, descricao: t.descricao, numero_documento: t.numero_documento, origem_titulo: t.origem_titulo,
      solicitacao_id: solicitacao ? Number(solicitacao[1]) : null,
      solicitacao_codigo: String(t.descricao || '').match(/^(RH-\d+)\s*-/)?.[1] || null,
      competencia: String(t.competencia_data || '').slice(0, 7) || String(t.numero_documento || '').match(/^RHDP-(\d{4}-\d{2})/)?.[1] || '',
      empresa_id: t.empresa_id, empresa: t.empresa?.nome || 'Não informada', obra_id: t.obra_id, obra: t.obra?.nome || 'Não informada',
      credor: t.parceiro?.nome || 'Não informado', recebimento_dp: t.recebimento_dp || 'NAO_INFORMADO',
      valor: Number(t.valor_original || 0), saldo: Number(t.valor_saldo || 0), baixado: Number(t.valor_baixado || 0),
      status_titulo: t.status, status_fila: envios[0].status, ultimo_envio: envios[0].enviado_em,
      envios, possiveis_duplicados: outros, duplicados_codigos: outros.map(id => codigos.get(id)) };
  });
  const termo = String(filters.q || '').toLocaleLowerCase('pt-BR');
  const data = todos.filter(t => (!filters.competencia || t.competencia === filters.competencia)
    && (!filters.empresa_id || Number(t.empresa_id) === filters.empresa_id)
    && (!filters.obra_id || Number(t.obra_id) === filters.obra_id)
    && (!filters.status_titulo || t.status_titulo === filters.status_titulo)
    && (!filters.status_fila || t.status_fila === filters.status_fila)
    && (!filters.recebimento_dp || t.recebimento_dp === filters.recebimento_dp)
    && (!filters.somente_suspeitos || t.possiveis_duplicados.length > 0)
    && (!termo || [t.codigo, t.descricao, t.credor, t.empresa, t.obra].some(v => String(v).toLocaleLowerCase('pt-BR').includes(termo))));
  return { data, total: data.length, suspeitos: data.filter(t => t.possiveis_duplicados.length).length,
    filtros: { empresas: [...empresas.values()], obras: [...obras.values()] } };
}

async function consultar(req, query) {
  if (!await auth.canViewRhDpDashboard(req.user)
    || !await auth.userHasAreaPermission(req.user, ['rh_dp.relatorios.visualizar'])) {
    throw new ValidationError('Sem permissao para relatorios do DP.', 403);
  }
  const filters = validarConsulta(query);
  const scope = await auth.getRhDpObraScopeIds(req.user);
  if (scope !== null && (!scope.length || (filters.obra_id && !scope.includes(filters.obra_id)))) {
    return { data: [], total: 0, suspeitos: 0, filtros: { empresas: [], obras: [] } };
  }
  // Universo LEVE autorizado para comparar duplicidades entre paginas e filtros.
  // Nao carrega snapshots, instrucoes bancarias ou historico de fila desse universo.
  const base = { origem_titulo: { [Op.in]: ORIGENS_DP }, tipo: 'PAGAR',
    ...(scope === null ? {} : { obra_id: { [Op.in]: scope } }),
    [Op.and]: literal('EXISTS (SELECT 1 FROM pagamentos_manuais_fila f WHERE f.titulo_financeiro_id = `TituloFinanceiro`.`id`)') };
  const includes = [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome'] },
    { model: Obra, as: 'obra', attributes: ['id', 'nome'] }, { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome'] }];
  const universo = (await TituloFinanceiro.findAll({ where: base,
    attributes: ['id', 'codigo', 'descricao', 'numero_documento', 'empresa_id', 'obra_id', 'valor_original', 'status'],
    include: includes.slice(0, 2) })).map(r => r.toJSON ? r.toJSON() : r);
  const grupos = new Map(), codigos = new Map(), empresas = new Map(), obras = new Map();
  for (const t of universo) {
    codigos.set(Number(t.id), t.codigo || '#' + t.id);
    const chave = chaveSuspeita(t);
    if (chave) { if (!grupos.has(chave)) grupos.set(chave, []); grupos.get(chave).push(Number(t.id)); }
    if (t.empresa?.id) empresas.set(t.empresa.id, { id: t.empresa.id, nome: t.empresa.nome });
    if (t.obra?.id) obras.set(t.obra.id, { id: t.obra.id, nome: t.obra.nome });
  }
  const suspeitosIds = [...grupos.values()].filter(g => g.length > 1).flat();
  const clauses = [base];
  if (filters.empresa_id) clauses.push({ empresa_id: filters.empresa_id });
  if (filters.obra_id) clauses.push({ obra_id: filters.obra_id });
  if (filters.status_titulo) clauses.push({ status: filters.status_titulo });
  if (filters.competencia) clauses.push(sqlWhere(literal("COALESCE(DATE_FORMAT(`TituloFinanceiro`.competencia_data, '%Y-%m'), CASE WHEN `TituloFinanceiro`.numero_documento REGEXP '^RHDP-[0-9]{4}-[0-9]{2}' THEN SUBSTRING(`TituloFinanceiro`.numero_documento, 6, 7) END)"), filters.competencia));
  if (filters.recebimento_dp) clauses.push(sqlWhere(literal(recebimentoDpSql('TituloFinanceiro')), filters.recebimento_dp));
  if (filters.status_fila) clauses.push(sqlWhere(literal(`(SELECT CASE
    WHEN JSON_EXTRACT(f.instrumento_pagamento_json, '$.estorno') IS NOT NULL
      AND JSON_TYPE(JSON_EXTRACT(f.instrumento_pagamento_json, '$.estorno')) <> 'NULL'
      AND CAST(JSON_EXTRACT(f.instrumento_pagamento_json, '$.estorno') AS CHAR) NOT IN ('false','0','""') THEN 'ESTORNADO'
    ELSE f.status END FROM pagamentos_manuais_fila f
    WHERE f.titulo_financeiro_id = \`TituloFinanceiro\`.id ORDER BY f.id DESC LIMIT 1)`), filters.status_fila));
  if (filters.somente_suspeitos) clauses.push({ id: { [Op.in]: suspeitosIds.length ? suspeitosIds : [0] } });
  if (filters.q) {
    const termo = '%' + filters.q.toLocaleLowerCase('pt-BR').replace(/[\\%_]/g, '\\$&') + '%';
    clauses.push({ [Op.or]: ['`TituloFinanceiro`.codigo', '`TituloFinanceiro`.descricao', '`parceiro`.nome', '`empresa`.nome', '`obra`.nome']
      .map(campo => literal(`LOWER(COALESCE(${campo}, ${campo === '`empresa`.nome' || campo === '`obra`.nome' ? "'Não informada'" : campo === '`parceiro`.nome' ? "'Não informado'" : "''"})) COLLATE utf8mb4_bin LIKE ${sequelize.escape(termo)}`)) });
  }
  const where = { [Op.and]: clauses };
  const includesContagem = filters.q ? includes.map(i => ({ ...i, attributes: [] })) : [];
  const total = Number(await TituloFinanceiro.count({ where, include: includesContagem }));
  const suspeitos = suspeitosIds.length ? Number(await TituloFinanceiro.count({
    where: { [Op.and]: [where, { id: { [Op.in]: suspeitosIds } }] }, include: includesContagem })) : 0;
  const paginas = Math.max(1, Math.ceil(total / filters.limite));
  const pagina = Math.min(filters.pagina, paginas);
  const rows = await TituloFinanceiro.findAll({ where,
    attributes: ['id', 'codigo', 'descricao', 'numero_documento', 'origem_titulo', 'empresa_id', 'obra_id', 'competencia_data',
      'valor_original', 'valor_saldo', 'valor_baixado', 'status'],
    include: [...includes, { model: PaymentBeneficiary, as: 'paymentBeneficiary', attributes: ['id', 'metodo_preferencial'] }],
    order: [['id', 'DESC']], limit: filters.limite, offset: (pagina - 1) * filters.limite });
  const titulos = rows.map(r => r.toJSON ? r.toJSON() : r);
  await require('./recebimentoDpConsultaService').anexarRecebimentosDp(titulos);
  const filas = titulos.length ? await PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos.map(t => t.id) } },
    attributes: ['id', 'titulo_financeiro_id', 'status', 'selecionado_em', 'processado_em', 'valor_previsto', 'valor_informado', 'instrumento_pagamento_json'], raw: true }) : [];
  const resultado = projetar(titulos, filas, {});
  const originais = new Map(titulos.map(t => [Number(t.id), t]));
  for (const t of resultado.data) {
    t.possiveis_duplicados = (grupos.get(chaveSuspeita(originais.get(Number(t.id)))) || []).filter(id => id !== Number(t.id));
    t.duplicados_codigos = t.possiveis_duplicados.map(id => codigos.get(id));
  }
  return { ...resultado, total, suspeitos, pagina, limite: filters.limite, total_paginas: paginas,
    filtros: { empresas: [...empresas.values()], obras: [...obras.values()] } };
}
module.exports = { consultar, validarConsulta, projetar, chaveSuspeita };
