export default function PreviewAnexoModal({ anexo, onClose }) {

  const API_URL = 'http://localhost:3001';
  const url = `${API_URL}/${anexo.caminho}`;

  function renderPreview() {

    // IMAGENS
    if (anexo.nome.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return (
        <img
          src={url}
          alt={anexo.nome}
          className="max-h-[80vh] mx-auto"
        />
      );
    }

    // PDF
    if (anexo.nome.match(/\.pdf$/i)) {
      return (
        <iframe
          src={url}
          className="w-full h-[80vh]"
          title="preview"
        />
      );
    }

    // OUTROS
    return (
      <div className="text-center">
        <p className="mb-4">
          Pré-visualização não disponível
        </p>

        <a
          href={url}
          download
          className="text-blue-600 underline"
        >
          Baixar arquivo
        </a>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

      <div className="bg-white w-11/12 md:w-3/4 p-4 rounded-xl relative">

        <button
          onClick={onClose}
          className="absolute right-4 top-2 text-xl"
        >
          ✖
        </button>

        <h2 className="font-semibold mb-3">
          {anexo.nome}
        </h2>

        {renderPreview()}

      </div>

    </div>
  );
}
