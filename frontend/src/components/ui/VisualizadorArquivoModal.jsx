import { useEffect, useState } from 'react';
import OverlayModal from './OverlayModal';

// srcDocInterno e reservado a previa HTML produzida pelo fluxo de compras,
// nunca a uploads. Arquivos HTML/SVG nao sao embutidos.
export function tipoPreviewArquivo(arquivo = {}) {
  const referencias = [arquivo.nome, arquivo.caminho, arquivo.url].filter(Boolean);
  const mime = String(arquivo.mime || arquivo.mimetype || arquivo.mime_type || '').split(';')[0].trim().toLowerCase();
  if (['text/html', 'application/xhtml+xml', 'image/svg+xml'].includes(mime)) return 'outro';
  if (mime === 'application/pdf' || referencias.some(ref => /\.pdf(?:[?#]|$)/i.test(ref))) return 'pdf';
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(mime)
    || referencias.some(ref => /\.(jpe?g|png|gif|webp|bmp)(?:[?#]|$)/i.test(ref))) return 'imagem';
  return 'outro';
}

export default function VisualizadorArquivoModal({
  arquivo, onClose, largura = '1200px', alturaPreview = 'min(76dvh, 780px)',
  children, acoes, fecharAoClicarFora = false
}) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [arquivo?.url]);
  const tipo = tipoPreviewArquivo(arquivo);
  const url = arquivo?.url;
  const seguro = !url || /^(https?:\/\/|blob:|\/)/i.test(url);
  const downloadUrl = arquivo?.downloadUrl || url;
  const downloadSeguro = /^(https?:\/\/|blob:|\/)/i.test(downloadUrl || '');
  const nome = arquivo?.nome || 'Arquivo';
  const indisponivel = !seguro || falhou || (!url && !children && !arquivo?.srcDocInterno);
  return (
    <OverlayModal rotulo={arquivo?.titulo || nome} largura={largura} onFechar={onClose} fecharAoClicarFora={fecharAoClicarFora}>
      <div data-modal="cabecalho" className="app-file-preview flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="app-file-preview__title break-words text-lg font-semibold">{arquivo?.titulo || nome}</h2>
          {arquivo?.descricao ? <p className="app-file-preview__meta text-xs">{arquivo.descricao}</p> : null}
        </div>
        <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onClose}>Fechar</button>
      </div>
      <div className="app-file-preview min-w-0 px-4 py-3">
        {arquivo?.carregando ? <p role="status" className="app-file-preview__meta py-6">Abrindo arquivo...</p>
          : children || (arquivo?.srcDocInterno ? (
            <iframe title={arquivo.titulo || nome} srcDoc={arquivo.srcDocInterno} className="w-full" style={{ height: alturaPreview }} />
          ) : indisponivel ? (
            <p role="status" className="app-file-preview__meta py-6">{arquivo?.erro || 'Não foi possível exibir o arquivo nesta tela.'}</p>
          ) : tipo === 'pdf' ? (
            <iframe src={url} title={`Pre-visualização de ${nome}`} className="w-full" style={{ height: alturaPreview }} onError={() => setFalhou(true)} />
          ) : tipo === 'imagem' ? (
            <img src={url} alt={nome} className="mx-auto" style={{ maxHeight: alturaPreview, maxWidth: '100%', objectFit: 'contain' }} onError={() => setFalhou(true)} />
          ) : <p className="app-file-preview__meta py-6">Este formato não possui visualização incorporada.</p>)}
      </div>
      <div data-modal="rodape" className="app-file-preview flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
        {acoes}
        {seguro && url && !arquivo?.carregando ? <>
          {downloadSeguro ? <a href={downloadUrl} download={nome} className="btn btn-outline btn-sm">Baixar arquivo</a> : null}
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Abrir arquivo em nova aba</a>
        </> : null}
      </div>
    </OverlayModal>
  );
}
