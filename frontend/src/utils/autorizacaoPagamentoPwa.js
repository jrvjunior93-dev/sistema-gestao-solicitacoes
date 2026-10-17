import { canAccessAutorizacoesPagamento } from './acessoProduto';

export const AUTORIZACAO_PAGAMENTO_ROUTE = '/financeiro/autorizacoes-pagamento';

export function isInstalledPwa(browser = typeof window === 'undefined' ? undefined : window) {
  return Boolean(browser?.matchMedia?.('(display-mode: standalone)')?.matches || browser?.navigator?.standalone);
}

// can_decide vem do backend: exige autorizador nominal e permissao granular.
// Ser diretor, ADMIN ou SUPERADMIN por si so nao ativa a experiencia.
export function isAutorizadorPwa(user, installed = isInstalledPwa()) {
  return Boolean(installed && user?.autorizacao_pagamentos?.can_decide && canAccessAutorizacoesPagamento(user));
}

// Compactar a pagina nao concede permissao nem muda a rota inicial individual.
// Navegador/PWA e todos os perfis com acesso usam a mesma area util.
export function isAutorizacaoPwaCompacta(user, pathname) {
  return String(pathname || '').replace(/\/+$/, '') === AUTORIZACAO_PAGAMENTO_ROUTE && canAccessAutorizacoesPagamento(user);
}
