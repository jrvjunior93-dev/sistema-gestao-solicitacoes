const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const {
  sequelize,
  Obra,
  Apropriacao,
  Solicitacao,
  SolicitacaoApropriacao,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  MovimentoFinanceiro,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManualApropriacao,
  ContratoApropriacao,
  ObraCustoHistorico
} = require('../src/models');
const { distribuirPorApropriacao } = require('../src/services/obraGestaoApropriacaoService');

const CODIGOS_PADRAO = [
  '5', '6', '7', '8', '10', '11', '12', '14', '16', '18', '19', '20',
  '22', '23', '24', '25', '28', '29', '31', '33', '48', '99909'
];

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.slice(2).find((item) => item.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : null;
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Number(asNumber(value).toFixed(2));
}

function add(map, key, value = 1) {
  const id = Number(key || 0);
  if (!id) return;
  map.set(id, roundCurrency((map.get(id) || 0) + asNumber(value)));
}

function countByApropriacao(rows = []) {
  const map = new Map();
  rows.forEach((item) => add(map, item.apropriacao_id));
  return map;
}

function validarSaida(value) {
  const resolved = path.resolve(value || 'auditoria-apropriacoes-base.json');
  if (path.extname(resolved).toLowerCase() !== '.json') {
    throw new Error('A saida da auditoria precisa usar extensao .json.');
  }
  return resolved;
}

async function executar() {
  const codigos = (argumento('codigos-obras') || CODIGOS_PADRAO.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const saida = validarSaida(argumento('saida'));

  const obras = await Obra.findAll({
    where: { codigo: { [Op.in]: codigos } },
    attributes: ['id', 'codigo', 'nome'],
    order: [['codigo', 'ASC']]
  });
  const obraIds = obras.map((item) => Number(item.id));
  const codigosEncontrados = new Set(obras.map((item) => String(item.codigo || '').trim()));
  const codigosNaoEncontrados = codigos.filter((codigo) => !codigosEncontrados.has(codigo));
  if (!obraIds.length) {
    throw new Error('Nenhuma obra foi encontrada para os codigos informados.');
  }

  const apropriacoes = await Apropriacao.findAll({
    where: { obra_id: { [Op.in]: obraIds } },
    attributes: ['id', 'obra_id', 'codigo', 'descricao', 'valor_orcado', 'somadora', 'apropriacao_pai_id', 'ativo', 'createdAt', 'updatedAt'],
    order: [['obra_id', 'ASC'], ['codigo', 'ASC'], ['id', 'ASC']]
  });
  const apropriacaoIds = apropriacoes.map((item) => Number(item.id));
  const whereApropriacao = { apropriacao_id: { [Op.in]: apropriacaoIds } };

  const [
    solicitacoes,
    titulos,
    solicitacaoRateios,
    tituloRateios,
    compraItens,
    compraItensManuais,
    compraRateios,
    compraRateiosManuais,
    contratoVinculos,
    custosHistoricos
  ] = await Promise.all([
    Solicitacao.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      attributes: ['id', 'obra_id', 'apropriacao_id'],
      include: [{
        model: SolicitacaoApropriacao,
        as: 'apropriacoes',
        required: false,
        attributes: ['id', 'apropriacao_id', 'percentual', 'quantidade', 'valor_rateio']
      }]
    }),
    TituloFinanceiro.findAll({
      where: { obra_id: { [Op.in]: obraIds }, tipo: 'PAGAR' },
      attributes: ['id', 'obra_id', 'solicitacao_id', 'apropriacao_id'],
      include: [
        {
          model: MovimentoFinanceiro,
          as: 'movimentos',
          required: false,
          where: { status: 'ATIVO' },
          attributes: ['id', 'valor', 'valor_quitacao', 'status']
        },
        {
          model: TituloFinanceiroRateio,
          as: 'rateios',
          required: false,
          attributes: ['id', 'obra_id', 'apropriacao_id', 'percentual', 'valor_rateio']
        }
      ]
    }),
    SolicitacaoApropriacao.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    TituloFinanceiroRateio.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    SolicitacaoCompraItem.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    SolicitacaoCompraItemManual.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    SolicitacaoCompraItemApropriacao.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    SolicitacaoCompraItemManualApropriacao.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    ContratoApropriacao.findAll({ where: whereApropriacao, attributes: ['apropriacao_id'] }),
    ObraCustoHistorico.findAll({
      where: { obra_id: { [Op.in]: obraIds }, ativo: true, tipo: 'PAGAR' },
      attributes: ['obra_id', 'valor']
    })
  ]);

  const solicitacoesPorId = new Map(solicitacoes.map((item) => [Number(item.id), item]));
  const valorPagoPorApropriacao = new Map();
  const valorPagoSemApropriacaoPorObra = new Map();
  titulos.forEach((titulo) => {
    const pago = roundCurrency((titulo.movimentos || []).reduce(
      (total, item) => total + asNumber(item.valor_quitacao || item.valor),
      0
    ));
    if (pago <= 0) return;
    const solicitacao = titulo.solicitacao_id
      ? solicitacoesPorId.get(Number(titulo.solicitacao_id))
      : null;
    distribuirPorApropriacao({ valor: pago, titulo, solicitacao }).forEach((rateio) => {
      if (rateio.apropriacao_id) {
        add(valorPagoPorApropriacao, rateio.apropriacao_id, rateio.valor);
      } else {
        add(valorPagoSemApropriacaoPorObra, rateio.obra_id || titulo.obra_id, rateio.valor);
      }
    });
  });
  const contagens = {
    solicitacoes_diretas: countByApropriacao(solicitacoes),
    solicitacoes_rateios: countByApropriacao(solicitacaoRateios),
    titulos_diretos: countByApropriacao(titulos),
    titulos_rateios: countByApropriacao(tituloRateios),
    compras_itens: countByApropriacao(compraItens),
    compras_itens_manuais: countByApropriacao(compraItensManuais),
    compras_rateios: countByApropriacao(compraRateios),
    compras_rateios_manuais: countByApropriacao(compraRateiosManuais),
    contratos: countByApropriacao(contratoVinculos)
  };

  const obrasPorId = new Map(obras.map((item) => [Number(item.id), item]));
  const registros = apropriacoes.map((item) => {
    const id = Number(item.id);
    const obra = obrasPorId.get(Number(item.obra_id));
    const vinculos = Object.fromEntries(
      Object.entries(contagens).map(([nome, map]) => [nome, Number(map.get(id) || 0)])
    );
    return {
      obra_id: Number(item.obra_id),
      codigo_obra: String(obra?.codigo || '').trim(),
      obra_nome: obra?.nome || '',
      apropriacao_id: id,
      codigo: String(item.codigo || '').trim(),
      descricao: item.descricao || '',
      valor_orcado: roundCurrency(item.valor_orcado),
      somadora: Boolean(item.somadora),
      apropriacao_pai_id: item.apropriacao_pai_id ? Number(item.apropriacao_pai_id) : null,
      ativo: Boolean(item.ativo),
      valor_pago_apropriado: roundCurrency(valorPagoPorApropriacao.get(id) || 0),
      total_vinculos: Object.values(vinculos).reduce((total, value) => total + value, 0),
      vinculos,
      criado_em: item.createdAt || null,
      atualizado_em: item.updatedAt || null
    };
  });
  const historicoLegadoPorObra = new Map();
  custosHistoricos.forEach((item) => add(historicoLegadoPorObra, item.obra_id, item.valor));
  const resumoObras = obras.map((obra) => ({
    obra_id: Number(obra.id),
    codigo_obra: String(obra.codigo || '').trim(),
    obra_nome: obra.nome,
    valor_historico_legado_sem_apropriacao: roundCurrency(historicoLegadoPorObra.get(Number(obra.id)) || 0),
    valor_titulos_sem_apropriacao: roundCurrency(valorPagoSemApropriacaoPorObra.get(Number(obra.id)) || 0)
  }));

  const payload = {
    gerado_em_utc: new Date().toISOString(),
    somente_leitura: true,
    codigos_solicitados: codigos,
    codigos_nao_encontrados: codigosNaoEncontrados,
    quantidade_obras: obras.length,
    quantidade_apropriacoes: registros.length,
    obras: resumoObras,
    apropriacoes: registros
  };

  await fs.mkdir(path.dirname(saida), { recursive: true });
  await fs.writeFile(saida, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    aplicado: false,
    somente_leitura: true,
    saida,
    quantidade_obras: payload.quantidade_obras,
    quantidade_apropriacoes: payload.quantidade_apropriacoes,
    codigos_nao_encontrados: codigosNaoEncontrados
  }, null, 2));
}

executar()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
