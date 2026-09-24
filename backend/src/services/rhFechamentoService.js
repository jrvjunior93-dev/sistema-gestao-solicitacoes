const {
  CategoriaFinanceira,
  IntegracaoSiengeFila,
  Notificacao,
  NotificacaoDestinatario,
  Obra,
  Parceiro,
  PaymentBeneficiary,
  MovimentoFinanceiro,
  PagamentoManualFilaComprovante,
  PagamentoManualFilaItem,
  RhApuracao,
  RhApuracaoEvento,
  RhApuracaoEventoItem,
  RhColaborador,
  RhColaboradorPagamento,
  RhEmpresaGrupo,
  RhEventoRecorrente,
  RhFechamento,
  RhFechamentoTitulo,
  Setor,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  User,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { ValidationError } = require('../middlewares/validation');
const { getPresignedUrl } = require('./s3');
const { canAccessFinanceiro, getUsuariosAcessoFinanceiro } = require('./authorizationService');
const { notificacaoEventoAtivo } = require('./notificacaoConfigService');
const {
  buildSetorComparisonTokens,
  hasSetorCapability,
  normalizeSetorCode
} = require('./setorCapabilityService');

const FECHAMENTO_INCLUDE = [
  {
    model: RhApuracao,
    as: 'apuracao',
    attributes: [
      'id',
      'competencia',
      'empresa_grupo_id',
      'obra_id',
      'tipo_vinculo',
      'status',
      'dias_base',
      'total_colaboradores',
      'total_bruto',
      'total_descontos',
      'total_liquido'
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
        attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id']
      }
    ]
  },
  {
    model: CategoriaFinanceira,
    as: 'categoriaFinanceira',
    attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'considera_dre']
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
  }
];

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizarComprovantesDoTitulo(titulo = {}) {
  const comprovantes = [];

  (titulo.filaPagamentosManuais || []).forEach((fila) => {
    const hashes = new Set();
    (fila.comprovantes || []).forEach((comprovante) => {
      if (comprovante.hash) hashes.add(comprovante.hash);
      comprovantes.push({
        id: comprovante.id,
        fila_id: fila.id,
        nome: comprovante.nome,
        banco: comprovante.banco || fila.comprovante_banco || null,
        tipo: comprovante.tipo || fila.comprovante_tipo || null,
        vinculado_em: comprovante.vinculado_em || fila.comprovante_vinculado_em || null,
        legado: false
      });
    });

    if (fila.comprovante_url && (!fila.comprovante_hash || !hashes.has(fila.comprovante_hash))) {
      comprovantes.push({
        id: null,
        fila_id: fila.id,
        nome: fila.comprovante_nome || 'Comprovante de pagamento',
        banco: fila.comprovante_banco || null,
        tipo: fila.comprovante_tipo || null,
        vinculado_em: fila.comprovante_vinculado_em || null,
        legado: true
      });
    }
  });

  return comprovantes.sort((a, b) => new Date(b.vinculado_em || 0) - new Date(a.vinculado_em || 0));
}

function appendAuditText(currentValue, line) {
  return [String(currentValue || '').trim(), line].filter(Boolean).join('\n');
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getLastDayOfCompetencia(competencia) {
  const [year, month] = String(competencia || '').split('-').map(Number);
  if (!year || !month) {
    return getToday();
  }
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getCompetenciaDate(competencia, day) {
  const [year, month] = String(competencia || '').split('-').map(Number);
  if (!year || !month) return getToday();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(Number(day) || 1, 1), lastDay)))
    .toISOString()
    .slice(0, 10);
}

function anticipateWeekend(dateOnly) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  const weekDay = date.getUTCDay();
  if (weekDay === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekDay === 0) date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function inferTipoPessoa(documento) {
  const digits = normalizeDigits(documento);
  if (digits.length === 11) return 'F';
  if (digits.length === 14) return 'J';
  return '';
}

function inferPixTipoChave(chavePix, documentoFallback) {
  const raw = String(chavePix || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return 'EMAIL';

  const digits = normalizeDigits(raw);
  const documento = normalizeDigits(documentoFallback);
  if (digits.length === 14) return 'CNPJ';
  if (digits.length === 11) {
    return documento && digits === documento ? 'CPF' : 'TELEFONE';
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return 'ALEATORIA';
  }
  return 'ALEATORIA';
}

function normalizePixChaveForType(tipoChave, chavePix) {
  const raw = String(chavePix || '').trim();
  if (['CPF', 'CNPJ', 'TELEFONE'].includes(String(tipoChave || '').toUpperCase())) {
    return normalizeDigits(raw);
  }
  if (String(tipoChave || '').toUpperCase() === 'EMAIL') {
    return raw.toLowerCase();
  }
  return raw;
}

function buildRhNumeroDocumento(competencia, colaboradorId, sufixo) {
  return `RHDP-${competencia}-COL-${colaboradorId}${sufixo ? `-${sufixo}` : ''}`.slice(0, 120);
}

function getPixKeyOptions(pagamento = {}) {
  return [
    pagamento.chave_pix,
    pagamento.chave_pix_secundaria,
    pagamento.chave_pix_variavel
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function resolvePixKeyForItem(item, pagamento = {}) {
  const selected = String(item?.detalhes_json?.pagamento?.chave_pix_titulo || '').trim();
  const options = getPixKeyOptions(pagamento);
  if (selected && options.includes(selected)) {
    return selected;
  }
  return options[0] || '';
}

async function ensureCategoriaFinanceiraPagar(categoriaFinanceiraId, transaction) {
  if (!categoriaFinanceiraId) {
    throw new ValidationError('Categoria financeira e obrigatoria para gerar titulos de fechamento RH/DP.');
  }

  const categoria = await CategoriaFinanceira.findByPk(categoriaFinanceiraId, { transaction });
  if (!categoria || categoria.ativo === false) {
    throw new ValidationError('Categoria financeira invalida para o fechamento RH/DP.');
  }

  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  if (tipo && tipo !== 'AMBOS' && tipo !== 'PAGAR') {
    throw new ValidationError('A categoria financeira do fechamento deve ser compativel com titulos a pagar.');
  }

  if (categoria.considera_dre === false) {
    throw new ValidationError('A categoria financeira do fechamento RH/DP precisa estar marcada para DRE.');
  }

  if (!String(categoria.dre_grupo || '').trim()) {
    throw new ValidationError('A categoria financeira do fechamento RH/DP precisa ter grupo DRE classificado.');
  }

  return categoria;
}

async function carregarApuracaoParaFechamento(apuracaoId, transaction) {
  const apuracao = await RhApuracao.findByPk(apuracaoId, {
    transaction,
    include: [
      {
        model: RhEmpresaGrupo,
        as: 'empresaGrupo',
        attributes: ['id', 'codigo', 'nome']
      },
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id']
      },
      {
        model: RhFechamento,
        as: 'fechamentoRh',
        required: false,
        where: { status: 'FECHADO' },
        attributes: ['id', 'status', 'data_fechamento', 'data_vencimento']
      },
      {
        model: RhApuracaoEvento,
        as: 'itens',
        separate: true,
        order: [['id', 'ASC']],
        include: [
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
              'forma_calculo_gerencial',
              'valor_diaria',
              'pagamento_automatico_40_60',
              'salario_base',
              'valor_contratual',
              'telefone',
              'email'
            ],
            include: [
              {
                model: RhColaboradorPagamento,
                as: 'pagamento'
              },
              {
                model: Obra,
                as: 'obra',
                attributes: ['id', 'codigo', 'nome']
              }
            ]
          },
          {
            model: RhApuracaoEventoItem,
            as: 'itens',
            required: false,
            include: [
              {
                model: RhEventoRecorrente,
                as: 'regra',
                required: false
              }
            ]
          }
        ]
      }
    ]
  });

  if (!apuracao) {
    throw new ValidationError('Apuracao RH/DP nao encontrada.', 404);
  }

  return apuracao;
}

function validarItemElegivelParaFechamento(item, apuracao) {
  const colaborador = item?.colaborador;
  if (!colaborador) {
    throw new ValidationError('Existe item de apuracao sem colaborador vinculado.');
  }

  if (String(item.status || '').trim().toUpperCase() !== 'CONFERIDO') {
    throw new ValidationError('Todos os itens da apuracao precisam estar conferidos antes do fechamento.');
  }

  const valorLiquido = Number(item.valor_liquido || 0);
  if (!Number.isFinite(valorLiquido) || valorLiquido <= 0) {
    throw new ValidationError(`O colaborador ${colaborador.nome} possui valor liquido invalido para gerar titulo.`);
  }

  const pagamento = colaborador.pagamento || {};
  const favorecidoNome = String(pagamento.favorecido_nome || colaborador.nome || '').trim();
  const favorecidoDocumento = normalizeDigits(pagamento.favorecido_documento || colaborador.cpf);
  const chavePix = resolvePixKeyForItem(item, pagamento);
  const possuiConta = Boolean(
    String(pagamento.banco || '').trim() &&
    String(pagamento.agencia || '').trim() &&
    String(pagamento.conta || '').trim()
  );
  const obraId = Number(apuracao.obra_id || 0);
  const empresaId = Number(colaborador.empresa_grupo_id || 0);

  if (!favorecidoNome) {
    throw new ValidationError(`O colaborador ${colaborador.nome} nao possui favorecido definido para pagamento.`);
  }

  if (![11, 14].includes(favorecidoDocumento.length)) {
    throw new ValidationError(`O colaborador ${colaborador.nome} nao possui documento valido para o favorecido.`);
  }

  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw new ValidationError('A apuracao RH/DP precisa estar vinculada a uma obra antes de gerar titulos financeiros.');
  }

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new ValidationError(`O colaborador ${colaborador.nome} nao possui empresa do grupo vinculada para gerar titulo financeiro.`);
  }

  if (!chavePix && !possuiConta) {
    throw new ValidationError(`O colaborador ${colaborador.nome} precisa ter chave PIX ou conta bancaria definida para pagamento.`);
  }

  return {
    favorecidoNome,
    favorecidoDocumento,
    chavePix,
    banco: pagamento.banco || null,
    agencia: pagamento.agencia || null,
    conta: pagamento.conta || null,
    tipoConta: pagamento.tipo_conta || null,
    obraId,
    empresaId,
    email: pagamento.email || colaborador.email || null,
    telefone: colaborador.telefone || null
  };
}

async function syncParceiroFavorecido({ colaborador, favorecidoNome, favorecidoDocumento, email, telefone }, transaction) {
  const digits = normalizeDigits(favorecidoDocumento);
  const tipoPessoa = inferTipoPessoa(digits);
  if (!tipoPessoa) {
    throw new ValidationError(`Documento invalido para o colaborador ${colaborador.nome}.`);
  }

  const parceiro = await Parceiro.findOne({
    where: { cpf_cnpj: digits },
    transaction
  });

  if (!parceiro) {
    return Parceiro.create(
      {
        cpf_cnpj: digits,
        nome: favorecidoNome,
        telefone: telefone || null,
        email: email || null,
        tipo_pessoa: tipoPessoa,
        cliente: false,
        fornecedor: true,
        corretor: false,
        ativo: true
      },
      { transaction }
    );
  }

  const updateData = {
    fornecedor: true,
    ativo: true
  };

  if (!parceiro.nome && favorecidoNome) {
    updateData.nome = favorecidoNome;
  }
  if (!parceiro.telefone && telefone) {
    updateData.telefone = telefone;
  }
  if (!parceiro.email && email) {
    updateData.email = email;
  }

  if (Object.keys(updateData).length > 0) {
    await parceiro.update(updateData, { transaction });
  }

  return parceiro;
}

async function syncFavorecidoBancarioRh({
  parceiro,
  favorecidoNome,
  favorecidoDocumento,
  chavePix,
  banco,
  agencia,
  conta,
  tipoConta,
  usuarioId
}, transaction) {
  const possuiPix = Boolean(String(chavePix || '').trim());
  const pixTipoChave = possuiPix ? inferPixTipoChave(chavePix, favorecidoDocumento) : 'DADOS_BANCARIOS';
  const pixChave = possuiPix
    ? normalizePixChaveForType(pixTipoChave, chavePix)
    : [banco, agencia, conta].map((value) => String(value || '').trim()).filter(Boolean).join(':').slice(0, 255);

  if (!pixTipoChave || !pixChave) {
    throw new ValidationError('Chave PIX invalida para gerar favorecido bancario RH/DP.');
  }

  const existing = await PaymentBeneficiary.findOne({
    where: {
      parceiro_id: parceiro.id,
      pix_tipo_chave: pixTipoChave,
      pix_chave: pixChave
    },
    transaction
  });

  const payload = {
    parceiro_id: parceiro.id,
    nome: favorecidoNome,
    cpf_cnpj: normalizeDigits(favorecidoDocumento),
    metodo_preferencial: possuiPix ? 'PIX_CHAVE' : 'CONTA_BANCARIA',
    pix_tipo_chave: pixTipoChave,
    pix_chave: pixChave,
    banco_codigo: banco ? String(banco).trim().slice(0, 10) : null,
    agencia: agencia ? String(agencia).trim().slice(0, 20) : null,
    conta: conta ? String(conta).trim().slice(0, 30) : null,
    tipo_conta: tipoConta ? String(tipoConta).trim().slice(0, 30) : null,
    ativo: true,
    updated_by: usuarioId || null
  };

  if (existing) {
    await existing.update(payload, { transaction });
    return existing;
  }

  return PaymentBeneficiary.create(
    {
      ...payload,
      created_by: usuarioId || null
    },
    { transaction }
  );
}

function buildTituloRhPayload({
  apuracao,
  item,
  parceiro,
  dataVencimento,
  categoriaFinanceiraId,
  empresaId,
  usuarioId,
  valor,
  tipoTitulo = 'INTEGRAL',
  descricaoFavorecido = null,
  numeroSufixo = null,
  observacaoAdicional = null,
  paymentBeneficiaryId = null
}) {
  if (!Number.isInteger(Number(empresaId)) || Number(empresaId) <= 0) {
    throw new ValidationError('Empresa do colaborador RH/DP e obrigatoria para gerar titulo financeiro.');
  }

  const colaborador = item.colaborador;
  const competencia = apuracao.competencia;
  const competenciaData = getLastDayOfCompetencia(competencia);
  const empresaNome = apuracao.empresaGrupo?.nome || apuracao.empresaGrupo?.codigo || `Empresa ${empresaId}`;
  const rotulo = tipoTitulo === 'ADIANTAMENTO_40'
    ? 'Adiantamento 40%'
    : tipoTitulo === 'SALDO_60'
      ? 'Saldo 60%'
      : tipoTitulo === 'PENSAO_ALIMENTICIA'
        ? 'Pensao alimenticia'
        : 'Folha';
  const valorTitulo = roundCurrency(valor);

  return {
    solicitacao_id: null,
    obra_id: Number(apuracao.obra_id),
    empresa_id: Number(empresaId),
    parceiro_id: parceiro.id,
    payment_beneficiary_id: paymentBeneficiaryId || null,
    possui_rateio: true,
    categoria_financeira_id: categoriaFinanceiraId,
    competencia_data: competenciaData,
    considera_dre: true,
    origem_titulo: 'RH_DP',
    tipo: 'PAGAR',
    status: 'ABERTO',
    descricao: `${rotulo} RH/DP ${competencia} - ${descricaoFavorecido || colaborador.nome} - ${empresaNome}`.slice(0, 255),
    numero_documento: buildRhNumeroDocumento(competencia, colaborador.id, numeroSufixo),
    valor_original: valorTitulo,
    valor_saldo: valorTitulo,
    valor_baixado: 0,
    data_emissao: getToday(),
    data_vencimento: dataVencimento,
    data_quitacao: null,
    observacoes: [
      `Origem: RH/DP`,
      `Competencia: ${competencia}`,
      `Empresa do colaborador: ${empresaNome}`,
      `Tipo do titulo: ${rotulo}`,
      observacaoAdicional,
      item.observacoes ? `Apuracao: ${item.observacoes}` : null
    ].filter(Boolean).join(' | ').slice(0, 2000),
    forma_cobranca: null,
    status_cobranca: 'NAO_APLICAVEL',
    banco_cobranca: null,
    nosso_numero: null,
    linha_digitavel: null,
    codigo_barras: null,
    identificador_externo: null,
    boleto_emitido_em: null,
    criado_por: usuarioId || null,
    atualizado_por: usuarioId || null
  };
}

async function criarOuAcumularTituloRh(payload, { obraId, valor, usuarioId, transaction }) {
  let titulo = await TituloFinanceiro.findOne({
    where: {
      numero_documento: payload.numero_documento,
      origem_titulo: 'RH_DP',
      tipo: 'PAGAR',
      status: 'ABERTO',
      valor_baixado: 0,
      parceiro_id: payload.parceiro_id,
      empresa_id: payload.empresa_id
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (titulo) {
    const novoValor = roundCurrency(Number(titulo.valor_original || 0) + Number(valor || 0));
    await titulo.update({
      valor_original: novoValor,
      valor_saldo: novoValor,
      payment_beneficiary_id: payload.payment_beneficiary_id || titulo.payment_beneficiary_id || null,
      observacoes: appendAuditText(
        titulo.observacoes,
        `Rateio acrescentado para a obra #${obraId}: R$ ${roundCurrency(valor).toFixed(2)}`
      ),
      atualizado_por: usuarioId || null
    }, { transaction });
  } else {
    titulo = await TituloFinanceiro.create(payload, { transaction });
  }

  const rateio = await TituloFinanceiroRateio.findOne({
    where: { titulo_financeiro_id: titulo.id, obra_id: obraId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const valorRateio = roundCurrency(Number(rateio?.valor_rateio || 0) + Number(valor || 0));
  const percentual = Number(titulo.valor_original || 0) > 0
    ? Number(((valorRateio / Number(titulo.valor_original)) * 100).toFixed(6))
    : 0;

  if (rateio) {
    await rateio.update({
      tipo_rateio: 'VALOR',
      valor_rateio: valorRateio,
      percentual,
      atualizado_por: usuarioId || null
    }, { transaction });
  } else {
    await TituloFinanceiroRateio.create({
      titulo_financeiro_id: titulo.id,
      obra_id: obraId,
      apropriacao_id: null,
      tipo_rateio: 'VALOR',
      valor_rateio: roundCurrency(valor),
      percentual,
      observacoes: 'Rateio gerado automaticamente pelo fechamento RH/DP.',
      criado_por: usuarioId || null,
      atualizado_por: usuarioId || null
    }, { transaction });
  }

  const rateios = await TituloFinanceiroRateio.findAll({
    where: { titulo_financeiro_id: titulo.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const totalTitulo = Number(titulo.valor_original || 0);
  for (const itemRateio of rateios) {
    const percentualAtualizado = totalTitulo > 0
      ? Number(((Number(itemRateio.valor_rateio || 0) / totalTitulo) * 100).toFixed(6))
      : 0;
    // eslint-disable-next-line no-await-in-loop
    await itemRateio.update({ percentual: percentualAtualizado }, { transaction });
  }

  return titulo;
}

function buildParcelasColaborador(item, apuracao, data = {}, ajuste = null) {
  const colaborador = item.colaborador || {};
  const valorLiquido = roundCurrency(item.valor_liquido);
  const formaCalculo = String(colaborador.forma_calculo_gerencial || 'MENSAL').toUpperCase();
  const automatico4060 = formaCalculo === 'MENSAL' && Boolean(colaborador.pagamento_automatico_40_60);
  const vencimentoIntegral = data.data_vencimento || anticipateWeekend(getLastDayOfCompetencia(apuracao.competencia));

  if (!automatico4060) {
    if (ajuste) {
      throw new ValidationError(`O colaborador ${colaborador.nome} nao utiliza a distribuicao automatica 40%/60%.`);
    }
    return [{
      tipoTitulo: formaCalculo === 'DIARIA' ? 'DIARIAS' : 'INTEGRAL',
      valor: valorLiquido,
      dataVencimento: vencimentoIntegral,
      numeroSufixo: formaCalculo === 'DIARIA' ? 'DIARIA' : 'INTEGRAL'
    }];
  }

  const salarioBruto = roundCurrency(
    String(colaborador.tipo_vinculo || '').toUpperCase() === 'CLT'
      ? colaborador.salario_base || colaborador.valor_contratual || item.valor_base_calculo
      : colaborador.valor_contratual || colaborador.salario_base || item.valor_base_calculo
  );
  const baseProporcionalObra = roundCurrency(
    item.detalhes_json?.resumo?.valor_proporcional || salarioBruto
  );
  const valor40Calculado = roundCurrency(baseProporcionalObra * 0.4);
  let valor40 = Math.min(valor40Calculado, valorLiquido);
  let valor60 = roundCurrency(valorLiquido - valor40);

  if (ajuste) {
    const valor40Informado = roundCurrency(ajuste.valor_40);
    const valor60Informado = roundCurrency(ajuste.valor_60);
    if (Math.abs(roundCurrency(valor40Informado + valor60Informado) - valorLiquido) > 0.01) {
      throw new ValidationError(
        `A distribuicao 40%/60% de ${colaborador.nome} deve totalizar o liquido de ${valorLiquido.toFixed(2)}.`
      );
    }
    const alterouCalculo = Math.abs(valor40Informado - valor40) > 0.01 || Math.abs(valor60Informado - valor60) > 0.01;
    if (alterouCalculo && !String(ajuste.observacao || '').trim()) {
      throw new ValidationError(`Informe a observacao para alterar a distribuicao 40%/60% de ${colaborador.nome}.`);
    }
    valor40 = valor40Informado;
    valor60 = valor60Informado;
  }
  const parcelas = [];

  if (valor40 > 0) {
    parcelas.push({
      tipoTitulo: 'ADIANTAMENTO_40',
      valor: valor40,
      dataVencimento: data.data_vencimento_40 || anticipateWeekend(getCompetenciaDate(apuracao.competencia, 15)),
      numeroSufixo: '40',
      observacaoAdicional: [
        `Salario bruto: ${salarioBruto.toFixed(2)} | Base proporcional da obra: ${baseProporcionalObra.toFixed(2)} | Percentual calculado: 40%`,
        ajuste?.observacao ? `Ajuste informado: ${ajuste.observacao}` : null
      ].filter(Boolean).join(' | ')
    });
  }
  if (valor60 > 0) {
    parcelas.push({
      tipoTitulo: 'SALDO_60',
      valor: valor60,
      dataVencimento: data.data_vencimento_60 || vencimentoIntegral,
      numeroSufixo: '60',
      observacaoAdicional: [
        `Base salarial bruta: ${salarioBruto.toFixed(2)} | Saldo liquido apos eventos e pensao`,
        ajuste?.observacao ? `Ajuste informado: ${ajuste.observacao}` : null
      ].filter(Boolean).join(' | ')
    });
  }

  return parcelas;
}

function getPensoesDoItem(item) {
  return (item.itens || []).filter((eventoItem) => (
    String(eventoItem.codigo || eventoItem.regra?.codigo || '').trim().toUpperCase() === 'PENSAO_ALIMENTICIA' &&
    String(eventoItem.natureza || '').trim().toUpperCase() === 'DESCONTO' &&
    Number(eventoItem.valor || 0) > 0
  ));
}

async function listarFechamentosRh(filters = {}) {
  const where = {};
  if (filters.apuracao_id) where.apuracao_id = filters.apuracao_id;
  if (filters.status) where.status = filters.status;

  const include = [...FECHAMENTO_INCLUDE];

  if (filters.competencia || filters.empresa_grupo_id || filters.obra_id) {
    include[0] = {
      ...include[0],
      required: true,
      where: {
        ...(filters.competencia ? { competencia: filters.competencia } : {}),
        ...(filters.empresa_grupo_id ? { empresa_grupo_id: filters.empresa_grupo_id } : {}),
        ...(filters.obra_id ? { obra_id: filters.obra_id } : {})
      }
    };
  }

  return RhFechamento.findAll({
    where,
    include,
    order: [['createdAt', 'DESC']]
  });
}

async function detalharFechamentoRh(id, { transaction = undefined } = {}) {
  const fechamento = await RhFechamento.findByPk(id, {
    transaction,
    include: [
      ...FECHAMENTO_INCLUDE,
      {
        model: RhFechamentoTitulo,
        as: 'titulos',
        separate: true,
        order: [['id', 'ASC']],
        include: [
          {
            model: RhApuracaoEvento,
            as: 'itemApuracao',
            attributes: ['id', 'valor_liquido', 'regra_aplicada', 'observacoes'],
            include: [
              {
                model: RhColaborador,
                as: 'colaborador',
                attributes: ['id', 'nome', 'cpf', 'matricula', 'tipo_vinculo']
              }
            ]
          },
          {
            model: TituloFinanceiro,
            as: 'tituloFinanceiro',
            attributes: [
              'id',
              'tipo',
              'status',
              'descricao',
              'numero_documento',
              'valor_original',
              'valor_saldo',
              'valor_baixado',
              'data_emissao',
              'data_vencimento'
            ],
            include: [
              {
                model: Obra,
                as: 'obra',
                attributes: ['id', 'codigo', 'nome']
              },
              {
                model: Parceiro,
                as: 'parceiro',
                attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
              },
              {
                model: IntegracaoSiengeFila,
                as: 'integracaoSienge',
                attributes: [
                  'id',
                  'origem_modulo',
                  'status',
                  'tentativas',
                  'enviado_em',
                  'ultimo_erro',
                  'external_title_id',
                  'updatedAt'
                ]
              },
              {
                model: PagamentoManualFilaItem,
                as: 'filaPagamentosManuais',
                attributes: [
                  'id',
                  'status',
                  'comprovante_nome',
                  'comprovante_url',
                  'comprovante_hash',
                  'comprovante_banco',
                  'comprovante_tipo',
                  'comprovante_vinculado_em'
                ],
                separate: true,
                order: [['id', 'DESC']],
                include: [
                  {
                    model: PagamentoManualFilaComprovante,
                    as: 'comprovantes',
                    attributes: ['id', 'nome', 'hash', 'banco', 'tipo', 'vinculado_em'],
                    separate: true,
                    order: [['vinculado_em', 'DESC'], ['id', 'DESC']]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  });

  if (!fechamento) {
    throw new ValidationError('Fechamento RH/DP nao encontrado.', 404);
  }

  const plano = fechamento.get({ plain: true });
  plano.titulos = (plano.titulos || []).map((item) => ({
    ...item,
    comprovantes_pagamento: normalizarComprovantesDoTitulo(item.tituloFinanceiro)
  }));
  return plano;
}

async function obterComprovanteFechamentoRh(fechamentoId, filaId, comprovanteId = null) {
  const fila = await PagamentoManualFilaItem.findOne({
    where: { id: filaId },
    attributes: ['id', 'comprovante_nome', 'comprovante_url'],
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        attributes: ['id'],
        required: true,
        include: [
          {
            model: RhFechamentoTitulo,
            as: 'fechamentoRh',
            attributes: ['id', 'fechamento_id'],
            required: true,
            where: { fechamento_id: fechamentoId }
          }
        ]
      }
    ]
  });

  if (!fila) throw new ValidationError('Comprovante do fechamento nao encontrado.', 404);

  if (comprovanteId) {
    const comprovante = await PagamentoManualFilaComprovante.findOne({
      where: { id: comprovanteId, fila_id: fila.id },
      attributes: ['id', 'nome', 'url']
    });
    if (!comprovante?.url) throw new ValidationError('Comprovante do fechamento nao encontrado.', 404);
    return {
      nome: comprovante.nome,
      url: await getPresignedUrl(comprovante.url, 300, { strict: true })
    };
  }

  if (!fila.comprovante_url) throw new ValidationError('Comprovante do fechamento nao encontrado.', 404);
  return {
    nome: fila.comprovante_nome || 'Comprovante de pagamento',
    url: await getPresignedUrl(fila.comprovante_url, 300, { strict: true })
  };
}

async function obterDestinatariosFinanceiro(transaction) {
  const usuariosConfigurados = await getUsuariosAcessoFinanceiro();
  const setoresFinanceiro = await Setor.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.in]: ['FINANCEIRO', 'FINANCEIRO_CSC', 'SETOR_FINANCEIRO'] } },
        { nome: { [Op.like]: '%Financeiro%' } },
        { eh_setor_financeiro: true }
      ]
    },
    attributes: ['id', 'codigo', 'nome', 'eh_setor_financeiro'],
    transaction
  });
  const setorIds = new Set(setoresFinanceiro.map((setor) => Number(setor.id)).filter(Boolean));
  const usuarios = await User.findAll({
    where: {
      ativo: true
    },
    attributes: ['id', 'perfil', 'area', 'setor_id'],
    include: [
      {
        model: Setor,
        as: 'setor',
        attributes: ['id', 'codigo', 'nome', 'eh_setor_financeiro'],
        required: false
      }
    ],
    transaction
  });

  const destinatarios = [];
  for (const usuario of usuarios) {
    const usuarioId = Number(usuario.id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) continue;

    const setorTokens = buildSetorComparisonTokens(usuario.setor || {});
    const perfilFinanceiro = normalizeSetorCode(usuario.perfil) === 'FINANCEIRO';
    const areaFinanceira = normalizeSetorCode(usuario.area).includes('FINANCEIRO');
    const setorFinanceiro = (
      setorIds.has(Number(usuario.setor_id)) ||
      hasSetorCapability(usuario.setor, 'eh_setor_financeiro') ||
      setorTokens.includes('FINANCEIRO') ||
      setorTokens.some((token) => token.includes('FINANCEIRO'))
    );
    const configuradoFinanceiro = usuariosConfigurados.includes(usuarioId);
    const possuiPermissaoFinanceira = await canAccessFinanceiro(usuario);

    if (
      perfilFinanceiro ||
      areaFinanceira ||
      setorFinanceiro ||
      configuradoFinanceiro ||
      possuiPermissaoFinanceira
    ) {
      destinatarios.push(usuarioId);
    }
  }

  return [...new Set(destinatarios)];
}

async function notificarFinanceiroReabertura({ fechamento, apuracao, justificativa, user, transaction }) {
  try {
    if (!(await notificacaoEventoAtivo('RH_DP_FECHAMENTO_REABERTO'))) {
      return;
    }

    const destinatarios = await obterDestinatariosFinanceiro(transaction);
    if (!destinatarios.length) {
      console.warn('[rh-dp] Estorno de fechamento sem destinatarios financeiros para notificacao.', {
        fechamento_id: fechamento.id,
        apuracao_id: apuracao.id
      });
      return;
    }

    const notificacao = await Notificacao.create(
      {
        solicitacao_id: null,
        tipo: 'RH_DP_FECHAMENTO_REABERTO',
        mensagem: `Apuracao RH/DP ${apuracao.competencia} foi estornada por ${user?.nome || 'Usuario'} e os titulos em aberto foram cancelados.`,
        metadata: JSON.stringify({
          fechamento_id: fechamento.id,
          apuracao_id: apuracao.id,
          competencia: apuracao.competencia,
          justificativa
        }),
        created_by: user?.id || null
      },
      { transaction }
    );

    await NotificacaoDestinatario.bulkCreate(
      destinatarios.map((usuarioId) => ({
        notificacao_id: notificacao.id,
        usuario_id: usuarioId
      })),
      { transaction }
    );
  } catch (error) {
    console.error('[rh-dp] Erro ao notificar financeiro sobre estorno de fechamento.', error);
  }
}

async function fecharApuracaoRh(apuracaoId, data, user) {
  return sequelize.transaction(async (transaction) => {
    const apuracao = await carregarApuracaoParaFechamento(apuracaoId, transaction);

    if (String(apuracao.status || '').trim().toUpperCase() !== 'CONFERIDA') {
      throw new ValidationError('A apuracao precisa estar conferida antes do fechamento.');
    }

    if (apuracao.fechamentoRh) {
      throw new ValidationError('Esta apuracao RH/DP ja foi fechada.');
    }

    const itens = Array.isArray(apuracao.itens) ? apuracao.itens : [];
    if (!itens.length) {
      throw new ValidationError('A apuracao RH/DP nao possui itens para fechar.');
    }

    const categoria = await ensureCategoriaFinanceiraPagar(data.categoria_financeira_id, transaction);
    const dataFechamento = data.data_fechamento || getToday();
    const dataVencimento = data.data_vencimento_60 || data.data_vencimento || anticipateWeekend(getLastDayOfCompetencia(apuracao.competencia));
    const fechamento = await RhFechamento.create(
      {
        apuracao_id: apuracao.id,
        categoria_financeira_id: categoria?.id || null,
        status: 'FECHADO',
        data_fechamento: dataFechamento,
        data_vencimento: dataVencimento,
        total_titulos: 0,
        total_valor: 0,
        observacoes: data.observacoes || null,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    let totalTitulos = 0;
    let totalValor = 0;
    const ajustesTitulos = new Map(
      (data.ajustes_titulos || []).map((ajuste) => [Number(ajuste.apuracao_evento_id), ajuste])
    );

    for (const item of itens) {
      // Serializa fechamentos simultaneos do mesmo colaborador em obras diferentes. Assim ambos
      // enxergam o mesmo titulo aberto e o segundo apenas acrescenta seu rateio.
      await RhColaborador.findByPk(item.colaborador_id, {
        attributes: ['id'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const dadosFechamento = validarItemElegivelParaFechamento(item, apuracao);
      const parceiro = await syncParceiroFavorecido(
        {
          colaborador: item.colaborador,
          favorecidoNome: dadosFechamento.favorecidoNome,
          favorecidoDocumento: dadosFechamento.favorecidoDocumento,
          email: dadosFechamento.email,
          telefone: dadosFechamento.telefone
        },
        transaction
      );

      const favorecidoBancario = await syncFavorecidoBancarioRh(
        {
          parceiro,
          favorecidoNome: dadosFechamento.favorecidoNome,
          favorecidoDocumento: dadosFechamento.favorecidoDocumento,
          chavePix: dadosFechamento.chavePix,
          banco: dadosFechamento.banco,
          agencia: dadosFechamento.agencia,
          conta: dadosFechamento.conta,
          tipoConta: dadosFechamento.tipoConta,
          usuarioId: user?.id || null
        },
        transaction
      );

      const pensoesPlanejadas = [];
      let descontoPensaoDuplicado = 0;
      for (const pensaoItem of getPensoesDoItem(item)) {
        const sufixoPensao = `PENSAO-${pensaoItem.evento_recorrente_id || pensaoItem.id}`;
        // Se o colaborador passou por mais de uma obra na competencia, a regra recorrente pode
        // aparecer nas duas apuracoes. Financeiramente ela deve ser paga e descontada uma vez.
        // eslint-disable-next-line no-await-in-loop
        const tituloPensaoExistente = await TituloFinanceiro.findOne({
          where: {
            numero_documento: buildRhNumeroDocumento(
              apuracao.competencia,
              item.colaborador.id,
              sufixoPensao
            ),
            origem_titulo: 'RH_DP',
            tipo: 'PAGAR',
            status: 'ABERTO',
            valor_baixado: 0,
            empresa_id: dadosFechamento.empresaId
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        const valorEvento = roundCurrency(pensaoItem.valor);
        const restante = Math.max(0, roundCurrency(valorEvento - Number(tituloPensaoExistente?.valor_original || 0)));
        const valorParaGerar = Math.min(valorEvento, restante);
        descontoPensaoDuplicado += roundCurrency(valorEvento - valorParaGerar);
        pensoesPlanejadas.push({ pensaoItem, valorParaGerar, sufixoPensao });
      }

      const itemParaTitulos = descontoPensaoDuplicado > 0
        ? {
            ...item.get({ plain: true }),
            colaborador: item.colaborador,
            valor_liquido: roundCurrency(Number(item.valor_liquido || 0) + descontoPensaoDuplicado)
          }
        : item;
      const parcelasColaborador = buildParcelasColaborador(
        itemParaTitulos,
        apuracao,
        data,
        ajustesTitulos.get(Number(item.id)) || null
      );
      for (const parcela of parcelasColaborador) {
        // eslint-disable-next-line no-await-in-loop
        const tituloPayload =
          buildTituloRhPayload({
            apuracao,
            item,
            parceiro,
            dataVencimento: parcela.dataVencimento,
            categoriaFinanceiraId: categoria?.id || null,
            empresaId: dadosFechamento.empresaId,
            usuarioId: user?.id || null,
            valor: parcela.valor,
            tipoTitulo: parcela.tipoTitulo,
            numeroSufixo: parcela.numeroSufixo,
            observacaoAdicional: parcela.observacaoAdicional,
            paymentBeneficiaryId: favorecidoBancario.id
          });
        // Um colaborador transferido dentro da competencia conserva um unico titulo por parcela.
        // Cada fechamento de obra acrescenta apenas o seu valor ao rateio do titulo ainda aberto.
        // eslint-disable-next-line no-await-in-loop
        const titulo = await criarOuAcumularTituloRh(tituloPayload, {
          obraId: dadosFechamento.obraId,
          valor: parcela.valor,
          usuarioId: user?.id || null,
          transaction
        });

        // eslint-disable-next-line no-await-in-loop
        await RhFechamentoTitulo.create(
          {
            fechamento_id: fechamento.id,
            apuracao_evento_id: item.id,
            titulo_financeiro_id: titulo.id,
            parceiro_id: parceiro.id,
            tipo_titulo: parcela.tipoTitulo,
            evento_recorrente_id: null,
            valor_gerado: roundCurrency(parcela.valor)
          },
          { transaction }
        );

        totalTitulos += 1;
        totalValor += Number(parcela.valor || 0);
      }

      for (const planoPensao of pensoesPlanejadas) {
        const { pensaoItem, valorParaGerar, sufixoPensao } = planoPensao;
        if (!(valorParaGerar > 0)) continue;
        const regra = pensaoItem.regra || {};
        const beneficiarioNome = String(regra.beneficiario_nome || '').trim();
        const beneficiarioDocumento = normalizeDigits(regra.beneficiario_documento);
        if (!beneficiarioNome || beneficiarioDocumento.length !== 11) {
          throw new ValidationError(`A pensao de ${item.colaborador.nome} nao possui beneficiario com nome e CPF validos.`);
        }

        // eslint-disable-next-line no-await-in-loop
        const parceiroPensao = await syncParceiroFavorecido(
          {
            colaborador: { nome: beneficiarioNome },
            favorecidoNome: beneficiarioNome,
            favorecidoDocumento: beneficiarioDocumento,
            email: null,
            telefone: null
          },
          transaction
        );

        // eslint-disable-next-line no-await-in-loop
        const favorecidoBancarioPensao = await syncFavorecidoBancarioRh(
          {
            parceiro: parceiroPensao,
            favorecidoNome: beneficiarioNome,
            favorecidoDocumento: beneficiarioDocumento,
            chavePix: regra.beneficiario_chave_pix,
            banco: regra.beneficiario_banco,
            agencia: regra.beneficiario_agencia,
            conta: regra.beneficiario_conta,
            tipoConta: regra.beneficiario_tipo_conta,
            usuarioId: user?.id || null
          },
          transaction
        );

        const valorPensao = roundCurrency(valorParaGerar);
        // eslint-disable-next-line no-await-in-loop
        const tituloPensaoPayload =
          buildTituloRhPayload({
            apuracao,
            item,
            parceiro: parceiroPensao,
            dataVencimento,
            categoriaFinanceiraId: categoria?.id || null,
            empresaId: dadosFechamento.empresaId,
            usuarioId: user?.id || null,
            valor: valorPensao,
            tipoTitulo: 'PENSAO_ALIMENTICIA',
            descricaoFavorecido: beneficiarioNome,
            numeroSufixo: sufixoPensao,
            observacaoAdicional: `Beneficiario da pensao de ${item.colaborador.nome}`,
            paymentBeneficiaryId: favorecidoBancarioPensao.id
          });
        // eslint-disable-next-line no-await-in-loop
        const tituloPensao = await criarOuAcumularTituloRh(tituloPensaoPayload, {
          obraId: dadosFechamento.obraId,
          valor: valorPensao,
          usuarioId: user?.id || null,
          transaction
        });

        // eslint-disable-next-line no-await-in-loop
        await RhFechamentoTitulo.create(
          {
            fechamento_id: fechamento.id,
            apuracao_evento_id: item.id,
            titulo_financeiro_id: tituloPensao.id,
            parceiro_id: parceiroPensao.id,
            tipo_titulo: 'PENSAO_ALIMENTICIA',
            evento_recorrente_id: pensaoItem.evento_recorrente_id || null,
            valor_gerado: valorPensao
          },
          { transaction }
        );

        totalTitulos += 1;
        totalValor += valorPensao;
      }
    }

    await fechamento.update(
      {
        total_titulos: totalTitulos,
        total_valor: roundCurrency(totalValor),
        resumo_json: {
          competencia: apuracao.competencia,
          total_titulos: totalTitulos,
          total_valor: roundCurrency(totalValor),
          categoria_financeira_id: categoria?.id || null,
          data_vencimento: dataVencimento,
          data_vencimento_40: data.data_vencimento_40 || anticipateWeekend(getCompetenciaDate(apuracao.competencia, 15)),
          data_vencimento_60: dataVencimento
        },
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    return detalharFechamentoRh(fechamento.id, { transaction });
  });
}

async function reabrirFechamentoRh(fechamentoId, data, user) {
  const justificativa = String(data?.justificativa || '').trim();
  if (!justificativa) {
    throw new ValidationError('Informe a justificativa da reabertura do fechamento RH/DP.');
  }

  return sequelize.transaction(async (transaction) => {
    const fechamento = await RhFechamento.findByPk(fechamentoId, {
      transaction,
      include: [
        {
          model: RhApuracao,
          as: 'apuracao',
          required: true,
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
        },
        {
          model: RhFechamentoTitulo,
          as: 'titulos',
          required: false,
          include: [
            {
              model: TituloFinanceiro,
              as: 'tituloFinanceiro',
              required: true,
              attributes: [
                'id',
                'status',
                'status_cobranca',
                'forma_cobranca',
                'valor_baixado',
                'valor_saldo',
                'observacoes'
              ]
            }
          ]
        }
      ]
    });

    if (!fechamento) {
      throw new ValidationError('Fechamento RH/DP nao encontrado.', 404);
    }

    if (String(fechamento.status || '').trim().toUpperCase() !== 'FECHADO') {
      throw new ValidationError('Somente fechamentos em status FECHADO podem ser reabertos.');
    }

    const titulos = Array.isArray(fechamento.titulos) ? fechamento.titulos : [];
    const tituloIds = titulos
      .map((item) => Number(item?.tituloFinanceiro?.id || 0))
      .filter((id) => Number.isInteger(id) && id > 0);

    const baixasAtivas = tituloIds.length
      ? await MovimentoFinanceiro.findAll({
          where: {
            titulo_financeiro_id: { [Op.in]: tituloIds },
            tipo_movimento: 'BAIXA',
            status: 'ATIVO'
          },
          attributes: ['id', 'titulo_financeiro_id', 'valor'],
          transaction
        })
      : [];
    const tituloIdsComBaixaAtiva = new Set(
      baixasAtivas.map((movimento) => Number(movimento.titulo_financeiro_id)).filter(Boolean)
    );

    const tituloBaixado = titulos.find((item) => {
      const titulo = item.tituloFinanceiro;
      const status = String(titulo?.status || '').trim().toUpperCase();
      const valorBaixado = Number(titulo?.valor_baixado || 0);
      const valorOriginal = Number(titulo?.valor_original || 0);
      const valorSaldo = Number(titulo?.valor_saldo || 0);
      return (
        tituloIdsComBaixaAtiva.has(Number(titulo?.id)) ||
        valorBaixado > 0 ||
        (valorOriginal > 0 && valorSaldo < valorOriginal) ||
        ['PARCIAL', 'QUITADO', 'BAIXADO', 'PAGO', 'CONCILIADO'].includes(status)
      );
    });

    if (tituloBaixado) {
      throw new ValidationError(
        `Nao e possivel estornar esta apuracao porque o titulo financeiro #${tituloBaixado.tituloFinanceiro.id} ja possui baixa registrada. Estorne a baixa no financeiro antes de reabrir a apuracao.`
      );
    }

    const auditLine = `Reabertura RH/DP em ${new Date().toISOString()} por ${user?.nome || 'Usuario'}: ${justificativa}`;

    for (const item of titulos) {
      const titulo = item.tituloFinanceiro;
      if (!titulo?.id) continue;

      const outrosVinculosAtivos = await RhFechamentoTitulo.findAll({
        where: {
          titulo_financeiro_id: titulo.id,
          fechamento_id: { [Op.ne]: fechamento.id }
        },
        include: [{
          model: RhFechamento,
          as: 'fechamento',
          required: true,
          where: { status: 'FECHADO' },
          attributes: ['id']
        }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (outrosVinculosAtivos.length) {
        const valorRemovido = roundCurrency(item.valor_gerado);
        const novoValor = roundCurrency(Number(titulo.valor_original || 0) - valorRemovido);
        if (novoValor <= 0) {
          throw new ValidationError(`O rateio do titulo #${titulo.id} ficou inconsistente ao estornar o fechamento.`);
        }
        await titulo.update({
          valor_original: novoValor,
          valor_saldo: novoValor,
          observacoes: appendAuditText(titulo.observacoes, auditLine),
          atualizado_por: user?.id || null
        }, { transaction });

        const rateio = await TituloFinanceiroRateio.findOne({
          where: {
            titulo_financeiro_id: titulo.id,
            obra_id: fechamento.apuracao.obra_id
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (rateio) {
          const novoRateio = roundCurrency(Number(rateio.valor_rateio || 0) - valorRemovido);
          if (novoRateio <= 0) {
            await rateio.destroy({ transaction });
          } else {
            await rateio.update({
              valor_rateio: novoRateio,
              percentual: Number(((novoRateio / novoValor) * 100).toFixed(6)),
              atualizado_por: user?.id || null
            }, { transaction });
          }
        }

        const rateiosRestantes = await TituloFinanceiroRateio.findAll({
          where: { titulo_financeiro_id: titulo.id },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        for (const itemRateio of rateiosRestantes) {
          // eslint-disable-next-line no-await-in-loop
          await itemRateio.update({
            percentual: Number(((Number(itemRateio.valor_rateio || 0) / novoValor) * 100).toFixed(6)),
            atualizado_por: user?.id || null
          }, { transaction });
        }
        continue;
      }

      await titulo.update(
        {
          status: 'CANCELADO',
          status_cobranca: titulo.status_cobranca === 'NAO_APLICAVEL' ? 'NAO_APLICAVEL' : 'CANCELADO',
          valor_saldo: 0,
          observacoes: appendAuditText(titulo.observacoes, auditLine),
          atualizado_por: user?.id || null
        },
        { transaction }
      );
    }

    await RhApuracaoEvento.update(
      {
        status: 'PENDENTE',
        ajustado_por: user?.id || null,
        ajustado_em: new Date()
      },
      {
        where: { apuracao_id: fechamento.apuracao_id },
        transaction
      }
    );

    await fechamento.apuracao.update(
      {
        status: 'RASCUNHO',
        observacoes: appendAuditText(fechamento.apuracao.observacoes, auditLine),
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    await fechamento.update(
      {
        status: 'ESTORNADO',
        observacoes: appendAuditText(fechamento.observacoes, auditLine),
        resumo_json: {
          ...(fechamento.resumo_json || {}),
          reabertura: {
            justificativa,
            usuario_id: user?.id || null,
            usuario_nome: user?.nome || null,
            data: new Date().toISOString()
          }
        },
        atualizado_por: user?.id || null
      },
      { transaction }
    );

    await notificarFinanceiroReabertura({
      fechamento,
      apuracao: fechamento.apuracao,
      justificativa,
      user,
      transaction
    });

    return detalharFechamentoRh(fechamento.id, { transaction });
  });
}

module.exports = {
  detalharFechamentoRh,
  fecharApuracaoRh,
  listarFechamentosRh,
  reabrirFechamentoRh,
  obterComprovanteFechamentoRh
};

if (process.env.NODE_ENV === 'test') {
  module.exports.__test = {
    anticipateWeekend,
    buildParcelasColaborador,
    getCompetenciaDate,
    getLastDayOfCompetencia,
    roundCurrency
  };
}
