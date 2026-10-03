import { useEffect } from 'react';
import ModalPortal from '../../../components/ui/ModalPortal';
import { isImagePreview, isPdfPreview } from '../utils/preview';

/**
 * VISUALIZADOR DE ARQUIVO DA COMPRA — casca única de pré-visualização,
 * usada por cinco telas do módulo (nova solicitação, revisão, revisão da
 * compra direta, recibo final e detalhe da cotação). O contrato é o mesmo
 * de sempre: `preview` (ou `null`) e `onClose`.
 *
 * ## Por que ele passou a compor o `ModalPortal` (05/09)
 *
 * A versão anterior travava a rolagem escrevendo, ela própria,
 * `document.body.style.overflow = 'hidden'` — e guardava o valor anterior
 * numa variável do seu próprio efeito. Dois problemas, ambos silenciosos:
 *
 * 1. **R18.** É `overflow: hidden` num ancestral de TUDO que é sticky.
 *    Enquanto o visualizador estivesse aberto (e depois dele, se a ordem de
 *    desmontagem embaralhasse a restauração), a faixa fixa e as colunas
 *    fixas das telas por baixo paravam de grudar. Escrito assim — atributo
 *    de estilo montado em JavaScript —, nem o check de CSS nem o de JSX
 *    enxergam: os dois procuram a propriedade em folha ou em `style={{}}`.
 *
 * 2. **Dois contadores para a mesma trava.** O `ModalPortal` já conta
 *    modais abertos numa variável de módulo, exatamente para que o primeiro
 *    a fechar não destrave a rolagem com outro ainda aberto. A cópia local
 *    daqui era um SEGUNDO contador — e o `OverlayModal` documenta esse caso
 *    citando esta tela pelo nome ("a tela de Compras usa `ModalPortal`
 *    direto"). Com uma confirmação do sistema aberta por cima deste
 *    visualizador, fechar uma das duas devolvia a rolagem do documento
 *    debaixo da outra.
 *
 * Compondo o `ModalPortal` vêm de graça, e numa implementação só: o portal
 * (que escapa do contexto de empilhamento do `.layout-main`), a trava de
 * rolagem contada, o `Escape` que fecha APENAS o modal de cima da pilha e a
 * devolução do foco. O `keydown` próprio que existia aqui fechava o
 * visualizador mesmo quando ele não era o de cima.
 *
 * O recorte dos cantos do painel virou `overflow-clip` (R18): corta igual e
 * não cria scrollport.
 */
export default function CompraPreviewModal({ preview, onClose }) {
  // A URL de blob é criada pela tela que abre o preview; revogá-la é a
  // única responsabilidade de ciclo de vida que continua sendo daqui.
  useEffect(() => {
    if (!preview) {
      return undefined;
    }

    return () => {
      if (String(preview?.url || '').startsWith('blob:')) {
        window.URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  if (!preview) {
    return null;
  }

  const titulo = preview.title || preview.name || 'Visualizacao de arquivo';

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{
          zIndex: 'var(--z-modal)',
          background: 'var(--modal-overlay, rgba(15, 23, 42, 0.48))'
        }}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div
          className="flex h-[90vh] w-full max-w-6xl flex-col overflow-clip rounded-xl shadow-2xl"
          style={{ background: 'var(--ui-surface)' }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
                {titulo}
              </h2>
              <p className="truncate text-sm text-[var(--c-muted)]">
                {preview.name || 'Arquivo anexado'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {preview.url && (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  Abrir em nova aba
                </a>
              )}
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>

          <div className="flex-1 p-3" style={{ background: 'var(--ui-canvas)' }}>
            {preview.srcDoc ? (
              <iframe
                title={titulo}
                srcDoc={preview.srcDoc}
                className="h-full w-full rounded-lg border border-[var(--c-border)] bg-white"
              />
            ) : isImagePreview(preview?.name, preview?.url) ? (
              <div className="flex h-full items-center justify-center overflow-auto rounded-lg border border-[var(--c-border)] bg-white p-4">
                <img
                  src={preview.url}
                  alt={preview.name || 'Imagem anexada'}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : isPdfPreview(preview?.name, preview?.url) ? (
              <iframe
                title={titulo}
                src={preview.url}
                className="h-full w-full rounded-lg border border-[var(--c-border)] bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-[var(--c-border)] bg-white p-6 text-center">
                <p className="text-sm text-[var(--c-muted)]">
                  Este tipo de arquivo não possui pre-visualização incorporada.
                </p>
                {preview.url && (
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Abrir arquivo
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
