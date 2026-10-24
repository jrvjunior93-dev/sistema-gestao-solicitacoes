function normalizeOriginalName(originalName) {
  const raw = String(originalName || '').trim();
  if (!raw) return 'arquivo';

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    const hasMojibake = /Ã.|Â|�/.test(raw);
    const candidate = hasMojibake ? decoded : raw;
    return candidate.replace(/\s+/g, ' ').trim();
  } catch {
    return raw.replace(/\s+/g, ' ').trim();
  }
}

function sanitizeFileNameForStorage(originalName) {
  const normalized = normalizeOriginalName(originalName);
  return normalized
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function attachmentContentDisposition(originalName) {
  const safeName = Buffer.from(sanitizeFileNameForStorage(originalName).slice(0, 200), 'utf8')
    .toString('utf8') || 'arquivo';
  const asciiName = safeName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8Name = encodeURIComponent(safeName).replace(/[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

module.exports = {
  normalizeOriginalName,
  sanitizeFileNameForStorage,
  attachmentContentDisposition
};
