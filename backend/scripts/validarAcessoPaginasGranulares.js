'use strict';

const assert = require('node:assert/strict');
const { ConfiguracaoSistema } = require('../src/models');
const auth = require('../src/services/authorizationService');
const prioridadeAcesso = require('../src/services/prioridadeDiretoriaAcesso');
const aprovacaoConfig = require('../src/services/aprovacaoDiretoriaConfig');
const usuariosSetores = require('../src/services/usuariosSetores');

const usuario = { id: 33, perfil: 'USUARIO', setor_id: 4, setor: { id: 4, codigo: 'FINANCEIRO' } };
const originalFindOne = ConfiguracaoSistema.findOne;
const originalPrioridadeAcesso = prioridadeAcesso.obterAcessoPrioridadeDiretoriaPorUsuario;
const originalAprovacao = aprovacaoConfig.obterConfiguracaoAprovacaoDiretoria;
const originalSetores = usuariosSetores.obterTokensSetoresUsuario;
let permissoes = [];

ConfiguracaoSistema.findOne = async () => ({ valor: JSON.stringify({ usuarios: { [usuario.id]: permissoes } }) });
prioridadeAcesso.obterAcessoPrioridadeDiretoriaPorUsuario = async () => ({ modo: 'TODOS' });
aprovacaoConfig.obterConfiguracaoAprovacaoDiretoria = async () => ({
  diretoriasPorClassificacao: { PUBLICA: 'DIR_OBRAS_PUBLICAS', PRIVADA: 'DIR_OBRAS_PRIVADAS' }
});
usuariosSetores.obterTokensSetoresUsuario = async () => ['FINANCEIRO'];
const PrioridadeDiretoriaController = require('../src/controllers/PrioridadeDiretoriaController');

async function conferir(keys, esperado) {
  permissoes = keys;
  auth.invalidatePermissoesAreasCache();
  assert.deepEqual(await Promise.all([
    auth.canViewPrioridadesDiretoria(usuario),
    auth.canAccessPagamentos(usuario),
    auth.canAccessFilaPagamentos(usuario),
    auth.canAccessBoletos(usuario)
  ]), esperado);
}

async function contextoStatus(keys) {
  permissoes = keys;
  auth.invalidatePermissoesAreasCache();
  let status = 200;
  const res = {
    status(value) { status = value; return this; },
    json() { return this; }
  };
  await PrioridadeDiretoriaController.contexto({ user: usuario }, res);
  return status;
}

(async () => {
  try {
    await conferir([], [false, false, false, false]);
    await conferir([
      'solicitacoes.prioridades.criar',
      'financeiro.pagamentos.preparar',
      'financeiro.fila_pagamentos.baixar',
      'boletos.emitir.gerar'
    ], [false, false, false, false]);
    assert.equal(await contextoStatus([]), 403);
    assert.equal(await contextoStatus(['solicitacoes.prioridades.criar']), 403);
    await conferir([
      'solicitacoes.prioridades.visualizar',
      'financeiro.pagamentos.visualizar',
      'financeiro.fila_pagamentos.visualizar',
      'boletos.emitir.visualizar'
    ], [true, true, true, true]);
    console.log('API exige visualizar para Prioridades e leituras financeiras; acesso legado nao se sobrepoe.');
  } finally {
    ConfiguracaoSistema.findOne = originalFindOne;
    prioridadeAcesso.obterAcessoPrioridadeDiretoriaPorUsuario = originalPrioridadeAcesso;
    aprovacaoConfig.obterConfiguracaoAprovacaoDiretoria = originalAprovacao;
    usuariosSetores.obterTokensSetoresUsuario = originalSetores;
    auth.invalidatePermissoesAreasCache();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
