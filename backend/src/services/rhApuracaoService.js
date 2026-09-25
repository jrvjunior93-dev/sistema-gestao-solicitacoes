const {
  Obra,
  RhApuracao,
  RhApuracaoEvento,
  RhColaborador,
  RhColaboradorVinculo,
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
      'cargo',
      'salario_base',
      'valor_contratual',
      'forma_calculo_gerencial',
      'valor_diaria',
      'pagamento_automatico_40_60'
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

function whereApuracaoRecorte(data, status) {
  return {
    competencia: data.competencia,
    empresa_grupo_id: data.empresa_grupo_id || null,
    obra_id: data.obra_id || null,
    tipo_vinculo: data.tipo_vinculo || null,
    status
  };
}

async function resolveExistingDraft(data, transaction) {
  const draft = await RhApuracao.findOne({
    where: whereApuracaoRecorte(data, 'RASCUNHO'),
    transaction
  });

  const conferida = await RhApuracao.findOne({
    where: whereApuracaoRecorte(data, 'CONFERIDA'),
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

async function buildAgrupamentoImportacoes(data, transaction, { incluirConsolidados = false } = {}) {
  const importacaoWhere = {
    status: 'CONFIRMADA',
    competencia: data.competencia
  };
  addExactRecorteFilter(importacaoWhere, 'empresa_grupo_id', data.empresa_grupo_id);
  addExactRecorteFilter(importacaoWhere, 'obra_id', data.obra_id);

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
          'obra_id',
          'forma_calculo_gerencial',
          'valor_diaria',
          'data_nascimento',
          'pagamento_automatico_40_60'
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

  /*
   * O mensalista recebe o salario integral quando trabalhou em uma unica obra, mesmo que haja
   * faltas informadas. Quando passou por mais de uma obra, entretanto, cada recorte precisa levar
   * somente sua participacao para que o titulo unico seja rateado sem duplicar o salario. A base
   * desse rateio e a proporcao dos dias efetivamente informados entre as obras da competencia.
   */
  const colaboradorIds = [...new Set(linhas.map((linha) => Number(linha.colaborador_id)).filter(Boolean))];
  const jornadasDaCompetencia = colaboradorIds.length
    ? await RhImportacaoLinha.findAll({
        where: { status: 'CONFIRMADA', colaborador_id: { [Op.in]: colaboradorIds } },
        attributes: ['colaborador_id', 'payload_json'],
        include: [{
          model: RhImportacao,
          as: 'importacao',
          required: true,
          attributes: ['obra_id'],
          where: { status: 'CONFIRMADA', competencia: data.competencia, tipo: 'JORNADA' }
        }],
        transaction
      })
    : [];
  const distribuicaoMensal = new Map();
  jornadasDaCompetencia.forEach((linha) => {
    const colaboradorId = Number(linha.colaborador_id);
    const atual = distribuicaoMensal.get(colaboradorId) || { dias: 0, obras: new Set() };
    atual.dias += Number(linha.payload_json?.dias_trabalhados || 0);
    if (linha.importacao?.obra_id) atual.obras.add(Number(linha.importacao.obra_id));
    distribuicaoMensal.set(colaboradorId, atual);
  });

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
          multiobra: false,
          dias_trabalhados: 0,
          faltas: 0,
          finais_semana_feriados: 0,
          horas_extras: 0,
          adicionais: 0,
          adicional_noturno: 0,
          adicional_insalubridade: 0,
          adicional_periculosidade: 0,
          bonificacoes: 0,
          descontos_informados: 0,
          decimo_terceiro: 0,
          valor_empreitada: 0,
          regime_pagamento: 'NORMAL',
          servicos_executados: [],
          total_dias_competencia: Number(distribuicaoMensal.get(colaboradorId)?.dias || 0),
          total_obras_competencia: Number(distribuicaoMensal.get(colaboradorId)?.obras?.size || 0),
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
      itemAtual.jornada.multiobra = itemAtual.jornada.multiobra
        || Boolean(linha.payload_json?.mais_de_uma_obra);
      itemAtual.jornada.dias_trabalhados += Number(linha.payload_json?.dias_trabalhados || 0);
      itemAtual.jornada.faltas += Number(linha.payload_json?.faltas || 0);
      itemAtual.jornada.finais_semana_feriados += Number(linha.payload_json?.finais_semana_feriados || 0);
      itemAtual.jornada.horas_extras += 0;
      itemAtual.jornada.adicionais += Number(linha.payload_json?.adicionais || 0);
      itemAtual.jornada.adicional_noturno += Number(linha.payload_json?.adicional_noturno || 0);
      itemAtual.jornada.adicional_insalubridade += Number(linha.payload_json?.adicional_insalubridade || 0);
      itemAtual.jornada.adicional_periculosidade += Number(linha.payload_json?.adicional_periculosidade || 0);
      itemAtual.jornada.bonificacoes += Number(linha.payload_json?.bonificacoes || 0);
      itemAtual.jornada.descontos_informados += Number(linha.payload_json?.descontos_informados || 0);
      itemAtual.jornada.decimo_terceiro += Number(linha.payload_json?.decimo_terceiro || 0);
      itemAtual.jornada.valor_empreitada += Number(linha.payload_json?.valor_empreitada || 0);
      if (String(linha.payload_json?.regime_pagamento || '').toUpperCase() === 'EMPREITADA') {
        itemAtual.jornada.regime_pagamento = 'EMPREITADA';
        if (linha.payload_json?.servico_executado) {
          itemAtual.jornada.servicos_executados.push(String(linha.payload_json.servico_executado));
        }
      }
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

  const resultadoCompleto = Array.from(agrupados.values());
  const idsMultiobraPorVinculo = new Set();
  if (!incluirConsolidados && resultadoCompleto.length) {
    const periodo = periodoDaCompetencia(data.competencia);
    const vinculosDoPeriodo = await RhColaboradorVinculo.findAll({
      where: {
        colaborador_id: {
          [Op.in]: resultadoCompleto.map((item) => Number(item.colaborador?.id)).filter(Boolean)
        },
        obra_id: { [Op.ne]: null },
        vigencia_inicio: { [Op.lte]: periodo.fim },
        [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: periodo.inicio } }]
      },
      attributes: ['colaborador_id', 'obra_id'],
      transaction
    });
    const obrasPorColaborador = new Map();
    vinculosDoPeriodo.forEach((vinculo) => {
      const colaboradorId = Number(vinculo.colaborador_id);
      if (!obrasPorColaborador.has(colaboradorId)) obrasPorColaborador.set(colaboradorId, new Set());
      obrasPorColaborador.get(colaboradorId).add(Number(vinculo.obra_id));
    });
    obrasPorColaborador.forEach((obras, colaboradorId) => {
      if (obras.size > 1) idsMultiobraPorVinculo.add(colaboradorId);
    });
  }
  // Colaboradores multiobra pertencem ao fluxo de consolidacao do DP. A geracao comum nao pode
  // criar uma apuracao por obra antes de todas as partes chegarem. O historico de vinculos tambem
  // protege jornadas antigas, gravadas antes de a marcacao passar a ser automatica.
  const resultado = incluirConsolidados
    ? resultadoCompleto
    : resultadoCompleto.filter((item) => (
        !item.jornada?.multiobra
        && !idsMultiobraPorVinculo.has(Number(item.colaborador?.id))
      ));
  if (incluirConsolidados || !resultado.length) return resultado;

  // Uma jornada ja consolidada pelo DP nao pode reaparecer nas apuracoes isoladas das obras.
  // Sem esta barreira, clicar novamente em "Gerar apuracoes" duplicaria o colaborador depois da
  // consolidacao multiobra, ainda que o titulo financeiro fosse protegido por numero-documento.
  const eventosConsolidados = await RhApuracaoEvento.findAll({
    where: {
      colaborador_id: { [Op.in]: resultado.map((item) => Number(item.colaborador?.id)).filter(Boolean) }
    },
    attributes: ['colaborador_id', 'detalhes_json'],
    include: [{
      model: RhApuracao,
      as: 'apuracao',
      required: true,
      attributes: ['id'],
      where: {
        competencia: data.competencia,
        obra_id: null,
        status: { [Op.in]: ['RASCUNHO', 'CONFERIDA'] }
      }
    }],
    transaction
  });
  const idsConsolidados = new Set(
    eventosConsolidados
      .filter((item) => Boolean(item.detalhes_json?.multiobra))
      .map((item) => Number(item.colaborador_id))
  );
  return resultado.filter((item) => !idsConsolidados.has(Number(item.colaborador?.id)));
}

function filtrosRecortesImportacoesConfirmadas(data) {
  const importacaoWhere = {
    status: 'CONFIRMADA',
    competencia: data.competencia,
    obra_id: { [Op.ne]: null }
  };

  addExactRecorteFilter(importacaoWhere, 'empresa_grupo_id', data.empresa_grupo_id);
  const colaboradorWhere = {};
  if (data.tipo_vinculo) colaboradorWhere.tipo_vinculo = data.tipo_vinculo;

  return { importacaoWhere, colaboradorWhere };
}

async function listarRecortesImportacoesConfirmadas(data, transaction) {
  const { importacaoWhere, colaboradorWhere } = filtrosRecortesImportacoesConfirmadas(data);

  // O formulario de jornada pode conter CLT e nao CLT na mesma importacao e, por isso, grava o
  // tipo no colaborador/linha, nao no cabecalho. Descobrir os recortes pelas linhas evita que o
  // filtro CLT descarte uma jornada confirmada cujo `tipo_vinculo` do cabecalho e nulo.
  const linhas = await RhImportacaoLinha.findAll({
    where: { status: 'CONFIRMADA' },
    attributes: ['id'],
    include: [
      {
        model: RhImportacao,
        as: 'importacao',
        required: true,
        attributes: ['empresa_grupo_id', 'obra_id'],
        where: importacaoWhere
      },
      {
        model: RhColaborador,
        as: 'colaborador',
        required: true,
        attributes: ['id', 'tipo_vinculo'],
        where: colaboradorWhere
      }
    ],
    order: [['id', 'ASC']],
    transaction
  });

  const recortes = new Map();
  linhas.forEach((linha) => {
    const importacao = linha.importacao;
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
  const formaCalculo = String(colaborador?.forma_calculo_gerencial || 'MENSAL').trim().toUpperCase();
  const valorBaseCalculo =
    formaCalculo === 'DIARIA'
      ? Number(colaborador?.valor_diaria || 0)
      : tipoVinculo === 'CLT'
      ? Number(colaborador?.salario_base || 0)
      : Number(colaborador?.valor_contratual || colaborador?.salario_base || 0);

  const jornada = agrupado.jornada || {};
  const diasTrabalhados = Number(jornada.dias_trabalhados || 0);
  const faltas = Number(jornada.faltas || 0);
  const finaisSemanaFeriados = Number(jornada.finais_semana_feriados || 0);
  const horasExtras = 0;
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
  const decimoTerceiro = Number(jornada.decimo_terceiro || 0);
  const valorEmpreitada = Number(jornada.valor_empreitada || 0);
  const regimePagamento = String(jornada.regime_pagamento || 'NORMAL').toUpperCase();
  const valorInformado = Number(jornada.valor_informado || 0);
  const creditos = Number(agrupado.creditos || 0);
  const debitos = Number(agrupado.debitos || 0);

  let regraAplicada = 'NAO_IDENTIFICADA';
  let valorBruto = 0;

  // A MEMORIA DE CALCULO, preenchida abaixo e devolvida em `detalhes_json.resumo`. E o que a
  // "planilha-resumo para conferencia" do escopo mostra linha a linha — sem ela, o conferente ve um
  // bruto e um liquido e nao tem como contestar nenhum dos dois.
  const resumo = {};

  if (regimePagamento === 'EMPREITADA') {
    regraAplicada = 'EMPREITADA';
    valorBruto = valorEmpreitada + decimoTerceiro + totalAdicionais + creditos;
    resumo.valor_empreitada = formatCurrencyValue(valorEmpreitada);
    resumo.servicos_executados = jornada.servicos_executados || [];
    resumo.valor_proporcional = formatCurrencyValue(valorEmpreitada);
    resumo.valor_horas_extras = 0;
  } else if (formaCalculo === 'DIARIA') {
    regraAplicada = 'DIARIA_DIAS_REMUNERADOS';
    const baseDiaria = valorBaseCalculo * diasTrabalhados;
    valorBruto = baseDiaria + decimoTerceiro + totalAdicionais + creditos;
    resumo.valor_diaria = formatCurrencyValue(valorBaseCalculo);
    resumo.dias_remunerados = formatCurrencyValue(diasTrabalhados);
    resumo.valor_proporcional = formatCurrencyValue(baseDiaria);
    resumo.valor_horas_extras = 0;
  } else if (formaCalculo === 'MENSAL') {
    regraAplicada = tipoVinculo === 'CLT' ? 'CLT_SIMPLIFICADA' : 'MENSAL_SIMPLIFICADA';
    const totalDiasCompetencia = Number(jornada.total_dias_competencia || 0);
    const totalObrasCompetencia = Number(jornada.total_obras_competencia || 0);
    const salarioProporcional = totalObrasCompetencia > 1 && totalDiasCompetencia > 0
      ? valorBaseCalculo * (diasTrabalhados / totalDiasCompetencia)
      : valorBaseCalculo;
    const valorHora = calculateValorHoraReferencia(valorBaseCalculo);
    const valorHorasExtras = horasExtras * valorHora * 1.5;
    valorBruto = salarioProporcional + decimoTerceiro + valorHorasExtras + totalAdicionais + creditos;
    resumo.valor_proporcional = formatCurrencyValue(salarioProporcional);
    resumo.rateio_multiobra = totalObrasCompetencia > 1;
    resumo.total_dias_competencia = formatCurrencyValue(totalDiasCompetencia);
    resumo.total_obras_competencia = totalObrasCompetencia;
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
    valorBruto = baseNaoClt + decimoTerceiro + totalAdicionais + creditos;
    resumo.valor_proporcional = formatCurrencyValue(baseNaoClt);
    resumo.valor_horas_extras = 0;
  }

  // Faltas sao apenas informativas. Para mensalistas, os dias so distribuem o salario entre obras;
  // nunca reduzem o total devido ao colaborador.
  resumo.desconto_faltas = 0;
  resumo.faltas_apenas_informativas = true;
  resumo.decimo_terceiro = formatCurrencyValue(decimoTerceiro);
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
      forma_calculo_gerencial: formaCalculo,
      salario_contratual_bruto: formatCurrencyValue(colaborador?.salario_base || 0),
      pagamento_automatico_40_60: Boolean(colaborador?.pagamento_automatico_40_60),
      dias_base: Number(diasBase || 0),
      resumo,
      jornada: {
        dias_trabalhados: formatCurrencyValue(diasTrabalhados),
        faltas: formatCurrencyValue(faltas),
        finais_semana_feriados: formatCurrencyValue(finaisSemanaFeriados),
        horas_extras: formatCurrencyValue(horasExtras),
        adicionais: formatCurrencyValue(adicionais),
        descontos_informados: formatCurrencyValue(descontosInformados),
        decimo_terceiro: formatCurrencyValue(decimoTerceiro),
        regime_pagamento: regimePagamento,
        valor_empreitada: formatCurrencyValue(valorEmpreitada),
        servicos_executados: jornada.servicos_executados || [],
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

async function solicitacaoJornadaTotalmenteProcessada(solicitacao, competencia, transaction) {
  const detalhes = typeof solicitacao.dados_json === 'string'
    ? JSON.parse(solicitacao.dados_json)
    : (solicitacao.dados_json || {});
  const importacaoId = Number(detalhes.importacao_id || 0);
  if (!importacaoId) return false;

  const linhas = await RhImportacaoLinha.findAll({
    where: { importacao_id: importacaoId, status: 'CONFIRMADA' },
    attributes: ['colaborador_id', 'payload_json'],
    transaction
  });
  if (!linhas.length) return false;

  const colaboradorIds = [...new Set(linhas.map((linha) => Number(linha.colaborador_id)).filter(Boolean))];
  const eventos = await RhApuracaoEvento.findAll({
    where: { colaborador_id: { [Op.in]: colaboradorIds } },
    attributes: ['colaborador_id', 'detalhes_json'],
    include: [{
      model: RhApuracao,
      as: 'apuracao',
      required: true,
      attributes: ['id', 'obra_id'],
      where: { competencia, status: { [Op.in]: ['RASCUNHO', 'CONFERIDA'] } }
    }],
    transaction
  });

  return linhas.every((linha) => {
    const colaboradorId = Number(linha.colaborador_id);
    const multiobra = Boolean(linha.payload_json?.mais_de_uma_obra);
    return eventos.some((evento) => (
      Number(evento.colaborador_id) === colaboradorId
      && (multiobra
        ? (evento.apuracao?.obra_id === null || evento.apuracao?.obra_id === undefined)
          && Boolean(evento.detalhes_json?.multiobra)
        : Number(evento.apuracao?.obra_id) === Number(solicitacao.obra_id))
    ));
  });
}

async function gerarApuracaoRecorteRh(data, user, transaction) {
  if (data.empresa_grupo_id) {
    await ensureEmpresaGrupoExists(data.empresa_grupo_id, transaction);
  }
  await ensureObraExists(data.obra_id, transaction);

  const agrupados = await buildAgrupamentoImportacoes(data, transaction);
  if (!agrupados.length) {
    if (data.ignorar_sem_colaboradores) return null;
    throw new ValidationError(
      'Nao existem colaboradores elegiveis neste recorte. Jornadas multiobra devem ser consolidadas pelo painel do DP.'
    );
  }
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
    // Uma solicitacao da obra pode misturar colaboradores exclusivos e multiobra. Ela permanece
    // aberta ate que os exclusivos estejam na apuracao da obra e cada multiobra tenha sido
    // consolidado pelo DP; assim o alerta nao desaparece prematuramente.
    // eslint-disable-next-line no-await-in-loop
    const totalmenteProcessada = await solicitacaoJornadaTotalmenteProcessada(
      solicitacao,
      data.competencia,
      transaction
    );
    if (!totalmenteProcessada) continue;
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

function periodoDaCompetencia(competencia) {
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  if (!ano || !mes) throw new ValidationError('Informe uma competencia valida para consultar as jornadas multiobra.');
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(ultimoDia).padStart(2, '0')}`
  };
}

async function carregarJornadasMultiobra(competencia, transaction = undefined) {
  const periodo = periodoDaCompetencia(competencia);
  const vinculos = await RhColaboradorVinculo.findAll({
    where: {
      obra_id: { [Op.ne]: null },
      vigencia_inicio: { [Op.lte]: periodo.fim },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: periodo.inicio } }]
    },
    attributes: ['colaborador_id', 'obra_id'],
    include: [
      {
        model: RhColaborador,
        as: 'colaborador',
        required: true,
        attributes: ['id', 'nome', 'matricula', 'cargo', 'tipo_vinculo', 'empresa_grupo_id'],
        include: [{
          model: RhEmpresaGrupo,
          as: 'empresaGrupo',
          attributes: ['id', 'codigo', 'nome']
        }]
      },
      { model: Obra, as: 'obra', required: true, attributes: ['id', 'codigo', 'nome'] }
    ],
    order: [['colaborador_id', 'ASC'], ['obra_id', 'ASC']],
    transaction
  });

  const porColaborador = new Map();
  vinculos.forEach((vinculo) => {
    const colaboradorId = Number(vinculo.colaborador_id);
    if (!porColaborador.has(colaboradorId)) {
      porColaborador.set(colaboradorId, {
        colaborador: vinculo.colaborador,
        obras: new Map()
      });
    }
    porColaborador.get(colaboradorId).obras.set(Number(vinculo.obra_id), {
      id: Number(vinculo.obra_id),
      codigo: vinculo.obra?.codigo || null,
      nome: vinculo.obra?.nome || `Obra #${vinculo.obra_id}`
    });
  });

  const grupos = Array.from(porColaborador.values()).filter((grupo) => grupo.obras.size > 1);
  const colaboradorIds = grupos.map((grupo) => Number(grupo.colaborador.id));
  if (!colaboradorIds.length) return [];

  const linhas = await RhImportacaoLinha.findAll({
    where: {
      status: 'CONFIRMADA',
      colaborador_id: { [Op.in]: colaboradorIds }
    },
    attributes: ['id', 'colaborador_id', 'payload_json', 'updatedAt'],
    include: [{
      model: RhImportacao,
      as: 'importacao',
      required: true,
      attributes: ['id', 'obra_id', 'empresa_grupo_id', 'periodicidade', 'periodo_inicio', 'periodo_fim', 'confirmado_em'],
      where: { tipo: 'JORNADA', status: 'CONFIRMADA', competencia }
    }],
    order: [['id', 'DESC']],
    transaction
  });
  const jornadaPorColaboradorObra = new Map();
  linhas.forEach((linha) => {
    const chave = `${linha.colaborador_id}:${linha.importacao?.obra_id}`;
    if (!jornadaPorColaboradorObra.has(chave)) jornadaPorColaboradorObra.set(chave, []);
    jornadaPorColaboradorObra.get(chave).push(linha);
  });

  const consolidados = await RhApuracaoEvento.findAll({
    where: { colaborador_id: { [Op.in]: colaboradorIds } },
    attributes: ['colaborador_id', 'detalhes_json'],
    include: [{
      model: RhApuracao,
      as: 'apuracao',
      required: true,
      attributes: ['id', 'status', 'updatedAt'],
      where: { competencia, obra_id: null, status: { [Op.in]: ['RASCUNHO', 'CONFERIDA'] } }
    }],
    transaction
  });
  const consolidadoPorColaborador = new Map(
    consolidados
      .filter((item) => Boolean(item.detalhes_json?.multiobra))
      .map((item) => [Number(item.colaborador_id), item.apuracao])
  );

  return grupos.map((grupo) => {
    const colaboradorId = Number(grupo.colaborador.id);
    const obras = Array.from(grupo.obras.values()).map((obra) => {
      const linhasObra = jornadaPorColaboradorObra.get(`${colaboradorId}:${obra.id}`) || [];
      const linhaMaisRecente = linhasObra[0] || null;
      const somarPayload = (campo) => formatCurrencyValue(linhasObra.reduce(
        (total, linha) => total + Number(linha.payload_json?.[campo] || 0),
        0
      ));
      const enviadaEm = linhasObra.reduce((maisRecente, linha) => {
        const valor = linha.importacao?.confirmado_em || linha.updatedAt || null;
        const momento = valor ? new Date(valor).getTime() : 0;
        return Number.isFinite(momento) && momento > (maisRecente?.momento || 0)
          ? { momento, valor }
          : maisRecente;
      }, null)?.valor || null;
      return {
        ...obra,
        jornada_enviada: linhasObra.length > 0,
        importacao_id: linhaMaisRecente?.importacao?.id || null,
        importacao_ids: [...new Set(linhasObra.map((linha) => Number(linha.importacao?.id)).filter(Boolean))],
        empresa_grupo_id: linhaMaisRecente?.importacao?.empresa_grupo_id || null,
        enviada_em: enviadaEm,
        dias_trabalhados: somarPayload('dias_trabalhados'),
        faltas: somarPayload('faltas'),
        acrescimos: formatCurrencyValue(
          linhasObra.reduce((total, linha) => (
            total
            + Number(linha.payload_json?.adicionais || 0)
            + Number(linha.payload_json?.adicional_noturno || 0)
            + Number(linha.payload_json?.adicional_insalubridade || 0)
            + Number(linha.payload_json?.adicional_periculosidade || 0)
            + Number(linha.payload_json?.bonificacoes || 0)
            + Number(linha.payload_json?.decimo_terceiro || 0)
          ), 0)
        ),
        descontos: somarPayload('descontos_informados'),
        valor_informado: somarPayload('valor_informado'),
        observacoes: [...new Set(linhasObra.map((linha) => linha.payload_json?.observacoes).filter(Boolean))].join(' | ') || null
      };
    });
    const apuracao = consolidadoPorColaborador.get(colaboradorId) || null;
    const enviadas = obras.filter((obra) => obra.jornada_enviada).length;
    const ultimaJornadaEm = obras.reduce((maisRecente, obra) => {
      const momento = obra.enviada_em ? new Date(obra.enviada_em).getTime() : 0;
      return Number.isFinite(momento) && momento > maisRecente ? momento : maisRecente;
    }, 0);
    const apuracaoAtualizadaEm = apuracao?.updatedAt ? new Date(apuracao.updatedAt).getTime() : 0;
    const precisaAtualizar = Boolean(
      apuracao
      && apuracao.status === 'RASCUNHO'
      && ultimaJornadaEm > apuracaoAtualizadaEm
    );
    return {
      colaborador_id: colaboradorId,
      nome: grupo.colaborador.nome,
      matricula: grupo.colaborador.matricula || null,
      cargo: grupo.colaborador.cargo || null,
      tipo_vinculo: grupo.colaborador.tipo_vinculo || null,
      empresa_grupo_id: grupo.colaborador.empresa_grupo_id || null,
      empresa: grupo.colaborador.empresaGrupo || null,
      total_obras: obras.length,
      jornadas_enviadas: enviadas,
      jornadas_pendentes: obras.length - enviadas,
      status: precisaAtualizar
        ? 'ATUALIZACAO'
        : (apuracao ? 'CONSOLIDADA' : (enviadas === obras.length ? 'PRONTA' : 'PENDENTE')),
      apuracao_id: apuracao?.id || null,
      apuracao_status: apuracao?.status || null,
      apuracao_atualizada_em: apuracao?.updatedAt || null,
      obras
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function listarJornadasMultiobraRh(filters = {}) {
  const competencia = String(filters.competencia || '').trim();
  const colaboradores = await carregarJornadasMultiobra(competencia);
  return {
    competencia,
    resumo: {
      colaboradores: colaboradores.length,
      prontos: colaboradores.filter((item) => ['PRONTA', 'ATUALIZACAO'].includes(item.status)).length,
      pendentes: colaboradores.filter((item) => item.status === 'PENDENTE').length,
      consolidados: colaboradores.filter((item) => item.status === 'CONSOLIDADA').length
    },
    colaboradores
  };
}

function somarCampo(itens, campo) {
  return formatCurrencyValue(itens.reduce((total, item) => total + Number(item?.[campo] || 0), 0));
}

function combinarItensMultiobra(partes, colaborador) {
  const itens = partes.map((parte) => parte.item);
  const primeiro = itens[0];
  const importacaoIds = [...new Set(itens.flatMap((item) => item.detalhes_json?.importacao_ids || []))]
    .map(Number)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const observacoes = [...new Set(itens.map((item) => item.observacoes).filter(Boolean))];
  const valorProporcional = formatCurrencyValue(itens.reduce(
    (total, item) => total + Number(item.detalhes_json?.resumo?.valor_proporcional || 0),
    0
  ));

  return {
    colaborador_id: Number(colaborador.id),
    status: 'PENDENTE',
    regra_aplicada: 'MULTIOBRA_CONSOLIDADA',
    valor_base_calculo: primeiro.valor_base_calculo,
    dias_trabalhados: somarCampo(itens, 'dias_trabalhados'),
    faltas: somarCampo(itens, 'faltas'),
    horas_extras: 0,
    valor_bruto: somarCampo(itens, 'valor_bruto'),
    valor_descontos: somarCampo(itens, 'valor_descontos'),
    ajuste_credito_manual: 0,
    ajuste_debito_manual: 0,
    adicional_noturno: somarCampo(itens, 'adicional_noturno'),
    adicional_insalubridade: somarCampo(itens, 'adicional_insalubridade'),
    adicional_periculosidade: somarCampo(itens, 'adicional_periculosidade'),
    bonificacoes: somarCampo(itens, 'bonificacoes'),
    valor_liquido: somarCampo(itens, 'valor_liquido'),
    observacoes: observacoes.join(' | ') || null,
    detalhes_json: {
      ...primeiro.detalhes_json,
      multiobra: true,
      importacao_ids: importacaoIds,
      resumo: {
        ...(primeiro.detalhes_json?.resumo || {}),
        valor_proporcional: valorProporcional,
        rateio_multiobra: true,
        total_dias_competencia: somarCampo(itens, 'dias_trabalhados'),
        total_obras_competencia: partes.length
      },
      jornada: {
        ...(primeiro.detalhes_json?.jornada || {}),
        dias_trabalhados: somarCampo(itens, 'dias_trabalhados'),
        faltas: somarCampo(itens, 'faltas'),
        descontos_informados: somarCampo(
          itens.map((item) => ({ valor: item.detalhes_json?.jornada?.descontos_informados })),
          'valor'
        ),
        decimo_terceiro: somarCampo(
          itens.map((item) => ({ valor: item.detalhes_json?.jornada?.decimo_terceiro })),
          'valor'
        )
      },
      distribuicao_obras: partes.map(({ obra, item }) => ({
        obra_id: Number(obra.id),
        codigo: obra.codigo || null,
        nome: obra.nome,
        importacao_ids: item.detalhes_json?.importacao_ids || [],
        dias_trabalhados: formatCurrencyValue(item.dias_trabalhados),
        faltas: formatCurrencyValue(item.faltas),
        valor_bruto: formatCurrencyValue(item.valor_bruto),
        valor_descontos: formatCurrencyValue(item.valor_descontos),
        valor_liquido: formatCurrencyValue(item.valor_liquido),
        observacoes: item.observacoes || null
      }))
    }
  };
}

async function removerItemDeApuracoesIsoladas(colaboradorId, competencia, obraIds, transaction) {
  const apuracaoProtegida = await RhApuracaoEvento.findOne({
    where: { colaborador_id: colaboradorId },
    include: [{
      model: RhApuracao,
      as: 'apuracao',
      required: true,
      attributes: ['id', 'status', 'obra_id'],
      where: {
        competencia,
        obra_id: { [Op.in]: obraIds },
        status: { [Op.ne]: 'RASCUNHO' }
      }
    }],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (apuracaoProtegida) {
    throw new ValidationError(
      'Uma das jornadas ja pertence a uma apuracao conferida ou fechada. Reabra essa apuracao antes de consolidar.',
      409
    );
  }

  const eventos = await RhApuracaoEvento.findAll({
    where: { colaborador_id: colaboradorId },
    include: [{
      model: RhApuracao,
      as: 'apuracao',
      required: true,
      attributes: ['id', 'status', 'obra_id'],
      where: { competencia, obra_id: { [Op.in]: obraIds }, status: 'RASCUNHO' }
    }],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  for (const evento of eventos) {
    const apuracaoId = Number(evento.apuracao_id);
    // eslint-disable-next-line no-await-in-loop
    await evento.destroy({ transaction });
    // eslint-disable-next-line no-await-in-loop
    const restantes = await RhApuracaoEvento.count({ where: { apuracao_id: apuracaoId }, transaction });
    if (restantes) {
      // eslint-disable-next-line no-await-in-loop
      await recalcularResumoApuracao(apuracaoId, transaction);
    } else {
      // Rascunho vazio nao representa uma apuracao operacional e apenas confundiria a lista do DP.
      // eslint-disable-next-line no-await-in-loop
      await RhApuracao.destroy({ where: { id: apuracaoId }, transaction });
    }
  }
}

async function gerarApuracaoMultiobraRh(data, user) {
  return sequelize.transaction(async (transaction) => {
    const competencia = String(data.competencia || '').trim();
    const colaboradorId = Number(data.colaborador_id);
    const diasBase = Number(data.dias_base || 30);
    await RhColaborador.findByPk(colaboradorId, { transaction, lock: transaction.LOCK.UPDATE });

    const grupos = await carregarJornadasMultiobra(competencia, transaction);
    const grupo = grupos.find((item) => Number(item.colaborador_id) === colaboradorId);
    if (!grupo) throw new ValidationError('O colaborador nao possui vinculo com mais de uma obra nesta competencia.', 409);
    if (grupo.jornadas_pendentes) {
      const pendentes = grupo.obras.filter((obra) => !obra.jornada_enviada).map((obra) => obra.nome).join(', ');
      throw new ValidationError(`A consolidacao aguarda a jornada de: ${pendentes}.`, 409);
    }

    const apuracaoExistente = grupo.apuracao_id
      ? await RhApuracao.findByPk(grupo.apuracao_id, { transaction, lock: transaction.LOCK.UPDATE })
      : null;
    if (apuracaoExistente && apuracaoExistente.status !== 'RASCUNHO') {
      throw new ValidationError('A apuracao multiobra ja foi conferida e nao pode ser reconstruida.', 409);
    }

    const colaborador = await RhColaborador.findByPk(colaboradorId, { transaction });
    if (!colaborador?.empresa_grupo_id) {
      throw new ValidationError('O colaborador precisa ter uma empresa definida antes da consolidacao multiobra.', 409);
    }
    const partes = [];
    for (const obra of grupo.obras) {
      // eslint-disable-next-line no-await-in-loop
      const agrupados = await buildAgrupamentoImportacoes({
        competencia,
        empresa_grupo_id: obra.empresa_grupo_id || undefined,
        obra_id: obra.id,
        tipo_vinculo: colaborador.tipo_vinculo || undefined
      }, transaction, { incluirConsolidados: true });
      const agrupado = agrupados.find((item) => Number(item.colaborador?.id) === colaboradorId);
      if (!agrupado) throw new ValidationError(`Nao foi possivel montar a jornada de ${obra.nome}.`, 409);
      partes.push({ obra, item: calcularItemApuracao(agrupado, diasBase) });
    }

    await removerItemDeApuracoesIsoladas(
      colaboradorId,
      competencia,
      grupo.obras.map((obra) => Number(obra.id)),
      transaction
    );

    let apuracao = apuracaoExistente;
    if (apuracao) {
      await RhApuracaoEvento.destroy({ where: { apuracao_id: apuracao.id }, transaction });
      await apuracao.update({
        dias_base: diasBase,
        observacoes: data.observacoes || apuracao.observacoes || null,
        atualizado_por: user?.id || null
      }, { transaction });
    } else {
      apuracao = await RhApuracao.create({
        competencia,
        empresa_grupo_id: colaborador.empresa_grupo_id || null,
        obra_id: null,
        tipo_vinculo: colaborador.tipo_vinculo || null,
        status: 'RASCUNHO',
        dias_base: diasBase,
        observacoes: data.observacoes || null,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null
      }, { transaction });
    }

    await RhApuracaoEvento.create({
      apuracao_id: apuracao.id,
      ...combinarItensMultiobra(partes, colaborador)
    }, { transaction });
    await aplicarRecorrentesNaApuracao(apuracao, transaction);
    await recalcularResumoApuracao(apuracao.id, transaction);

    const solicitacoes = await RhSolicitacao.findAll({
      where: { tipo: 'JORNADA', situacao: 'ABERTA', obra_id: { [Op.in]: grupo.obras.map((obra) => obra.id) } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    for (const solicitacao of solicitacoes) {
      const detalhes = typeof solicitacao.dados_json === 'string'
        ? JSON.parse(solicitacao.dados_json)
        : (solicitacao.dados_json || {});
      if (String(detalhes.competencia || '') !== competencia) continue;
      // eslint-disable-next-line no-await-in-loop
      const totalmenteProcessada = await solicitacaoJornadaTotalmenteProcessada(
        solicitacao,
        competencia,
        transaction
      );
      if (!totalmenteProcessada) continue;
      // eslint-disable-next-line no-await-in-loop
      await solicitacao.update({ situacao: 'APROVADA', decidida_por: user?.id || null, decidida_em: new Date() }, { transaction });
      // eslint-disable-next-line no-await-in-loop
      await RhSolicitacaoHistorico.create({
        solicitacao_id: solicitacao.id,
        usuario_id: user?.id || null,
        setor: codigoDoSetor(user) || 'DP',
        acao: 'JORNADAS_MULTIOBRA_CONSOLIDADAS',
        descricao: `Jornadas consolidadas na apuracao #${apuracao.id} para ${competencia}.`,
        situacao_anterior: 'ABERTA',
        situacao_nova: 'APROVADA'
      }, { transaction });
    }

    return detalharApuracaoPorPk(apuracao.id, transaction);
  });
}

async function gerarApuracaoRh(data, user) {
  return sequelize.transaction(async (transaction) => {
    if (data.obra_id) {
      return gerarApuracaoRecorteRh(data, user, transaction);
    }

    const recortes = await listarRecortesImportacoesConfirmadas(data, transaction);
    const apuracoes = [];
    const ignoradas = [];

    for (const recorte of recortes) {
      // Geracao em lote nao deve ser atomizada por uma obra ja concluida. O recorte conferido e
      // preservado e as demais obras continuam sendo geradas/recalculadas na mesma transacao.
      // A chamada direta com `obra_id` continua recusando a reabertura implicita.
      // eslint-disable-next-line no-await-in-loop
      const conferida = await RhApuracao.findOne({
        where: whereApuracaoRecorte(recorte, 'CONFERIDA'),
        attributes: ['id', 'obra_id', 'empresa_grupo_id', 'tipo_vinculo'],
        transaction
      });
      if (conferida) {
        ignoradas.push({
          id: Number(conferida.id),
          obra_id: Number(conferida.obra_id),
          empresa_grupo_id: conferida.empresa_grupo_id || null,
          tipo_vinculo: conferida.tipo_vinculo || null,
          motivo: 'APURACAO_JA_CONFERIDA'
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const gerada = await gerarApuracaoRecorteRh(
        { ...recorte, ignorar_sem_colaboradores: true },
        user,
        transaction
      );
      if (gerada) {
        apuracoes.push(gerada);
      } else {
        ignoradas.push({
          obra_id: Number(recorte.obra_id),
          empresa_grupo_id: recorte.empresa_grupo_id || null,
          tipo_vinculo: recorte.tipo_vinculo || null,
          motivo: 'AGUARDANDO_CONSOLIDACAO_MULTIOBRA'
        });
      }
    }

    return {
      apuracoes,
      total: apuracoes.length,
      ignoradas,
      total_ignoradas: ignoradas.length
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
  gerarApuracaoMultiobraRh,
  gerarApuracaoRh,
  listarJornadasMultiobraRh,
  listarApuracoesRh,
  atualizarItemApuracaoRh,
  __test: {
    combinarItensMultiobra,
    filtrosRecortesImportacoesConfirmadas,
    whereApuracaoRecorte
  }
};
