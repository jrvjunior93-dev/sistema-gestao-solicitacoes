const {
  Obra,
  RhApuracao,
  RhApuracaoEvento,
  RhColaborador,
  RhColaboradorPagamento,
  RhEmpresaGrupo,
  RhFechamento,
  RhImportacao,
  RhImportacaoLinha,
  RhSolicitacao,
  RhSolicitacaoHistorico,
  User,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { ValidationError } = require('../middlewares/validation');
const { codigoDoSetor } = require('../utils/codigoDoSetor');

const APURACAO_ITEM_INCLUDE = [
  {
    model: RhColaborador,
    as: 'colaborador',
    attributes: [
      'id',
      'nome',
      'cpf',
      'matricula',
      'tipo_vinculo',
      'status',
      'empresa_grupo_id',
      'obra_id',
      'cargo'
    ],
    include: [
      {
        model: RhEmpresaGrupo,
        as: 'empresaGrupo',
        attributes: ['id', 'codigo', 'nome']
      },
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'codigo', 'nome']
      },
      {
        model: RhColaboradorPagamento,
        as: 'pagamento'
      }
    ]
  },
  {
    model: User,
    as: 'ajustadoPor',
    attributes: ['id', 'nome', 'email']
  }
];

const APURACAO_INCLUDE = [
  {
    model: RhEmpresaGrupo,
    as: 'empresaGrupo',
    attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj', 'ativo']
  },
  {
    model: Obra,
    as: 'obra',
    attributes: ['id', 'codigo', 'nome']
  },
  {
    model: User,
    as: 'criadoPor',
    attributes: ['id', 'nome', 'email']
  },
  {
    model: User,
    as: 'atualizadoPor',
    attributes: ['id', 'nome', 'email']
  },
  {
    model: RhFechamento,
    as: 'fechamentoRh',
    required: false,
    where: { status: 'FECHADO' },
    attributes: [
      'id',
      'status',
      'data_fechamento',
      'data_vencimento',
      'total_titulos',
      'total_valor'
    ]
  }
];

function formatCurrencyValue(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(2));
}

function calculateValorHoraReferencia(valorBase) {
  const parsed = Number(valorBase || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed / 220;
}

async function ensureEmpresaGrupoExists(empresaGrupoId, transaction) {
  const empresa = await RhEmpresaGrupo.findByPk(empresaGrupoId, {
    transaction,
    attributes: ['id', 'nome']
  });

  if (!empresa) {
    throw new ValidationError('Empresa do grupo nao encontrada.');
  }

  return empresa;
}

async function ensureObraExists(obraId, transaction) {
  if (!obraId) {
    return null;
  }

  const obra = await Obra.findByPk(obraId, {
    transaction,
    attributes: ['id', 'nome']
  });

  if (!obra) {
    throw new ValidationError('Obra nao encontrada.');
  }

  return obra;
}

function buildApuracaoWhere(filters = {}) {
  const where = {};
  if (filters.competencia) where.competencia = filters.competencia;
  if (filters.empresa_grupo_id) where.empresa_grupo_id = filters.empresa_grupo_id;
  if (filters.obra_id) where.obra_id = filters.obra_id;
  if (filters.tipo_vinculo) where.tipo_vinculo = filters.tipo_vinculo;
  if (filters.status) where.status = filters.status;
  return where;
}

function addExactRecorteFilter(where, field, value) {
  if (!value) return;
  where[field] = value;
}

function enrichApuracao(apuracao) {
  const plain = typeof apuracao?.toJSON === 'function' ? apuracao.toJSON() : apuracao;
  const itensOrdenados = Array.isArray(plain?.itens)
    ? [...plain.itens].sort((a, b) =>
        String(a?.colaborador?.nome || '').localeCompare(String(b?.colaborador?.nome || ''), 'pt-BR')
      )
    : [];

  return {
    ...plain,
    itens: itensOrdenados,
    resumo_operacional: {
      itens_pendentes: itensOrdenados.filter((item) => item.status === 'PENDENTE').length,
      itens_conferidos: itensOrdenados.filter((item) => item.status === 'CONFERIDO').length
    }
  };
}

async function detalharApuracaoPorPk(id, transaction) {
  const apuracao = await RhApuracao.findByPk(id, {
    transaction,
    include: [
      ...APURACAO_INCLUDE,
      {
        model: RhApuracaoEvento,
        as: 'itens',
        separate: true,
        order: [['id', 'ASC']],
        include: APURACAO_ITEM_INCLUDE
      }
    ]
  });

  if (!apuracao) {
    throw new ValidationError('Apuracao RH/DP nao encontrada.', 404);
  }

  return enrichApuracao(apuracao);
}

async function resolveExistingDraft(data, transaction) {
  const draft = await RhApuracao.findOne({
    where: {
      competencia: data.competencia,
      empresa_grupo_id: data.empresa_grupo_id || null,
      obra_id: data.obra_id || null,
      tipo_vinculo: data.tipo_vinculo || null,
      status: 'RASCUNHO'
    },
    transaction
  });

  const conferida = await RhApuracao.findOne({
    where: {
      competencia: data.competencia,
      empresa_grupo_id: data.empresa_grupo_id || null,
      obra_id: data.obra_id || null,
      tipo_vinculo: data.tipo_vinculo || null,
      status: 'CONFERIDA'
    },
    transaction
  });

  if (conferida) {
    throw new ValidationError(
      'Ja existe uma apuracao conferida para esta competencia e recorte. Avance para o fechamento ou crie outro recorte.',
      409
    );
  }

  return draft;
}

async function buildAgrupamentoImportacoes(data, transaction) {
  const importacaoWhere = {
    status: 'CONFIRMADA',
    competencia: data.competencia
  };
  addExactRecorteFilter(importacaoWhere, 'empresa_grupo_id', data.empresa_grupo_id);
  addExactRecorteFilter(importacaoWhere, 'obra_id', data.obra_id);
  addExactRecorteFilter(importacaoWhere, 'tipo_vinculo', data.tipo_vinculo);

  const colaboradorWhere = {};
  if (data.empresa_grupo_id) colaboradorWhere.empresa_grupo_id = data.empresa_grupo_id;
  if (data.tipo_vinculo) colaboradorWhere.tipo_vinculo = data.tipo_vinculo;

  const linhas = await RhImportacaoLinha.findAll({
    where: {
      status: 'CONFIRMADA'
    },
    include: [
      {
        model: RhImportacao,
        as: 'importacao',
        required: true,
        attributes: ['id', 'tipo', 'competencia', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo'],
        where: importacaoWhere
      },
      {
        model: RhColaborador,
        as: 'colaborador',
        required: true,
        where: colaboradorWhere,
        attributes: [
          'id',
          'nome',
          'cpf',
          'matricula',
          'tipo_vinculo',
          'status',
          'salario_base',
          'valor_contratual',
          'empresa_grupo_id',
          'obra_id'
        ],
        include: [
          {
            model: RhEmpresaGrupo,
            as: 'empresaGrupo',
            attributes: ['id', 'codigo', 'nome']
          },
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'codigo', 'nome']
          }
        ]
      }
    ],
    order: [['id', 'ASC']],
    transaction
  });

  if (!linhas.length) {
    throw new ValidationError('Nao existem importacoes confirmadas para gerar a apuracao neste recorte.');
  }

  const agrupados = new Map();

  linhas.forEach((linha) => {
    const colaboradorId = Number(linha.colaborador_id || linha.colaborador?.id);
    if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
      return;
    }

    const itemAtual =
      agrupados.get(colaboradorId) ||
      {
        colaborador: linha.colaborador,
        importacao_ids: new Set(),
        observacoes: new Set(),
        jornada: {
          dias_trabalhados: 0,
          faltas: 0,
          horas_extras: 0,
          adicionais: 0,
          descontos_informados: 0,
          valor_informado: 0
        },
        creditos: 0,
        debitos: 0,
        eventos: []
      };

    itemAtual.importacao_ids.add(Number(linha.importacao?.id));
    if (linha.payload_json?.observacoes) {
      itemAtual.observacoes.add(String(linha.payload_json.observacoes).trim());
    }

    if (linha.importacao?.tipo === 'JORNADA') {
      itemAtual.jornada.dias_trabalhados += Number(linha.payload_json?.dias_trabalhados || 0);
      itemAtual.jornada.faltas += Number(linha.payload_json?.faltas || 0);
      itemAtual.jornada.horas_extras += Number(linha.payload_json?.horas_extras || 0);
      itemAtual.jornada.adicionais += Number(linha.payload_json?.adicionais || 0);
      itemAtual.jornada.descontos_informados += Number(linha.payload_json?.descontos_informados || 0);
      itemAtual.jornada.valor_informado += Number(linha.payload_json?.valor_informado || 0);
    } else {
      const valorEvento = Number(linha.payload_json?.valor || 0);
      const natureza = String(linha.payload_json?.natureza || 'CREDITO').trim().toUpperCase();

      if (natureza === 'DEBITO') {
        itemAtual.debitos += valorEvento;
      } else {
        itemAtual.creditos += valorEvento;
      }

      itemAtual.eventos.push({
        importacao_id: Number(linha.importacao?.id),
        natureza,
        valor: formatCurrencyValue(valorEvento),
        codigo_evento: linha.payload_json?.codigo_evento || null,
        descricao_evento: linha.payload_json?.descricao_evento || null,
        referencia: linha.payload_json?.referencia || null
      });
    }

    agrupados.set(colaboradorId, itemAtual);
  });

  return Array.from(agrupados.values());
}

async function listarRecortesImportacoesConfirmadas(data, transaction) {
  const where = {
    status: 'CONFIRMADA',
    competencia: data.competencia,
    obra_id: { [Op.ne]: null }
  };

  addExactRecorteFilter(where, 'empresa_grupo_id', data.empresa_grupo_id);
  addExactRecorteFilter(where, 'tipo_vinculo', data.tipo_vinculo);

  const importacoes = await RhImportacao.findAll({
    where,
    attributes: ['empresa_grupo_id', 'obra_id', 'tipo_vinculo'],
    order: [['obra_id', 'ASC'], ['id', 'ASC']],
    transaction
  });

  const recortes = new Map();
  importacoes.forEach((importacao) => {
    const obraId = Number(importacao.obra_id || 0);
    if (!Number.isInteger(obraId) || obraId <= 0) {
      return;
    }

    const empresaGrupoId = importacao.empresa_grupo_id || null;
    const tipoVinculo = data.tipo_vinculo || null;
    const key = [empresaGrupoId || 'null', obraId, tipoVinculo || 'null'].join(':');
    if (!recortes.has(key)) {
      recortes.set(key, {
        ...data,
        empresa_grupo_id: empresaGrupoId,
        obra_id: obraId,
        tipo_vinculo: tipoVinculo
      });
    }
  });

  const result = Array.from(recortes.values());
  if (!result.length) {
    throw new ValidationError('Nao existem importacoes confirmadas com obra para gerar a apuracao nesta competencia.');
  }

  return result;
}

function calcularItemApuracao(agrupado, diasBase) {
  const colaborador = agrupado.colaborador;
  const tipoVinculo = String(colaborador?.tipo_vinculo || '').trim().toUpperCase();
  const valorBaseCalculo =
    tipoVinculo === 'CLT'
      ? Number(colaborador?.salario_base || 0)
      : Number(colaborador?.valor_contratual || colaborador?.salario_base || 0);

  const jornada = agrupado.jornada || {};
  const diasTrabalhados = Number(jornada.dias_trabalhados || 0);
  const faltas = Number(jornada.faltas || 0);
  const horasExtras = Number(jornada.horas_extras || 0);
  const adicionais = Number(jornada.adicionais || 0);
  /**
   * OS QUATRO ADICIONAIS DO ITEM 11 DO ESCOPO (Fase 12).
   *
   * Entram na SOMA junto com `adicionais` — que continua sendo o campo livre para o que nao se
   * encaixa nos quatro e para o que foi gravado antes desta fase. Ler os cinco e somar aqui e o
   * que impede o valor antigo de sumir do bruto quando a tela nova passar a mandar os separados.
   */
  const adicionalNoturno = Number(jornada.adicional_noturno || 0);
  const adicionalInsalubridade = Number(jornada.adicional_insalubridade || 0);
  const adicionalPericulosidade = Number(jornada.adicional_periculosidade || 0);
  const bonificacoes = Number(jornada.bonificacoes || 0);
  const totalAdicionais =
    adicionais + adicionalNoturno + adicionalInsalubridade + adicionalPericulosidade + bonificacoes;
  const descontosInformados = Number(jornada.descontos_informados || 0);
  const valorInformado = Number(jornada.valor_informado || 0);
  const creditos = Number(agrupado.creditos || 0);
  const debitos = Number(agrupado.debitos || 0);

  let regraAplicada = 'NAO_IDENTIFICADA';
  let valorBruto = 0;

  // A MEMORIA DE CALCULO, preenchida abaixo e devolvida em `detalhes_json.resumo`. E o que a
  // "planilha-resumo para conferencia" do escopo mostra linha a linha — sem ela, o conferente ve um
  // bruto e um liquido e nao tem como contestar nenhum dos dois.
  const resumo = {};

  if (tipoVinculo === 'CLT') {
    regraAplicada = 'CLT_SIMPLIFICADA';
    const salarioProporcional =
      diasTrabalhados > 0 && Number(diasBase || 0) > 0
        ? valorBaseCalculo * (diasTrabalhados / Number(diasBase))
        : valorBaseCalculo;
    const valorHora = calculateValorHoraReferencia(valorBaseCalculo);
    const valorHorasExtras = horasExtras * valorHora * 1.5;
    valorBruto = salarioProporcional + valorHorasExtras + totalAdicionais + creditos;
    resumo.valor_proporcional = formatCurrencyValue(salarioProporcional);
    resumo.valor_hora = formatCurrencyValue(valorHora);
    resumo.valor_horas_extras = formatCurrencyValue(valorHorasExtras);
  } else {
    regraAplicada = valorInformado > 0 ? 'NAO_CLT_VALOR_INFORMADO' : 'NAO_CLT_SIMPLIFICADA';
    const baseNaoClt =
      valorInformado > 0
        ? valorInformado
        : diasTrabalhados > 0 && Number(diasBase || 0) > 0
          ? valorBaseCalculo * (diasTrabalhados / Number(diasBase))
          : valorBaseCalculo;
    valorBruto = baseNaoClt + totalAdicionais + creditos;
    resumo.valor_proporcional = formatCurrencyValue(baseNaoClt);
    resumo.valor_horas_extras = 0;
  }

  /**
   * DESCONTO POR FALTAS — o escopo pede o numero, mas ele NAO E SUBTRAIDO DE NOVO.
   *
   * O salario proporcional ja e calculado sobre os DIAS TRABALHADOS, entao o dia de falta ja deixou
   * de ser pago ali. Subtrair outra vez cobraria a falta em dobro do colaborador.
   *
   * O valor existe aqui como MEMORIA DE CALCULO: e a resposta a pergunta "quanto essas faltas
   * custaram", que e o que o conferente quer ver na planilha. Por isso ele mora em `resumo`, e nao
   * em `valor_descontos`.
   */
  resumo.desconto_faltas = formatCurrencyValue(
    Number(diasBase || 0) > 0 ? valorBaseCalculo * (faltas / Number(diasBase)) : 0
  );
  resumo.desconto_faltas_ja_no_proporcional = true;
  resumo.adicionais = {
    noturno: formatCurrencyValue(adicionalNoturno),
    insalubridade: formatCurrencyValue(adicionalInsalubridade),
    periculosidade: formatCurrencyValue(adicionalPericulosidade),
    bonificacoes: formatCurrencyValue(bonificacoes),
    outros: formatCurrencyValue(adicionais),
    total: formatCurrencyValue(totalAdicionais)
  };

  const valorDescontos = descontosInformados + debitos;
  const valorLiquido = valorBruto - valorDescontos;

  return {
    colaborador_id: colaborador.id,
    status: 'PENDENTE',
    regra_aplicada: regraAplicada,
    valor_base_calculo: formatCurrencyValue(valorBaseCalculo),
    dias_trabalhados: formatCurrencyValue(diasTrabalhados),
    faltas: formatCurrencyValue(faltas),
    horas_extras: formatCurrencyValue(horasExtras),
    valor_bruto: formatCurrencyValue(valorBruto),
    valor_descontos: formatCurrencyValue(valorDescontos),
    ajuste_credito_manual: 0,
    ajuste_debito_manual: 0,
    adicional_noturno: formatCurrencyValue(adicionalNoturno),
    adicional_insalubridade: formatCurrencyValue(adicionalInsalubridade),
    adicional_periculosidade: formatCurrencyValue(adicionalPericulosidade),
    bonificacoes: formatCurrencyValue(bonificacoes),
    valor_liquido: formatCurrencyValue(valorLiquido),
    observacoes: Array.from(agrupado.observacoes || []).filter(Boolean).join(' | ') || null,
    detalhes_json: {
      importacao_ids: Array.from(agrupado.importacao_ids || []).sort((a, b) => a - b),
      tipo_vinculo: tipoVinculo,
      dias_base: Number(diasBase || 0),
      resumo,
      jornada: {
        dias_trabalhados: formatCurrencyValue(diasTrabalhados),
        faltas: formatCurrencyValue(faltas),
        horas_extras: formatCurrencyValue(horasExtras),
        adicionais: formatCurrencyValue(adicionais),
        descontos_informados: formatCurrencyValue(descontosInformados),
        valor_informado: formatCurrencyValue(valorInformado)
      },
      creditos_evento: formatCurrencyValue(creditos),
      debitos_evento: formatCurrencyValue(debitos),
      eventos: agrupado.eventos || []
    }
  };
}

async function recalcularResumoApuracao(apuracaoId, transaction) {
  const itens = await RhApuracaoEvento.findAll({
    where: { apuracao_id: apuracaoId },
    attributes: [
      'id',
      'status',
      'valor_bruto',
      'valor_descontos',
      'valor_liquido'
    ],
    transaction
  });

  const resumo = itens.reduce(
    (acc, item) => {
      acc.total_colaboradores += 1;
      acc.total_bruto += Number(item.valor_bruto || 0);
      acc.total_descontos += Number(item.valor_descontos || 0);
      acc.total_liquido += Number(item.valor_liquido || 0);
      if (item.status === 'CONFERIDO') {
        acc.itens_conferidos += 1;
      } else {
        acc.itens_pendentes += 1;
      }
      return acc;
    },
    {
      total_colaboradores: 0,
      total_bruto: 0,
      total_descontos: 0,
      total_liquido: 0,
      itens_conferidos: 0,
      itens_pendentes: 0
    }
  );

  await RhApuracao.update(
    {
      total_colaboradores: resumo.total_colaboradores,
      total_bruto: formatCurrencyValue(resumo.total_bruto),
      total_descontos: formatCurrencyValue(resumo.total_descontos),
      total_liquido: formatCurrencyValue(resumo.total_liquido),
      resumo_json: {
        total_colaboradores: resumo.total_colaboradores,
        total_bruto: formatCurrencyValue(resumo.total_bruto),
        total_descontos: formatCurrencyValue(resumo.total_descontos),
        total_liquido: formatCurrencyValue(resumo.total_liquido),
        itens_conferidos: resumo.itens_conferidos,
        itens_pendentes: resumo.itens_pendentes
      }
    },
    {
      where: { id: apuracaoId },
      transaction
    }
  );
}

async function listarApuracoesRh(filters = {}) {
  return RhApuracao.findAll({
    where: buildApuracaoWhere(filters),
    include: APURACAO_INCLUDE,
    order: [['createdAt', 'DESC']]
  });
}

async function detalharApuracaoRh(id) {
  return detalharApuracaoPorPk(id);
}

async function gerarApuracaoRecorteRh(data, user, transaction) {
  if (data.empresa_grupo_id) {
    await ensureEmpresaGrupoExists(data.empresa_grupo_id, transaction);
  }
  await ensureObraExists(data.obra_id, transaction);

  const agrupados = await buildAgrupamentoImportacoes(data, transaction);
  const draft = await resolveExistingDraft(data, transaction);
  const diasBase = Number(data.dias_base || 30);

  let apuracao;
  if (draft) {
    await RhApuracaoEvento.destroy({
      where: { apuracao_id: draft.id },
      transaction
    });

    await draft.update(
      {
        dias_base: diasBase,
        observacoes: data.observacoes || draft.observacoes || null,
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    apuracao = draft;
  } else {
    apuracao = await RhApuracao.create(
      {
        competencia: data.competencia,
        empresa_grupo_id: data.empresa_grupo_id || null,
        obra_id: data.obra_id || null,
        tipo_vinculo: data.tipo_vinculo || null,
        status: 'RASCUNHO',
        dias_base: diasBase,
        observacoes: data.observacoes || null,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null
      },
      { transaction }
    );
  }

  const itens = agrupados.map((agrupado) => ({
    apuracao_id: apuracao.id,
    ...calcularItemApuracao(agrupado, diasBase)
  }));

  if (!itens.length) {
    throw new ValidationError('Nao existem colaboradores elegiveis para gerar a apuracao neste recorte.');
  }

  await RhApuracaoEvento.bulkCreate(itens, { transaction });

  /**
   * OS EVENTOS RECORRENTES ENTRAM AQUI (Fase 4 do modulo DP, 26/08).
   *
   * Vale alimentacao, desconto de adiantamento em N parcelas, pensao, plano de saude. Sem esta
   * chamada, `ajuste_credito_manual` e `ajuste_debito_manual` continuariam sendo dois numeros
   * digitados a mao todo mes — o "controle paralelo" que o cliente pediu para eliminar.
   *
   * Roda DEPOIS do `bulkCreate` porque cada item precisa do proprio id para pendurar os lancamentos.
   *
   * E roda a cada geracao, inclusive quando a apuracao ja existia como rascunho: `aplicarRecorrentes`
   * apaga e reescreve os itens de origem RECORRENTE, entao regerar da o mesmo resultado em vez de
   * acumular. A parcela nao avanca, porque ela e DERIVADA da quantidade de competencias anteriores
   * — nao de um contador. Esse e o ponto que impede o adiantamento de 6 parcelas de acabar em 3
   * recalculos.
   */
  await aplicarRecorrentesNaApuracao(apuracao, transaction);

  await recalcularResumoApuracao(apuracao.id, transaction);

  const solicitacoesJornada = await RhSolicitacao.findAll({
    where: { tipo: 'JORNADA', situacao: 'ABERTA', obra_id: data.obra_id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const concluidas = solicitacoesJornada.filter((solicitacao) => (
    String((typeof solicitacao.dados_json === 'string'
      ? JSON.parse(solicitacao.dados_json)
      : solicitacao.dados_json)?.competencia || '') === String(data.competencia || '')
  ));
  for (const solicitacao of concluidas) {
    // eslint-disable-next-line no-await-in-loop
    await solicitacao.update({
      situacao: 'APROVADA',
      decidida_por: user?.id || null,
      decidida_em: new Date()
    }, { transaction });
    // eslint-disable-next-line no-await-in-loop
    await RhSolicitacaoHistorico.create({
      solicitacao_id: solicitacao.id,
      usuario_id: user?.id || null,
      setor: codigoDoSetor(user) || 'DP',
      acao: 'APURACAO_GERADA',
      descricao: `Apuracao #${apuracao.id} gerada para ${data.competencia}.`,
      situacao_anterior: 'ABERTA',
      situacao_nova: 'APROVADA'
    }, { transaction });
  }

  return detalharApuracaoPorPk(apuracao.id, transaction);
}

/**
 * Aplica os eventos recorrentes a todas as linhas de uma apuracao e leva o resultado para os
 * campos de ajuste, que sao o que o calculo do liquido ja le.
 *
 * O que ENTRA NO LIQUIDO vira `ajuste_credito_manual` / `ajuste_debito_manual`. O que e pago a
 * parte — vale alimentacao — NAO entra: ele e um pagamento proprio (recarga de cartao ou pagamento
 * direto), e soma-lo ao liquido faria o colaborador receber duas vezes. Ele fica registrado nos
 * itens, que e de onde o custo por obra vai busca-lo (Fase 7).
 */
async function aplicarRecorrentesNaApuracao(apuracao, transaction) {
  // eslint-disable-next-line global-require
  const { aplicarRecorrentes } = require('./rhEventoRecorrenteService');

  const linhas = await RhApuracaoEvento.findAll({
    where: { apuracao_id: apuracao.id },
    transaction
  });

  for (const linha of linhas) {
    // eslint-disable-next-line no-await-in-loop
    const resultado = await aplicarRecorrentes(linha, apuracao.competencia, transaction);
    if (!resultado.itens.length) continue;

    const bruto = Number(linha.valor_bruto || 0);
    const descontos = Number(linha.valor_descontos || 0);
    const credito = resultado.creditoNoLiquido;
    const debito = resultado.descontoNoLiquido;

    // eslint-disable-next-line no-await-in-loop
    await linha.update(
      {
        ajuste_credito_manual: formatCurrencyValue(credito),
        ajuste_debito_manual: formatCurrencyValue(debito),
        valor_liquido: formatCurrencyValue(bruto - descontos + credito - debito)
      },
      { transaction }
    );
  }
}

async function gerarApuracaoRh(data, user) {
  return sequelize.transaction(async (transaction) => {
    if (data.obra_id) {
      return gerarApuracaoRecorteRh(data, user, transaction);
    }

    const recortes = await listarRecortesImportacoesConfirmadas(data, transaction);
    const apuracoes = [];

    for (const recorte of recortes) {
      apuracoes.push(await gerarApuracaoRecorteRh(recorte, user, transaction));
    }

    return {
      apuracoes,
      total: apuracoes.length
    };
  });
}

async function atualizarItemApuracaoRh(apuracaoId, itemId, data, user) {
  return sequelize.transaction(async (transaction) => {
    const apuracao = await RhApuracao.findByPk(apuracaoId, { transaction });
    if (!apuracao) {
      throw new ValidationError('Apuracao RH/DP nao encontrada.', 404);
    }

    if (apuracao.status !== 'RASCUNHO') {
      throw new ValidationError('Apenas apuracoes em rascunho podem receber ajustes.');
    }

    const item = await RhApuracaoEvento.findOne({
      where: {
        id: itemId,
        apuracao_id: apuracao.id
      },
      transaction
    });

    if (!item) {
      throw new ValidationError('Item da apuracao RH/DP nao encontrado.', 404);
    }

    const detalhesJson = item.detalhes_json && typeof item.detalhes_json === 'object'
      ? { ...item.detalhes_json }
      : {};

    if (data.chave_pix_titulo !== undefined) {
      detalhesJson.pagamento = {
        ...(detalhesJson.pagamento || {}),
        chave_pix_titulo: data.chave_pix_titulo || null
      };
    }

    const payload = {
      ...(data.ajuste_credito_manual !== undefined
        ? { ajuste_credito_manual: formatCurrencyValue(data.ajuste_credito_manual) }
        : {}),
      ...(data.ajuste_debito_manual !== undefined
        ? { ajuste_debito_manual: formatCurrencyValue(data.ajuste_debito_manual) }
        : {}),
      ...(data.observacoes !== undefined ? { observacoes: data.observacoes || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.chave_pix_titulo !== undefined ? { detalhes_json: detalhesJson } : {}),
      ajustado_por: user?.id || null,
      ajustado_em: new Date()
    };

    const valorBruto = Number(item.valor_bruto || 0);
    const valorDescontos = Number(item.valor_descontos || 0);
    const ajusteCredito = Number(
      payload.ajuste_credito_manual !== undefined ? payload.ajuste_credito_manual : item.ajuste_credito_manual || 0
    );
    const ajusteDebito = Number(
      payload.ajuste_debito_manual !== undefined ? payload.ajuste_debito_manual : item.ajuste_debito_manual || 0
    );

    payload.valor_liquido = formatCurrencyValue(valorBruto - valorDescontos + ajusteCredito - ajusteDebito);

    await item.update(payload, { transaction });
    await apuracao.update({ atualizado_por: user?.id || null }, { transaction });
    await recalcularResumoApuracao(apuracao.id, transaction);

    return detalharApuracaoPorPk(apuracao.id, transaction);
  });
}

async function conferirApuracaoRh(id, user) {
  return sequelize.transaction(async (transaction) => {
    const apuracao = await RhApuracao.findByPk(id, { transaction });
    if (!apuracao) {
      throw new ValidationError('Apuracao RH/DP nao encontrada.', 404);
    }

    if (apuracao.status !== 'RASCUNHO') {
      throw new ValidationError('A apuracao RH/DP ja foi conferida.');
    }

    const itens = await RhApuracaoEvento.findAll({
      where: { apuracao_id: apuracao.id },
      attributes: ['id', 'status'],
      transaction
    });

    if (!itens.length) {
      throw new ValidationError('Nao existem itens para conferir nesta apuracao.');
    }

    if (itens.some((item) => item.status !== 'CONFERIDO')) {
      throw new ValidationError('Existem itens pendentes de conferencia. Revise todos os itens antes de concluir.');
    }

    await apuracao.update(
      {
        status: 'CONFERIDA',
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    await recalcularResumoApuracao(apuracao.id, transaction);

    return detalharApuracaoPorPk(apuracao.id, transaction);
  });
}

module.exports = {
  // Exposto para a suite 59 poder conferir a memoria de calculo sem montar uma apuracao inteira.
  // O nome diz que e para teste justamente para ninguem passar a chamar isto em producao.
  calcularItemApuracaoParaTeste: calcularItemApuracao,
  conferirApuracaoRh,
  detalharApuracaoRh,
  gerarApuracaoRh,
  listarApuracoesRh,
  atualizarItemApuracaoRh
};
