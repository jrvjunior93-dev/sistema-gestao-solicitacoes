import { useState } from 'react';
import { uploadComprovantes } from '../services/comprovantes';

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

      // Backend pode retornar message OU error (status 200)
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
    <div>
      <h1>Upload de Comprovantes (Em Massa)</h1>

      <form onSubmit={handleUpload}>
        <label className="grid gap-1 text-sm">
          Arquivos
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.html"
            onChange={handleFileChange}
          />
        </label>

        <br />

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar arquivos'}
        </button>
      </form>

      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <hr />

      <p>
        <strong>Regra:</strong> o nome do arquivo deve conter o código da solicitação.<br />
        Exemplo: <code>SOL-12.pdf</code>
      </p>
    </div>
  );
}
