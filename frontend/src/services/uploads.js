const API = 'http://localhost:3001';

export async function uploadArquivos({ files, tipo, solicitacao_id = null }) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  if (solicitacao_id) {
    formData.append('solicitacao_id', solicitacao_id);
  }

  formData.append('tipo', tipo);

  const res = await fetch(`${API}/uploads`, {
    method: 'POST',
    body: formData
  });

  return res.json();
}
