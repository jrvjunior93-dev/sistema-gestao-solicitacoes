'use strict';

const { Parceiro } = require('../models');
const { registrarEventoSeguranca } = require('./securityLogService');

/**
 * Completar o cadastro do CONTRATADO durante a abertura de um contrato (20/08).
 *
 * Acima do limite o contrato vai ao Juridico, que monta a minuta — e minuta precisa identificar e
 * localizar a parte. Os cadastros ja existem e estao vazios: dos 2.454 fornecedores ativos, **26**
 * tem endereco completo. Ou seja, exigir sem deixar corrigir na hora inviabilizaria o fluxo.
 *
 * Por que uma rota estreita, e nao `PATCH /parceiros/:id`:
 *
 * - a rota geral exige `configuracoes.cadastros.gerenciar`, que nem o usuario da obra nem o GEO
 *   possuem — o modal abriria e o salvar daria 403;
 * - e dar a permissao geral para resolver isso entregaria o cadastro INTEIRO (nome, PIX, flags de
 *   cliente/fornecedor) a quem so precisa consertar um endereco.
 *
 * Dai a lista fixa de campos abaixo. Ela nao e conveniencia: e o motivo de o servico existir.
 */

// Unicos campos que esta rota pode tocar. Qualquer outro no corpo e ignorado em silencio.
const CAMPOS_PERMITIDOS = [
  'cpf_cnpj',
  'endereco',
  'numero',
  'complemento',
  'bairro',
  'cep',
  'municipio',
  'estado'
];

// Complemento fora: predio sem complemento e o caso comum, e exigir levaria a "S/C" digitado.
const CAMPOS_OBRIGATORIOS = [
  'cpf_cnpj',
  'endereco',
  'numero',
  'bairro',
  'cep',
  'municipio',
  'estado'
];

const ROTULOS = {
  cpf_cnpj: 'CPF/CNPJ',
  endereco: 'Logradouro',
  numero: 'Numero',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cep: 'CEP',
  municipio: 'Municipio',
  estado: 'UF'
};

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

const somenteDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');
const textoLimpo = (valor) => String(valor ?? '').trim();

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

/**
 * CPF e CNPJ pelo digito verificador, nao pelo tamanho.
 *
 * Contar digitos aceitaria `00000000000`, que e o que aparece quando alguem preenche so para
 * passar da validacao — e o Juridico so descobre na hora de emitir a minuta.
 */
function cpfValido(digitos) {
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;
  const calcular = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(digitos[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10]);
}

function cnpjValido(digitos) {
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false;
  const calcular = (ate) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(digitos[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === Number(digitos[12]) && calcular(13) === Number(digitos[13]);
}

function documentoValido(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

/**
 * O que falta no cadastro para este parceiro poder entrar num contrato acima do limite.
 *
 * Devolve a lista de rotulos — e ela vai inteira para a tela. Dizer so "cadastro incompleto"
 * obrigaria a pessoa a descobrir por tentativa qual campo o sistema quer.
 */
function pendenciasDoCadastro(parceiro) {
  const faltando = [];
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (!textoLimpo(parceiro?.[campo])) faltando.push(ROTULOS[campo]);
  }
  // Documento presente porem invalido e pendencia tambem: existe cadastro antigo com "000".
  if (textoLimpo(parceiro?.cpf_cnpj) && !documentoValido(parceiro.cpf_cnpj)) {
    faltando.push(`${ROTULOS.cpf_cnpj} invalido`);
  }
  if (textoLimpo(parceiro?.cep) && somenteDigitos(parceiro.cep).length !== 8) {
    faltando.push(`${ROTULOS.cep} invalido`);
  }
  if (textoLimpo(parceiro?.estado) && !UFS.has(textoLimpo(parceiro.estado).toUpperCase())) {
    faltando.push(`${ROTULOS.estado} invalida`);
  }
  return faltando;
}

function cadastroCompleto(parceiro) {
  return pendenciasDoCadastro(parceiro).length === 0;
}

/** Conferencia de varios parceiros de uma vez, no formato que o modal consome. */
async function conferirCadastros(ids = []) {
  const unicos = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (unicos.length === 0) return [];

  const parceiros = await Parceiro.findAll({
    where: { id: unicos },
    attributes: ['id', 'nome', 'tipo_pessoa', ...CAMPOS_PERMITIDOS]
  });

  return parceiros.map((p) => {
    const plano = p.get({ plain: true });
    return { ...plano, pendencias: pendenciasDoCadastro(plano), completo: cadastroCompleto(plano) };
  });
}

/**
 * Quem pode mexer no cadastro do credor a partir do contrato.
 *
 * Decisao do cliente (20/08): **quem cria a solicitacao corrige os dados**, e a Gerencia de
 * Processos revisa depois — ela ja precisa aprovar o contrato de qualquer forma. Exigir uma
 * permissao propria travava o fluxo no primeiro uso: o usuario da obra abria o modal, via o que
 * faltava e nao conseguia salvar.
 *
 * `contratos.credor.completar_cadastro` continua existindo para conceder a quem NAO cria contrato
 * (o proprio GEO, por exemplo, ao revisar).
 *
 * O que sustenta essa abertura e o escopo: a rota mexe em endereco e CPF/CNPJ, nada mais, e toda
 * alteracao grava evento de seguranca com o antes e o depois. Sem esse par — escopo curto e
 * trilha — soltar a permissao seria dar o cadastro de parceiros a quem abre solicitacao.
 */
async function garantirPermissaoDeCadastro(usuario) {
  const { userHasAreaPermission } = require('./authorizationService');

  const permitido = await userHasAreaPermission(usuario, [
    'contratos.credor.completar_cadastro',
    'contratos.geral.criar',
    'solicitacoes.acoes.criar'
  ]);

  if (!permitido) {
    throw erro('Acesso negado: e preciso poder criar contrato ou solicitacao para cadastrar o credor.', 403);
  }
}

/**
 * Grava SOMENTE os campos de `CAMPOS_PERMITIDOS`.
 *
 * Nao ha `...dados` em lugar nenhum aqui de proposito: um espalhamento transformaria esta rota na
 * rota geral de parceiros, com a permissao errada.
 */
async function completarCadastroDoCredor(parceiroId, { usuario, req, dados = {} } = {}) {
  await garantirPermissaoDeCadastro(usuario);

  const parceiro = await Parceiro.findByPk(parceiroId);
  if (!parceiro) throw erro('Parceiro nao encontrado.', 404);

  const alteracoes = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (dados[campo] === undefined) continue;
    alteracoes[campo] = textoLimpo(dados[campo]) || null;
  }

  if (Object.keys(alteracoes).length === 0) {
    throw erro('Informe ao menos um campo para atualizar.');
  }

  if (alteracoes.cpf_cnpj !== undefined && alteracoes.cpf_cnpj !== null) {
    if (!documentoValido(alteracoes.cpf_cnpj)) {
      throw erro('CPF/CNPJ invalido: confira os digitos.');
    }
    alteracoes.cpf_cnpj = somenteDigitos(alteracoes.cpf_cnpj);

    // O cadastro nao pode ganhar um documento que ja e de outro parceiro: duas fichas com o mesmo
    // CNPJ viram duas partes diferentes no contrato.
    const jaExiste = await Parceiro.findOne({
      where: { cpf_cnpj: alteracoes.cpf_cnpj },
      attributes: ['id', 'nome']
    });
    if (jaExiste && Number(jaExiste.id) !== Number(parceiro.id)) {
      throw erro(`Este CPF/CNPJ ja pertence ao parceiro ${jaExiste.nome} (id ${jaExiste.id}).`, 409);
    }
  }

  if (alteracoes.cep !== undefined && alteracoes.cep !== null) {
    const digitos = somenteDigitos(alteracoes.cep);
    if (digitos.length !== 8) throw erro('CEP invalido: precisa ter 8 digitos.');
    alteracoes.cep = digitos;
  }

  if (alteracoes.estado !== undefined && alteracoes.estado !== null) {
    const uf = textoLimpo(alteracoes.estado).toUpperCase();
    if (!UFS.has(uf)) throw erro('UF invalida.');
    alteracoes.estado = uf;
  }

  const antes = {};
  for (const campo of Object.keys(alteracoes)) antes[campo] = parceiro[campo] ?? null;

  await parceiro.update(alteracoes);

  await registrarEventoSeguranca({
    req,
    usuarioId: usuario?.id || null,
    tipoEvento: 'PARTNER_CONTRACT_DATA_UPDATED',
    recursoTipo: 'PARCEIRO',
    recursoId: parceiro.id,
    status: 'SUCCESS',
    descricao: 'Cadastro do credor completado na conferencia do contrato',
    metadata: { antes, depois: alteracoes }
  });

  const plano = parceiro.get({ plain: true });
  return {
    id: plano.id,
    nome: plano.nome,
    ...Object.fromEntries(CAMPOS_PERMITIDOS.map((c) => [c, plano[c] ?? null])),
    pendencias: pendenciasDoCadastro(plano),
    completo: cadastroCompleto(plano)
  };
}

module.exports = {
  CAMPOS_PERMITIDOS,
  CAMPOS_OBRIGATORIOS,
  ROTULOS,
  completarCadastroDoCredor,
  conferirCadastros,
  cadastroCompleto,
  pendenciasDoCadastro,
  documentoValido
};
