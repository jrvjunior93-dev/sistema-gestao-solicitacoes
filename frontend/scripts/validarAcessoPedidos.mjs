import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { canViewComprasPedidos } = await server.ssrLoadModule('/src/utils/acessoProduto.js');
  const { NAV_MODULES, getVisibleCommandItems } = await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
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

  assert.equal(canViewComprasPedidos(base), false, 'Poder criar solicitacao nao libera pedidos');
  assert.equal(pedidosNoCtrlK(base), false, 'Ctrl+K nao lista pedidos sem permissao');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes: ['compras.relatorios.pedidos'] }), false,
    'Relatorio de pedidos nao libera a pagina operacional');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes: ['compras.pedidos.visualizar'] }), true,
    'Visualizar pedidos libera a pagina na busca');
  assert.equal(pedidosNoCtrlK({ ...base, areas_permissoes_configuradas: false }), false,
    'Sem configuracao granular nao ha acesso implicito a pedidos');

  console.log('Catalogo do Ctrl+K e acesso a Pedidos de Compra coerentes com as permissoes.');
} finally {
  await server.close();
}
