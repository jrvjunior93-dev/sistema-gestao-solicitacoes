export const UPLOAD_MAX_FILE_SIZE_MB_PADRAO = 50;
export const UPLOAD_DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.rar';

const EXTENSOES_DOCUMENTO_PERMITIDAS = new Set(UPLOAD_DOCUMENT_ACCEPT.split(','));
const MIMES_DOCUMENTO_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'application/vnd.rar',
  'application/x-rar-compressed'
]);

export function arquivoDocumentoPermitido(file) {
  const nome = String(file?.name || '').trim().toLowerCase();
  const indiceExtensao = nome.lastIndexOf('.');
  const extensao = indiceExtensao >= 0 ? nome.slice(indiceExtensao) : '';
  const mime = String(file?.type || '').trim().toLowerCase();
  const mimePermitido = !mime || mime === 'application/octet-stream' || MIMES_DOCUMENTO_PERMITIDOS.has(mime);
  return EXTENSOES_DOCUMENTO_PERMITIDAS.has(extensao) && mimePermitido;
}

export function montarMensagemTiposArquivoNaoPermitidos(files = []) {
  const nomes = Array.from(files || []).map((file) => file?.name).filter(Boolean).join(', ');
  return `Tipo de arquivo não permitido${nomes ? `: ${nomes}` : ''}. Use PDF, Word, Excel, CSV, PowerPoint, imagem ou RAR.`;
}

function gerarIdArquivo(file) {
  const nome = String(file?.name || 'arquivo').replace(/\s+/g, '-').toLowerCase();
  const ultimaAlteracao = Number(file?.lastModified || Date.now());
  const aleatorio = Math.random().toString(36).slice(2, 8);
  return `${nome}-${ultimaAlteracao}-${aleatorio}`;
}

function inferirTipoArquivo(nome = '', tipo = '') {
  const tipoNormalizado = String(tipo || '').trim();
  if (tipoNormalizado) {
    const partes = tipoNormalizado.split('/');
    return String(partes[partes.length - 1] || tipoNormalizado).toUpperCase();
  }

  const nomeNormalizado = String(nome || '').trim();
  const indiceExtensao = nomeNormalizado.lastIndexOf('.');
  if (indiceExtensao >= 0) {
    return nomeNormalizado.slice(indiceExtensao + 1).toUpperCase();
  }

  return 'ARQUIVO';
}

export function criarAnexoPendente(file) {
  const dataBase = Number(file?.lastModified);
  const data = Number.isFinite(dataBase) && dataBase > 0
    ? new Date(dataBase).toISOString()
    : new Date().toISOString();

  return {
    id: gerarIdArquivo(file),
    file,
    nome: String(file?.name || 'Arquivo sem nome'),
    tipo: inferirTipoArquivo(file?.name, file?.type),
    tamanho: Number(file?.size || 0),
    data
  };
}

export function concatenarAnexosPendentes(atual = [], fileList, options = {}) {
  const arquivosExistentes = Array.isArray(atual) ? atual : [];
  const limiteMb = Number(options.maxFileSizeMb || 0);
  const limiteBytes = limiteMb > 0 ? limiteMb * 1024 * 1024 : null;
  const novosArquivos = Array.from(fileList || []).filter(Boolean);

  const aceitos = [];
  const rejeitados = [];

  novosArquivos.forEach((file) => {
    const item = criarAnexoPendente(file);
    if (limiteBytes && item.tamanho > limiteBytes) {
      rejeitados.push(item);
      return;
    }
    aceitos.push(item);
  });

  return {
    arquivos: [...arquivosExistentes, ...aceitos],
    rejeitados
  };
}

export function extrairFilesAnexosPendentes(anexos = []) {
  return (Array.isArray(anexos) ? anexos : [])
    .map((item) => item?.file)
    .filter(Boolean);
}

export function formatarTamanhoAnexoPendente(bytes) {
  const valor = Number(bytes || 0);
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatarDataAnexoPendente(valor) {
  if (!valor) return 'Data indisponivel';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Data indisponivel';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function montarMensagemArquivosAcimaDoLimite(rejeitados = [], maxFileSizeMb = UPLOAD_MAX_FILE_SIZE_MB_PADRAO) {
  if (!Array.isArray(rejeitados) || rejeitados.length === 0) return '';
  const nomes = rejeitados.map((item) => item?.nome).filter(Boolean).join(', ');
  return `Os seguintes arquivos ultrapassam o limite de ${maxFileSizeMb} MB por arquivo: ${nomes}.`;
}
