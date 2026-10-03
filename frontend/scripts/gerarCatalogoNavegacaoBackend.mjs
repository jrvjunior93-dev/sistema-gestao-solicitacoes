// =====================================================================
// COMPILA A FONTE ÚNICA DE NAVEGAÇÃO PARA O BACKEND
// ---------------------------------------------------------------------
// A validação da "tela inicial" do usuário precisa acontecer NO BACKEND
// com as MESMAS regras de visibilidade do frontend — sem duplicar regra.
// Este script empacota navigationConfig.jsx (e tudo que ele importa,
// acessoProduto incluído) em um único arquivo CommonJS que o backend
// consegue dar require(): backend/src/generated/navegacaoFonteUnica.cjs.
//
// O arquivo gerado é COMMITADO (o backend não roda esbuild em produção).
// Ele é regenerado automaticamente no build do frontend (prebuild) e
// pode ser regenerado à mão com:  npm run gerar:navegacao  (no frontend/).
//
// ⚠️ ESTE SCRIPT NUNCA PODE FALHAR O BUILD. O frontend publica sozinho
// na Vercel a cada push; um erro aqui derrubaria o deploy inteiro por um
// artefato que só o backend consome — e o backend já degrada em silêncio
// sem o catálogo (telaInicialService: require falhou → login cai na
// Home). Por isso QUALQUER erro vira aviso no log e o processo sai com
// código 0. Dependências: só esbuild, que o Vite já traz — nada além do
// `npm install` do frontend.
// =====================================================================
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const { build } = await import('esbuild');
  const entrada = path.join(raiz, 'src/navigation/navigationConfig.jsx');
  const saida = path.resolve(raiz, '../backend/src/generated/navegacaoFonteUnica.cjs');

  fs.mkdirSync(path.dirname(saida), { recursive: true });

  await build({
    entryPoints: [entrada],
    bundle: true,
    outfile: saida,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    jsx: 'automatic',
    minify: true,
    define: {
      // O código da fonte única roda fora do Vite: import.meta.env vira
      // objeto vazio (os flags VITE_* ficam undefined, como no default).
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"'
    },
    logLevel: 'error',
    banner: {
      js: [
        '// ARQUIVO GERADO — NÃO EDITE À MÃO.',
        '// Fonte: frontend/src/navigation/navigationConfig.jsx (fonte única).',
        '// Regenerar: cd frontend && npm run gerar:navegacao'
      ].join('\n')
    }
  });

  console.log('Catálogo de navegação compilado em', path.relative(path.resolve(raiz, '..'), saida));
} catch (error) {
  console.warn('[gerar:navegacao] AVISO: falha ao compilar o catálogo de navegação para o backend.');
  console.warn('[gerar:navegacao] O build do frontend SEGUE NORMALMENTE; o backend degrada em silêncio');
  console.warn('[gerar:navegacao] (tela inicial cai na Home) enquanto o catálogo commitado não for regenerado.');
  console.warn('[gerar:navegacao]', error?.message || error);
}

process.exitCode = 0;
