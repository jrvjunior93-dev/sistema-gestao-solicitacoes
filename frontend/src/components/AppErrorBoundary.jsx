import React from 'react';
import { getFallbackRoute } from '../utils/navigation';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return (
    name.includes('chunkloaderror') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('importing a module script failed') ||
    message.includes('module script load failed')
  );
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      isChunkError: false
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
      isChunkError: isChunkLoadError(error)
    };
  }

  componentDidCatch(error, info) {
    console.error('Erro de renderizacao do frontend:', error, info);

    if (!isChunkLoadError(error) || typeof window === 'undefined') {
      return;
    }

    const retryKey = 'fluxy_chunk_reload_retry_at';
    const retryAt = Number(window.sessionStorage.getItem(retryKey) || 0);
    const alreadyRetriedRecently = Number.isFinite(retryAt) && Date.now() - retryAt < 60000;

    if (!alreadyRetriedRecently) {
      window.sessionStorage.setItem(retryKey, String(Date.now()));
      window.location.reload();
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, isChunkError: false });
    }
  }

  handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('fluxy_chunk_reload_retry_at');
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    /*
      ESTA TELA E A REDE DE SEGURANCA DE 201 ROTAS (06/09).

      Ela e instanciada UMA vez, em `main.jsx`, envolvendo o app inteiro:
      toda tela que quebrar ao montar cai aqui. Tinha tres defeitos que so
      apareciam quando alguem ja estava com problema.

      1. Os botoes usavam `btn-primary`/`btn-secondary` SEM o `.btn`. A
         FORMA (min-height 40px, padding, raio) mora no `.btn`; os
         modificadores so PINTAM. Medido a 390px: 92,5x24px e 40,9x24px,
         padding 0, raio 0. E o `.btn-secondary` pinta `#eef2f7`, que e
         exatamente o `--c-bg` da tela de fundo, com borda zerada pelo
         preflight — o "Voltar" NAO ERA botao pequeno, era TEXTO. Nao havia
         pixel que o distinguisse.
      2. O cartao usava `--c-card`, token que NAO EXISTE em CSS nenhum. O
         fundo resolvia para transparente: uma borda de 1px flutuando no
         cinza. O token real e `--c-surface`.
      3. Sem classe de bloco do sistema, a tela nao tinha bloco nenhum —
         era isso que a celula B1 media.

      Os dois primeiros o portao JA ACUSAVA: `provas/tokensExistem.mjs`
      imprime o fantasma `--c-card` desde sempre. Nao faltou descobrir;
      faltou agir sobre uma prova que ja estava vermelha.
    */
    return (
      <div className="min-h-screen bg-[var(--c-bg)] px-4 py-6 text-[var(--c-text)]">
        <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center">
          <div className="card rounded-[28px] border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-xl md:p-8">
            <div className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              Tela interrompida
            </div>
            <h1 className="text-lg font-bold">
              Não foi possível abrir esta tela.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--c-muted)]">
              {this.state.isChunkError
                ? 'Uma atualizacao do sistema pode ter deixado arquivos antigos no navegador. Atualize para carregar a versao mais recente.'
                : 'O sistema encontrou um erro ao montar esta pagina. Atualize a tela e tente novamente.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
                Atualizar tela
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.assign(getFallbackRoute(window.location.pathname));
                  }
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }
}
