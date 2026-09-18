export function listarComprovantesFila(item) {
  const documentos = [];
  const hashes = new Set();
  for (const comprovante of item?.comprovantes || []) {
    if (!comprovante?.id || !comprovante?.hash || hashes.has(comprovante.hash)) continue;
    hashes.add(comprovante.hash);
    documentos.push({ id: comprovante.id, filaId: item.id, nome: comprovante.nome || 'Comprovante PDF' });
  }
  if (item?.comprovante_hash && !hashes.has(item.comprovante_hash)) {
    documentos.unshift({ id: null, filaId: item.id, nome: item.comprovante_nome || 'Comprovante PDF' });
  }
  return documentos;
}
