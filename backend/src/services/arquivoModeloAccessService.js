const { ConfiguracaoSistema, Setor } = require('../models');
const {
  canManageBiblioteca,
  isAdministrador,
  isSuperadmin
} = require('./authorizationService');

const KEY_PAGINAS = 'ARQUIVOS_MODELOS_PAGINAS';
const KEY_UPLOADERS = 'ARQUIVOS_MODELOS_UPLOADERS';

const ALIAS_CODIGO_PAGINA_POR_SETOR = {
  GEO: 'GERENCIA_PROCESSOS',
  GERENCIA_DE_PROCESSOS: 'GERENCIA_PROCESSOS'
};

const PAGINAS_PADRAO = [
  { codigo: 'GERENCIA_PROCESSOS', nome: 'Gerencia de Processos', ativo: true },
  { codigo: 'SESMT', nome: 'SESMT', ativo: true },
  { codigo: 'DEPARTAMENTO_PESSOAL', nome: 'Departamento Pessoal', ativo: true },
  { codigo: 'FINANCEIRO', nome: 'Financeiro', ativo: true },
  { codigo: 'RH', nome: 'RH', ativo: true },
  { codigo: 'JURIDICO', nome: 'Juridico', ativo: true },
  { codigo: 'COMPRAS', nome: 'Compras', ativo: true },
  { codigo: 'MARKETING', nome: 'Marketing', ativo: true }
];

function parseJsonSeguro(valor, fallback) {
  try {
    if (!valor) return fallback;
    const parsed = JSON.parse(valor);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizarCodigo(nome = '') {
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function normalizarPaginas(paginas) {
  if (!Array.isArray(paginas)) return [];

  const usados = new Set();
  return paginas
    .map((item) => {
      const nome = String(item?.nome || '').trim();
      const codigoBase = String(item?.codigo || '').trim() || normalizarCodigo(nome);
      const codigo = normalizarCodigo(codigoBase);

      if (!nome || !codigo || usados.has(codigo)) {
        return null;
      }

      usados.add(codigo);
      return {
        codigo,
        nome,
        ativo: item?.ativo !== false
      };
    })
    .filter(Boolean);
}

async function getConfig(chave, fallback) {
  const registro = await ConfiguracaoSistema.findOne({ where: { chave } });
  return parseJsonSeguro(registro?.valor, fallback);
}

async function setConfig(chave, valorObj) {
  const valor = JSON.stringify(valorObj);
  const registro = await ConfiguracaoSistema.findOne({ where: { chave } });

  if (registro) {
    await registro.update({ valor });
    return;
  }

  await ConfiguracaoSistema.create({ chave, valor });
}

async function getPaginas() {
  const configuradas = await getConfig(KEY_PAGINAS, null);
  const normalizadas = normalizarPaginas(configuradas);
  if (normalizadas.length > 0) {
    return normalizadas;
  }

  return PAGINAS_PADRAO;
}

async function getUploaders() {
  const uploaders = await getConfig(KEY_UPLOADERS, {});
  if (!uploaders || typeof uploaders !== 'object' || Array.isArray(uploaders)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(uploaders).map(([codigo, ids]) => [
      normalizarCodigo(codigo),
      Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : []
    ])
  );
}

function isAdminRole(user) {
  const perfil = String(user?.perfil || '').trim().toUpperCase();
  return perfil === 'ADMIN' || isAdministrador(user) || isSuperadmin(user);
}

async function getUserAllowedPageCodes(user) {
  const codigos = new Set();
  const adicionarCodigo = (valor) => {
    const codigoNormalizado = normalizarCodigo(valor);
    if (!codigoNormalizado) return;

    codigos.add(codigoNormalizado);
    const alias = ALIAS_CODIGO_PAGINA_POR_SETOR[codigoNormalizado];
    if (alias) {
      codigos.add(alias);
    }
  };

  adicionarCodigo(user?.area);

  if (user?.setor_id) {
    const setor = await Setor.findByPk(user.setor_id, {
      attributes: ['codigo', 'nome']
    });

    adicionarCodigo(setor?.codigo);
    adicionarCodigo(setor?.nome);
  }

  return Array.from(codigos);
}

async function canUploadArquivoModeloPage(user, paginaCodigo, uploadersByPagina = null) {
  // A permissao granular representa gerenciamento da biblioteca inteira e deve
  // funcionar independentemente do perfil nominal do usuario. A regra legada
  // por setor/pagina continua valendo apenas para perfis administrativos que
  // nao receberam a permissao granular.
  if (await canManageBiblioteca(user)) return true;
  if (!isAdminRole(user)) return false;

  const codigoPagina = normalizarCodigo(paginaCodigo);
  const codigosPermitidosPorSetor = await getUserAllowedPageCodes(user);
  if (codigosPermitidosPorSetor.includes(codigoPagina)) {
    return true;
  }

  const uploaders = uploadersByPagina || await getUploaders();
  const lista = uploaders[String(codigoPagina || '').toUpperCase()] || [];
  return lista.includes(Number(user?.id));
}

async function canViewArquivoModeloPage(user, paginaCodigo) {
  const codigoPagina = normalizarCodigo(paginaCodigo);
  if (!codigoPagina || !user?.id) return false;

  const paginas = await getPaginas();
  const pagina = paginas.find((item) => item.codigo === codigoPagina);

  return Boolean(pagina && pagina.ativo !== false);
}

module.exports = {
  ALIAS_CODIGO_PAGINA_POR_SETOR,
  canUploadArquivoModeloPage,
  canViewArquivoModeloPage,
  getPaginas,
  getUploaders,
  getUserAllowedPageCodes,
  isAdminRole,
  normalizarCodigo,
  normalizarPaginas,
  setConfig
};
