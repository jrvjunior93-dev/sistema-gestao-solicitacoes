/**
 * SERVIDOR DA FIXTURE VIVA (React) usada por `provas/itensDoRunnerMordem.mjs`.
 *
 * Empacota `paginaRunner.jsx` — que monta os COMPONENTES REAIS do sistema —
 * com o esbuild que já vem no projeto, e serve tudo de 127.0.0.1:
 *
 *   /<qualquer rota>?d=<defeito>  → o HTML da fixture
 *   /prova-estilos.css            → o CSS REAL do sistema, concatenado
 *   /prova-bundle.js              → o pacote da fixture
 *
 * O CSS vai por `<link>`, NÃO por `page.addStyleTag`. A T3 RECARREGA a
 * página no meio da medição (é assim que ela prova a persistência da
 * largura), e estilo injetado por script morre na recarga: a segunda
 * medição cairia numa página sem folha de estilo nenhuma. O mesmo vale para
 * a X2, que roda numa aba nova aberta pelo próprio `checarMobile`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_FRONT = path.resolve(AQUI, '..', '..', '..');

/* NA MESMA ORDEM DE `src/main.jsx` — cascata é ordem. Ver a nota longa em
   `itensDaDoDMordem.mjs`: trocar a ordem inventa falhas de contraste. */
const CSS = [
  'src/index.css',
  'src/styles/design-tokens.css',
  'src/components/lista-avancada/lista-avancada.css',
  'src/styles/escala.css',
  'src/styles/componentes-padrao.css',
  'src/modules/solicitacao-compra/compras-responsive.css',
  'src/styles/responsive-system.css'
];

const HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture do runner</title>
<link rel="stylesheet" href="/prova-estilos.css">
</head><body><div id="root"></div>
<script>globalThis.__ENV_FIXTURE__ = {};</script>
<script src="/prova-bundle.js"></script>
</body></html>`;

export async function criarServidorDaFixture() {
  const pacote = await esbuild.build({
    entryPoints: [path.join(AQUI, 'paginaRunner.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    absWorkingDir: RAIZ_FRONT,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      // A fixture NÃO fala com API nenhuma; o módulo de serviços só é
      // arrastado pelo grafo de imports da BarraFiltros.
      'import.meta.env.VITE_API_URL': '"http://127.0.0.1:1/api"',
      'import.meta.env': 'globalThis.__ENV_FIXTURE__'
    }
  });
  const js = pacote.outputFiles[0].text;
  const css = CSS.map((rel) => fs.readFileSync(path.join(RAIZ_FRONT, rel), 'utf8')).join('\n\n');

  const servidor = http.createServer((req, res) => {
    const rota = req.url.split('?')[0];
    if (rota === '/prova-bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(js);
      return;
    }
    if (rota === '/prova-estilos.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      res.end(css);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  return {
    /** URL da fixture com UM defeito plantado (ou nenhum, se vazio). */
    rota: (defeito = '') => `http://127.0.0.1:${porta}/usuarios${defeito ? `?d=${defeito}` : ''}`,
    fechar: () => servidor.close()
  };
}
