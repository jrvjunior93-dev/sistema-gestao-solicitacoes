import { fileUrl } from '../../services/api';
import OverlayModal from '../../components/ui/OverlayModal';

/**
 * PRE-VISUALIZACAO DE ANEXO — modal do sistema.
 *
 * Migrado para `OverlayModal` na rodada de 05/09. Tres motivos, nesta ordem:
 *
 * 1. **R27** — o painel escrito a mao (`fixed inset-0` + `.card`) nao tinha
 *    teto de altura nem corpo rolante. Com PDF alto o rodape (o link "Abrir
 *    arquivo em nova aba"/"Baixar arquivo") saia do painel em silencio. O
 *    `OverlayModal` da a estrutura: cabecalho e rodape marcados com
 *    `data-modal` ficam fixos, o meio rola.
 * 2. **Empilhamento** — o painel antigo dependia de `usarPortal` para subir
 *    o `z-index` quando aberto DE DENTRO de outro modal (medicao,
 *    comprovantes pendentes). O `OverlayModal` compoe o `ModalPortal`, que
 *    ja resolve pilha, Escape do topo, trava de rolagem e devolucao de foco.
 *    A prop `usarPortal` continua aceita (os dois chamadores a passam) e
 *    hoje e redundante: o portal e sempre usado.
 * 3. **R25 / token fantasma** — o estado "sem link" pintava o texto com
 *    `var(--c-text-muted)`, que NAO EXISTE em lugar nenhum do CSS nem no
 *    ThemeContext. Custom property indefinida invalida a declaracao inteira
 *    em silencio: a cor caia no valor herdado. O token que existe e
 *    `--c-muted`.
 */
export default function PreviewAnexoModal({ anexo, onClose, usarPortal = false }) {
  const temUrlExplicita = Object.prototype.hasOwnProperty.call(anexo, 'url');
  const url = temUrlExplicita ? anexo.url : fileUrl(anexo.caminho);
  const downloadUrl = anexo.downloadUrl || url;
  const referenciaArquivo = String(anexo?.nome || anexo?.caminho || url || '');
  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(referenciaArquivo);
  const isPdf = /\.pdf(\?|$)/i.test(referenciaArquivo);
  // Mantida por compatibilidade com os chamadores (ModalMedicao e
  // ComprovantesPendentes) — o portal agora e incondicional.
  void usarPortal;

  function renderPreview() {
    if (!url) {
      return (
        <div className="text-center py-12" style={{ color: 'var(--c-muted)' }}>
          <p className="mb-2 font-semibold" style={{ color: 'var(--c-text)' }}>
            Pre-visualização indisponível
          </p>
          <p>{anexo.erro || 'Nao foi possivel gerar um link seguro para este arquivo.'}</p>
        </div>
      );
    }

    if (isImage) {
      return (
        <img
          src={url}
          alt={anexo.nome || 'Anexo'}
          className="max-h-[80vh] mx-auto"
        />
      );
    }

    if (isPdf) {
      return (
        <iframe
          src={url}
          className="w-full h-[80vh]"
          title={`Pre-visualização de ${anexo.nome || 'PDF'}`}
        />
      );
    }

    return (
      <p className="text-center text-sm">Pre-visualização não disponível</p>
    );
  }

  return (
    <OverlayModal rotulo={anexo?.nome || 'Anexo'} onFechar={onClose}>
      <div
        data-modal="cabecalho"
        className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3"
      >
        <h2 className="text-lg font-semibold text-[var(--c-text)]">{anexo.nome}</h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
          Fechar
        </button>
      </div>

      <div className="px-4 py-3">
        {renderPreview()}
      </div>

      {/* Mesmas saidas de antes, agora no rodape fixo: o PDF abre em aba
          nova, o formato sem visualizador baixa. Imagem continua sem link
          proprio (ela ja esta inteira na tela). */}
      {url && isPdf ? (
        <div
          data-modal="rodape"
          className="flex justify-end border-t border-[var(--c-border)] px-4 py-3"
        >
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
          >
            Abrir arquivo em nova aba
          </a>
        </div>
      ) : null}

      {url && !isPdf && !isImage ? (
        <div
          data-modal="rodape"
          className="flex justify-end border-t border-[var(--c-border)] px-4 py-3"
        >
          <a href={downloadUrl} download className="btn btn-outline btn-sm">
            Baixar arquivo
          </a>
        </div>
      ) : null}
    </OverlayModal>
  );
}
