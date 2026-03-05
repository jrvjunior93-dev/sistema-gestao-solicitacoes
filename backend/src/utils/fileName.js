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

module.exports = {
  normalizeOriginalName,
  sanitizeFileNameForStorage
};
