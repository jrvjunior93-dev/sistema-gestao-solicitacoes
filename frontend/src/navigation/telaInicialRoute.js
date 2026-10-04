import { getFixableItems } from './navigationConfig';

// A preferência vem validada do backend. Conferimos também no catálogo
// visível da sessão para não criar um ciclo entre a rota inicial e um guarda
// de permissão quando o acesso mudar com a sessão ainda aberta.
export function resolverRotaInicial(user) {
  const preferencia = user?.tela_inicial;
  if (!preferencia?.id || !preferencia?.to) return '/';

  const rota = String(preferencia.to).trim();
  if (!rota.startsWith('/') || rota.startsWith('//') || rota === '/' || rota === '/modulos') return '/';

  return getFixableItems(user).some((item) => item.id === preferencia.id && item.to === rota)
    ? rota
    : '/';
}
