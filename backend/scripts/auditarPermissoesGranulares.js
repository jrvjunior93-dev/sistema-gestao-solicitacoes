'use strict';

/**
 * Auditoria somente de leitura do registro central e do uso das permissoes.
 *
 * Uso:
 *   node scripts/auditarPermissoesGranulares.js
 *   node scripts/auditarPermissoesGranulares.js --db
 *   node scripts/auditarPermissoesGranulares.js --json --db
 */

const fs = require('fs');
const path = require('path');
const { MODULO_PERMISSION_GROUPS } = require('../src/constants/moduloPermissoes');
const { getVisiblePermissionRegistry } = require('../src/modules/sst/constants/sstSimplificationPolicy');

const backendRoot = path.resolve(__dirname, '..', 'src');
const frontendRoot = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const registryFile = path.resolve(backendRoot, 'constants', 'moduloPermissoes.js');
const useDb = process.argv.includes('--db');
const asJson = process.argv.includes('--json');
const checkMode = process.argv.includes('--check');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !/\.(c?js|jsx|mjs)$/.test(entry.name) || entry.name.endsWith('.orig')) return [];
    return [fullPath];
  });
}

const IMPLICIT_BACKEND_PERMISSION_KEYS = new Set([
  // Ausencia de um escopo mais amplo e interpretada pelo backend como o escopo
  // minimo "minhas/atribuidas". A chave existe para deixar essa escolha visivel
  // na configuracao, sem precisar de um teste literal no filtro SQL.
  'compras.escopo.minhas_atribuidas'
]);

const CLIENT_ONLY_PERMISSION_KEYS = new Set([
  // O CSV e montado a partir dos titulos que a API ja autorizou e devolveu.
  // Nao existe endpoint de exportacao para proteger no backend.
  'financeiro.titulos.exportar'
]);

function removeFullLineComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, ' '))
    .replace(/^[\t ]*\/\/.*$/gm, (comment) => comment.replace(/[^\r\n]/g, ' '));
}

function flattenRegistry(groups = MODULO_PERMISSION_GROUPS) {
  return groups.flatMap((group) =>
    (group.areas || []).flatMap((area) =>
      (area.permissoes || []).map((permission) => ({
        modulo: group.modulo,
        modulo_label: group.label,
        area: area.key,
        area_label: area.label,
        ...permission
      }))
    )
  );
}

function duplicates(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function scanUsage(files, registryKeys) {
  const usage = Object.fromEntries([...registryKeys].map((key) => [key, []]));
  files.forEach((file) => {
    if (path.resolve(file) === registryFile) return;
    // Comentarios explicativos podem citar uma chave sem que exista qualquer
    // verificacao em runtime. Ignora-los evita classificar documentacao como
    // uma regra de autorizacao implementada.
    const source = removeFullLineComments(fs.readFileSync(file, 'utf8'));
    registryKeys.forEach((key) => {
      if (!source.includes(key)) return;
      const lines = source.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (line.includes(key)) {
          usage[key].push(`${path.relative(path.resolve(__dirname, '..', '..'), file)}:${index + 1}`);
        }
      });
    });
  });
  return usage;
}

function collectConfiguredKeys(node, output = []) {
  if (Array.isArray(node)) {
    node.forEach((value) => {
      if (typeof value === 'string') output.push(value.trim().toLowerCase());
    });
    return output;
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((value) => collectConfiguredKeys(value, output));
  }
  return output;
}

async function auditDatabase(registryKeys) {
  const { ConfiguracaoSistema, User, Setor, sequelize } = require('../src/models');
  const { getAreaPermissionStateForUser } = require('../src/services/authorizationService');
  try {
    await sequelize.authenticate();
    const configRow = await ConfiguracaoSistema.findOne({
      where: { chave: 'PERMISSOES_AREAS_USUARIOS' },
      order: [['id', 'DESC']],
      attributes: ['id', 'valor', 'updatedAt']
    });
    const config = configRow?.valor ? JSON.parse(configRow.valor) : {};
    const configuredKeys = collectConfiguredKeys(config).filter(Boolean);
    const unknownKeys = [...new Set(configuredKeys.filter((key) => !registryKeys.has(key)))].sort();
    const usuarios = config?.usuarios && typeof config.usuarios === 'object' ? config.usuarios : {};
    const bloqueios = config?.usuarios_bloqueios && typeof config.usuarios_bloqueios === 'object'
      ? config.usuarios_bloqueios
      : {};
    const padroes = config?.padroes_setor_perfil && typeof config.padroes_setor_perfil === 'object'
      ? config.padroes_setor_perfil
      : {};
    const activeUsers = await User.findAll({
      where: { ativo: true },
      attributes: ['id', 'nome', 'email', 'perfil', 'setor_id'],
      include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo', 'eh_setor_obra'], required: false }],
      order: [['id', 'ASC']]
    });
    const explicitEmptyUsers = Object.entries(usuarios)
      .filter(([, permissions]) => Array.isArray(permissions) && permissions.length === 0)
      .map(([id]) => Number(id));
    const orphanBlocks = Object.keys(bloqueios)
      .filter((id) => !Object.prototype.hasOwnProperty.call(usuarios, id));
    const explicitEmptyProfiles = Object.entries(padroes).flatMap(([setor, profiles]) =>
      Object.entries(profiles || {})
        .filter(([, permissions]) => Array.isArray(permissions) && permissions.length === 0)
        .map(([profile]) => `${setor}:${profile}`)
    );
    const activeUserSummary = await Promise.all(activeUsers.map(async (record) => {
      const user = record.get({ plain: true });
      const state = await getAreaPermissionStateForUser(user);
      return {
        id: user.id,
        nome: user.nome,
        perfil: user.perfil,
        setor: user.setor?.codigo || user.setor?.nome || null,
        bypass: Boolean(state.bypass),
        effective_configured: Boolean(state.configured),
        effective_permission_count: state.permissions.length,
        direct_configured: Object.prototype.hasOwnProperty.call(usuarios, String(user.id)),
        direct_permission_count: Array.isArray(usuarios[user.id]) ? usuarios[user.id].length : 0,
        block_count: Array.isArray(bloqueios[user.id]) ? bloqueios[user.id].length : 0
      };
    }));

    return {
      config_id: configRow?.id || null,
      config_updated_at: configRow?.updatedAt || null,
      active_users: activeUsers.length,
      direct_users: Object.keys(usuarios).length,
      block_users: Object.keys(bloqueios).length,
      sector_profile_defaults: Object.values(padroes).reduce(
        (total, profiles) => total + Object.keys(profiles || {}).length,
        0
      ),
      configured_key_occurrences: configuredKeys.length,
      unknown_keys: unknownKeys,
      explicit_empty_users: explicitEmptyUsers,
      explicit_empty_profiles: explicitEmptyProfiles,
      orphan_block_users: orphanBlocks.map(Number),
      legacy_unconfigured_users: activeUserSummary
        .filter((item) => !item.bypass && !item.effective_configured)
        .map(({ id, nome, perfil, setor }) => ({ id, nome, perfil, setor })),
      active_user_summary: activeUserSummary
    };
  } finally {
    await sequelize.close();
  }
}

async function main() {
  const fullRegistry = flattenRegistry();
  const registry = flattenRegistry(getVisiblePermissionRegistry(MODULO_PERMISSION_GROUPS));
  const registryKeys = new Set(fullRegistry.map((item) => item.key));
  const activeRegistryKeys = new Set(registry.map((item) => item.key));
  const backendUsage = scanUsage(walk(backendRoot), registryKeys);
  const frontendUsage = scanUsage(walk(frontendRoot), registryKeys);
  IMPLICIT_BACKEND_PERMISSION_KEYS.forEach((key) => {
    if (backendUsage[key] && !backendUsage[key].length) backendUsage[key].push('(regra de escopo minimo implicita)');
  });
  const invalidKeys = fullRegistry
    .filter((item) => !/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(item.key))
    .map((item) => item.key);
  const duplicateKeys = duplicates(fullRegistry.map((item) => item.key));
  const backendOnly = registry.filter((item) => backendUsage[item.key].length && !frontendUsage[item.key].length);
  const frontendOnly = registry.filter((item) => (
    !CLIENT_ONLY_PERMISSION_KEYS.has(item.key)
    && !backendUsage[item.key].length
    && frontendUsage[item.key].length
  ));
  const clientOnly = registry.filter((item) => (
    CLIENT_ONLY_PERMISSION_KEYS.has(item.key) && frontendUsage[item.key].length
  ));
  const withoutRuntimeUse = registry.filter(
    (item) => !backendUsage[item.key].length && !frontendUsage[item.key].length
  );
  const broadManageCandidates = registry.filter((item) => /(^|\.)(gerenciar|editar)$/.test(item.key));
  const registryControllerSource = fs.readFileSync(
    path.resolve(backendRoot, 'controllers', 'PermissoesAreasController.js'),
    'utf8'
  );
  const frontendRegistryServiceSource = fs.readFileSync(
    path.resolve(frontendRoot, 'services', 'configuracoesSistema.js'),
    'utf8'
  );
  const frontendRegistryPageSource = fs.readFileSync(
    path.resolve(frontendRoot, 'pages', 'PermissoesAreas.jsx'),
    'utf8'
  );
  const registryDelivery = {
    backend_uses_central_registry: registryControllerSource.includes('getVisiblePermissionRegistry(MODULO_PERMISSION_GROUPS)'),
    frontend_loads_registry_endpoint: frontendRegistryServiceSource.includes('/configuracoes/permissoes-areas/registry'),
    frontend_renders_registry_groups: frontendRegistryPageSource.includes('registry.map((grupo)')
  };

  const report = {
    generated_at: new Date().toISOString(),
    registry: {
      modules: MODULO_PERMISSION_GROUPS.length,
      permissions: fullRegistry.length,
      active_permissions: registry.length,
      hidden_by_runtime_policy: fullRegistry.filter((item) => !activeRegistryKeys.has(item.key)).map((item) => item.key),
      invalid_keys: invalidKeys,
      duplicate_keys: duplicateKeys
    },
    usage: {
      used_backend_and_frontend: registry.length - backendOnly.length - frontendOnly.length - withoutRuntimeUse.length,
      backend_only: backendOnly.map((item) => item.key),
      client_only: clientOnly.map((item) => item.key),
      frontend_only_risk: frontendOnly.map((item) => ({ key: item.key, locations: frontendUsage[item.key] })),
      without_runtime_literal: withoutRuntimeUse.map((item) => item.key)
    },
    registry_delivery: registryDelivery,
    split_review_candidates: broadManageCandidates.map((item) => ({ key: item.key, label: item.label })),
    database: useDb ? await auditDatabase(registryKeys) : null
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log('AUDITORIA DE PERMISSOES GRANULARES (somente leitura)');
    console.log(`Registro: ${report.registry.modules} modulos / ${report.registry.permissions} permissoes (${report.registry.active_permissions} ativas na politica atual)`);
    console.log(`Chaves invalidas: ${invalidKeys.length} | duplicadas: ${duplicateKeys.length}`);
    console.log(`Uso em backend + frontend: ${report.usage.used_backend_and_frontend}`);
    console.log(`Somente backend: ${backendOnly.length}`);
    console.log(`Somente frontend por desenho: ${clientOnly.length}`);
    console.log(`Somente frontend (risco): ${frontendOnly.length}`);
    console.log(`Sem uso literal fora do registro: ${withoutRuntimeUse.length}`);
    console.log(`Registro entregue ao frontend: ${Object.values(registryDelivery).every(Boolean) ? 'SIM' : 'NAO'}`);
    if (frontendOnly.length) console.log(`Frontend sem evidencia backend: ${frontendOnly.map((item) => item.key).join(', ')}`);
    if (withoutRuntimeUse.length) console.log(`Sem uso: ${withoutRuntimeUse.map((item) => item.key).join(', ')}`);
    if (report.database) {
      console.log(`Banco: config #${report.database.config_id || '-'} / ${report.database.active_users} usuarios ativos`);
      console.log(`Banco: ${report.database.unknown_keys.length} chave(s) desconhecida(s), ${report.database.explicit_empty_users.length} usuario(s) explicitamente vazio(s)`);
      console.log(`Banco: ${report.database.legacy_unconfigured_users.length} usuario(s) ativo(s) ainda em compatibilidade legada irrestrita`);
      if (report.database.legacy_unconfigured_users.length) {
        console.log(`Legado irrestrito: ${report.database.legacy_unconfigured_users.map((item) => `${item.id}-${item.nome} (${item.perfil}/${item.setor || 'sem setor'})`).join(', ')}`);
      }
      if (report.database.unknown_keys.length) console.log(`Chaves desconhecidas: ${report.database.unknown_keys.join(', ')}`);
      if (report.database.orphan_block_users.length) console.log(`Bloqueios sem concessao individual: ${report.database.orphan_block_users.join(', ')}`);
    }
  }

  if (checkMode) {
    const failures = [];
    if (invalidKeys.length) failures.push(`${invalidKeys.length} chave(s) invalida(s)`);
    if (duplicateKeys.length) failures.push(`${duplicateKeys.length} chave(s) duplicada(s)`);
    if (frontendOnly.length) failures.push(`${frontendOnly.length} permissao(oes) usada(s) somente no frontend`);
    if (!Object.values(registryDelivery).every(Boolean)) failures.push('registro central nao chega integralmente a tela de configuracao');
    if (failures.length) throw new Error(`Auditoria de permissoes reprovada: ${failures.join('; ')}`);
  }
}

main().catch((error) => {
  console.error('Falha na auditoria:', error);
  process.exitCode = 1;
});
