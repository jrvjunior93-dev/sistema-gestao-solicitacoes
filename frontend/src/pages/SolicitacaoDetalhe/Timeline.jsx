import { useState } from 'react';
import PreviewAnexoModal from './PreviewAnexoModal';

const API_URL = 'http://localhost:3001';

export default function Timeline({ historicos }) {

  const [preview, setPreview] = useState(null);

  return (
    <div className="bg-white p-4 rounded-xl shadow">

      <h2 className="font-semibold mb-4">
        Histórico
      </h2>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto">

        {historicos.map(h => {

          const meta = h.metadata
            ? JSON.parse(h.metadata)
            : null;

          return (

            <div
              key={h.id}
              className="border-l-4 border-blue-500 pl-3"
            >

              <p className="text-sm font-medium">
                {h.acao}
              </p>

              {h.descricao && (
                <p className="text-sm text-gray-700">
                  {h.descricao}
                </p>
              )}

              {/* 🔥 ANEXO */}
              {h.acao === 'ANEXO_ADICIONADO' && meta && (

                <div className="flex gap-3 mt-1">

                  <button
                    className="text-blue-600 text-sm"
                    onClick={() =>
                      setPreview({
                        nome: h.descricao,
                        caminho: meta.caminho
                      })
                    }
                  >
                    Visualizar
                  </button>

                  <button
                    type="button"
                    className="text-green-600 text-sm"
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        try {
                        const urlArquivo = `${API_URL}/${meta.caminho}`;
                        console.log('Baixando:', urlArquivo);

                        const response = await fetch(urlArquivo);

                        if (!response.ok) {
                            throw new Error('Falha ao baixar arquivo');
                        }

                        const blob = await response.blob();

                        const url = window.URL.createObjectURL(blob);

                        const link = document.createElement('a');
                        link.href = url;
                        link.download = h.descricao || 'arquivo';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        window.URL.revokeObjectURL(url);
                        } catch (err) {
                        console.error(err);
                        alert('Erro ao baixar arquivo');
                        }
                    }}
                    >
                    Download
                    </button>



                </div>

              )}

              <span className="text-xs text-gray-400">
                {h.usuario?.nome} •{' '}
                {new Date(h.createdAt).toLocaleString()}
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
