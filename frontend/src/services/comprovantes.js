const API_URL = 'http://localhost:3001';

export async function uploadComprovantes(files) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/comprovantes/upload-massa`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Erro no upload');
  }

  return data;
}
