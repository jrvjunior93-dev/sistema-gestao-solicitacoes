const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const docsRoot = path.join(root, 'docs');

const moduleDocByRuntimeKey = {
  SOLICITACOES: 'solicitacoes',
  COMUNICACAO_INTERNA: 'comunicacao-interna',
  BIBLIOTECA_MODELOS: 'biblioteca-modelos',
  TREINAMENTO: 'treinamento',
  COMPRAS: 'compras',
  COTACOES: 'cotacoes-pedidos',
  FINANCEIRO: 'financeiro',
  BOLETOS: 'boletos',
  FISCAL: 'fiscal',
  OBRAS: 'obras',
  PROVISOES: 'provisionamento',
  CUSTOS_RECEBIVEIS: 'custos-recebiveis',
  CONTRATOS: 'contratos',
  COMERCIAL: 'comercial',
  CRM: 'crm',
  RH_DP: 'rh-dp',
  SST: 'sst'
};

const additionalCanonicalDocs = ['configuracoes-painel', 'governanca'];
const legacyRuntimeModules = new Set(['INTEGRACAO_SIENGE']);
const legacyTermsDocument = 'docs/arquitetura/ESTADO_RUNTIME_E_LEGADOS.md';

const forbiddenPatterns = [
  /FLUXY[ _-]?Ops/i,
  /fluxy_ops/i,
  /SIENGE/i,
  /produto comercial/i,
  /comercializa[cç][aã]o/i,
  /expans[aã]o comercial/i,
  /posicionamento comercial/i,
  /modelo comercial futuro/i,
  /SaaS multi-tenant/i
];

function listMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [fullPath] : [];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function validateForbiddenTerms(filePath, content, errors) {
  const patternsToValidate = relative(filePath) === legacyTermsDocument
    ? forbiddenPatterns.slice(3)
    : forbiddenPatterns;

  patternsToValidate.forEach((pattern) => {
    // Inventario mecanico deve conservar nomes de modelos/migrations/campos
    // historicos. A excecao e somente para evidencia tabulada COLUNA_BANCO,
    // neste arquivo gerado; prosa e todos os demais termos seguem validados.
    const technicalInventory = relative(filePath) === 'docs/datas/INVENTARIO_CAMPOS_DATAS.md'
      && pattern.source === 'SIENGE';
    const textToValidate = technicalInventory ? content.split('\n').filter(line =>
      !/^\| backend\/(?:src|migrations)\/[^|]+\.js:\d+ \| COLUNA_BANCO \| [^|]+ \| (?:DataTypes|Sequelize)\.DATE(?:ONLY)? \|\r?$/.test(line)).join('\n') : content;
    if (pattern.test(textToValidate)) {
      errors.push(`${relative(filePath)} contem termo obsoleto: ${pattern}`);
    }
  });
}

function getRuntimeModuleKeys(errors) {
  const servicePath = path.join(root, 'backend', 'src', 'services', 'moduleConfigService.js');
  const content = fs.readFileSync(servicePath, 'utf8');
  const catalogMatch = content.match(/const MODULE_CATALOG = \[([\s\S]*?)\n\];/);
  if (!catalogMatch) {
    errors.push('nao foi possivel ler MODULE_CATALOG em backend/src/services/moduleConfigService.js');
    return [];
  }

  return [...catalogMatch[1].matchAll(/\bkey:\s*'([A-Z0-9_]+)'/g)].map((match) => match[1]);
}

function getPermissionStats(errors) {
  try {
    const { MODULO_PERMISSION_GROUPS, ALL_PERMISSION_KEYS } = require('../src/constants/moduloPermissoes');
    return {
      groups: MODULO_PERMISSION_GROUPS.length,
      areas: MODULO_PERMISSION_GROUPS.reduce((total, group) => total + group.areas.length, 0),
      permissions: ALL_PERMISSION_KEYS.size
    };
  } catch (error) {
    errors.push(`nao foi possivel ler o registro central de permissoes: ${error.message}`);
    return null;
  }
}

function validateLinks(filePath, content, errors) {
  const markdownLink = /\[[^\]]*\]\(([^)\r\n]+)\)/g;
  let match;

  while ((match = markdownLink.exec(content))) {
    let target = match[1].trim();
    if (!target || /^(https?:\/\/|mailto:|#)/i.test(target)) continue;

    target = target.replace(/^<|>$/g, '').split('#')[0];
    if (!target) continue;

    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(filePath), target);

    if (!fs.existsSync(resolved)) {
      errors.push(`${relative(filePath)} referencia caminho inexistente: ${match[1]}`);
    }
  }
}

function main() {
  const errors = [];
  const markdownFiles = [path.join(root, 'README.md'), path.join(root, 'AGENTS.md'), ...listMarkdownFiles(docsRoot)];
  const textFiles = [...markdownFiles, path.join(root, 'backend', '.env.example')];
  const runtimeModuleKeys = getRuntimeModuleKeys(errors);
  const permissionStats = getPermissionStats(errors);

  textFiles.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    validateForbiddenTerms(filePath, content, errors);
    if (filePath.toLowerCase().endsWith('.md')) validateLinks(filePath, content, errors);
  });

  runtimeModuleKeys.forEach((moduleKey) => {
    if (legacyRuntimeModules.has(moduleKey)) return;
    if (!moduleDocByRuntimeKey[moduleKey]) {
      errors.push(`modulo de runtime sem mapeamento documental: ${moduleKey}`);
    }
  });

  Object.keys(moduleDocByRuntimeKey).forEach((moduleKey) => {
    if (!runtimeModuleKeys.includes(moduleKey)) {
      errors.push(`mapeamento documental sem modulo correspondente no runtime: ${moduleKey}`);
    }
  });

  legacyRuntimeModules.forEach((moduleKey) => {
    if (!runtimeModuleKeys.includes(moduleKey)) {
      errors.push(`modulo marcado como legado nao existe mais no runtime; revise o inventario: ${moduleKey}`);
    }
  });

  const requiredModuleDocs = [
    ...new Set([...Object.values(moduleDocByRuntimeKey), ...additionalCanonicalDocs])
  ].sort();

  requiredModuleDocs.forEach((moduleName) => {
    const moduleDoc = path.join(docsRoot, 'modulos', moduleName, 'README.md');
    if (!fs.existsSync(moduleDoc)) {
      errors.push(`documentacao canonica ausente: docs/modulos/${moduleName}/README.md`);
    }
  });

  const duplicateContext = path.join(docsRoot, 'contexto', 'visao-geral.md');
  if (fs.existsSync(duplicateContext)) {
    errors.push('documento duplicado encontrado: docs/contexto/visao-geral.md');
  }

  const legacyStatusPath = path.join(root, legacyTermsDocument);
  if (!fs.existsSync(legacyStatusPath)) {
    errors.push(`documento de estado dos legados ausente: ${legacyTermsDocument}`);
  }

  if (permissionStats) {
    const expectedStats = `${permissionStats.groups} grupos, ${permissionStats.areas} areas e ${permissionStats.permissions}`;
    const statsDocs = [
      path.join(root, 'AGENTS.md'),
      path.join(docsRoot, 'seguranca', 'autenticacao_autorizacao.md')
    ];

    statsDocs.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes(expectedStats)) {
        errors.push(`${relative(filePath)} nao reflete as metricas atuais de permissoes: ${expectedStats}`);
      }
    });
  }

  if (errors.length) {
    console.error('Falha na validacao documental:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Documentacao valida: ${markdownFiles.length} arquivos Markdown e ${requiredModuleDocs.length} documentos canonicos.`);
}

if (require.main === module) main();
module.exports = { validateForbiddenTerms };
