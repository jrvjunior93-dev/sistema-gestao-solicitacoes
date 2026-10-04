import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fonte = (arquivo) => readFileSync(path.join(raiz, arquivo), 'utf8');
const server = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { resolverRotaInicial } = await server.ssrLoadModule('/src/navigation/telaInicialRoute.js');
  const superadmin = { id: 1, perfil: 'SUPERADMIN', setor: { codigo: 'SUPORTE' }, modulos_habilitados: [] };

  assert.equal(resolverRotaInicial(superadmin), '/', 'Sem escolha, Inicio abre o menu.');
  assert.equal(resolverRotaInicial({
    ...superadmin,
    tela_inicial: { id: 'painel-gestor', to: '/painel-gestor' }
  }), '/painel-gestor', 'A escolha do SUPERADMIN deve ser respeitada.');
  const usuarioComum = { id: 2, perfil: 'USUARIO', setor: { codigo: 'OBRA' }, modulos_habilitados: [] };
  assert.equal(resolverRotaInicial({
    ...usuarioComum,
    tela_inicial: { id: 'perfil', to: '/perfil' }
  }), '/perfil', 'A preferencia individual nao pode depender do perfil SUPERADMIN.');
  assert.equal(resolverRotaInicial({
    ...superadmin,
    tela_inicial: { id: 'painel-gestor', to: '/outra-rota' }
  }), '/', 'Uma rota adulterada nao pode ser usada como Inicio.');
  assert.equal(resolverRotaInicial({
    ...superadmin,
    tela_inicial: { id: 'tela-inexistente', to: '/painel-gestor' }
  }), '/', 'Uma tela que saiu do catalogo volta ao menu.');

  const app = fonte('src/App.jsx');
  const layout = fonte('src/layout/Layout.jsx');
  const login = fonte('src/pages/Login/index.jsx');
  const perfil = fonte('src/pages/Perfil.jsx');

  assert.match(app, /<Route index element={<HomeEntry \/>} \/>/);
  assert.match(app, /<Route path="modulos" element={<HomeHub \/>} \/>/);
  assert.match(login, /navigate\(resolverRotaInicial\(data\?\.user\)\)/);
  assert.match(layout, /<Link to="\/modulos" className="fx-brand"/);
  assert.match(layout, /<Link to="\/" className="fx-home-btn"/);
  assert.match(perfil, /Menu de módulos \(padrão\)/);

  console.log('Tela inicial individual validada: login, Inicio, menu explicito e fallback seguro.');
} finally {
  await server.close();
}
