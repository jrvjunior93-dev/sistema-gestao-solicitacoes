'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const {
  ALL_PERMISSION_KEYS,
  MODULO_PERMISSION_GROUPS
} = require('../../../constants/moduloPermissoes');
const {
  MODULE_CATALOG
} = require('../../../services/moduleConfigService');
const {
  CUSTOS_RECEBIVEIS_PERMISSIONS
} = require('../constants/custosRecebiveisConstants');
const {
  hasExplicitCustosRecebiveisPermission,
  resolveExplicitCustosRecebiveisPermissions
} = require('../policies/permissionPolicy');
const {
  resolverEscopoObras,
  usuarioEhSetorObra,
  usuarioPodeAcessarObra
} = require('../policies/obraScopePolicy');
const db = require('../../../models');

const backendRoot = path.resolve(__dirname, '..', '..', '..', '..');
const migrationPath = path.join(
  backendRoot,
  'migrations',
  '202607280002_custos_recebiveis_fundacao.js'
);

function validateCatalogs() {
  const moduleEntry = MODULE_CATALOG.find((item) => item.key === 'CUSTOS_RECEBIVEIS');
  assert(moduleEntry, 'Feature CUSTOS_RECEBIVEIS ausente do MODULE_CATALOG');
  assert.strictEqual(moduleEntry.enabled, false, 'Feature deve nascer desabilitada');
  assert.deepStrictEqual(moduleEntry.requiresAll, ['OBRAS', 'FINANCEIRO']);

  const permissionGroup = MODULO_PERMISSION_GROUPS.find(
    (group) => group.modulo === 'CUSTOS_RECEBIVEIS'
  );
  assert(permissionGroup, 'Grupo CUSTOS_RECEBIVEIS ausente do registro de permissoes');

  const registeredKeys = permissionGroup.areas.flatMap(
    (area) => area.permissoes.map((permission) => permission.key)
  );
  const expectedKeys = Object.values(CUSTOS_RECEBIVEIS_PERMISSIONS);
  assert.deepStrictEqual(
    [...registeredKeys].sort(),
    [...expectedKeys].sort(),
    'Registro central e constantes de permissao divergentes'
  );
  expectedKeys.forEach((key) => assert(ALL_PERMISSION_KEYS.has(key), `Permissao ausente: ${key}`));
}

async function validateExplicitPermissions() {
  const regularUser = { id: 7, perfil: 'ADMINISTRADOR' };
  const permission = CUSTOS_RECEBIVEIS_PERMISSIONS.MODULE_ACCESS;

  assert.strictEqual(await hasExplicitCustosRecebiveisPermission(
    regularUser,
    permission,
    {
      isSuperadmin: () => false,
      resolveExplicitPermissions: async () => []
    }
  ), false, 'Lista vazia nao pode conceder acesso implicito ao modulo novo');

  assert.strictEqual(await hasExplicitCustosRecebiveisPermission(
    regularUser,
    permission,
    {
      isSuperadmin: () => false,
      resolveExplicitPermissions: async () => [permission]
    }
  ), true, 'Permissao explicita deveria conceder acesso');

  assert.strictEqual(await hasExplicitCustosRecebiveisPermission(
    { id: 1, perfil: 'SUPERADMIN' },
    permission,
    {
      isSuperadmin: () => true,
      resolveExplicitPermissions: async () => []
    }
  ), true, 'SUPERADMIN deveria possuir bypass');

  const resolvedForAdministrator = await resolveExplicitCustosRecebiveisPermissions({
    id: 7,
    perfil: 'ADMINISTRADOR',
    setor_id: 4,
    setor: { id: 4, codigo: 'FINANCEIRO', nome: 'Financeiro' },
    areas_permissoes: []
  }, {
    getPermissoesAreasConfig: async () => ({
      usuarios: { 7: [permission] },
      usuarios_bloqueios: {},
      padroes_setor_perfil: {}
    })
  });
  assert.deepStrictEqual(
    resolvedForAdministrator,
    [permission],
    'ADMINISTRADOR deve receber permissao explicitamente configurada, sem bypass legado'
  );

  const blockedDefault = await resolveExplicitCustosRecebiveisPermissions({
    id: 8,
    perfil: 'USUARIO',
    setor: { codigo: 'FINANCEIRO' },
    areas_permissoes: []
  }, {
    getPermissoesAreasConfig: async () => ({
      usuarios: {},
      usuarios_bloqueios: { 8: [permission] },
      padroes_setor_perfil: {
        FINANCEIRO: { USUARIO: [permission] }
      }
    })
  });
  assert.deepStrictEqual(blockedDefault, [], 'Bloqueio individual deve prevalecer sobre o padrao');
}

async function validateObraScope() {
  let queries = 0;
  const fakeUsuarioObra = {
    async findAll() {
      queries += 1;
      return [{ obra_id: 9 }, { obra_id: 9 }, { obra_id: 12 }];
    }
  };

  const superadminScope = await resolverEscopoObras(
    { id: 1, perfil: 'SUPERADMIN' },
    {
      isSuperadmin: () => true,
      hasExplicitPermission: async () => false,
      UsuarioObra: fakeUsuarioObra
    }
  );
  assert.deepStrictEqual(superadminScope, { todas: true, obraIds: null });
  assert.strictEqual(queries, 0, 'SUPERADMIN nao deve consultar vinculos de obra');

  const globalScope = await resolverEscopoObras(
    { id: 2, perfil: 'USUARIO' },
    {
      isSuperadmin: () => false,
      hasExplicitPermission: async () => true,
      UsuarioObra: fakeUsuarioObra
    }
  );
  assert.deepStrictEqual(globalScope, { todas: true, obraIds: null });
  assert.strictEqual(queries, 0, 'Escopo global explicito nao deve consultar vinculos');

  const obraUserScope = await resolverEscopoObras(
    { id: 22, perfil: 'USUARIO', setor: { codigo: 'OBRA', eh_setor_obra: true } },
    {
      isSuperadmin: () => false,
      hasExplicitPermission: async () => true,
      UsuarioObra: fakeUsuarioObra
    }
  );
  assert.deepStrictEqual(
    obraUserScope,
    { todas: false, obraIds: [9, 12] },
    'Usuario do setor OBRA deve permanecer limitado aos vinculos, mesmo com permissao global'
  );
  assert.strictEqual(usuarioEhSetorObra({ setor: { nome: 'Obra' } }), true);
  assert.strictEqual(queries, 1, 'Usuario de obra deve consultar os vinculos autorizados');
  assert.strictEqual(await usuarioPodeAcessarObra(
    { id: 22, perfil: 'USUARIO', setor: { codigo: 'OBRA' } },
    9,
    {
      isSuperadmin: () => false,
      hasExplicitPermission: async () => true,
      UsuarioObra: fakeUsuarioObra
    }
  ), true, 'Usuario da obra deve acessar obra vinculada');
  assert.strictEqual(await usuarioPodeAcessarObra(
    { id: 22, perfil: 'USUARIO', setor: { codigo: 'OBRA' } },
    99,
    {
      isSuperadmin: () => false,
      hasExplicitPermission: async () => true,
      UsuarioObra: fakeUsuarioObra
    }
  ), false, 'Usuario da obra nao pode acessar obra fora dos vinculos');
  assert.strictEqual(queries, 3, 'A validacao direta deve consultar os vinculos autorizados');

  const linkedScope = await resolverEscopoObras(
    { id: 3, perfil: 'USUARIO', setor: { codigo: 'FINANCEIRO' } },
    {
      isSuperadmin: () => false,
      hasExplicitPermission: async () => false,
      UsuarioObra: fakeUsuarioObra
    }
  );
  assert.deepStrictEqual(linkedScope, { todas: false, obraIds: [9, 12] });
  assert.strictEqual(queries, 4, 'Escopo restrito deve consultar apenas usuarios_obras');
}

async function validateMigrationLifecycle() {
  delete require.cache[require.resolve(migrationPath)];
  const migration = require(migrationPath);
  assert.strictEqual(typeof migration.up, 'function');
  assert.strictEqual(typeof migration.down, 'function');

  const tables = new Set();
  const indexes = new Set();
  const sequelize = {
    async query(sql, options = {}) {
      if (String(sql).includes('information_schema.TABLES')) {
        return [[{ total: tables.has(options.replacements[0]) ? 1 : 0 }]];
      }
      if (String(sql).includes('information_schema.STATISTICS')) {
        return [[{ total: indexes.has(options.replacements[1]) ? 1 : 0 }]];
      }
      throw new Error(`Consulta inesperada no teste estrutural: ${sql}`);
    }
  };
  const queryInterface = {
    async createTable(tableName) {
      tables.add(tableName);
    },
    async addIndex(tableName, fields, options) {
      assert(tables.has(tableName), `Indice criado antes da tabela ${tableName}`);
      assert(Array.isArray(fields) && fields.length > 0);
      indexes.add(options.name);
    },
    async dropTable(tableName) {
      tables.delete(tableName);
    }
  };

  await migration.up({ DataTypes, queryInterface, sequelize });
  assert.strictEqual(tables.size, 14, 'A migration deve criar exatamente 14 tabelas cr_*');
  [...tables].forEach((tableName) => assert(tableName.startsWith('cr_')));

  await migration.down({ DataTypes, queryInterface, sequelize });
  assert.strictEqual(tables.size, 0, 'O down deve remover apenas as tabelas cr_* criadas');
}

function validateIntegrationFiles() {
  const routesSource = fs.readFileSync(path.join(backendRoot, 'src', 'routes.js'), 'utf8');
  assert(routesSource.includes("requireEnabledModule('CUSTOS_RECEBIVEIS', { allowSuperadminBypass: false })"));
  assert(routesSource.includes("router.use('/custos-recebiveis', custosRecebiveisRoutes)"));

  const modelsSource = fs.readFileSync(path.join(backendRoot, 'src', 'models', 'index.js'), 'utf8');
  [
    'CrPlanoObra',
    'CrPlanoItem',
    'CrPlanoMacroVinculo',
    'CrImportacao',
    'CrCompetencia',
    'CrPrevisaoCusto',
    'CrPrevisaoReceita',
    'CrMedicaoConsolidada',
    'CrRealizado',
    'CrResponsavelObra',
    'CrObrigacaoUsuario',
    'CrReabertura',
    'CrGuardBypass',
    'CrAuditoria'
  ].forEach((modelName) => assert(modelsSource.includes(`db.${modelName} =`), `Model nao registrado: ${modelName}`));

  const scopeSource = fs.readFileSync(
    path.join(backendRoot, 'src', 'modules', 'custosRecebiveis', 'policies', 'obraScopePolicy.js'),
    'utf8'
  );
  assert(!scopeSource.includes('getUserObraScopeIds'));
  assert(!scopeSource.includes('userHasAllObrasAccess'));
}

async function validateRegisteredModels() {
  const expectedTables = {
    CrPlanoObra: 'cr_planos_obra',
    CrPlanoItem: 'cr_plano_itens',
    CrPlanoMacroVinculo: 'cr_plano_macro_vinculos',
    CrImportacao: 'cr_importacoes',
    CrCompetencia: 'cr_competencias',
    CrPrevisaoCusto: 'cr_previsoes_custo',
    CrPrevisaoReceita: 'cr_previsoes_receita',
    CrMedicaoConsolidada: 'cr_medicoes_consolidadas',
    CrRealizado: 'cr_realizados',
    CrResponsavelObra: 'cr_responsaveis_obra',
    CrObrigacaoUsuario: 'cr_obrigacoes_usuario',
    CrReabertura: 'cr_reaberturas',
    CrGuardBypass: 'cr_guard_bypass',
    CrAuditoria: 'cr_auditoria'
  };

  Object.entries(expectedTables).forEach(([modelName, tableName]) => {
    assert(db[modelName], `Model nao carregado: ${modelName}`);
    assert.strictEqual(db[modelName].getTableName(), tableName);
  });

  await assert.rejects(
    async () => db.CrAuditoria.runHooks('beforeBulkDestroy', {}),
    /append-only/,
    'Auditoria nao pode aceitar DELETE pelo ORM'
  );
  await assert.rejects(
    async () => db.CrAuditoria.runHooks('beforeBulkUpdate', {}),
    /append-only/,
    'Auditoria nao pode aceitar UPDATE pelo ORM'
  );
}

async function run() {
  validateCatalogs();
  await validateExplicitPermissions();
  await validateObraScope();
  await validateMigrationLifecycle();
  validateIntegrationFiles();
  await validateRegisteredModels();
  console.log('Fase 0 de Custos e Recebiveis validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
