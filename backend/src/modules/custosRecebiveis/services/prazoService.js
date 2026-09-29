'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');

/*
  Prazos do ciclo mensal (regras fechadas pelo proprietario em 29/09/2026):

  - Janela de planejamento da competencia M: do dia 25 do mes anterior (00:00)
    ao dia 5 de M (23:59:59), horario de Brasilia, sem antecipar por fim de
    semana ou feriado.
  - Medicao aprovada (somente obra PUBLICA): 40 dias contados a partir do dia
    1o da competencia. Marco -> 1o/03 + 40 dias = 10/04, ate 23:59:59.

  Os valores abaixo sao o PADRAO; cada obra pode ter a sua configuracao
  (`cr_prazos_obra`, tela de Configuracoes), que chega por `config`.
  Dilatacao aprovada (`cr_dilatacoes`) move o prazo da medicao do mes.

  Brasilia e UTC-3 fixo desde o fim do horario de verao (2019). O calculo nao
  depende do fuso do servidor.
*/
const PRAZOS_PADRAO = Object.freeze({
  planejamento_dia_abertura: 25,
  planejamento_dia_fechamento: 5,
  medicao_prazo_dias: 40
});

const OFFSET_BRASILIA_HORAS = 3;
const DAY_MS = 86400000;
const VALID_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

const LIMITES_PRAZOS = Object.freeze({
  planejamento_dia_abertura: [1, 28],
  planejamento_dia_fechamento: [1, 28],
  medicao_prazo_dias: [1, 120]
});

function resolverConfig(config = {}) {
  const result = { ...PRAZOS_PADRAO };
  Object.keys(PRAZOS_PADRAO).forEach((key) => {
    const value = Number(config?.[key]);
    const [min, max] = LIMITES_PRAZOS[key];
    if (Number.isInteger(value) && value >= min && value <= max) result[key] = value;
  });
  return result;
}

function instanteBrasilia(year, monthIndex, day, hours = 0, minutes = 0, seconds = 0, ms = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hours + OFFSET_BRASILIA_HORAS, minutes, seconds, ms));
}

function partesBrasilia(value) {
  const shifted = new Date(new Date(value).getTime() - (OFFSET_BRASILIA_HORAS * 3600000));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function competenciaNoInstante(now = new Date()) {
  const { year, month } = partesBrasilia(now);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function addMonth(competencia, amount = 1) {
  const [year, month] = String(competencia).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function listCompetencias(start, end) {
  if (!VALID_COMPETENCIA.test(String(start)) || !VALID_COMPETENCIA.test(String(end))) return [];
  const result = [];
  for (let cursor = start; cursor <= end && result.length <= 240; cursor = addMonth(cursor)) {
    result.push(cursor);
  }
  return result;
}

function janelaPlanejamento(competencia, config) {
  const cfg = resolverConfig(config);
  const [year, month] = String(competencia).split('-').map(Number);
  return {
    abre_em: instanteBrasilia(year, month - 2, cfg.planejamento_dia_abertura),
    fecha_em: instanteBrasilia(year, month - 1, cfg.planejamento_dia_fechamento, 23, 59, 59, 999)
  };
}

function prazoMedicaoAprovada(competencia, config) {
  const cfg = resolverConfig(config);
  const [year, month] = String(competencia).split('-').map(Number);
  return instanteBrasilia(year, month - 1, 1 + Number(cfg.medicao_prazo_dias), 23, 59, 59, 999);
}

// Prazo da medicao considerando dilatacoes aprovadas: vale o maior entre o
// prazo base e o ultimo prazo concedido.
function prazoMedicaoEfetivo(competencia, config, prazoDilatado = null) {
  const base = prazoMedicaoAprovada(competencia, config);
  const dilatado = prazoDilatado ? new Date(prazoDilatado) : null;
  return dilatado && !Number.isNaN(dilatado.getTime()) && dilatado > base ? dilatado : base;
}

// Fim do dia (23:59:59.999 de Brasilia) da data informada, somando dias.
function fimDoDiaBrasilia(value, addDays = 0) {
  const { year, month, day } = partesBrasilia(value);
  return instanteBrasilia(year, month - 1, day + addDays, 23, 59, 59, 999);
}

// Dias de calendario (Brasilia) entre duas datas: 0 = mesmo dia.
function diasCalendario(from, to) {
  const a = partesBrasilia(from);
  const b = partesBrasilia(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

// Ultima competencia cuja janela de planejamento ja abriu.
function competenciaAlvoPlanejamento(now = new Date(), config) {
  const atual = competenciaNoInstante(now);
  const seguinte = addMonth(atual);
  return janelaPlanejamento(seguinte, config).abre_em <= now ? seguinte : atual;
}

// Cumprido = entregue (FINALIZADA). Mes REABERTO para correcao continua
// contando como entregue e nao trava a obra (decisao de 29/09); a reabertura
// dura 24h e o mes fecha de novo.
function planejamentoCumprido(competencia) {
  return ['FINALIZADA', 'REABERTA'].includes(competencia?.estado);
}

function inicioEfetivo(inicio, competencias, limite) {
  if (VALID_COMPETENCIA.test(String(inicio || ''))) return inicio;
  const existentes = (competencias || [])
    .map((item) => item.competencia)
    .filter((value) => VALID_COMPETENCIA.test(String(value || '')) && value <= limite)
    .sort();
  return existentes[0] || limite;
}

function resumoPlanejamento({ temPlanoPublicado, inicio, byKey, now, config }) {
  if (!temPlanoPublicado) return { situacao: 'SEM_ESTRUTURA' };
  const alvo = competenciaAlvoPlanejamento(now, config);
  const start = inicioEfetivo(inicio, [...byKey.values()], alvo);
  const pendentes = listCompetencias(start, alvo)
    .filter((competencia) => !planejamentoCumprido(byKey.get(competencia)));
  if (pendentes.length) {
    const competencia = pendentes[0];
    const janela = janelaPlanejamento(competencia, config);
    const vencido = janela.fecha_em < now;
    return {
      situacao: vencido ? 'VENCIDO' : 'ABERTO',
      competencia,
      abre_em: janela.abre_em.toISOString(),
      prazo_em: janela.fecha_em.toISOString(),
      dias: vencido ? diasCalendario(janela.fecha_em, now) : diasCalendario(now, janela.fecha_em),
      pendentes: pendentes.length
    };
  }
  const proxima = start > alvo ? start : addMonth(alvo);
  const janela = janelaPlanejamento(proxima, config);
  return {
    situacao: 'AGUARDANDO_JANELA',
    competencia: proxima,
    abre_em: janela.abre_em.toISOString(),
    prazo_em: janela.fecha_em.toISOString(),
    dias: Math.max(0, diasCalendario(now, janela.abre_em)),
    pendentes: 0
  };
}

function resumoMedicao({ inicio, byKey, now, config }) {
  const atual = competenciaNoInstante(now);
  const start = inicioEfetivo(inicio, [...byKey.values()], atual);
  const pendentes = listCompetencias(start, atual)
    .filter((competencia) => !byKey.get(competencia)?.tem_medicao_aprovada);
  if (pendentes.length) {
    const competencia = pendentes[0];
    const registro = byKey.get(competencia);
    const prazo = prazoMedicaoEfetivo(competencia, config, registro?.dilatacao_prazo);
    const vencido = prazo < now;
    return {
      situacao: vencido ? 'VENCIDO' : 'ABERTO',
      competencia,
      prazo_em: prazo.toISOString(),
      dias: vencido ? diasCalendario(prazo, now) : diasCalendario(now, prazo),
      pendentes: pendentes.length,
      dilatado: Boolean(registro?.dilatacao_prazo) && prazo > prazoMedicaoAprovada(competencia, config),
      dilatacao_pendente: Boolean(registro?.dilatacao_pendente)
    };
  }
  const proxima = start > atual ? start : addMonth(atual);
  const prazo = prazoMedicaoAprovada(proxima, config);
  return {
    situacao: 'EM_DIA',
    competencia: proxima,
    prazo_em: prazo.toISOString(),
    dias: diasCalendario(now, prazo),
    pendentes: 0
  };
}

/*
  Resumo de prazos de UMA obra. `competencias` sao os registros da obra
  ({ competencia, estado, finalizado_em, tem_medicao_aprovada }); `inicio` e a
  competencia inicial do responsavel (AAAA-MM) quando existir.
*/
function resumirPrazosObra({
  classificacao,
  temPlanoPublicado,
  inicio = null,
  competencias = [],
  now = new Date(),
  config = null
}) {
  const byKey = new Map((competencias || []).map((item) => [item.competencia, item]));
  const publica = String(classificacao || '').trim().toUpperCase() === 'PUBLICA';
  return {
    planejamento: resumoPlanejamento({ temPlanoPublicado, inicio, byKey, now, config }),
    // Sem planilha publicada nao ha como registrar medicao: nada a cobrar.
    medicao: publica && temPlanoPublicado ? resumoMedicao({ inicio, byKey, now, config }) : null,
    config: resolverConfig(config),
    // O bloqueio por atraso entra na Fase 3; ate la nenhuma obra e travada.
    travada: false,
    server_time: new Date(now).toISOString()
  };
}

// Competencias que o "Novo mes" pode criar, em ordem cronologica: as
// atrasadas ainda sem registro e a competencia cuja janela ja abriu.
function competenciasLiberadas({
  temPlanoPublicado,
  inicio = null,
  competencias = [],
  now = new Date(),
  config = null
}) {
  if (!temPlanoPublicado) return [];
  const alvo = competenciaAlvoPlanejamento(now, config);
  const existentes = new Set((competencias || []).map((item) => item.competencia));
  const start = inicioEfetivo(inicio, competencias, alvo);
  return listCompetencias(start, alvo).filter((competencia) => !existentes.has(competencia));
}

function dependencies(overrides = {}) {
  return {
    CrCompetencia: db.CrCompetencia,
    CrMedicaoConsolidada: db.CrMedicaoConsolidada,
    CrResponsavelObra: db.CrResponsavelObra,
    CrPlanoObra: db.CrPlanoObra,
    CrPrazoObra: db.CrPrazoObra,
    CrDilatacao: db.CrDilatacao,
    CrMedicaoSemRegistro: db.CrMedicaoSemRegistro,
    ...overrides
  };
}

function isMissingTableError(error) {
  return error?.parent?.code === 'ER_NO_SUCH_TABLE'
    || error?.original?.code === 'ER_NO_SUCH_TABLE';
}

// Tabelas da Fase 2 (migration 202609290001). Enquanto a migration nao roda
// no ambiente, prazos caem no padrao e nao ha dilatacao/sem medicao — o
// modulo continua abrindo em vez de responder 500.
let missingTableWarned = false;
async function readOptional(query) {
  try {
    return await query();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    if (!missingTableWarned) {
      missingTableWarned = true;
      console.warn('[custos-recebiveis] migration 202609290001 pendente: usando prazos padrao.');
    }
    return [];
  }
}

/*
  Le do banco o necessario para calcular os prazos de varias obras de uma vez.
  Devolve Map(obraId -> { temPlanoPublicado, inicio, competencias }).
*/
async function carregarContextoPrazos(obraIdsValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraIds = [...new Set((obraIdsValue || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map(obraIds.map((id) => [id, {
    temPlanoPublicado: false,
    inicio: null,
    config: null,
    competencias: []
  }]));
  if (!obraIds.length) return result;

  const [competencias, planos, responsaveis, configs] = await Promise.all([
    deps.CrCompetencia.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      attributes: ['id', 'obra_id', 'competencia', 'estado', 'finalizado_em'],
      raw: true
    }),
    deps.CrPlanoObra.findAll({
      where: { obra_id: { [Op.in]: obraIds }, situacao: 'PUBLICADA' },
      attributes: ['obra_id'],
      raw: true
    }),
    deps.CrResponsavelObra.findAll({
      where: {
        obra_id: { [Op.in]: obraIds },
        ativo: true,
        papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] }
      },
      attributes: ['obra_id', 'competencia_inicial'],
      raw: true
    }),
    readOptional(() => deps.CrPrazoObra.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      raw: true
    }))
  ]);

  const competenciaIds = competencias.map((item) => Number(item.id));
  const [medidas, semRegistro, dilatacoes] = competenciaIds.length
    ? await Promise.all([
      deps.CrMedicaoConsolidada.findAll({
        where: { competencia_id: { [Op.in]: competenciaIds } },
        attributes: ['competencia_id', [db.sequelize.fn('MAX', db.sequelize.col('createdAt')), 'registrado_em']],
        group: ['competencia_id'],
        raw: true
      }),
      readOptional(() => deps.CrMedicaoSemRegistro.findAll({
        where: { competencia_id: { [Op.in]: competenciaIds } },
        attributes: ['competencia_id', 'registrado_em'],
        raw: true
      })),
      readOptional(() => deps.CrDilatacao.findAll({
        where: {
          competencia_id: { [Op.in]: competenciaIds },
          situacao: { [Op.in]: ['SOLICITADA', 'APROVADA'] }
        },
        attributes: ['competencia_id', 'situacao', 'prazo_novo'],
        raw: true
      }))
    ])
    : [[], [], []];
  const medicaoRegistradaEm = new Map();
  [...medidas, ...semRegistro].forEach((item) => {
    medicaoRegistradaEm.set(Number(item.competencia_id), item.registrado_em || null);
  });
  const dilatacaoPrazo = new Map();
  const dilatacaoPendente = new Set();
  dilatacoes.forEach((item) => {
    const id = Number(item.competencia_id);
    if (item.situacao === 'SOLICITADA') {
      dilatacaoPendente.add(id);
      return;
    }
    const prazo = item.prazo_novo ? new Date(item.prazo_novo) : null;
    if (prazo && (!dilatacaoPrazo.has(id) || prazo > dilatacaoPrazo.get(id))) dilatacaoPrazo.set(id, prazo);
  });

  competencias.forEach((item) => {
    const entry = result.get(Number(item.obra_id));
    if (!entry) return;
    entry.competencias.push({
      competencia: item.competencia,
      estado: item.estado,
      finalizado_em: item.finalizado_em || null,
      tem_medicao_aprovada: medicaoRegistradaEm.has(Number(item.id)),
      medicao_registrada_em: medicaoRegistradaEm.get(Number(item.id)) || null,
      dilatacao_prazo: dilatacaoPrazo.get(Number(item.id)) || null,
      dilatacao_pendente: dilatacaoPendente.has(Number(item.id))
    });
  });
  configs.forEach((item) => {
    const entry = result.get(Number(item.obra_id));
    if (entry) entry.config = item;
  });
  planos.forEach((item) => {
    const entry = result.get(Number(item.obra_id));
    if (entry) entry.temPlanoPublicado = true;
  });
  responsaveis.forEach((item) => {
    const entry = result.get(Number(item.obra_id));
    const value = String(item.competencia_inicial || '');
    if (!entry || !VALID_COMPETENCIA.test(value)) return;
    if (!entry.inicio || value < entry.inicio) entry.inicio = value;
  });
  return result;
}

async function calcularPrazosObras(obras = [], options = {}, overrides = {}) {
  const now = options.now || new Date();
  const context = await carregarContextoPrazos(obras.map((obra) => obra.id), overrides);
  const result = new Map();
  obras.forEach((obra) => {
    const entry = context.get(Number(obra.id));
    if (!entry) return;
    result.set(Number(obra.id), resumirPrazosObra({
      classificacao: obra.classificacao,
      ...entry,
      now
    }));
  });
  return result;
}

async function competenciasLiberadasObra(obraId, options = {}, overrides = {}) {
  const context = await carregarContextoPrazos([obraId], overrides);
  const entry = context.get(Number(obraId));
  return competenciasLiberadas({ ...entry, now: options.now || new Date() });
}

module.exports = {
  LIMITES_PRAZOS,
  PRAZOS_PADRAO,
  isMissingTableError,
  prazoMedicaoEfetivo,
  readOptional,
  resolverConfig,
  addMonth,
  calcularPrazosObras,
  carregarContextoPrazos,
  competenciaAlvoPlanejamento,
  competenciaNoInstante,
  competenciasLiberadas,
  competenciasLiberadasObra,
  diasCalendario,
  fimDoDiaBrasilia,
  janelaPlanejamento,
  planejamentoCumprido,
  prazoMedicaoAprovada,
  resumirPrazosObra
};
