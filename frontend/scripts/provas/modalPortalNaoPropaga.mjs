/**
 * Modal renderizado por portal nao pode repassar o clique ao card/tela que
 * o abriu. Esse foi o motivo de o modal de titulos do pedido desaparecer ao
 * clicar em uma area vazia: o clique chegava ao BlocoConteudo recolhivel e
 * o bloco desmontava o modal.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

const PAGINA = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModalPortal from '${path.join(RAIZ, 'src/components/ui/ModalPortal.jsx').replace(/\\/g, '/')}';

function App() {
  const [aberto, setAberto] = useState(true);
  const [cliquesTela, setCliquesTela] = useState(0);
  const [acoes, setAcoes] = useState(0);
  return (
    <div id="tela" onClick={() => setCliquesTela((valor) => valor + 1)}>
      <output id="cliques-tela">{cliquesTela}</output>
      <output id="acoes">{acoes}</output>
      {aberto ? (
        <ModalPortal onClose={() => setAberto(false)} closeOnEscape={false}>
          <div id="modal" role="dialog" aria-modal="true">
            <div id="area-vazia" style={{ width: 300, height: 100 }}>area vazia</div>
            <button id="acao" type="button" onClick={() => setAcoes((valor) => valor + 1)}>Executar</button>
            <button id="fechar" type="button" onClick={() => setAberto(false)}>Fechar</button>
          </div>
        </ModalPortal>
      ) : <span id="modal-fechado">fechado</span>}
    </div>
  );
}

createRoot(document.getElementById('raiz')).render(<App />);
`;

const bundle = await esbuild.build({
  stdin: { contents: PAGINA, resolveDir: RAIZ, loader: 'jsx' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' }
});

const servidor = http.createServer((req, res) => {
  if (req.url === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(bundle.outputFiles[0].text);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><body><div id="raiz"></div><script src="/app.js"></script></body></html>');
});

await new Promise((ok) => servidor.listen(0, ok));
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
await pagina.waitForSelector('#modal');

const resultados = [];
const conferir = (nome, esperado, obtido) => {
  const ok = esperado === obtido;
  resultados.push({ nome, ok, esperado, obtido });
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${nome} — esperado "${esperado}", obtido "${obtido}"`);
};

await pagina.locator('#area-vazia').click();
conferir('clique vazio mantem o modal aberto', 1, await pagina.locator('#modal').count());
conferir('clique do portal nao chega a tela', '0', await pagina.locator('#cliques-tela').textContent());

await pagina.locator('#acao').click();
conferir('acao interna continua funcionando', '1', await pagina.locator('#acoes').textContent());
conferir('acao interna tambem nao vaza para a tela', '0', await pagina.locator('#cliques-tela').textContent());

await pagina.locator('#fechar').click();
conferir('botao explicito fecha o modal', 1, await pagina.locator('#modal-fechado').count());

await navegador.close();
await new Promise((ok) => servidor.close(ok));

const falhas = resultados.filter((resultado) => !resultado.ok);
console.log(`\n[provas] Isolamento do portal de modal: ${resultados.length} medida(s), ${falhas.length} falha(s)`);
process.exitCode = falhas.length ? 1 : 0;
