import { API_URL, authHeaders } from './api';

export async function getContextoArquivosModelos() {
  const res = await fetch(`${API_URL}/arquivos-modelos/contexto`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao carregar contexto de arquivos modelos');
  return res.json();
}

export async function getAdminsArquivosModelos() {
  const res = await fetch(`${API_URL}/arquivos-modelos/admins`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao carregar admins');
  return res.json();
}

export async function listarArquivosModelos(paginaCodigo) {
  const res = await fetch(`${API_URL}/arquivos-modelos?pagina_codigo=${encodeURIComponent(paginaCodigo)}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao listar arquivos modelos');
  return res.json();
}

export async function uploadArquivoModelo({ paginaCodigo, file }) {
  const form = new FormData();
  form.append('pagina_codigo', paginaCodigo);
  form.append('file', file);

  const res = await fetch(`${API_URL}/arquivos-modelos/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao enviar arquivo');
  return data;
}

export async function getLinkArquivoModelo(id) {
  const res = await fetch(`${API_URL}/arquivos-modelos/${id}/link`, {
    headers: authHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao obter link do arquivo');
  return data?.url;
}

export async function excluirArquivoModelo(id) {
  const res = await fetch(`${API_URL}/arquivos-modelos/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Erro ao excluir arquivo');
  }
}

export async function criarPaginaArquivoModelo(nome) {
  const res = await fetch(`${API_URL}/arquivos-modelos/paginas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nome })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao criar pagina');
  return data;
}

export async function salvarPaginasArquivosModelos(paginas) {
  const res = await fetch(`${API_URL}/arquivos-modelos/paginas`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ paginas })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao salvar paginas');
  return data;
}

export async function ativarPaginaArquivoModelo(codigo) {
  const res = await fetch(`${API_URL}/arquivos-modelos/paginas/${encodeURIComponent(codigo)}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao ativar pagina');
}

export async function desativarPaginaArquivoModelo(codigo) {
  const res = await fetch(`${API_URL}/arquivos-modelos/paginas/${encodeURIComponent(codigo)}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao desativar pagina');
}

export async function salvarUploadersArquivosModelos(uploadersByPagina) {
  const res = await fetch(`${API_URL}/arquivos-modelos/uploaders`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uploadersByPagina })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao salvar permissoes de upload');
  return data;
}
