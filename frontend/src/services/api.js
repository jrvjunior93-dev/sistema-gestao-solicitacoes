function normalizeApiUrl(value) {
  const raw = String(value || '/api').trim().replace(/\/+$/g, '');
  if (!raw) return '/api';
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);
export const API_ORIGIN = String(API_URL).replace(/\/api\/?$/, '');

const AUTH_SESSION_TOKEN_KEY = 'fluxy_auth_session_token';

function readSessionAuthToken() {
  if (typeof window === 'undefined') return null;

  try {
    return sessionStorage.getItem(AUTH_SESSION_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function persistSessionAuthToken(token) {
  if (typeof window === 'undefined') return;

  try {
    if (token) {
      sessionStorage.setItem(AUTH_SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
    }
  } catch {
    // Alguns navegadores podem bloquear o storage; o cookie HttpOnly continua sendo o meio principal.
  }
}

let currentAuthToken = readSessionAuthToken();
let currentCsrfToken = null;
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_COOKIE_NAME = 'fluxy_csrf';
const AUDIT_SESSION_KEY = 'fluxy_audit_session_id';

export function getAuditSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let value = sessionStorage.getItem(AUDIT_SESSION_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(AUDIT_SESSION_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}

function getCookieValue(name) {
  if (typeof document === 'undefined') return null;

  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length) || null;
}

function isUnsafeMethod(method) {
  const normalized = String(method || 'GET').trim().toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(normalized);
}

function rememberCsrfTokenFromResponse(response) {
  try {
    const nextToken = response?.headers?.get?.(CSRF_HEADER_NAME);
    if (nextToken) {
      currentCsrfToken = nextToken;
    }
  } catch {
    // Nem toda resposta permite leitura de headers; mantem o token atual.
  }
}

function getKnownCsrfToken() {
  return currentCsrfToken || getCookieValue(CSRF_COOKIE_NAME);
}

export function installFetchSecurityDefaults() {
  if (typeof window === 'undefined' || window.__fluxyFetchSecurityInstalled) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const baseHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init.headers || baseHeaders || {});
    const method = init.method || (input instanceof Request ? input.method : 'GET');

    if (currentAuthToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${currentAuthToken}`);
    }

    if (isUnsafeMethod(method) && !headers.has(CSRF_HEADER_NAME)) {
      const csrfToken = getKnownCsrfToken();
      if (csrfToken) {
        headers.set(CSRF_HEADER_NAME, csrfToken);
      }
    }

    const auditSessionId = getAuditSessionId();
    if (auditSessionId && !headers.has('X-Audit-Session-Id')) {
      headers.set('X-Audit-Session-Id', auditSessionId);
    }

    const response = await nativeFetch(input, {
      ...init,
      credentials: init.credentials || 'include',
      headers
    });

    rememberCsrfTokenFromResponse(response);
    if (response.status === 423) {
      void response.clone().json().then((payload) => {
        if (payload.codigo === 'CONTROLE_DIARIO_CONTAS_PENDENTE') {
          window.dispatchEvent(new CustomEvent('fluxy:controle-diario-caixa', { detail: payload }));
        }
        if (payload.codigo === 'OBRA_PRAZO_OPERACIONAL_PENDENTE') {
          window.dispatchEvent(new CustomEvent('fluxy:prazos-operacionais', { detail: payload }));
        }
      }).catch(() => {});
    } else if (response.ok && isUnsafeMethod(method)) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (/\/financeiro\/caixas\//.test(url)) {
        window.dispatchEvent(new CustomEvent('fluxy:controle-diario-caixa'));
      }
      if (/\/pedidos-compra\/\d+\/(entregas|itens\/\d+\/recebimentos)|\/configuracoes\/prazos-operacionais/.test(url)) {
        window.dispatchEvent(new CustomEvent('fluxy:prazos-operacionais'));
      }
    }
    return response;
  };

  window.__fluxyFetchSecurityInstalled = true;
};

export function fileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

export function getAuthToken() {
  return currentAuthToken;
}

export function setAuthToken(token) {
  currentAuthToken = token || null;
  persistSessionAuthToken(currentAuthToken);
}

export function clearAuthToken() {
  currentAuthToken = null;
  currentCsrfToken = null;
  persistSessionAuthToken(null);
}

export function authHeaders(extra = {}) {
  const token = getAuthToken();
  const csrfToken = getKnownCsrfToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {})
  };
}
