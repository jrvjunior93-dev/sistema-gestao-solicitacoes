// src/routes.js

const express = require('express');
const router = express.Router();

const fakeAuth = require('./middlewares/fakeAuth');
const permit = require('./middlewares/permissions');

const uploadComprovantes = require('./config/uploadComprovantes');

// Controllers
const SolicitacaoController = require('./controllers/SolicitacaoController');
const UsuarioController = require('./controllers/UsuarioController');
const CargoController = require('./controllers/CargoController');
const SetorController = require('./controllers/SetorController');
const ObraController = require('./controllers/ObraController');
const TipoSolicitacaoController = require('./controllers/TipoSolicitacaoController');
const DashboardController = require('./controllers/DashboardController');
const AuthController = require('./controllers/AuthController');
const ContratoController = require('./controllers/ContratoController');
const TipoMacroContratoController = require('./controllers/TipoMacroContratoController');
const TipoSubContratoController = require('./controllers/TipoSubContratoController');
const StatusSetorController = require('./controllers/StatusSetorController');
const ComprovanteController = require('./controllers/ComprovanteController');
const AnexoController = require('./controllers/AnexoController');
const NotificacaoController = require('./controllers/NotificacaoController');
const SetorPermissaoController = require('./controllers/SetorPermissaoController');
const ConfiguracaoSistemaController = require('./controllers/ConfiguracaoSistemaController');
//console.log('AnexoController =>', AnexoController);


// -------------------------------------------------------------------
// AUTH
// -------------------------------------------------------------------
router.post('/login', AuthController.login);
router.get('/configuracoes/tema', ConfiguracaoSistemaController.getTema);
const auth = require('./middlewares/auth');
router.use(auth);


// -------------------------------------------------------------------
// SOLICITAÇÕES
// -------------------------------------------------------------------

router.post('/solicitacoes', SolicitacaoController.create);
router.get('/solicitacoes', SolicitacaoController.index);
router.get('/solicitacoes/:id', SolicitacaoController.show);
router.patch('/solicitacoes/:id/status', SolicitacaoController.updateStatus);
router.patch('/solicitacoes/:id/pedido', SolicitacaoController.atualizarNumeroPedido);
router.patch('/solicitacoes/:id/valor', SolicitacaoController.atualizarValor);
router.get('/solicitacoes/resumo', SolicitacaoController.resumo);
router.post('/solicitacoes/:id/comentarios', SolicitacaoController.adicionarComentario);
router.post('/solicitacoes/:id/enviar-setor', SolicitacaoController.enviarParaSetor);
router.post('/solicitacoes/:id/assumir', SolicitacaoController.assumirSolicitacao);
router.patch('/solicitacoes/:id/ocultar', SolicitacaoController.ocultarDaMinhaLista);
router.delete('/solicitacoes/:id', SolicitacaoController.excluir);

// -------------------------------------------------------------------
// NOTIFICACOES
// -------------------------------------------------------------------
router.get('/notificacoes', NotificacaoController.index);
router.patch('/notificacoes/:id/lida', NotificacaoController.marcarLida);
router.patch('/notificacoes/lidas', NotificacaoController.marcarTodasLidas);



// -------------------------------------------------------------------
// ANEXOS (UPLOAD DENTRO DA SOLICITAÇÃO)
// -------------------------------------------------------------------

router.post(
  '/anexos/upload',
  uploadComprovantes.array('files'),
  AnexoController.upload
);

router.get(
  '/anexos/presign',
  AnexoController.presign
);

router.get(
  '/solicitacoes/:id/anexos',
  AnexoController.listarPorSolicitacao
);
// -------------------------------------------------------------------
// COMPROVANTES
// -------------------------------------------------------------------
const allowComprovantes = (req, res, next) => {
  const { perfil, area, setor_id } = req.user;
  if (
    perfil === 'SUPERADMIN' ||
    perfil === 'FINANCEIRO' ||
    area === 'FINANCEIRO' ||
    setor_id === 4
  ) {
    return next();
  }
  return res.status(403).json({ error: 'Acesso negado' });
};

router.post(
  '/comprovantes/upload-massa',
  allowComprovantes,
  uploadComprovantes.array('files'),
  ComprovanteController.uploadMassa
);

router.get(
  '/comprovantes/solicitacoes',
  allowComprovantes,
  ComprovanteController.solicitacoes
);

router.get(
  '/comprovantes/pendentes',
  allowComprovantes,
  ComprovanteController.pendentes
);

router.post(
  '/comprovantes/:id/vincular',
  allowComprovantes,
  ComprovanteController.vincular
);
// -------------------------------------------------------------------
// USUÁRIOS
// -------------------------------------------------------------------

router.get('/usuarios', UsuarioController.index);
router.get('/usuarios/:id', UsuarioController.show);
router.post('/usuarios', UsuarioController.create);
router.put('/usuarios/:id', UsuarioController.update);
router.patch('/usuarios/me/senha', UsuarioController.alterarSenha);
router.patch('/usuarios/:id/ativar', UsuarioController.ativar);
router.patch('/usuarios/:id/desativar', UsuarioController.desativar);
router.post('/solicitacoes/:id/atribuir', SolicitacaoController.atribuirResponsavel);




// -------------------------------------------------------------------
// CARGOS
// -------------------------------------------------------------------

router.get('/cargos', CargoController.index);
router.post('/cargos', permit(['SUPERADMIN']), CargoController.create);
router.patch('/cargos/:id', permit(['SUPERADMIN']), CargoController.update);
router.patch('/cargos/:id/ativar', permit(['SUPERADMIN']), CargoController.ativar);
router.patch('/cargos/:id/desativar', permit(['SUPERADMIN']), CargoController.desativar);

// -------------------------------------------------------------------
// SETORES
// -------------------------------------------------------------------

router.get('/setores', SetorController.index);
router.post('/setores', permit(['SUPERADMIN']), SetorController.create);
router.patch('/setores/:id', permit(['SUPERADMIN']), SetorController.update);
router.patch('/setores/:id/ativar', permit(['SUPERADMIN']), SetorController.ativar);
router.patch('/setores/:id/desativar', permit(['SUPERADMIN']), SetorController.desativar);

// -------------------------------------------------------------------
// OBRAS
// -------------------------------------------------------------------

router.get('/obras', ObraController.index);
router.get('/obras/minhas', ObraController.minhas);
router.post('/obras', permit(['SUPERADMIN']), ObraController.create);
router.patch('/obras/:id', permit(['SUPERADMIN']), ObraController.update);
router.patch('/obras/:id/ativar', permit(['SUPERADMIN']), ObraController.ativar);
router.patch('/obras/:id/desativar', permit(['SUPERADMIN']), ObraController.desativar);

// -------------------------------------------------------------------
// TIPOS DE SOLICITAÇÃO
// -------------------------------------------------------------------

router.get('/tipos-solicitacao', TipoSolicitacaoController.index);
router.post('/tipos-solicitacao', permit(['SUPERADMIN']), TipoSolicitacaoController.create);
router.patch('/tipos-solicitacao/:id', permit(['SUPERADMIN']), TipoSolicitacaoController.update);
router.patch('/tipos-solicitacao/:id/ativar', permit(['SUPERADMIN']), TipoSolicitacaoController.ativar);
router.patch('/tipos-solicitacao/:id/desativar', permit(['SUPERADMIN']), TipoSolicitacaoController.desativar);

// -------------------------------------------------------------------
// TIPOS MACRO E SUB DE CONTRATO
// -------------------------------------------------------------------

router.get('/tipos-macro-contrato', TipoMacroContratoController.index);
router.post('/tipos-macro-contrato', permit(['SUPERADMIN']), TipoMacroContratoController.create);
router.patch('/tipos-macro-contrato/:id', permit(['SUPERADMIN']), TipoMacroContratoController.update);
router.patch('/tipos-macro-contrato/:id/ativar', permit(['SUPERADMIN']), TipoMacroContratoController.ativar);
router.patch('/tipos-macro-contrato/:id/desativar', permit(['SUPERADMIN']), TipoMacroContratoController.desativar);

router.get('/tipos-sub-contrato', TipoSubContratoController.index);
router.post('/tipos-sub-contrato', permit(['SUPERADMIN']), TipoSubContratoController.create);
router.patch('/tipos-sub-contrato/:id', permit(['SUPERADMIN']), TipoSubContratoController.update);
router.patch('/tipos-sub-contrato/:id/ativar', permit(['SUPERADMIN']), TipoSubContratoController.ativar);
router.patch('/tipos-sub-contrato/:id/desativar', permit(['SUPERADMIN']), TipoSubContratoController.desativar);

// -------------------------------------------------------------------
// STATUS POR SETOR (SUPERADMIN)
// -------------------------------------------------------------------

router.get('/status-setor', StatusSetorController.index);
router.post('/status-setor', permit(['SUPERADMIN']), StatusSetorController.create);
router.patch('/status-setor/:id', permit(['SUPERADMIN']), StatusSetorController.update);
router.patch('/status-setor/:id/ativar', permit(['SUPERADMIN']), StatusSetorController.ativar);
router.patch('/status-setor/:id/desativar', permit(['SUPERADMIN']), StatusSetorController.desativar);

// -------------------------------------------------------------------
// PERMISSOES POR SETOR (SUPERADMIN)
// -------------------------------------------------------------------

router.get('/setor-permissoes', SetorPermissaoController.index);
router.patch('/setor-permissoes', permit(['SUPERADMIN']), SetorPermissaoController.upsert);

// -------------------------------------------------------------------
// CONFIGURACOES DO SISTEMA (SUPERADMIN)
// -------------------------------------------------------------------

router.patch('/configuracoes/tema', permit(['SUPERADMIN']), ConfiguracaoSistemaController.updateTema);
router.get('/configuracoes/areas-obra', ConfiguracaoSistemaController.getAreasObra);
router.patch('/configuracoes/areas-obra', permit(['SUPERADMIN']), ConfiguracaoSistemaController.updateAreasObra);

// -------------------------------------------------------------------
// CONTRATOS
// -------------------------------------------------------------------

router.get('/contratos', ContratoController.index);
router.get('/contratos/resumo', ContratoController.resumo);
router.get('/contratos/:id/solicitacoes', ContratoController.solicitacoes);
router.get('/contratos/:id/anexos', ContratoController.listarAnexos);
router.post('/contratos', ContratoController.create);
router.post('/contratos/:id/anexos', uploadComprovantes.array('files'), ContratoController.uploadAnexos);
router.patch('/contratos/:id', ContratoController.update);
router.patch('/contratos/:id/ativar', ContratoController.ativar);
router.patch('/contratos/:id/desativar', ContratoController.desativar);

// -------------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------------

router.get('/dashboard/executivo', DashboardController.executivo);

module.exports = router;
