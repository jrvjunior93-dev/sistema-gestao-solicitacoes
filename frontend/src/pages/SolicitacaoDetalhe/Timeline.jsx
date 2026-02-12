import { useState } from 'react';
import PreviewAnexoModal from './PreviewAnexoModal';
import { API_URL, authHeaders, fileUrl } from '../../services/api';

export default function Timeline({ historicos, canRemoveAnexo = false, onAnexoRemovido }) {
  const [preview, setPreview] = useState(null);

  async function obterUrlAssinada(caminhoArquivo) {
    if (!caminhoArquivo) return null;
    if (!String(caminhoArquivo).startsWith('http')) {
      return fileUrl(caminhoArquivo);
    }

    try {
      const res = await fetch(
        `${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoArquivo)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error('Falha ao assinar URL');
      const data = await res.json();
      return data?.url || caminhoArquivo;
    } catch (error) {
      console.error(error);
      return caminhoArquivo;
    }
  }

  async function baixarArquivo(caminhoArquivo, nomeArquivo) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo);

      const response = await fetch(urlArquivo);
      if (!response.ok) {
        throw new Error('Falha ao baixar arquivo');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo || 'arquivo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar arquivo');
    }
  }

  async function removerAnexo(historicoId) {
    const confirmar = window.confirm('Deseja remover este anexo do historico?');
    if (!confirmar) return;

    try {
      const res = await fetch(
        `${API_URL}/anexos/historico/${historicoId}`,
        {
          method: 'DELETE',
          headers: authHeaders()
        }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao remover anexo');
      }

      if (typeof onAnexoRemovido === 'function') {
        onAnexoRemovido();
      }
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao remover anexo');
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <h2 className="font-semibold mb-4">Historico</h2>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {historicos.map(h => {
          const meta = h.metadata ? JSON.parse(h.metadata) : null;
          const atorNome = meta?.ator_nome || null;
          const responsavelNome = meta?.responsavel_nome || h.usuario?.nome || null;
          const caminhoArquivo = meta?.caminho || null;
          const podeExibirArquivo = ['ANEXO_ADICIONADO', 'COMPROVANTE_ADICIONADO'].includes(h.acao);

          return (
            <div
              key={h.id}
              className="border-l-4 border-blue-500 pl-3"
            >
              <p className="text-sm font-medium">{h.acao}</p>

              {(h.status_anterior || h.status_novo) && (
                <p className="text-sm text-gray-700">
                  Status: {h.status_anterior || '-'} {'->'} {h.status_novo || '-'}
                </p>
              )}

              {h.acao === 'RESPONSAVEL_ATRIBUIDO' && (
                <p className="text-sm text-gray-700">
                  {atorNome ? `${atorNome} atribuiu` : 'Responsavel atribuido'}
                  {responsavelNome ? ` para ${responsavelNome}` : ''}
                </p>
              )}

              {h.acao === 'RESPONSAVEL_ASSUMIU' && (
                <p className="text-sm text-gray-700">
                  {atorNome ? `${atorNome} assumiu a solicitacao` : 'Responsavel assumiu a solicitacao'}
                </p>
              )}

              {h.descricao && (
                <p className="text-sm text-gray-700">{h.descricao}</p>
              )}

              {podeExibirArquivo && meta && caminhoArquivo && (
                <div className="flex gap-3 mt-1">
                  <button
                    className="text-blue-600 text-sm"
                    onClick={async () => {
                      const urlArquivo = await obterUrlAssinada(caminhoArquivo);
                      setPreview({
                        nome: h.descricao,
                        caminho: caminhoArquivo,
                        url: urlArquivo
                      });
                    }}
                  >
                    Visualizar
                  </button>

                  <button
                    type="button"
                    className="text-green-600 text-sm"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      await baixarArquivo(caminhoArquivo, h.descricao);
                    }}
                  >
                    Download
                  </button>

                  {canRemoveAnexo && (
                    <button
                      type="button"
                      className="text-red-600 text-sm"
                      onClick={() => removerAnexo(h.id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              )}

              <span className="text-xs text-gray-400">
                {h.usuario?.nome} • {new Date(h.createdAt).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {preview && (
        <PreviewAnexoModal
          anexo={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
