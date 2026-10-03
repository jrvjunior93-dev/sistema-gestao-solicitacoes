const assert = require('assert');
const fs = require('fs');
const path = require('path');

const authorizationService = require('../src/services/authorizationService');
const db = require('../src/models');

const originalPermissionResolver = authorizationService.getAreaPermissionStateForUser;
const originalObraFindAll = db.Obra.findAll;
const originalUsuarioObraFindAll = db.UsuarioObra.findAll;
const originalContaFindAll = db.ContaBancaria.findAll;

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

    const painelServiceSource = fs.readFileSync(path.resolve(__dirname, '../src/services/painelGestorService.js'), 'utf8');
    const permissionRegistrySource = fs.readFileSync(path.resolve(__dirname, '../src/constants/moduloPermissoes.js'), 'utf8');
    const accessSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/acessoProduto.js'), 'utf8');
    const appSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/App.jsx'), 'utf8');
    const painelPermissionKeys = [
      'painel_gestor.acessar',
      'painel_gestor.escopo.todas_obras',
      'painel_gestor.resultado_obras.visualizar',
      'painel_gestor.custos_recebiveis.visualizar',
      'painel_gestor.saldos.visualizar',
      'painel_gestor.saldos.informar',
      'painel_gestor.saldos.corrigir'
    ];
    painelPermissionKeys.forEach((permissionKey) => {
      assert(permissionRegistrySource.includes(permissionKey), `Permissao ausente no registro central: ${permissionKey}`);
      assert(painelServiceSource.includes(permissionKey), `Permissao sem regra no backend do Painel do Gestor: ${permissionKey}`);
    });
    painelPermissionKeys
      .filter((permissionKey) => permissionKey !== 'painel_gestor.escopo.todas_obras')
      .forEach((permissionKey) => {
        assert(accessSource.includes(permissionKey), `Permissao sem regra no frontend do Painel do Gestor: ${permissionKey}`);
      });
    assert(appSource.includes('PainelGestorRoute'), 'Rota principal do Painel do Gestor deve permanecer protegida.');
    assert(appSource.includes('PainelGestorSaldosRoute'), 'Rota de lancamento de saldos deve permanecer protegida.');
    assert(painelServiceSource.includes('contaPossuiSaldoAutomatico'), 'Contas controladas devem usar saldo automatico no Painel do Gestor.');
    assert(painelServiceSource.includes('PAINEL_GESTOR_SALDO_AUTOMATICO'), 'Backend deve bloquear informacao manual para conta automatica.');
    const painelPageSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PainelGestor.jsx'), 'utf8');
    assert(painelPageSource.includes('Detalhar por conta'), 'Resumo principal deve expandir o detalhe de todas as contas.');
    assert(painelPageSource.includes('pg-balance-entry'), 'A aba de saldos deve permitir informar contas em um painel expansivel.');
    assert(painelPageSource.includes('Saldo atual por conta'), 'A aba de saldos deve manter os cards de saldo atual visiveis.');
    assert(painelPageSource.includes('salvarSaldosPainelGestor'), 'A informacao de saldos deve ser salva diretamente na aba protegida.');

    console.log('Contrato de obras do Painel do Gestor validado com sucesso.');
  } finally {
    authorizationService.getAreaPermissionStateForUser = originalPermissionResolver;
    db.Obra.findAll = originalObraFindAll;
    db.UsuarioObra.findAll = originalUsuarioObraFindAll;
    db.ContaBancaria.findAll = originalContaFindAll;
  }
}

validar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
