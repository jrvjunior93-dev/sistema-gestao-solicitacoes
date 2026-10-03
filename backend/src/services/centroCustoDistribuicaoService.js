'use strict';

const { Op } = require('sequelize');
const { Obra, UsuarioObra } = require('../models');
const { isObraCentroCusto, TIPO_CENTRO_CUSTO_OBRA } = require('../constants/centroCusto');
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

async function listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction = null }) {
  const centroCusto = await carregarCentroCusto(centroCustoId, transaction);
  const perfil = normalizarToken(usuario?.perfil);
  const [tokensSetor, possuiCapacidadeObra] = await Promise.all([
    obterTokensSetoresUsuario(usuario),
    userHasSetorCapability(usuario, 'eh_setor_obra')
  ]);
  const usuarioDoSetorObra = possuiCapacidadeObra
    || tokensSetor.map(normalizarToken).includes('OBRA');
  const podeListarPrivadas = centroCustoPermiteTodasPrivadas(centroCusto) && !usuarioDoSetorObra;

  const deveRestringirVinculadas = usuarioDoSetorObra
    || (perfil !== 'SUPERADMIN' && !podeListarPrivadas);

  let idsVinculados = null;
  if (deveRestringirVinculadas) {
    const vinculos = await UsuarioObra.findAll({
      where: { user_id: Number(usuario?.id) || -1 },
      attributes: ['obra_id'],
      transaction
    });
    idsVinculados = [...new Set(vinculos.map((item) => Number(item.obra_id)).filter(Boolean))];
  }

  const where = {
    ativo: true,
    tipo_centro_custo: TIPO_CENTRO_CUSTO_OBRA
  };
  if (podeListarPrivadas) where.classificacao = 'PRIVADA';
  if (idsVinculados) where.id = idsVinculados.length ? { [Op.in]: idsVinculados } : -1;

  const obras = await Obra.findAll({
    where,
    attributes: ['id', 'codigo', 'nome', 'cidade', 'classificacao'],
    order: [['codigo', 'ASC'], ['nome', 'ASC']],
    transaction
  });

  return {
    centro_custo: centroCusto.get({ plain: true }),
    regra: podeListarPrivadas
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
    const elegibilidade = await listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction });
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
  if (itens.length === 0) throw erroNegocio('Selecione ao menos uma obra para a distribuicao gerencial.');

  const ids = itens.map((item) => Number(item?.obra_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw erroNegocio('A distribuicao gerencial contem obras invalidas ou repetidas.');
  }

  const elegibilidade = await listarObrasElegiveisDistribuicao({ centroCustoId, usuario, transaction });
  const permitidas = new Set(elegibilidade.obras.map((obra) => Number(obra.id)));
  if (ids.some((id) => !permitidas.has(id))) {
    throw erroNegocio('Uma ou mais obras do rateio nao estao disponiveis para este usuario e centro de custo.', 403);
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
  centroCustoPermiteTodasPrivadas,
  listarObrasElegiveisDistribuicao,
  validarDistribuicaoCentroCusto
};
