import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { canViewComprasPedidos } = await server.ssrLoadModule('/src/utils/acessoProduto.js');
  const { NAV_MODULES, getVisibleCommandItems, getVisibleModule, getVisibleItems, resolveLabel, findActiveNode } = await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
  const base = {
    id: 33, perfil: 'USUARIO', setor: { codigo: 'OBRA' },
    pode_criar_solicitacao_compra: true, modulos_habilitados: [],
    areas_permissoes_configuradas: true, areas_permissoes: []
  };
  const pedidosNoCtrlK = (user) => getVisibleCommandItems(user).some((item) => item.to === '/pedidos-compra');
  const semGuarda = NAV_MODULES.flatMap((mod) => [...mod.children, ...(mod.commandItems || [])]
    .filter((item) => typeof item.can !== 'function').map((item) => `${mod.id}:${item.to}`));
  assert.deepEqual(semGuarda, [], 'Todos os destinos do Ctrl+K precisam ter guarda de permissao');
  assert.deepEqual(getVisibleCommandItems(base).map((item) => item.to).sort(), [
    '/solicitacoes', '/nova-solicitacao', '/solicitacoes-arquivadas', '/rh-dp/pessoal', '/perfil'
  ].sort(), 'Usuario de obra sem permissoes granulares so ve rotas liberadas pela propria regra da rota');

  const moduloObra = getVisibleModule(base, 'rhdp');
  assert.equal(moduloObra.label, 'Colaboradores');
  assert.equal(resolveLabel(moduloObra, base), 'Colaboradores');
  assert.equal(moduloObra.desc, 'Solicitações e Pagamentos');
  assert.deepEqual(moduloObra.children.map(item => item.to), ['/rh-dp/pessoal']);
  assert.equal(getVisibleItems(base).find(item => item.id === 'rhdp-pessoal').moduleLabel, 'Colaboradores');
  assert.equal(getVisibleCommandItems(base).find(item => item.id === 'rhdp-pessoal').moduleLabel, 'Colaboradores');
  assert.equal(findActiveNode(base, '/rh-dp/pessoal').module.label, 'Colaboradores');
  assert.equal(getVisibleModule({ ...base, setor: { codigo: 'CANTEIRO', eh_setor_obra: true } }, 'rhdp').label, 'Colaboradores');
  const administrador = { ...base, perfil: 'SUPERADMIN', setor: { codigo: 'DP' } };
  const moduloDp = getVisibleModule(administrador, 'rhdp');
  assert.equal(moduloDp.label, 'RH/DP');
  assert.equal(moduloDp.desc, 'Colaboradores, apuração e fechamentos.');
  assert.equal(NAV_MODULES.find(mod => mod.id === 'rhdp').label, 'RH/DP', 'Catalogo base nao e mutado por usuario');
  const { default: NavCard } = await server.ssrLoadModule('/src/navigation/NavCard.jsx');
  const card = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' },
    React.createElement(NavCard, { to: '/rh-dp/pessoal', label: moduloObra.label, desc: moduloObra.desc, icon: moduloObra.icon })));
  assert.ok(card.includes('Colaboradores') && card.includes('Solicitações e Pagamentos'));
  assert.ok(card.includes('href="/rh-dp/pessoal"'));
  assert.ok(!card.includes('RH/DP'), 'Card real nao exibe rotulo administrativo para OBRA');

  assert.equal(canViewComprasPedidos(base), false, 'Poder criar solicitacao nao libera pedidos');
  assert.equal(pedidosNoCtrlK(base), false, 'Ctrl+K nao lista pedidos sem permissao');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes: ['compras.relatorios.pedidos'] }), false,
    'Relatorio de pedidos nao libera a pagina operacional');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes: ['compras.pedidos.visualizar'] }), true,
    'Visualizar pedidos libera a pagina na busca');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes_configuradas: false }), false,
    'Sem configuracao granular nao ha acesso implicito a pedidos');

  console.log('Menu/card Colaboradores para OBRA, RH/DP nos demais setores, destinos/atalhos e Ctrl+K preservados; acesso a Pedidos coerente com permissoes.');
} finally {
  await server.close();
}
