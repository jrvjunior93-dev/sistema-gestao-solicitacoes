import { API_URL, authHeaders } from './api';

export async function uploadArquivos({ files, tipo, solicitacao_id = null, medicao_id = null, criacao_upload_token = null }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  if (solicitacao_id) {
    formData.append('solicitacao_id', solicitacao_id);
  }
  if (medicao_id) {
    formData.append('medicao_id', medicao_id);
  }
  if (criacao_upload_token) {
    formData.append('criacao_upload_token', criacao_upload_token);
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
