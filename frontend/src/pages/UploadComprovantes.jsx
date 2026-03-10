import { useState } from 'react';
import { uploadComprovantes } from '../services/comprovantes';
import { HiPaperClip } from 'react-icons/hi2';

export default function UploadComprovantes() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    setFiles(Array.from(e.target.files));
    setMessage(null);
    setError(null);
  }

  async function handleUpload(e) {
    e.preventDefault();

    if (!files.length) {
      setError('Selecione ao menos um arquivo');
      return;
    }

    try {
      setLoading(true);

      const result = await uploadComprovantes(files);

      if (result.message) {
        setMessage(result.message);
      } else if (result.error) {
        setMessage(result.error);
      } else {
        setMessage('Upload realizado com sucesso.');
      }

      setFiles([]);
      e.target.reset();
    } catch (err) {
      setError(err.message || 'Erro ao enviar comprovantes');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4 max-w-3xl">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Upload de Comprovantes</p>
        <h1 className="page-title mt-1" style={{ color: 'var(--c-text)' }}>
          Envio em massa
        </h1>
        <p className="page-subtitle">
          Anexe PDFs ou imagens. O nome do arquivo deve conter o código da solicitação.
        </p>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        <label className="grid gap-1 text-sm" style={{ color: 'var(--c-text)' }}>
          Arquivos
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`btn btn-outline inline-flex items-center gap-2 cursor-pointer ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
              <HiPaperClip className="w-4 h-4" />
              <span>Anexar arquivos</span>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.html,.rar"
                className="hidden"
                disabled={loading}
                onChange={handleFileChange}
              />
            </label>
            <span className="text-xs text-[var(--c-muted)]">
              {files.length > 0
                ? `${files.length} arquivo(s) selecionado(s)`
                : 'Nenhum arquivo selecionado'}
            </span>
          </div>
        </label>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar arquivos'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setFiles([]);
              setMessage(null);
              setError(null);
            }}
          >
            Limpar
          </button>
        </div>
      </form>

      {message && <p className="text-sm" style={{ color: '#1d4ed8' }}>{message}</p>}
      {error && <p className="text-sm" style={{ color: '#1e40af' }}>{error}</p>}

      <div style={{ borderTop: `1px solid var(--c-border)` }} />

      <p className="text-sm" style={{ color: 'var(--c-text)' }}>
        <strong>Regra:</strong> o nome do arquivo deve conter o código da solicitação.<br />
        Exemplo: <code className="px-2 py-1 rounded bg-[var(--c-border)]/40 text-[var(--c-text)]">SOL-12.pdf</code>
      </p>
    </div>
  );
}
