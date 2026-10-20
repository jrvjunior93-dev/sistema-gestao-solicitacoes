export const COMPROVANTE_MANUAL_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
const formatos = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
export function erroComprovanteManual(arquivo) {
  const extensao = /\.([a-z]+)$/i.exec(String(arquivo?.name || ''))?.[1]?.toLowerCase();
  const esperado = Object.hasOwn(formatos, extensao) ? formatos[extensao] : undefined;
  if (!esperado || !['', 'application/octet-stream', esperado].includes(String(arquivo?.type || '').toLowerCase())) {
    return 'Selecione um comprovante em PDF, JPG, JPEG ou PNG.';
  }
  if (!arquivo.size || arquivo.size > 12 * 1024 * 1024) return 'O comprovante deve ter conteúdo e no máximo 12 MB.';
  return '';
}
