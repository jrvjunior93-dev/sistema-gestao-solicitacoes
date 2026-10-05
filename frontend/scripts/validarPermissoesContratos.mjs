import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { getVisibleCommandItems } = await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
  const { canViewContratos, canCreateContratos, canViewContratosRelatorios } = await server.ssrLoadModule('/src/utils/acessoProduto.js');
  const usuario = {
    id: 33, perfil: 'USUARIO', setor: { codigo: 'OBRA' },
    areas_permissoes_configuradas: true, areas_permissoes: [], modulos_habilitados: []
  };
  const destinos = (permissoes) => getVisibleCommandItems({ ...usuario, areas_permissoes: permissoes })
    .map((item) => item.to)
    .filter((destino) => destino.startsWith('/contratos/') || destino === '/gestao-contratos')
    .sort();

  assert.deepEqual(destinos([]), []);
  assert.deepEqual(destinos(['contratos.geral.criar']), ['/contratos/novo']);
  assert.deepEqual(destinos(['contratos.geral.visualizar']), ['/gestao-contratos']);
  assert.deepEqual(destinos(['contratos.relatorios.visualizar']), [
    '/contratos/relatorios', '/contratos/relatorios/operacional'
  ]);
  assert.equal(canViewContratos(usuario), false);
  assert.equal(canCreateContratos(usuario), false);
  assert.equal(canViewContratosRelatorios(usuario), false);
  const app = fs.readFileSync(path.join(raiz, 'src/App.jsx'), 'utf8');
  assert.match(app, /path="contratos\/novo"[^\n]*can=\{canCreateContratos\}/);
  assert.match(app, /path="contratos\/relatorios\/operacional"[^\n]*can=\{canViewContratosRelatorios\}/);
  const gestao = fs.readFileSync(path.join(raiz, 'src/pages/GestaoContratos.jsx'), 'utf8');
  assert.match(gestao, /acaoPrincipal=\{podeCriarContratos \?/);
  const relatorios = fs.readFileSync(path.join(raiz, 'src/pages/ModuloRelatorios.jsx'), 'utf8');
  assert.match(relatorios, /permissao: 'contratosGestao'/);
  console.log('Rotas de Contratos no Ctrl+K respeitam as permissoes especificas.');
} finally {
  await server.close();
}
