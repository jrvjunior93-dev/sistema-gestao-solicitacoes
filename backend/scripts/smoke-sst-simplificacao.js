'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const originalMode = process.env.SST_SIMPLIFIED_MODE;

function permissionKeys(groups) {
  const sstGroup = groups.find((group) => group.modulo === 'SST');
  assert.ok(sstGroup, 'O grupo de permissoes SST deve existir.');
  return sstGroup.areas.flatMap((area) => (
    area.permissoes.map((permission) => permission.key)
  ));
}

async function run() {
  process.env.SST_SIMPLIFIED_MODE = 'true';

  const policy = require('../src/modules/sst/constants/sstSimplificationPolicy');
  const { SST_RESOURCE_CONFIG } = require('../src/modules/sst/constants/sstConstants');
  const { MODULO_PERMISSION_GROUPS } = require('../src/constants/moduloPermissoes');

  assert.equal(policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/pgr' }).allowed, true);
  assert.equal(policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/ltcat' }).allowed, true);
  assert.equal(
    policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/avaliacoes_quantitativas' }).allowed,
    true
  );
  assert.equal(
    policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/documentos/upload' }).allowed,
    true
  );

  const legacyRead = policy.evaluateSstSimplifiedAccess({ method: 'GET', path: '/acidentes' });
  assert.equal(legacyRead.allowed, true);
  assert.equal(legacyRead.mode, 'legacy-read-only');

  const legacyWrite = policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/acidentes' });
  assert.equal(legacyWrite.allowed, false);
  assert.equal(legacyWrite.status, 410);
  assert.equal(legacyWrite.code, 'SST_LEGACY_FLOW_DISABLED');
  assert.equal(
    policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/riscos/1/analisar-ia' }).allowed,
    false
  );

  assert.ok(SST_RESOURCE_CONFIG.ltcat, 'O recurso LTCAT deve estar registrado.');
  assert.ok(
    SST_RESOURCE_CONFIG.avaliacoes_quantitativas,
    'O recurso de avaliacoes quantitativas deve estar registrado.'
  );

  const simplifiedKeys = permissionKeys(
    policy.getVisiblePermissionRegistry(MODULO_PERMISSION_GROUPS)
  );
  assert.ok(simplifiedKeys.includes('sst.ltcat.visualizar'));
  assert.ok(simplifiedKeys.includes('sst.avaliacoes_quantitativas.gerenciar'));
  assert.equal(simplifiedKeys.some((key) => key.startsWith('sst.acidentes.')), false);
  assert.equal(simplifiedKeys.some((key) => key.includes('.ia.')), false);

  process.env.SST_SIMPLIFIED_MODE = 'false';
  assert.equal(
    policy.evaluateSstSimplifiedAccess({ method: 'POST', path: '/acidentes' }).allowed,
    true
  );
  const completeKeys = permissionKeys(
    policy.getVisiblePermissionRegistry(MODULO_PERMISSION_GROUPS)
  );
  assert.ok(completeKeys.some((key) => key.startsWith('sst.acidentes.')));

  process.env.SST_SIMPLIFIED_MODE = 'true';

  const appSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/App.jsx'),
    'utf8'
  );
  const layoutSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/layout/Layout.jsx'),
    'utf8'
  );
  const navigationSource = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/navigation/navigationConfig.jsx'),
    'utf8'
  );

  assert.match(appSource, /SST_SIMPLIFIED_MODE/);
  assert.match(appSource, /function SstLegacyRoute/);
  assert.match(appSource, /<SstLegacyRoute><SstEsocial \/><\/SstLegacyRoute>/);
  assert.match(
    layoutSource,
    /findActiveNode, getVisibleModule, resolveLabel.*navigationConfig/,
    'O layout deve consumir a fonte unica de navegacao.'
  );
  assert.match(navigationSource, /function sstChildrenSimplified\(\)/);
  assert.match(navigationSource, /return SST_NAV\.map/);
  assert.match(navigationSource, /gate: \(user\) => canAccessSst\(user\)/);
  assert.match(
    navigationSource,
    /children: SST_SIMPLIFIED_MODE \? sstChildrenSimplified\(\) : sstChildrenFull\(\)/,
    'O catalogo deve alternar a navegacao SST conforme o modo simplificado.'
  );

  const models = require('../src/models');
  assert.ok(models.SstLtcat, 'O model SstLtcat deve carregar no bootstrap.');
  assert.ok(models.SstLtcatAvaliacao, 'O model SstLtcatAvaliacao deve carregar no bootstrap.');
  await models.sequelize.close();

  console.log('Smoke SST simplificacao: OK');
}

run()
  .catch((error) => {
    console.error('Smoke SST simplificacao: FALHOU');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (originalMode === undefined) delete process.env.SST_SIMPLIFIED_MODE;
    else process.env.SST_SIMPLIFIED_MODE = originalMode;
  });
