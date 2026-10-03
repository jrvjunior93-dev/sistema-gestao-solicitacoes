/**
 * D5 — SÓ O ESC FECHA, O CLIQUE FORA NÃO (06/09).
 *
 * O cliente decidiu que três listas de resultado EM FLUXO (favorecidos da
 * medição, subitens do planejamento, credores do contrato) ganham o Esc e
 * NÃO ganham o fechamento por clique fora. O motivo é medido: elas não
 * cobrem nada, empurram o formulário; e converter por inteiro faria clicar
 * em outro campo do MESMO formulário sumir com a lista — no caso dos
 * credores, a lista é o único caminho para vincular um credor ao contrato.
 *
 * Esta prova existe porque a afirmação tem DOIS lados, e o segundo é o que
 * costuma passar calado: é fácil provar que o Esc fecha, e fácil esquecer
 * de provar que o clique fora NÃO fecha. Uma opção `apenasEsc` que fosse
 * ignorada passaria despercebida — a lista fecharia nos dois casos e
 * ninguém notaria até um usuário perder o vínculo de credor no meio do
 * preenchimento.
 *
 * Monta o gancho REAL (`src/hooks/useFecharAoSair.js`), não uma cópia.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

const PAGINA = `
import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useFecharAoSair } from '${path.join(RAIZ, 'src/hooks/useFecharAoSair.js').replace(/\\/g, '/')}';

function Lista({ id, apenasEsc }) {
  const [aberta, setAberta] = useState(true);
  const ref = useRef(null);
  useFecharAoSair(ref, aberta, () => setAberta(false), apenasEsc ? { apenasEsc: true } : undefined);
  return (
    <div>
      <div ref={ref} id={id} style={{ padding: 20 }}>
        {aberta ? <span data-aberta={id}>lista aberta</span> : <span data-fechada={id}>lista fechada</span>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')).render(
  <div>
    <div id="fora" style={{ height: 120, background: '#eee' }}>area fora</div>
    <Lista id="so-esc" apenasEsc />
    <Lista id="padrao" apenasEsc={false} />
  </div>
);
`;

const bundle = await esbuild.build({
  stdin: { contents: PAGINA, resolveDir: RAIZ, loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' }
});
const js = bundle.outputFiles[0].text;

const servidor = http.createServer((req, res) => {
  if (req.url === '/app.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(js); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><body><div id="raiz"></div><script src="/app.js"></script></body></html>');
});
await new Promise((ok) => servidor.listen(0, ok));
const porta = servidor.address().port;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(`http://127.0.0.1:${porta}/`);
await pagina.waitForSelector('[data-aberta="so-esc"]');

const resultados = [];
const conferir = (nome, esperado, obtido) => {
  const ok = esperado === obtido;
  resultados.push({ nome, ok, esperado, obtido });
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${nome} — esperado "${esperado}", obtido "${obtido}"`);
};

const estado = async (id) => (await pagina.locator(`[data-aberta="${id}"]`).count()) ? 'aberta' : 'fechada';

/* 1 — clique fora NAO fecha a que so ouve Esc, e FECHA a padrao.
   As duas no mesmo clique: mesmo evento, comportamentos diferentes. */
await pagina.locator('#fora').click();
conferir('clique fora NAO fecha a lista de apenasEsc', 'aberta', await estado('so-esc'));
conferir('clique fora FECHA a camada padrao (nada regrediu)', 'fechada', await estado('padrao'));

/* 2 — Esc fecha a que sobrou. */
await pagina.keyboard.press('Escape');
conferir('Esc fecha a lista de apenasEsc', 'fechada', await estado('so-esc'));

await navegador.close();
await new Promise((ok) => servidor.close(ok));

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n[provas] Esc sem clique fora: ${resultados.length} medida(s), ${falhas.length} falha(s)`);
process.exitCode = falhas.length ? 1 : 0;
