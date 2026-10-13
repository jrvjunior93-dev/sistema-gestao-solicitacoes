import { useEffect } from 'react';
import VisualizadorArquivoModal from '../../../components/ui/VisualizadorArquivoModal';

// Mantém o contrato das cinco telas e o descarte dos blobs criados por elas.
export default function CompraPreviewModal({ preview, onClose }) {
  useEffect(() => () => {
    if (String(preview?.url || '').startsWith('blob:')) URL.revokeObjectURL(preview.url);
  }, [preview]);
  if (!preview) return null;
  return <VisualizadorArquivoModal
    arquivo={{ titulo: preview.title, nome: preview.name, url: preview.url, srcDocInterno: preview.srcDoc }}
    onClose={onClose}
  />;
}
