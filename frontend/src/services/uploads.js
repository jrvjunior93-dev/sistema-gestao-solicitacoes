import { API_URL, authHeaders } from './api';

export async function uploadArquivos({ files, tipo, solicitacao_id = null }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  if (solicitacao_id) {
    formData.append('solicitacao_id', solicitacao_id);
  }

  formData.append('tipo', tipo);

  const res = await fetch(`${API_URL}/anexos/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao enviar arquivos');
  }

  return res.json();
}
