'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { solicitarAditivo } = require('../src/services/contratoAditivoService');

async function run() {
  await assert.rejects(
    () => solicitarAditivo({ justificativa: 'Teste' }, { usuarioId: 1 }),
    /Negociacao Detalhada/
  );

  const raiz = path.resolve(__dirname, '../..');
  const routes = fs.readFileSync(path.join(raiz, 'backend/src/routes.js'), 'utf8');
  const modal = fs.readFileSync(path.join(raiz, 'frontend/src/components/contratos/ModalAditivoContrato.jsx'), 'utf8');
  const lista = fs.readFileSync(path.join(raiz, 'frontend/src/pages/SolicitacaoDetalhe/AditivosDoContrato.jsx'), 'utf8');

  assert.match(routes, /uploadNegociacaoContrato\.single\('negociacao'\)/);
  assert.match(modal, /name="aditivo_negociacao_detalhada"/);
  assert.match(modal, /required/);
  assert.match(modal, /Boolean\(negociacaoArquivo\)/);
  assert.match(lista, /negociacao_detalhada/);
  assert.match(lista, /Abrir documento/);

  console.log('Negociacao detalhada obrigatoria do termo aditivo validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
