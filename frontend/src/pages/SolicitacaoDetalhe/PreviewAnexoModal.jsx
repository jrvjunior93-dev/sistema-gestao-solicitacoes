import { fileUrl } from '../../services/api';
import VisualizadorArquivoModal from '../../components/ui/VisualizadorArquivoModal';

// Adaptador do contrato existente: links e blobs continuam com o chamador.
export default function PreviewAnexoModal({ anexo, onClose, largura, alturaPreview }) {
  const url = Object.prototype.hasOwnProperty.call(anexo, 'url') ? anexo.url : fileUrl(anexo.caminho);
  return <VisualizadorArquivoModal arquivo={{ ...anexo, url }} onClose={onClose} largura={largura} alturaPreview={alturaPreview} />;
}
