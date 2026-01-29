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
//const ComprovanteController = require('./controllers/ComprovanteController');
const AnexoController = require('./controllers/AnexoController');
//console.log('AnexoController =>', AnexoController);


// -------------------------------------------------------------------
// AUTH
// -------------------------------------------------------------------
router.post('/login', AuthController.login);
const auth = require('./middlewares/auth');
router.use(auth);


// -------------------------------------------------------------------
// SOLICITAÇÕES
// -------------------------------------------------------------------

router.post('/solicitacoes', SolicitacaoController.create);
router.get('/solicitacoes', SolicitacaoController.index);
router.get('/solicitacoes/:id', SolicitacaoController.show);
router.patch('/solicitacoes/:id/status', SolicitacaoController.updateStatus);
router.get('/solicitacoes/resumo', SolicitacaoController.resumo);
router.post('/solicitacoes/:id/comentarios', SolicitacaoController.adicionarComentario);
router.post('/solicitacoes/:id/enviar-setor', SolicitacaoController.enviarParaSetor);
router.post('/solicitacoes/:id/enviar-setor', SolicitacaoController.enviarParaSetor);
router.post('/solicitacoes/:id/assumir', SolicitacaoController.assumirSolicitacao);



// -------------------------------------------------------------------
// ANEXOS (UPLOAD DENTRO DA SOLICITAÇÃO)
// -------------------------------------------------------------------

router.post(
  '/anexos/upload',
  uploadComprovantes.array('files'),
  AnexoController.upload
);

router.get(
  '/solicitacoes/:id/anexos',
  AnexoController.listarPorSolicitacao
);
// -------------------------------------------------------------------
// COMPROVANTES
// -------------------------------------------------------------------
/*
router.post(
  '/comprovantes/upload',
  uploadComprovantes.array('files'),
  ComprovanteController.uploadEmMassa
);

router.get(
  '/comprovantes/pendentes',
  ComprovanteController.pendentes
);
*/
// -------------------------------------------------------------------
// USUÁRIOS
// -------------------------------------------------------------------

router.get('/usuarios', UsuarioController.index);
router.post('/usuarios', UsuarioController.create);
router.put('/usuarios/:id', UsuarioController.update);
router.patch('/usuarios/:id/ativar', UsuarioController.ativar);
router.patch('/usuarios/:id/desativar', UsuarioController.desativar);
router.post('/solicitacoes/:id/atribuir', SolicitacaoController.atribuirResponsavel);
router.post('/:id/comentarios', SolicitacaoController.adicionarComentario);




// -------------------------------------------------------------------
// CARGOS
// -------------------------------------------------------------------

router.get('/cargos', CargoController.index);
router.post('/cargos', CargoController.create);
router.patch('/cargos/:id/ativar', CargoController.ativar);
router.patch('/cargos/:id/desativar', CargoController.desativar);

// -------------------------------------------------------------------
// SETORES
// -------------------------------------------------------------------

router.get('/setores', SetorController.index);
router.post('/setores', SetorController.create);
router.patch('/setores/:id/ativar', SetorController.ativar);
router.patch('/setores/:id/desativar', SetorController.desativar);

// -------------------------------------------------------------------
// OBRAS
// -------------------------------------------------------------------

router.get('/obras', ObraController.index);
router.post('/obras', ObraController.create);
router.patch('/obras/:id', ObraController.update);
router.patch('/obras/:id/ativar', ObraController.ativar);
router.patch('/obras/:id/desativar', ObraController.desativar);

// -------------------------------------------------------------------
// TIPOS DE SOLICITAÇÃO
// -------------------------------------------------------------------

router.get('/tipos-solicitacao', TipoSolicitacaoController.index);
router.post('/tipos-solicitacao', TipoSolicitacaoController.create);
router.patch('/tipos-solicitacao/:id/ativar', TipoSolicitacaoController.ativar);
router.patch('/tipos-solicitacao/:id/desativar', TipoSolicitacaoController.desativar);

// -------------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------------

router.get('/dashboard/executivo', DashboardController.executivo);

module.exports = router;
