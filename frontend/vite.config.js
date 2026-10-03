import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // O ALVO DO PROXY E OUTRA COISA QUE A URL DA API (21/08).
  //
  // `VITE_API_URL` acumulava dois papeis: o endereco que o NAVEGADOR chama e o destino que o dev
  // server repassa. Para o acesso pela rede local o primeiro precisa ser RELATIVO (`/api`), para o
  // navegador falar com o mesmo endereco de onde carregou a pagina — e ai o segundo ficaria vazio,
  // deixando o proxy sem destino. Por isso sao duas variaveis.
  const rawApiUrl = String(env.VITE_API_URL || '').trim();
  const proxyTarget = String(
    env.VITE_DEV_API_PROXY_TARGET
    || (/^https?:\/\//i.test(rawApiUrl) ? rawApiUrl.replace(/\/api\/?$/, '') : '')
    || 'http://127.0.0.1:8100'
  ).trim();

  return {
    plugins: [react()],
    // Marca de versão no bundle: o harness de QA visual (scripts/qa-preview)
    // compara este SHA com o commit local antes de verificar — checar um
    // build velho é o mesmo que não checar. A Vercel injeta o SHA no build.
    define: {
      __BUILD_SHA__: JSON.stringify(
        env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || ''
      )
    },
    server: {
      // Portas dedicadas ao Fluxy-V4 local para nao colidir com o projeto em C:\Fluxy,
      // que usa 5173/8000. strictPort evita subir silenciosamente em outra porta.
      port: 5273,
      strictPort: true,
      // Todas as interfaces, para a maquina ser alcancavel pela rede local. Quem restringe quem
      // entra e o firewall do Windows, com a regra limitada a sub-rede — e nao esta linha.
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        // `/uploads` tambem, e nao so `/api`: o backend serve os ANEXOS por ali, e `fileUrl()` monta
        // esse caminho a partir da origem da API. Com a URL relativa, o caminho passa a apontar para
        // o proprio dev server — sem esta linha, todo anexo daria 404 pela rede.
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
