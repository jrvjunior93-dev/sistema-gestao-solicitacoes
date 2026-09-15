const PizZip = require('pizzip');
const db = require('../models');
const { gerarRemessaCnab240Caixa } = require('./boletoCaixaCnab240Service');
const { gerarPdfBoletoTitulo } = require('./boletoCaixaService');
const { parseRetornoCnab240Caixa } = require('./boletoCaixaRetornoCnab240Service');
const { registrarEventoSeguranca } = require('./securityLogService');
const { sincronizarStatusSolicitacaoPorBaixaTitulos } = require('./solicitacaoFinanceiroStatusService');
const { sincronizarContratoComercialPorTituloFinanceiro } = require('./comercialService');

const {
  BoletoCaixa,
  BoletoCaixaConvenio,
  BoletoCaixaOcorrencia,
  BoletoCaixaRemessa,
  BoletoCaixaRemessaItem,
  BoletoCaixaRetorno,
  MovimentoFinanceiro,
  Parceiro,
  TituloFinanceiro,
  sequelize
} = db;
const { carregarContaBancaria, obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');

function formatarNumeroArquivo(value) {
  return String(value || 1).padStart(6, '0');
}

function nomeArquivoRemessa(numeroRemessa, date = new Date()) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `CB${ano}${mes}${dia}_${formatarNumeroArquivo(numeroRemessa)}.REM`;
}

function boletoParaCnab(boleto) {
  const plain = typeof boleto.get === 'function' ? boleto.get({ plain: true }) : boleto;
  return {
    ...plain,
    titulo: plain.titulo,
    pagador: plain.pagador,
    numero_documento: plain.titulo?.numero_documento || plain.titulo?.codigo || plain.titulo_financeiro_id,
    data_vencimento: plain.data_vencimento || plain.titulo?.data_vencimento,
    data_emissao: plain.data_emissao || plain.titulo?.data_emissao,
    valor: Number(plain.valor || plain.titulo?.valor_saldo || plain.titulo?.valor_original || 0)
  };
}

function validarBoletosParaRemessa(boletos = [], { convenio = null } = {}) {
  const erros = [];
  const nossosNumeros = new Set();
  const empresaConvenioId = convenio?.empresa_id ? Number(convenio.empresa_id) : null;

  boletos.forEach((boleto) => {
    const plain = typeof boleto.get === 'function' ? boleto.get({ plain: true }) : boleto;
    const label = `Boleto ${plain.id || plain.nosso_numero_base || ''}`.trim();
    const empresaBoletoId = plain.empresa_id ? Number(plain.empresa_id) : null;
    const empresaTituloId = plain.titulo?.empresa_id ? Number(plain.titulo.empresa_id) : null;

    if (!plain.nosso_numero_base && !plain.nosso_numero) {
      erros.push(`${label}: nosso numero ausente.`);
    }

    const nossoNumero = plain.nosso_numero_base || plain.nosso_numero;
    if (nossoNumero && nossosNumeros.has(nossoNumero)) {
      erros.push(`${label}: nosso numero duplicado na remessa.`);
    }
    if (nossoNumero) nossosNumeros.add(nossoNumero);

    if (Number(plain.valor || 0) <= 0) {
      erros.push(`${label}: valor deve ser maior que zero.`);
    }

    if (!plain.data_vencimento) {
      erros.push(`${label}: vencimento obrigatorio.`);
    }

    const pagador = plain.pagador || plain.titulo?.parceiro || {};
    if (!pagador.cpf_cnpj && !pagador.cpf && !pagador.cnpj && !plain.pagador_documento) {
      erros.push(`${label}: CPF/CNPJ do pagador obrigatorio.`);
    }

    if (plain.status_bancario && !['NAO_REMETIDO', 'REJEITADO'].includes(plain.status_bancario)) {
      erros.push(`${label}: status bancario ${plain.status_bancario} nao permite nova remessa de entrada.`);
    }

    if (!empresaBoletoId) {
      erros.push(`${label}: empresa do boleto ausente.`);
    }

    if (!empresaTituloId) {
      erros.push(`${label}: empresa do titulo ausente.`);
    }

    if (empresaBoletoId && empresaTituloId && empresaBoletoId !== empresaTituloId) {
      erros.push(`${label}: empresa do boleto difere da empresa do titulo.`);
    }

    if (empresaConvenioId && empresaBoletoId && empresaBoletoId !== empresaConvenioId) {
      erros.push(`${label}: empresa do boleto difere da empresa do convenio Caixa.`);
    }
  });

  return {
    valido: erros.length === 0,
    erros
  };
}

async function validarConvenioOperacionalCaixa(convenio, transaction) {
  if (!convenio?.empresa_id) {
    throw new Error('Convenio Caixa precisa estar vinculado a empresa do grupo antes da operacao bancaria.');
  }

  if (!convenio.conta_bancaria_id) {
    throw new Error('Convenio Caixa precisa estar vinculado a conta bancaria antes da operacao bancaria.');
  }

  const contaBancaria = await carregarContaBancaria(convenio.conta_bancaria_id, { transaction });
  if (!contaBancaria.empresa_id) {
    throw new Error('Conta bancaria do convenio Caixa precisa estar vinculada a empresa do grupo.');
  }

  const empresaConvenioId = Number(convenio.empresa_id);
  const empresaContaId = Number(contaBancaria.empresa_id);
  if (empresaConvenioId !== empresaContaId) {
    throw new Error('Empresa do convenio Caixa deve ser a mesma empresa vinculada a conta bancaria.');
  }

  return {
    empresaId: empresaConvenioId,
    contaBancaria
  };
}

function safePlain(modelOrObject) {
  return typeof modelOrObject?.get === 'function' ? modelOrObject.get({ plain: true }) : modelOrObject;
}

function csvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function documentoParceiro(parceiro = {}) {
  return parceiro.cpf_cnpj || parceiro.cnpj || parceiro.cpf || '';
}

async function carregarBoletosParaRemessa(boletoIds, transaction) {
  return BoletoCaixa.findAll({
    where: { id: boletoIds },
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo'
      },
      {
        model: Parceiro,
        as: 'pagador'
      }
    ],
    transaction
  });
}

async function carregarRemessaCompleta(remessaId, transaction = null) {
  const id = Number(remessaId || 0);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Remessa Caixa invalida.');
  }

  const remessa = await BoletoCaixaRemessa.findByPk(id, {
    include: [
      {
        model: BoletoCaixaConvenio,
        as: 'convenio',
        include: [
          { model: db.EmpresaGrupo, as: 'empresa' },
          { model: db.ContaBancaria, as: 'contaBancaria' }
        ]
      },
      {
        model: BoletoCaixaRemessaItem,
        as: 'itens',
        include: [
          {
            model: BoletoCaixa,
            as: 'boleto',
            include: [
              { model: TituloFinanceiro, as: 'titulo' },
              { model: Parceiro, as: 'pagador' }
            ]
          }
        ]
      }
    ],
    order: [[{ model: BoletoCaixaRemessaItem, as: 'itens' }, 'sequencial_lote', 'ASC']],
    transaction
  });

  if (!remessa) {
    throw new Error('Remessa Caixa nao encontrada.');
  }

  if (!remessa.convenio) {
    throw new Error('Convenio da remessa Caixa nao encontrado.');
  }

  return remessa;
}

async function regenerarArquivoRemessaCaixa(remessaId) {
  const remessa = await carregarRemessaCompleta(remessaId);
  const plain = safePlain(remessa);
  const boletos = (plain.itens || [])
    .map((item) => item.boleto)
    .filter(Boolean)
    .map(boletoParaCnab);

  if (!boletos.length) {
    throw new Error('Remessa Caixa sem boletos vinculados para regenerar arquivo.');
  }

  const cnab = gerarRemessaCnab240Caixa({
    convenio: plain.convenio,
    boletos,
    numeroRemessa: plain.numero_remessa,
    generatedAt: plain.gerado_em || plain.createdAt || new Date()
  });

  return {
    remessa,
    cnab,
    hash_confere: cnab.hash === plain.cnab_hash
  };
}

async function gerarRelatorioHomologacaoRemessaCaixa(remessaId) {
  const { remessa, cnab, hash_confere: hashConfere } = await regenerarArquivoRemessaCaixa(remessaId);
  const plain = safePlain(remessa);
  const convenio = plain.convenio || {};
  const boletos = (plain.itens || []).map((item) => {
    const boleto = item.boleto || {};
    const titulo = boleto.titulo || {};
    const pagador = boleto.pagador || {};
    return {
      sequencial: item.sequencial_lote,
      boleto_id: boleto.id,
      titulo_financeiro_id: boleto.titulo_financeiro_id || titulo.id,
      numero_documento: titulo.numero_documento || titulo.codigo || boleto.titulo_financeiro_id,
      nosso_numero: boleto.nosso_numero,
      nosso_numero_base: boleto.nosso_numero_base,
      linha_digitavel: boleto.linha_digitavel,
      codigo_barras: boleto.codigo_barras,
      valor: Number(boleto.valor || titulo.valor_saldo || titulo.valor_original || 0),
      vencimento: boleto.data_vencimento || titulo.data_vencimento,
      emissao: boleto.data_emissao || titulo.data_emissao,
      pagador_nome: pagador.nome || pagador.razao_social || pagador.nome_fantasia || '',
      pagador_documento: documentoParceiro(pagador),
      status_bancario: boleto.status_bancario,
      codigo_movimento_remessa: item.codigo_movimento_remessa
    };
  });

  const alertas = [];
  if (!cnab.valid) {
    alertas.push('Arquivo CNAB regenerado possui erros de validacao.');
  }
  if (!hashConfere) {
    alertas.push('Hash regenerado difere do hash armazenado na remessa. Conferir dados alterados apos a geracao.');
  }
  if (!convenio.homologado) {
    alertas.push('Convenio marcado como nao homologado. Manter producao bloqueada ate retorno formal da Caixa.');
  }
  if (!convenio.conta_bancaria_id) {
    alertas.push('Convenio sem conta bancaria vinculada. Retornos liquidados nao baixarao titulos automaticamente.');
  }

  return {
    gerado_em: new Date().toISOString(),
    remessa: {
      id: plain.id,
      numero_remessa: plain.numero_remessa,
      nome_arquivo: plain.nome_arquivo,
      status: plain.status,
      homologacao: Boolean(plain.homologacao),
      quantidade_boletos: plain.quantidade_boletos,
      quantidade_registros: plain.quantidade_registros,
      valor_total: Number(plain.valor_total || 0),
      hash_armazenado: plain.cnab_hash,
      hash_regenerado: cnab.hash,
      hash_confere: hashConfere,
      gerado_em: plain.gerado_em
    },
    convenio: {
      id: convenio.id,
      banco_codigo: convenio.banco_codigo,
      banco_nome: convenio.banco_nome,
      agencia: convenio.agencia,
      agencia_dv: convenio.agencia_dv,
      conta: convenio.conta,
      conta_dv: convenio.conta_dv,
      codigo_beneficiario: convenio.codigo_beneficiario,
      beneficiario_nome: convenio.beneficiario_nome,
      beneficiario_cpf_cnpj: convenio.beneficiario_cpf_cnpj,
      carteira_codigo: convenio.carteira_codigo,
      modalidade_nosso_numero: convenio.modalidade_nosso_numero,
      layout_arquivo_versao: convenio.layout_arquivo_versao,
      layout_lote_versao: convenio.layout_lote_versao,
      ambiente: convenio.ambiente,
      homologado: Boolean(convenio.homologado)
    },
    validacao: {
      cnab_valido: Boolean(cnab.valid),
      erros: cnab.validation?.errors || [],
      quantidade_registros_regenerada: cnab.quantidade_registros,
      quantidade_boletos_regenerada: cnab.quantidade_boletos,
      valor_total_regenerado: cnab.valor_total,
      alertas
    },
    checklist: [
      { item: 'Arquivo REM gerado em CNAB 240', ok: Boolean(cnab.valid) },
      { item: 'Hash do arquivo regenerado confere com a remessa armazenada', ok: hashConfere },
      { item: 'Todos os boletos possuem pagador com CPF/CNPJ', ok: boletos.every((boleto) => Boolean(boleto.pagador_documento)) },
      { item: 'Todos os boletos possuem linha digitavel e codigo de barras', ok: boletos.every((boleto) => Boolean(boleto.linha_digitavel && boleto.codigo_barras)) },
      { item: 'Convenio ainda bloqueado como nao homologado ate aprovacao da Caixa', ok: !convenio.homologado || !plain.homologacao }
    ],
    boletos
  };
}

function relatorioHomologacaoToCsv(relatorio) {
  const header = [
    'sequencial',
    'boleto_id',
    'titulo_financeiro_id',
    'numero_documento',
    'nosso_numero',
    'linha_digitavel',
    'codigo_barras',
    'valor',
    'vencimento',
    'pagador_nome',
    'pagador_documento',
    'status_bancario'
  ];

  const rows = relatorio.boletos.map((boleto) => header.map((field) => csvValue(boleto[field])).join(';'));
  const metadata = [
    ['remessa_id', relatorio.remessa.id],
    ['numero_remessa', relatorio.remessa.numero_remessa],
    ['nome_arquivo', relatorio.remessa.nome_arquivo],
    ['hash_armazenado', relatorio.remessa.hash_armazenado],
    ['hash_regenerado', relatorio.remessa.hash_regenerado],
    ['hash_confere', relatorio.remessa.hash_confere],
    ['cnab_valido', relatorio.validacao.cnab_valido],
    ['valor_total', relatorio.remessa.valor_total]
  ].map((row) => row.map(csvValue).join(';'));

  return [
    'campo;valor',
    ...metadata,
    '',
    header.join(';'),
    ...rows
  ].join('\r\n');
}

function nomeSeguroArquivo(value, fallback = 'arquivo') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || fallback;
}

function montarReadmeHomologacao(relatorio) {
  const linhas = [
    'FLUXY - Pacote de Homologacao Caixa CNAB 240',
    '',
    `Gerado em: ${relatorio.gerado_em}`,
    `Remessa: ${relatorio.remessa.numero_remessa || relatorio.remessa.id}`,
    `Arquivo: ${relatorio.remessa.nome_arquivo}`,
    `Quantidade de boletos: ${relatorio.remessa.quantidade_boletos}`,
    `Valor total: ${relatorio.remessa.valor_total}`,
    `Hash armazenado: ${relatorio.remessa.hash_armazenado || '-'}`,
    `Hash regenerado: ${relatorio.remessa.hash_regenerado || '-'}`,
    `Hash confere: ${relatorio.remessa.hash_confere ? 'SIM' : 'NAO'}`,
    '',
    'Arquivos do pacote:',
    '- remessa/: arquivo CNAB 240 para envio/validacao pela Caixa.',
    '- relatorios/homologacao.csv: resumo operacional dos boletos.',
    '- relatorios/homologacao.json: evidencia tecnica com validacoes.',
    '- pdfs/: demonstrativos dos boletos incluidos na remessa.',
    '',
    'Observacoes:',
    '- Manter emissao em producao bloqueada ate a homologacao formal da Caixa.',
    '- Usar o retorno CNAB devolvido pela Caixa para validar registro/rejeicoes/liquidacoes.',
    '- Conferir convenio, beneficiario, pagador, nosso numero, linha digitavel, codigo de barras, vencimento e valor.'
  ];

  if (relatorio.validacao?.alertas?.length) {
    linhas.push('', 'Alertas:', ...relatorio.validacao.alertas.map((alerta) => `- ${alerta}`));
  }

  return linhas.join('\r\n');
}

async function gerarPacoteHomologacaoRemessaCaixa(req, remessaId) {
  const arquivo = await regenerarArquivoRemessaCaixa(remessaId);
  const relatorio = await gerarRelatorioHomologacaoRemessaCaixa(remessaId);
  const zip = new PizZip();
  const pdfErrors = [];

  zip.file(`remessa/${arquivo.remessa.nome_arquivo}`, arquivo.cnab.content);
  zip.file('relatorios/homologacao.csv', relatorioHomologacaoToCsv(relatorio));
  zip.file('relatorios/homologacao.json', JSON.stringify(relatorio, null, 2));
  zip.file('README.txt', montarReadmeHomologacao(relatorio));

  for (const boleto of relatorio.boletos || []) {
    if (!boleto.titulo_financeiro_id) {
      pdfErrors.push(`Boleto ${boleto.boleto_id || '-'} sem titulo financeiro vinculado.`);
      continue;
    }

    try {
      const pdf = await gerarPdfBoletoTitulo(req, boleto.titulo_financeiro_id, { amostra: false });
      zip.file(`pdfs/${nomeSeguroArquivo(pdf.filename, `boleto-${boleto.boleto_id}.pdf`)}`, pdf.buffer);
    } catch (error) {
      pdfErrors.push(`Boleto ${boleto.boleto_id || '-'} / titulo ${boleto.titulo_financeiro_id}: ${error.message}`);
    }
  }

  if (pdfErrors.length) {
    zip.file('pdfs/ERROS.txt', pdfErrors.join('\r\n'));
  }

  const buffer = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req?.user?.id || null,
    tipoEvento: 'BOLETO_CAIXA_HOMOLOGACAO_PACOTE_GERADO',
    recursoTipo: 'BOLETO_CAIXA_REMESSA',
    recursoId: String(relatorio.remessa.id),
    status: 'SUCCESS',
    descricao: `Pacote de homologacao Caixa gerado para a remessa #${relatorio.remessa.numero_remessa || relatorio.remessa.id}`,
    metadata: JSON.stringify({
      remessa_id: relatorio.remessa.id,
      numero_remessa: relatorio.remessa.numero_remessa,
      quantidade_boletos: relatorio.remessa.quantidade_boletos,
      valor_total: relatorio.remessa.valor_total,
      hash_confere: relatorio.remessa.hash_confere,
      pdfs_com_erro: pdfErrors.length
    })
  });

  return {
    buffer,
    filename: nomeSeguroArquivo(`homologacao-caixa-remessa-${relatorio.remessa.numero_remessa || relatorio.remessa.id}.zip`),
    relatorio
  };
}

async function gerarRemessaParaBoletosCaixa({ convenioId, boletoIds, tituloIds, usuarioId }) {
  const boletoIdList = Array.isArray(boletoIds) ? boletoIds.filter(Boolean) : [];
  const tituloIdList = Array.isArray(tituloIds) ? tituloIds.filter(Boolean) : [];
  if (boletoIdList.length === 0 && tituloIdList.length === 0) {
    throw new Error('Selecione ao menos um boleto Caixa para gerar a remessa.');
  }

  return sequelize.transaction(async (transaction) => {
    const convenio = await BoletoCaixaConvenio.findByPk(convenioId, { transaction });
    if (!convenio || !convenio.ativo) {
      throw new Error('Convenio Caixa ativo nao encontrado.');
    }
    const { empresaId: empresaConvenioId } = await validarConvenioOperacionalCaixa(convenio, transaction);

    const whereBoletos = boletoIdList.length
      ? { id: boletoIdList }
      : { titulo_financeiro_id: tituloIdList, convenio_id: convenio.id };
    const boletos = boletoIdList.length
      ? await carregarBoletosParaRemessa(boletoIdList, transaction)
      : await BoletoCaixa.findAll({
          where: whereBoletos,
          include: [
            { model: TituloFinanceiro, as: 'titulo' },
            { model: Parceiro, as: 'pagador' }
          ],
          transaction
        });

    const expectedCount = boletoIdList.length || tituloIdList.length;
    if (boletos.length !== expectedCount) {
      throw new Error('Um ou mais boletos selecionados nao foram encontrados.');
    }

    const validacao = validarBoletosParaRemessa(boletos, { convenio });
    if (!validacao.valido) {
      throw new Error(validacao.erros.join(' '));
    }

    const numeroRemessa = Number(convenio.numero_remessa_atual || 0) + 1;
    const generatedAt = new Date();
    const remessaCnab = gerarRemessaCnab240Caixa({
      convenio: convenio.get({ plain: true }),
      boletos: boletos.map(boletoParaCnab),
      numeroRemessa,
      generatedAt
    });

    if (!remessaCnab.valid) {
      throw new Error(`Remessa CNAB invalida: ${remessaCnab.validation.errors.join(' ')}`);
    }

    const remessa = await BoletoCaixaRemessa.create(
      {
        convenio_id: convenio.id,
        empresa_id: empresaConvenioId,
        numero_remessa: numeroRemessa,
        nome_arquivo: nomeArquivoRemessa(numeroRemessa, generatedAt),
        status: 'GERADA',
        quantidade_boletos: remessaCnab.quantidade_boletos,
        quantidade_registros: remessaCnab.quantidade_registros,
        valor_total: remessaCnab.valor_total,
        cnab_hash: remessaCnab.hash,
        homologacao: !convenio.homologado,
        gerado_por: usuarioId || null,
        gerado_em: generatedAt
      },
      { transaction }
    );

    await Promise.all(
      boletos.map((boleto, index) =>
        BoletoCaixaRemessaItem.create(
          {
            remessa_id: remessa.id,
            boleto_id: boleto.id,
            titulo_financeiro_id: boleto.titulo_financeiro_id,
            sequencial_lote: index + 1,
            codigo_movimento_remessa: '01',
            status: 'INCLUIDO'
          },
          { transaction }
        )
      )
    );

    await BoletoCaixa.update(
      {
        status_bancario: 'REMETIDO',
        remessa_inclusao_id: remessa.id,
        ultimo_codigo_movimento: '01',
        atualizado_por: usuarioId || null
      },
      {
        where: { id: boletos.map((boleto) => boleto.id) },
        transaction
      }
    );

    await convenio.update({ numero_remessa_atual: numeroRemessa, atualizado_por: usuarioId || null }, { transaction });

    return {
      remessa,
      cnab: remessaCnab.content,
      hash: remessaCnab.hash,
      validation: remessaCnab.validation
    };
  });
}

function statusBancarioPorOcorrencia(tipo) {
  if (tipo === 'ENTRADA_CONFIRMADA') return 'REGISTRADO';
  if (tipo === 'LIQUIDACAO') return 'LIQUIDADO';
  if (tipo === 'BAIXA') return 'BAIXADO';
  if (tipo === 'REJEICAO') return 'REJEITADO';
  return 'OCORRENCIA';
}

function getHoje() {
  return new Date().toISOString().slice(0, 10);
}

function roundCurrency(value) {
  const number = Number(value || 0);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function calcularStatusTitulo({ valorOriginal, valorBaixado }) {
  const saldo = roundCurrency(valorOriginal - valorBaixado);
  if (saldo <= 0) {
    return { status: 'QUITADO', valor_saldo: 0 };
  }
  return { status: 'PARCIAL', valor_saldo: saldo };
}

function mensagemErro(error) {
  return String(error?.message || error || 'Erro ao aplicar baixa financeira.').slice(0, 1000);
}

async function marcarOcorrenciaSemBaixa(ocorrenciaCriada, statusAplicacao, erroMensagem, transaction) {
  await ocorrenciaCriada.update(
    {
      status_aplicacao: statusAplicacao,
      erro_mensagem: erroMensagem || null
    },
    { transaction }
  );

  return {
    aplicada: false,
    status_aplicacao: statusAplicacao,
    erro_mensagem: erroMensagem || null
  };
}

async function aplicarBaixaFinanceiraPorLiquidacao({ boleto, convenio, retorno, ocorrenciaCriada, ocorrencia, usuarioId, transaction }) {
  if (ocorrencia.tipo !== 'LIQUIDACAO') {
    return { aplicada: false, status_aplicacao: ocorrenciaCriada.status_aplicacao };
  }

  if (!boleto || !boleto.titulo_financeiro_id) {
    return marcarOcorrenciaSemBaixa(
      ocorrenciaCriada,
      'PENDENTE_TITULO',
      'Ocorrencia de liquidacao sem boleto ou titulo financeiro vinculado.',
      transaction
    );
  }

  if (ocorrenciaCriada.movimento_financeiro_id) {
    return { aplicada: false, status_aplicacao: 'BAIXADO_FINANCEIRO' };
  }

  if (!convenio.conta_bancaria_id) {
    return marcarOcorrenciaSemBaixa(
      ocorrenciaCriada,
      'PENDENTE_CONTA_BANCARIA',
      'Convenio Caixa sem conta bancaria vinculada para registrar a baixa.',
      transaction
    );
  }

  try {
    const titulo = await TituloFinanceiro.findByPk(boleto.titulo_financeiro_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!titulo) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'PENDENTE_TITULO',
        'Titulo financeiro vinculado ao boleto nao foi encontrado.',
        transaction
      );
    }

    if (String(titulo.tipo || '').toUpperCase() !== 'RECEBER') {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'IGNORADO_TIPO_TITULO',
        'Somente titulos a receber sao baixados automaticamente pelo retorno de boleto.',
        transaction
      );
    }

    const statusAtual = String(titulo.status || '').toUpperCase();
    const saldoAtual = roundCurrency(titulo.valor_saldo);
    if (!['ABERTO', 'PARCIAL'].includes(statusAtual) || saldoAtual <= 0) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'IGNORADO_TITULO_QUITADO',
        'Titulo nao esta em aberto/parcial ou ja nao possui saldo para baixa.',
        transaction
      );
    }

    const documentoReferencia = `RETORNO_CAIXA:${retorno.id}:OCORRENCIA:${ocorrenciaCriada.id}`;
    const movimentoExistente = await MovimentoFinanceiro.findOne({
      where: { documento_referencia: documentoReferencia },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (movimentoExistente) {
      await ocorrenciaCriada.update(
        {
          movimento_financeiro_id: movimentoExistente.id,
          status_aplicacao: 'BAIXADO_FINANCEIRO',
          erro_mensagem: null
        },
        { transaction }
      );
      return { aplicada: false, status_aplicacao: 'BAIXADO_FINANCEIRO' };
    }

    const valorPago = roundCurrency(Math.max(
      Number(ocorrencia.valor_pago || 0),
      Number(ocorrencia.valor_liquido || 0)
    ));
    if (valorPago <= 0) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'ERRO_BAIXA_FINANCEIRA',
        'Valor pago no retorno Caixa esta zerado ou invalido.',
        transaction
      );
    }

    const valorPrincipal = Math.min(valorPago, saldoAtual);
    const juros = roundCurrency(Math.max(valorPago - valorPrincipal, 0));
    const dataMovimento = ocorrencia.data_credito || ocorrencia.data_ocorrencia || getHoje();
    const contaBancaria = await carregarContaBancaria(convenio.conta_bancaria_id, { transaction });
    const empresaContaId = contaBancaria.empresa_id ? Number(contaBancaria.empresa_id) : null;
    const empresaTituloId = titulo.empresa_id ? Number(titulo.empresa_id) : null;
    const empresaConvenioId = convenio.empresa_id ? Number(convenio.empresa_id) : null;

    if (!empresaContaId) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'ERRO_CONFIGURACAO_CONTA',
        'A conta bancaria do convenio nao possui empresa vinculada. Corrija o cadastro antes de aplicar a baixa.',
        transaction
      );
    }

    if (!empresaTituloId) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'PENDENTE_TITULO',
        'Titulo sem empresa vinculada. Corrija a empresa do titulo antes de aplicar a baixa por retorno bancario.',
        transaction
      );
    }

    if (empresaConvenioId && empresaConvenioId !== empresaContaId) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'ERRO_CONFIGURACAO_CONVENIO',
        'A empresa do convenio Caixa deve ser a mesma empresa vinculada a conta bancaria do recebimento.',
        transaction
      );
    }

    if (empresaTituloId !== empresaContaId) {
      return marcarOcorrenciaSemBaixa(
        ocorrenciaCriada,
        'PENDENTE_INTERCOMPANY',
        'Retorno bancario recebido em conta de empresa diferente da empresa do titulo. Registre baixa Entre Empresas manual para manter rastreabilidade.',
        transaction
      );
    }

    const caixaSessao = await obterSessaoAbertaParaConta(contaBancaria, dataMovimento, { transaction });
    const novoValorBaixado = roundCurrency(Number(titulo.valor_baixado || 0) + valorPrincipal);
    const novoEstado = calcularStatusTitulo({
      valorOriginal: Number(titulo.valor_original || 0),
      valorBaixado: novoValorBaixado
    });

    const movimento = await MovimentoFinanceiro.create(
      {
        titulo_financeiro_id: titulo.id,
        conta_bancaria_id: contaBancaria.id,
        empresa_id: empresaContaId,
        caixa_sessao_id: caixaSessao?.id || null,
        forma_recebimento: 'BOLETO',
        documento_referencia: documentoReferencia,
        tipo_movimento: 'BAIXA',
        status: 'ATIVO',
        valor: valorPrincipal,
        juros,
        multa: 0,
        desconto: 0,
        valor_quitacao: valorPago,
        data_movimento: dataMovimento,
        observacoes: `Baixa automatica por retorno Caixa ${retorno.nome_arquivo || retorno.id}. Nosso numero ${ocorrencia.nosso_numero || boleto.nosso_numero_base}.`,
        criado_por: usuarioId || null
      },
      { transaction }
    );

    await titulo.update(
      {
        valor_baixado: novoValorBaixado,
        valor_saldo: novoEstado.valor_saldo,
        status: novoEstado.status,
        data_quitacao: novoEstado.status === 'QUITADO' ? dataMovimento : null,
        status_cobranca: titulo.forma_cobranca ? 'CONCILIADO' : titulo.status_cobranca,
        atualizado_por: usuarioId || null
      },
      { transaction }
    );

    await sincronizarContratoComercialPorTituloFinanceiro({
      tituloId: titulo.id,
      usuarioId: usuarioId || null,
      transaction,
      motivo: 'LIQUIDACAO_RETORNO_BANCARIO'
    });

    await sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId: titulo.solicitacao_id,
      usuarioId: usuarioId || null,
      setor: 'FINANCEIRO',
      transaction,
      observacao: 'Status atualizado automaticamente apos baixa por retorno bancario.'
    });

    await ocorrenciaCriada.update(
      {
        movimento_financeiro_id: movimento.id,
        status_aplicacao: 'BAIXADO_FINANCEIRO',
        erro_mensagem: null
      },
      { transaction }
    );

    return {
      aplicada: true,
      status_aplicacao: 'BAIXADO_FINANCEIRO',
      movimento
    };
  } catch (error) {
    return marcarOcorrenciaSemBaixa(
      ocorrenciaCriada,
      'ERRO_BAIXA_FINANCEIRA',
      mensagemErro(error),
      transaction
    );
  }
}

async function importarRetornoCnab240Caixa({ convenioId, content, nomeArquivo, usuarioId }) {
  const parsed = parseRetornoCnab240Caixa(content);
  if (!parsed.valid) {
    throw new Error(`Retorno CNAB invalido: ${parsed.validation.errors.join(' ')}`);
  }

  return sequelize.transaction(async (transaction) => {
    const existente = await BoletoCaixaRetorno.findOne({
      where: { arquivo_hash: parsed.hash },
      transaction
    });

    if (existente) {
      return {
        duplicate: true,
        retorno: existente,
        parsed
      };
    }

    const convenio = await BoletoCaixaConvenio.findByPk(convenioId, { transaction });
    if (!convenio) {
      throw new Error('Convenio Caixa nao encontrado para importar retorno.');
    }
    const { empresaId: empresaConvenioId } = await validarConvenioOperacionalCaixa(convenio, transaction);

    const valorLiquidado = parsed.ocorrencias
      .filter((ocorrencia) => ocorrencia.tipo === 'LIQUIDACAO')
      .reduce((total, ocorrencia) => total + Number(ocorrencia.valor_liquido || ocorrencia.valor_pago || 0), 0);

    const retorno = await BoletoCaixaRetorno.create(
      {
        convenio_id: convenio.id,
        empresa_id: empresaConvenioId,
        nome_arquivo: nomeArquivo || 'RETORNO_CAIXA.RET',
        status: 'IMPORTADO',
        arquivo_hash: parsed.hash,
        quantidade_registros: parsed.quantidade_linhas,
        quantidade_ocorrencias: parsed.ocorrencias.length,
        valor_liquidado: valorLiquidado,
        processado_por: usuarioId || null,
        processado_em: new Date()
      },
      { transaction }
    );

    const ocorrenciasCriadas = [];
    let baixasAplicadas = 0;
    for (const ocorrencia of parsed.ocorrencias) {
      const boleto = ocorrencia.nosso_numero
        ? await BoletoCaixa.findOne({
            where: {
              [db.Sequelize.Op.or]: [
                { nosso_numero_base: ocorrencia.nosso_numero },
                { nosso_numero: ocorrencia.nosso_numero }
              ]
            },
            transaction
          })
        : null;

      const ocorrenciaCriada = await BoletoCaixaOcorrencia.create(
        {
          retorno_id: retorno.id,
          boleto_id: boleto?.id || null,
          titulo_financeiro_id: boleto?.titulo_financeiro_id || null,
          nosso_numero_base: ocorrencia.nosso_numero || null,
          codigo_movimento: ocorrencia.codigo_ocorrencia,
          descricao_movimento: ocorrencia.descricao_ocorrencia,
          motivos: ocorrencia.motivos_ocorrencia || null,
          segmento_t_json: ocorrencia.segmento_t || null,
          segmento_u_json: ocorrencia.segmento_u || null,
          data_ocorrencia: ocorrencia.data_ocorrencia || null,
          data_credito: ocorrencia.data_credito || null,
          valor_pago: ocorrencia.valor_pago || 0,
          valor_liquido: ocorrencia.valor_liquido || 0,
          valor_tarifa: ocorrencia.segmento_t?.valor_tarifa_custas || 0,
          status_aplicacao: boleto ? 'APLICADO_BOLETO' : 'PENDENTE_BOLETO'
        },
        { transaction }
      );

      ocorrenciasCriadas.push(ocorrenciaCriada);

      if (boleto) {
        const statusBancario = statusBancarioPorOcorrencia(ocorrencia.tipo);
        await boleto.update(
          {
            status_bancario: statusBancario,
            retorno_confirmacao_id: ocorrencia.tipo === 'ENTRADA_CONFIRMADA' ? retorno.id : boleto.retorno_confirmacao_id,
            retorno_liquidacao_id: ocorrencia.tipo === 'LIQUIDACAO' ? retorno.id : boleto.retorno_liquidacao_id,
            data_registro: ocorrencia.tipo === 'ENTRADA_CONFIRMADA' ? ocorrencia.data_ocorrencia : boleto.data_registro,
            data_liquidacao: ocorrencia.tipo === 'LIQUIDACAO' ? ocorrencia.data_ocorrencia : boleto.data_liquidacao,
            data_baixa: ocorrencia.tipo === 'BAIXA' ? ocorrencia.data_ocorrencia : boleto.data_baixa,
            ultimo_codigo_movimento: ocorrencia.codigo_ocorrencia,
            ultimo_motivo_ocorrencia: ocorrencia.motivos_ocorrencia || ocorrencia.descricao_ocorrencia
          },
          { transaction }
        );
      }

      const resultadoBaixa = await aplicarBaixaFinanceiraPorLiquidacao({
        boleto,
        convenio,
        retorno,
        ocorrenciaCriada,
        ocorrencia,
        usuarioId,
        transaction
      });

      if (resultadoBaixa.aplicada) {
        baixasAplicadas += 1;
      }
    }

    return {
      duplicate: false,
      retorno,
      baixas_aplicadas: baixasAplicadas,
      ocorrencias: ocorrenciasCriadas,
      parsed
    };
  });
}

module.exports = {
  boletoParaCnab,
  aplicarBaixaFinanceiraPorLiquidacao,
  gerarPacoteHomologacaoRemessaCaixa,
  gerarRelatorioHomologacaoRemessaCaixa,
  gerarRemessaParaBoletosCaixa,
  importarRetornoCnab240Caixa,
  nomeArquivoRemessa,
  regenerarArquivoRemessaCaixa,
  relatorioHomologacaoToCsv,
  statusBancarioPorOcorrencia,
  validarBoletosParaRemessa
};
