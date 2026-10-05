import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { getVisibleCommandItems } = await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
  const acesso = await server.ssrLoadModule('/src/utils/acessoProduto.js');
  const usuario = {
    id: 33,
    perfil: 'USUARIO',
    setor: { codigo: 'FINANCEIRO' },
    areas_permissoes_configuradas: true,
    areas_permissoes: [],
    prioridade_diretoria_acesso: { modo: 'TODOS' },
    modulos_habilitados: []
  };
  const destinos = (keys) => getVisibleCommandItems({ ...usuario, areas_permissoes: keys })
    .map((item) => item.to);

  assert.equal(acesso.canAccessPrioridadesDiretoria(usuario), false);
  assert.equal(acesso.canAccessPagamentos(usuario), false);
  assert.equal(acesso.canAccessFilaPagamentos(usuario), false);
  assert.equal(acesso.canAccessFinanceiroDda(usuario), false);
  assert.equal(acesso.canAccessBoletos(usuario), false);
  assert.equal(acesso.canAccessFinanceiroArea(usuario, 'financeiro.titulos.visualizar'), false);
  assert.equal(destinos([]).includes('/prioridades-diretoria'), false);
  assert.equal(destinos([]).includes('/financeiro/titulos?tipo=pagar'), false);

  for (const [acao, destino] of [
    ['solicitacoes.prioridades.criar', '/prioridades-diretoria'],
    ['financeiro.pagamentos.preparar', '/financeiro/pagamentos'],
    ['financeiro.fila_pagamentos.baixar', '/financeiro/fila-pagamentos'],
    ['financeiro.dda.sincronizar', '/financeiro/dda'],
    ['boletos.emitir.gerar', '/financeiro/boletos']
  ]) {
    assert.equal(destinos([acao]).includes(destino), false, `${acao} abriu ${destino} sem visualizar`);
  }

  for (const [visualizar, destino] of [
    ['solicitacoes.prioridades.visualizar', '/prioridades-diretoria'],
    ['financeiro.titulos.visualizar', '/financeiro/titulos?tipo=pagar'],
    ['financeiro.pagamentos.visualizar', '/financeiro/pagamentos'],
    ['financeiro.fila_pagamentos.visualizar', '/financeiro/fila-pagamentos'],
    ['financeiro.dda.visualizar', '/financeiro/dda'],
    ['boletos.emitir.visualizar', '/financeiro/boletos']
  ]) {
    assert.equal(destinos([visualizar]).includes(destino), true, `${visualizar} nao abriu ${destino}`);
  }

  console.log('Menu e Ctrl+K exigem visualizar para Prioridades e paginas financeiras.');
} finally {
  await server.close();
}
