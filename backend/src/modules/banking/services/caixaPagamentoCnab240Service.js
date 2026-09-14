const { Op } = require('sequelize');
const {
  blank,
  createLine,
  dateField,
  hashCnab,
  moneyField,
  numberField,
  onlyDigits,
  textField,
  timeField,
  validateCnab240Lines,
  zero
} = require('../../../services/cnab240Utils');

const db = require('../../../models');

const BANCO_CAIXA = '104';
const NOME_CAIXA = 'CAIXA ECONOMICA FEDERAL';
const LOTE_PAGAMENTOS = '0001';
const LOTE_TRAILER_ARQUIVO = '9999';
const TIPO_REGISTRO_HEADER_ARQUIVO = '0';
const TIPO_REGISTRO_HEADER_LOTE = '1';
const TIPO_REGISTRO_DETALHE = '3';
const TIPO_REGISTRO_TRAILER_LOTE = '5';
const TIPO_REGISTRO_TRAILER_ARQUIVO = '9';
const OPERACAO_CREDITO = 'C';
const TIPO_SERVICO_PAGAMENTO_FORNECEDOR = '20';
const FORMA_LANCAMENTO_TITULOS = '30';
const MOVIMENTO_INCLUSAO = '00';

function createHttpError(statusCode, message, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function tipoInscricao(documento) {
  return onlyDigits(documento).length <= 11 ? '1' : '2';
}

function todayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

function dataIso(value) {
  if (!value) return todayIso();
  const date = value instanceof Date ? value : new Date(String(value).slice(0, 10));
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function parseValor(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function codigoBarrasFromLinhaDigitavel(value) {
  const digits = onlyDigits(value);
  if (digits.length === 44) return digits;
  if (digits.length !== 47) return '';

  return [
    digits.slice(0, 4),
    digits.slice(32, 33),
    digits.slice(33, 47),
    digits.slice(4, 9),
    digits.slice(10, 20),
    digits.slice(21, 31)
  ].join('');
}

function resolveCodigoBarras(titulo) {
  return codigoBarrasFromLinhaDigitavel(titulo?.codigo_barras || titulo?.linha_digitavel);
}

function resolveConvenio(convenio = {}) {
  const empresa = convenio.empresa || {};
  const conta = convenio.contaBancaria || {};
  return {
    banco_codigo: numberField(convenio.banco_codigo || BANCO_CAIXA, 3),
    banco_nome: convenio.banco_nome || NOME_CAIXA,
    tipo_inscricao: tipoInscricao(convenio.empresa_cpf_cnpj || empresa.cnpj),
    numero_inscricao: convenio.empresa_cpf_cnpj || empresa.cnpj,
    codigo_convenio: convenio.compromisso_codigo || convenio.convenio_codigo,
    convenio_codigo: convenio.convenio_codigo,
    convenio_nome: convenio.convenio_nome,
    compromisso_codigo: convenio.compromisso_codigo,
    compromisso_nome: convenio.compromisso_nome,
    agencia: convenio.agencia || conta.agencia,
    agencia_dv: convenio.agencia_dv || '',
    conta: convenio.conta || conta.conta,
    conta_dv: convenio.conta_dv || '',
    nome_empresa: convenio.empresa_nome || empresa.razao_social || empresa.nome,
    layout_arquivo_versao: convenio.layout_arquivo_versao || '080',
    layout_lote_versao: convenio.layout_lote_versao || '045',
    ambiente: convenio.ambiente || 'HOMOLOGACAO'
  };
}

function validarConvenio(convenio) {
  if (!convenio) {
    throw createHttpError(404, 'Convenio Caixa de pagamentos nao encontrado.');
  }
  if (convenio.ativo === false) {
    throw createHttpError(400, 'Convenio Caixa de pagamentos esta inativo.');
  }

  const resolved = resolveConvenio(convenio);
  const pendencias = [];
  if (!onlyDigits(resolved.numero_inscricao)) pendencias.push('CNPJ/CPF da empresa');
  if (!resolved.nome_empresa) pendencias.push('nome da empresa');
  if (!onlyDigits(resolved.codigo_convenio)) pendencias.push('codigo do compromisso ou convenio');
  if (!onlyDigits(resolved.agencia)) pendencias.push('agencia');
  if (!onlyDigits(resolved.conta)) pendencias.push('conta');

  if (pendencias.length) {
    throw createHttpError(400, `Convenio incompleto para gerar remessa: ${pendencias.join(', ')}.`);
  }

  return resolved;
}

function validarDataPagamento(value) {
  const data = dataIso(value);
  if (!data) {
    throw createHttpError(400, 'Data de pagamento invalida.');
  }
  if (data < todayIso()) {
    throw createHttpError(400, 'Data de pagamento nao pode ser retroativa.');
  }
  return data;
}

function montarHeaderArquivo(convenioInput, numeroRemessa, dataGeracao = new Date()) {
  const convenio = resolveConvenio(convenioInput);
  return createLine([
    { start: 1, end: 3, value: convenio.banco_codigo },
    { start: 4, end: 7, value: '0000' },
    { start: 8, end: 8, value: TIPO_REGISTRO_HEADER_ARQUIVO },
    { start: 9, end: 17, value: blank(9) },
    { start: 18, end: 18, value: convenio.tipo_inscricao },
    { start: 19, end: 32, value: numberField(convenio.numero_inscricao, 14) },
    { start: 33, end: 52, value: textField(convenio.codigo_convenio, 20) },
    { start: 53, end: 57, value: numberField(convenio.agencia, 5) },
    { start: 58, end: 58, value: textField(convenio.agencia_dv, 1) },
    { start: 59, end: 70, value: numberField(convenio.conta, 12) },
    { start: 71, end: 71, value: textField(convenio.conta_dv, 1) },
    { start: 72, end: 72, value: blank(1) },
    { start: 73, end: 102, value: textField(convenio.nome_empresa, 30) },
    { start: 103, end: 132, value: textField(convenio.banco_nome, 30) },
    { start: 133, end: 142, value: blank(10) },
    { start: 143, end: 143, value: '1' },
    { start: 144, end: 151, value: dateField(dataIso(dataGeracao)) },
    { start: 152, end: 157, value: timeField(dataGeracao) },
    { start: 158, end: 163, value: numberField(numeroRemessa, 6) },
    { start: 164, end: 166, value: numberField(convenio.layout_arquivo_versao, 3) },
    { start: 167, end: 171, value: zero(5) },
    { start: 172, end: 240, value: blank(69) }
  ]);
}

function montarHeaderLote(convenioInput) {
  const convenio = resolveConvenio(convenioInput);
  return createLine([
    { start: 1, end: 3, value: convenio.banco_codigo },
    { start: 4, end: 7, value: LOTE_PAGAMENTOS },
    { start: 8, end: 8, value: TIPO_REGISTRO_HEADER_LOTE },
    { start: 9, end: 9, value: OPERACAO_CREDITO },
    { start: 10, end: 11, value: TIPO_SERVICO_PAGAMENTO_FORNECEDOR },
    { start: 12, end: 13, value: FORMA_LANCAMENTO_TITULOS },
    { start: 14, end: 16, value: numberField(convenio.layout_lote_versao, 3) },
    { start: 17, end: 17, value: blank(1) },
    { start: 18, end: 18, value: convenio.tipo_inscricao },
    { start: 19, end: 33, value: numberField(convenio.numero_inscricao, 15) },
    { start: 34, end: 53, value: textField(convenio.codigo_convenio, 20) },
    { start: 54, end: 58, value: numberField(convenio.agencia, 5) },
    { start: 59, end: 59, value: textField(convenio.agencia_dv, 1) },
    { start: 60, end: 71, value: numberField(convenio.conta, 12) },
    { start: 72, end: 72, value: textField(convenio.conta_dv, 1) },
    { start: 73, end: 73, value: blank(1) },
    { start: 74, end: 103, value: textField(convenio.nome_empresa, 30) },
    { start: 104, end: 143, value: blank(40) },
    { start: 144, end: 183, value: blank(40) },
    { start: 184, end: 191, value: zero(8) },
    { start: 192, end: 199, value: zero(8) },
    { start: 200, end: 207, value: zero(8) },
    { start: 208, end: 240, value: blank(33) }
  ]);
}

function montarSegmentoJ(titulo, sequencialRegistro, dataPagamento) {
  const codigoBarras = resolveCodigoBarras(titulo);
  const valor = parseValor(titulo.valor_saldo || titulo.valor_original);
  const parceiroNome = titulo.parceiro?.nome || titulo.descricao || 'FAVORECIDO';

  return createLine([
    { start: 1, end: 3, value: BANCO_CAIXA },
    { start: 4, end: 7, value: LOTE_PAGAMENTOS },
    { start: 8, end: 8, value: TIPO_REGISTRO_DETALHE },
    { start: 9, end: 13, value: numberField(sequencialRegistro, 5) },
    { start: 14, end: 14, value: 'J' },
    { start: 15, end: 15, value: blank(1) },
    { start: 16, end: 17, value: MOVIMENTO_INCLUSAO },
    { start: 18, end: 61, value: numberField(codigoBarras, 44) },
    { start: 62, end: 91, value: textField(parceiroNome, 30) },
    { start: 92, end: 99, value: dateField(titulo.data_vencimento) },
    { start: 100, end: 114, value: moneyField(titulo.valor_original, 15) },
    { start: 115, end: 129, value: zero(15) },
    { start: 130, end: 144, value: zero(15) },
    { start: 145, end: 152, value: dateField(dataPagamento) },
    { start: 153, end: 167, value: moneyField(valor, 15) },
    { start: 168, end: 182, value: zero(15) },
    { start: 183, end: 202, value: textField(titulo.codigo || titulo.numero_documento || titulo.id, 20) },
    { start: 203, end: 222, value: textField(titulo.numero_documento || titulo.codigo || titulo.id, 20) },
    { start: 223, end: 230, value: blank(8) },
    { start: 231, end: 240, value: blank(10) }
  ]);
}

function montarTrailerLote(convenioInput, quantidadeRegistrosLote, titulos = []) {
  const convenio = resolveConvenio(convenioInput);
  const valorTotal = titulos.reduce((sum, titulo) => sum + parseValor(titulo.valor_saldo || titulo.valor_original), 0);
  return createLine([
    { start: 1, end: 3, value: convenio.banco_codigo },
    { start: 4, end: 7, value: LOTE_PAGAMENTOS },
    { start: 8, end: 8, value: TIPO_REGISTRO_TRAILER_LOTE },
    { start: 9, end: 17, value: blank(9) },
    { start: 18, end: 23, value: numberField(quantidadeRegistrosLote, 6) },
    { start: 24, end: 41, value: moneyField(valorTotal, 18) },
    { start: 42, end: 59, value: zero(18) },
    { start: 60, end: 65, value: numberField(titulos.length, 6) },
    { start: 66, end: 230, value: blank(165) },
    { start: 231, end: 240, value: blank(10) }
  ]);
}

function montarTrailerArquivo(convenioInput, quantidadeRegistrosArquivo) {
  const convenio = resolveConvenio(convenioInput);
  return createLine([
    { start: 1, end: 3, value: convenio.banco_codigo },
    { start: 4, end: 7, value: LOTE_TRAILER_ARQUIVO },
    { start: 8, end: 8, value: TIPO_REGISTRO_TRAILER_ARQUIVO },
    { start: 9, end: 17, value: blank(9) },
    { start: 18, end: 23, value: numberField(1, 6) },
    { start: 24, end: 29, value: numberField(quantidadeRegistrosArquivo, 6) },
    { start: 30, end: 35, value: zero(6) },
    { start: 36, end: 240, value: blank(205) }
  ]);
}

function validarTitulosParaRemessa(titulos, convenio, dataPagamento) {
  if (!Array.isArray(titulos) || !titulos.length) {
    throw createHttpError(400, 'Selecione ao menos um titulo elegivel para gerar a remessa.');
  }

  const erros = [];
  titulos.forEach((titulo) => {
    if (titulo.tipo !== 'PAGAR') erros.push(`${titulo.codigo}: titulo nao e de contas a pagar.`);
    if (titulo.status !== 'ABERTO') erros.push(`${titulo.codigo}: titulo nao esta aberto.`);
    if (Number(titulo.empresa_id) !== Number(convenio.empresa_id)) {
      erros.push(`${titulo.codigo}: empresa do titulo diverge da empresa do convenio.`);
    }
    if (parseValor(titulo.valor_saldo || titulo.valor_original) <= 0) {
      erros.push(`${titulo.codigo}: valor em aberto invalido.`);
    }
    if (!resolveCodigoBarras(titulo)) {
      erros.push(`${titulo.codigo}: informe linha digitavel ou codigo de barras para pagamento de boleto.`);
    }
    if (titulo.data_vencimento && dataIso(titulo.data_vencimento) < dataPagamento) {
      // Boleto vencido pode exigir regra bancaria especifica; deixamos bloqueado para evitar rejeicao silenciosa.
      erros.push(`${titulo.codigo}: titulo vencido exige ajuste/renegociacao antes da remessa.`);
    }
  });

  if (erros.length) {
    throw createHttpError(400, 'Existem titulos inconsistentes para remessa Caixa.', { erros });
  }
}

function gerarArquivoCnab240CaixaPagamento({ convenio, titulos, numeroRemessa, dataPagamento, generatedAt = new Date() }) {
  validarConvenio(convenio);
  validarTitulosParaRemessa(titulos, convenio, dataPagamento);

  const lines = [
    montarHeaderArquivo(convenio, numeroRemessa, generatedAt),
    montarHeaderLote(convenio)
  ];

  titulos.forEach((titulo, index) => {
    lines.push(montarSegmentoJ(titulo, index + 1, dataPagamento));
  });

  lines.push(montarTrailerLote(convenio, lines.length + 1, titulos));
  lines.push(montarTrailerArquivo(convenio, lines.length + 1));

  const content = `${lines.join('\r\n')}\r\n`;
  const validation = validateCnab240Lines(lines);

  return {
    content,
    hash: hashCnab(content),
    lines,
    valid: validation.valid,
    validation,
    quantidade_titulos: titulos.length,
    quantidade_registros: lines.length,
    valor_total: titulos.reduce((sum, titulo) => sum + parseValor(titulo.valor_saldo || titulo.valor_original), 0)
  };
}

async function listarConveniosCaixaPagamento() {
  return db.CaixaPagamentoConvenio.findAll({
    include: [
      { model: db.EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome', 'razao_social', 'cnpj'] },
      { model: db.ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'ativo'] }
    ],
    order: [['ativo', 'DESC'], ['id', 'DESC']]
  });
}

async function salvarConvenioCaixaPagamento(data, userId, id = null) {
  const contaBancaria = await db.ContaBancaria.findByPk(data.conta_bancaria_id, {
    include: [{ model: db.EmpresaGrupo, as: 'empresa' }]
  });
  if (!contaBancaria || contaBancaria.ativo === false) {
    throw createHttpError(400, 'Conta bancaria do convenio invalida ou inativa.');
  }
  if (!contaBancaria.empresa_id || !contaBancaria.empresa || contaBancaria.empresa.ativo === false) {
    throw createHttpError(400, 'A conta bancaria do convenio precisa estar vinculada a uma empresa ativa.');
  }

  const payload = {
    empresa_id: Number(contaBancaria.empresa_id),
    conta_bancaria_id: Number(contaBancaria.id),
    banco_codigo: '104',
    banco_nome: data.banco_nome || NOME_CAIXA,
    agencia: data.agencia,
    agencia_dv: data.agencia_dv || null,
    conta: data.conta,
    conta_dv: data.conta_dv || null,
    convenio_codigo: data.convenio_codigo,
    convenio_nome: data.convenio_nome || null,
    compromisso_codigo: data.compromisso_codigo || null,
    compromisso_nome: data.compromisso_nome || null,
    empresa_nome: data.empresa_nome || contaBancaria.empresa.razao_social || contaBancaria.empresa.nome,
    empresa_cpf_cnpj: data.empresa_cpf_cnpj || contaBancaria.empresa.cnpj,
    layout_arquivo_versao: data.layout_arquivo_versao || '080',
    layout_lote_versao: data.layout_lote_versao || '045',
    ambiente: data.ambiente || 'HOMOLOGACAO',
    homologado: Boolean(data.homologado),
    ativo: data.ativo !== false,
    atualizado_por: userId || null
  };

  validarConvenio(payload);

  if (id) {
    const convenio = await db.CaixaPagamentoConvenio.findByPk(id);
    if (!convenio) throw createHttpError(404, 'Convenio Caixa de pagamentos nao encontrado.');
    await convenio.update(payload);
    return convenio.reload({ include: [{ model: db.EmpresaGrupo, as: 'empresa' }, { model: db.ContaBancaria, as: 'contaBancaria' }] });
  }

  return db.CaixaPagamentoConvenio.create({ ...payload, criado_por: userId || null });
}

async function buscarConvenioCompleto(convenioId, options = {}) {
  return db.CaixaPagamentoConvenio.findByPk(convenioId, {
    ...options,
    include: [
      { model: db.EmpresaGrupo, as: 'empresa' },
      { model: db.ContaBancaria, as: 'contaBancaria' }
    ]
  });
}

async function listarTitulosElegiveisCaixaPagamento({ convenio_id }) {
  const convenio = await buscarConvenioCompleto(convenio_id);
  validarConvenio(convenio);

  return db.TituloFinanceiro.findAll({
    where: {
      tipo: 'PAGAR',
      status: 'ABERTO',
      empresa_id: convenio.empresa_id,
      valor_saldo: { [Op.gt]: 0 },
      [Op.or]: [
        { codigo_barras: { [Op.ne]: null } },
        { linha_digitavel: { [Op.ne]: null } }
      ]
    },
    include: [
      { model: db.Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj', 'email', 'telefone'] },
      { model: db.EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome', 'razao_social', 'cnpj'] }
    ],
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']],
    limit: 300
  });
}

function nomeArquivoRemessa(numeroRemessa, generatedAt = new Date()) {
  const date = dataIso(generatedAt).replace(/\D/g, '');
  return `CAIXA_PAG_${date}_${String(numeroRemessa).padStart(6, '0')}.REM`;
}

async function gerarRemessaCaixaPagamento({ convenio_id, titulo_ids = [], data_pagamento, usuario_id }) {
  const dataPagamento = validarDataPagamento(data_pagamento);

  return db.sequelize.transaction(async (transaction) => {
    const convenio = await buscarConvenioCompleto(convenio_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    validarConvenio(convenio);

    const ids = [...new Set((titulo_ids || []).map((id) => Number(id)).filter(Boolean))];
    const titulos = await db.TituloFinanceiro.findAll({
      where: { id: ids },
      include: [
        { model: db.Parceiro, as: 'parceiro' },
        { model: db.EmpresaGrupo, as: 'empresa' }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (titulos.length !== ids.length) {
      throw createHttpError(400, 'Um ou mais titulos selecionados nao foram encontrados.');
    }

    const numeroRemessa = Number(convenio.numero_remessa_atual || 0) + 1;
    const generatedAt = new Date();
    const cnab = gerarArquivoCnab240CaixaPagamento({
      convenio,
      titulos,
      numeroRemessa,
      dataPagamento,
      generatedAt
    });

    if (!cnab.valid) {
      throw createHttpError(400, 'Arquivo CNAB240 gerado com linhas invalidas.', cnab.validation);
    }

    const remessa = await db.CaixaPagamentoRemessa.create({
      convenio_id: convenio.id,
      empresa_id: convenio.empresa_id,
      conta_bancaria_id: convenio.conta_bancaria_id,
      numero_remessa: numeroRemessa,
      nome_arquivo: nomeArquivoRemessa(numeroRemessa, generatedAt),
      status: 'GERADA',
      tipo_pagamento: 'BOLETO_CODIGO_BARRAS',
      quantidade_titulos: cnab.quantidade_titulos,
      quantidade_registros: cnab.quantidade_registros,
      valor_total: cnab.valor_total,
      data_pagamento: dataPagamento,
      cnab_hash: cnab.hash,
      conteudo_cnab: cnab.content,
      homologacao: convenio.ambiente !== 'PRODUCAO' || !convenio.homologado,
      gerado_por: usuario_id || null,
      gerado_em: generatedAt
    }, { transaction });

    await db.CaixaPagamentoRemessaItem.bulkCreate(
      titulos.map((titulo, index) => ({
        remessa_id: remessa.id,
        titulo_financeiro_id: titulo.id,
        parceiro_id: titulo.parceiro_id || null,
        sequencial_lote: index + 1,
        segmento: 'J',
        codigo_barras: resolveCodigoBarras(titulo),
        valor: parseValor(titulo.valor_saldo || titulo.valor_original),
        data_pagamento: dataPagamento,
        status: 'GERADO'
      })),
      { transaction }
    );

    await convenio.update({ numero_remessa_atual: numeroRemessa }, { transaction });

    return remessa.reload({
      transaction,
      include: [
        { model: db.CaixaPagamentoConvenio, as: 'convenio' },
        { model: db.CaixaPagamentoRemessaItem, as: 'itens' }
      ]
    });
  });
}

async function listarRemessasCaixaPagamento() {
  return db.CaixaPagamentoRemessa.findAll({
    include: [
      { model: db.CaixaPagamentoConvenio, as: 'convenio', attributes: ['id', 'convenio_codigo', 'ambiente', 'homologado'] },
      { model: db.EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome', 'razao_social', 'cnpj'] },
      { model: db.ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta'] }
    ],
    order: [['id', 'DESC']],
    limit: 100
  });
}

async function obterRemessaCaixaPagamento(id) {
  const remessa = await db.CaixaPagamentoRemessa.findByPk(id, {
    include: [
      { model: db.CaixaPagamentoConvenio, as: 'convenio' },
      { model: db.CaixaPagamentoRemessaItem, as: 'itens' }
    ]
  });
  if (!remessa) throw createHttpError(404, 'Remessa Caixa de pagamentos nao encontrada.');
  return remessa;
}

module.exports = {
  codigoBarrasFromLinhaDigitavel,
  gerarArquivoCnab240CaixaPagamento,
  gerarRemessaCaixaPagamento,
  listarConveniosCaixaPagamento,
  listarRemessasCaixaPagamento,
  listarTitulosElegiveisCaixaPagamento,
  montarHeaderArquivo,
  montarHeaderLote,
  montarSegmentoJ,
  montarTrailerArquivo,
  montarTrailerLote,
  obterRemessaCaixaPagamento,
  salvarConvenioCaixaPagamento,
  resolveCodigoBarras
};
