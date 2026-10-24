import { API_URL, authHeaders, fileUrl } from './api';
import { isTrustedApiTarget } from '../utils/requestTarget';

const isApiRequest = url => isTrustedApiTarget(url, API_URL, window.location.href);

export async function obterLinkAnexoMedicao(anexo, { download = false, signal } = {}) {
  const caminho = String(anexo?.caminho_arquivo || '').trim();
  if (!caminho) throw new Error('Arquivo sem endereco para abertura.');
  const params = new URLSearchParams({ url: caminho.replace(/%(?![0-9A-Fa-f]{2})/g, '%25') });
  if (download) params.set('download', '1');
  // Sempre validar registro/ACL no backend, inclusive para /uploads legado.
  const response = await fetch(`${API_URL}/anexos/presign?${params}`, { headers: authHeaders(), signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || 'Nao foi possivel gerar o link seguro do arquivo.');
  }
  // Validar ANTES de fileUrl: nao transformar javascript:/data: em path da API.
  if (typeof data.url !== 'string' || (!/^https?:\/\//i.test(data.url) && !data.url.startsWith('/uploads/'))) {
    throw new Error('O endereco do arquivo nao e valido.');
  }
  const url = fileUrl(data.url);
  const parsed = new URL(url, window.location.href);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('O endereco do arquivo nao e valido.');
  }
  return url; // Nao reconstruir a URL: a query faz parte da assinatura.
}

export async function baixarAnexoMedicao(anexo) {
  const url = await obterLinkAnexoMedicao(anexo, { download: true });
  let blobUrl;
  try {
    let destino = url;
    if (isApiRequest(url)) {
      // Arquivo local protegido: fetch autenticado apenas no dominio da API.
      const response = await fetch(url, { headers: authHeaders(), redirect: 'error' });
      if (!response.ok) throw new Error('Nao foi possivel carregar o arquivo. Atualize e tente novamente.');
      blobUrl = window.URL.createObjectURL(await response.blob());
      destino = blobUrl;
    }
    const link = document.createElement('a');
    link.href = destino;
    link.download = anexo.nome_original || 'arquivo-medicao';
    link.referrerPolicy = 'no-referrer';
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
    // No S3, Content-Disposition assinado efetua o download sem fetch/CORS.
  } finally {
    if (blobUrl) window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  }
}
