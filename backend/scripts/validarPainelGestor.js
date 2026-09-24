const assert = require('assert');

const authorizationService = require('../src/services/authorizationService');
const db = require('../src/models');

const originalPermissionResolver = authorizationService.getAreaPermissionStateForUser;
const originalObraFindAll = db.Obra.findAll;
const originalUsuarioObraFindAll = db.UsuarioObra.findAll;

let permissionState = { bypass: false, permissions: [] };
authorizationService.getAreaPermissionStateForUser = async () => permissionState;
delete require.cache[require.resolve('../src/services/painelGestorService')];

const { listarObras, resolverEscopo } = require('../src/services/painelGestorService');

async function validar() {
  try {
    db.UsuarioObra.findAll = async () => [{ obra_id: 7 }];
    db.Obra.findAll = async (options) => {
      assert.deepStrictEqual(options.attributes, ['id', 'empresa_grupo_id']);
      return [{ id: 7, empresa_grupo_id: 11 }];
    };

    const escopo = await resolverEscopo({ id: 42 });
    assert.deepStrictEqual(escopo, { todas: false, obraIds: [7], empresaIds: [11] });

    permissionState = { bypass: true, permissions: [] };
    let consultaObras = null;
    db.Obra.findAll = async (options) => {
      consultaObras = options;
      return [];
    };

    await listarObras({ id: 1 });
    assert(consultaObras.attributes.includes('empresa_grupo_id'));
    assert(!consultaObras.attributes.includes('empresa_id'));
    assert.strictEqual(consultaObras.include[0].as, 'empresaGrupo');
    assert.strictEqual(consultaObras.include[0].required, false);

    console.log('Contrato de obras do Painel do Gestor validado com sucesso.');
  } finally {
    authorizationService.getAreaPermissionStateForUser = originalPermissionResolver;
    db.Obra.findAll = originalObraFindAll;
    db.UsuarioObra.findAll = originalUsuarioObraFindAll;
  }
}

validar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
