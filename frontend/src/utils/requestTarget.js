// A origem e o caminho sao comparados como URL, nunca por prefixo de texto.
export function isTrustedApiTarget(input, apiUrl, baseUrl) {
  try {
    const api = new URL(apiUrl, baseUrl);
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input?.url, baseUrl);
    const prefix = api.pathname.replace(/\/+$/, '');
    return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password
      && target.origin === api.origin
      && (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`)
        || target.pathname.startsWith('/uploads/'));
  } catch {
    return false;
  }
}
