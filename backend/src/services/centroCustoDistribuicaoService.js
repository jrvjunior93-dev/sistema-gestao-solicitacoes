'use strict';

const { Op } = require('sequelize');
const { Obra, UsuarioObra, ConfiguracaoSistema, sequelize } = require('../models');
const { isObraCentroCusto, TIPO_CENTRO_CUSTO_OBRA, TIPO_CENTRO_CUSTO_ADMINISTRATIVO } = require('../constants/centroCusto');
const { obterTokensSetoresUsuario } = require('./usuariosSetores');
const { userHasSetorCapability } = require('./setorCapabilityService');

const CRITERIOS_DISTRIBUICAO = Object.freeze({
  PERCENTUAL: 'PERCENTUAL',
  VALOR: 'VALOR',
  TODAS: 'TODAS'
});

function erroNegocio(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function normalizarToken(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tokensDoCadastro(cadastro) {
  return new Set([
    normalizarToken(cadastro?.codigo),
    normalizarToken(cadastro?.nome)
  ].filter(Boolean).flatMap((token) => [token, ...token.split('_')]));
}

function centroCustoPermiteTodasPrivadas(centroCusto) {
  const tokens = tokensDoCadastro(centroCusto);
  return tokens.has('MARKETING') || tokens.has('COMERCIAL');
}

function centroCustoPermiteTodasObras(centroCusto) {
  const tokens = tokensDoCadastro(centroCusto);
  return ['ADMINISTRATIVO', 'ADMINISTRATIVA', 'ESCRITORIO', 'DP', 'RH', 'DEPARTAMENTO_PESSOAL'].some(token => tokens.has(token));
}

async function lerConfiguracao(centroCustoId, transaction = null) {
  const registro = await ConfiguracaoSistema.findOne({ where: { chave: `CENTRO_CUSTO_OBRAS_DISTRIBUICAO_${Number(centroCustoId)}` }, transaction });
  if (!registro) return { obras_ids: null };
  try {
    const valor = JSON.parse(registro.valor);
    if (valor.obras_ids === null || (Array.isArray(valor.obras_ids) && valor.obras_ids.every(id => Number.isInteger(id) && id > 0))) return valor;
  } catch { /* Configuracao invalida nao pode ampliar o escopo. */ }
  throw erroNegocio('Configuracao de obras do centro de custo invalida. Solicite a revisao ao administrador.', 409);
}

function filtroDestinosAtivos(centro, incluirCentrosCusto = false) {
  const obras = { tipo_centro_custo: TIPO_CENTRO_CUSTO_OBRA };
  if (centroCustoPermiteTodasPrivadas(centro)) obras.classificacao = 'PRIVADA';
  // Opt-in gerencial. A prestacao de contas de adiantamentos conserva apenas obras.
  return incluirCentrosCusto
    ? { ativo: true, [Op.or]: [obras, { tipo_centro_custo: TIPO_CENTRO_CUSTO_ADMINISTRATIVO }] }
    : { ativo: true, ...obras };
}

async function configurarObrasDistribuicao(centroCustoId, payload, usuario) {
  if (normalizarToken(usuario?.perfil) !== 'SUPERADMIN') throw erroNegocio('Somente SUPERADMIN pode configurar as obras de distribuicao.', 403);
  const ids = payload?.obras_ids;
  if (ids !== null && (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length)) {
    throw erroNegocio('Informe obras ou centros de custo distintos e validos ou todos os destinos elegiveis.');
  }
  return sequelize.transaction(async transaction => {
    const centro = await carregarCentroCusto(centroCustoId, transaction);
    // Lock do cadastro serializa inclusive a primeira criacao da chave.
    await Obra.findByPk(centro.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (ids?.length) {
      const where = { ...filtroDestinosAtivos(centro, true), id: { [Op.in]: ids } };
      if (await Obra.count({ where, transaction }) !== ids.length) throw erroNegocio('Selecione somente obras ou centros de custo ativos elegiveis para este centro de custo.');
    }
    const chave = `CENTRO_CUSTO_OBRAS_DISTRIBUICAO_${centro.id}`;
    const valor = JSON.stringify({ obras_ids: ids === null ? null : [...ids].sort((a, b) => a - b) });
    const atual = await ConfiguracaoSistema.findOne({ where: { chave }, transaction, lock: transaction.LOCK.UPDATE });
    if (atual) await atual.update({ valor }, { transaction });
    else await ConfiguracaoSistema.create({ chave, valor }, { transaction });
    return JSON.parse(valor);
  });
}

async function contextoConfiguracao(centroCustoId, usuario) {
  if (normalizarToken(usuario?.perfil) !== 'SUPERADMIN') throw erroNegocio('Acesso negado.', 403);
  const centro = await carregarCentroCusto(centroCustoId);
  const where = filtroDestinosAtivos(centro, true);
  return { ...await lerConfiguracao(centro.id), obras: await Obra.findAll({ where, attributes: ['id', 'codigo', 'nome', 'classificacao', 'tipo_centro_custo'], order: [['nome', 'ASC']] }) };
}

async function carregarCentroCusto(centroCustoId, transaction = null) {
  const id = Number(centroCustoId);
  if (!Number.isInteger(id) || id <= 0) throw erroNegocio('Centro de custo invalido.');
  const centroCusto = await Obra.findByPk(id, {
    attributes: ['id', 'codigo', 'nome', 'ativo', 'tipo_centro_custo'],
    transaction
  });
  if (!centroCusto || centroCusto.ativo === false || isObraCentroCusto(centroCusto.tipo_centro_custo)) {
    throw erroNegocio('Centro de custo nao encontrado ou inativo.', 404);
  }
  return centroCusto;
}

async function listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction = null, incluirCentrosCusto = false }) {
  const centroCusto = await carregarCentroCusto(centroCustoId, transaction);
  const auth = require('./authorizationService');
  if (!await auth.hasObraAccess(usuario, centroCusto.id) && !await auth.userCanCreateInAllObras(usuario)) {
    throw erroNegocio('Acesso negado a este centro de custo.', 403);
  }
  const perfil = normalizarToken(usuario?.perfil);
  const [tokensSetor, possuiCapacidadeObra] = await Promise.all([
    obterTokensSetoresUsuario(usuario),
    userHasSetorCapability(usuario, 'eh_setor_obra')
  ]);
  const usuarioDoSetorObra = possuiCapacidadeObra
    || tokensSetor.map(normalizarToken).includes('OBRA');
  const somentePrivadas = centroCustoPermiteTodasPrivadas(centroCusto);
  const podeListarPrivadas = somentePrivadas && !usuarioDoSetorObra;
  const configuracao = await lerConfiguracao(centroCustoId, transaction);

  const deveRestringirVinculadas = usuarioDoSetorObra
    || (perfil !== 'SUPERADMIN' && !podeListarPrivadas && !centroCustoPermiteTodasObras(centroCusto) && configuracao.obras_ids === null);

  let idsVinculados = null;
  if (deveRestringirVinculadas) {
    const vinculos = await UsuarioObra.findAll({
      where: { user_id: Number(usuario?.id) || -1 },
      attributes: ['obra_id'],
      transaction
    });
    idsVinculados = [...new Set(vinculos.map((item) => Number(item.obra_id)).filter(Boolean))];
  }

  const where = filtroDestinosAtivos(centroCusto, incluirCentrosCusto);
  if (configuracao.obras_ids !== null) {
    const elegiveis = idsVinculados ? configuracao.obras_ids.filter(id => idsVinculados.includes(id)) : configuracao.obras_ids;
    idsVinculados = elegiveis;
  }
  if (idsVinculados) where.id = idsVinculados.length ? { [Op.in]: idsVinculados } : -1;

  const obras = await Obra.findAll({
    where,
    attributes: ['id', 'codigo', 'nome', 'cidade', 'classificacao', 'tipo_centro_custo'],
    order: [['codigo', 'ASC'], ['nome', 'ASC']],
    transaction
  });

  return {
    centro_custo: centroCusto.get({ plain: true }),
    regra: configuracao.obras_ids !== null ? 'CONFIGURADAS_CENTRO_CUSTO' : somentePrivadas
      ? 'TODAS_PRIVADAS'
      : (deveRestringirVinculadas ? 'VINCULADAS_USUARIO' : 'TODAS'),
    obras: obras.map((obra) => obra.get({ plain: true }))
  };
}

function decimalParaCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  const texto = String(valor).trim().replace(/[^\d,.-]/g, '');
  if (!texto) return null;
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

function normalizarNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(String(valor).replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

async function validarDistribuicaoCentroCusto({
  centroCustoId,
  usuario,
  valorTotal,
  distribuicao,
  transaction = null
}) {
  const totalCentavos = decimalParaCentavos(valorTotal);
  if (!totalCentavos || totalCentavos <= 0) {
    throw erroNegocio('Informe um valor total maior que zero para distribuir o custo do centro de custo.');
  }

  if (distribuicao?.todas === true || normalizarToken(distribuicao?.abrangencia) === 'TODAS') {
    const elegibilidade = await listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction, incluirCentrosCusto: true });
    return {
      ...elegibilidade,
      criterio: CRITERIOS_DISTRIBUICAO.TODAS,
      linhas: [{
        obra_id: null,
        abrangencia: 'TODAS',
        criterio: CRITERIOS_DISTRIBUICAO.TODAS,
        percentual: 100,
        valor_distribuido: totalCentavos / 100
      }]
    };
  }

  const criterio = normalizarToken(distribuicao?.criterio);
  if (![CRITERIOS_DISTRIBUICAO.PERCENTUAL, CRITERIOS_DISTRIBUICAO.VALOR].includes(criterio)) {
    throw erroNegocio('Selecione se a distribuicao gerencial sera por percentual ou por valor.');
  }

  const itens = Array.isArray(distribuicao?.itens) ? distribuicao.itens : [];
  if (itens.length === 0) throw erroNegocio('Selecione ao menos uma obra ou centro de custo para a distribuicao gerencial.');

  const ids = itens.map((item) => Number(item?.obra_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw erroNegocio('A distribuicao gerencial contem obras ou centros de custo invalidos ou repetidos.');
  }

  const elegibilidade = await listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction, incluirCentrosCusto: true });
  const permitidas = new Set(elegibilidade.obras.map((obra) => Number(obra.id)));
  if (ids.some((id) => !permitidas.has(id))) {
    throw erroNegocio('Uma ou mais obras ou centros de custo do rateio nao estao disponiveis para este usuario e centro de custo.', 403);
  }

  let linhas;
  if (criterio === CRITERIOS_DISTRIBUICAO.PERCENTUAL) {
    const percentuais = itens.map((item) => normalizarNumero(item?.percentual));
    if (percentuais.some((valor) => !valor || valor <= 0)) {
      throw erroNegocio('Todos os percentuais da distribuicao devem ser maiores que zero.');
    }
    const somaMicros = percentuais.reduce((total, valor) => total + Math.round(valor * 1000000), 0);
    if (somaMicros !== 100000000) {
      throw erroNegocio('A soma da distribuicao gerencial deve ser exatamente 100%.');
    }
    let alocado = 0;
    linhas = itens.map((item, index) => {
      const percentual = percentuais[index];
      const centavos = index === itens.length - 1
        ? totalCentavos - alocado
        : Math.round(totalCentavos * percentual / 100);
      alocado += centavos;
      return {
        obra_id: ids[index],
        abrangencia: 'OBRA',
        criterio,
        percentual: Number(percentual.toFixed(6)),
        valor_distribuido: centavos / 100
      };
    });
  } else {
    const valoresCentavos = itens.map((item) => decimalParaCentavos(item?.valor));
    if (valoresCentavos.some((valor) => !valor || valor <= 0)) {
      throw erroNegocio('Todos os valores da distribuicao devem ser maiores que zero.');
    }
    if (valoresCentavos.reduce((total, valor) => total + valor, 0) !== totalCentavos) {
      throw erroNegocio('A soma da distribuicao gerencial deve ser igual ao valor total da solicitacao.');
    }
    linhas = itens.map((item, index) => ({
      obra_id: ids[index],
      abrangencia: 'OBRA',
      criterio,
      percentual: Number(((valoresCentavos[index] / totalCentavos) * 100).toFixed(6)),
      valor_distribuido: valoresCentavos[index] / 100
    }));
  }

  return { ...elegibilidade, criterio, linhas };
}

module.exports = {
  CRITERIOS_DISTRIBUICAO,
  configurarObrasDistribuicao,
  contextoConfiguracao,
  centroCustoPermiteTodasObras,
  centroCustoPermiteTodasPrivadas,
  listarObrasElegiveisDistribuicao,
  validarDistribuicaoCentroCusto
};
