import {
  getEnabledModules,
  normalizeToken,
  isSuperadmin
} from '../../../utils/acessoProduto';
import { CUSTOS_RECEBIVEIS_PERMISSIONS } from '../constants/custosRecebiveis';

export function hasExplicitCustosRecebiveisPermission(user, permissionKey) {
  if (isSuperadmin(user)) return true;
  const expected = String(permissionKey || '').trim().toLowerCase();
  if (!expected) return false;
  const permissions = Array.isArray(user?.areas_permissoes)
    ? user.areas_permissoes
    : [];
  return permissions.some((permission) => (
    String(permission || '').trim().toLowerCase() === expected
  ));
}

export function canAccessCustosRecebiveis(user) {
  const moduleEntry = getEnabledModules(user).find(
    (item) => normalizeToken(item?.key) === 'CUSTOS_RECEBIVEIS'
  );
  return (
    Boolean(moduleEntry?.enabled)
    && hasExplicitCustosRecebiveisPermission(
      user,
      CUSTOS_RECEBIVEIS_PERMISSIONS.MODULE_ACCESS
    )
  );
}

export function canManageResponsaveisObra(user) {
  return canAccessCustosRecebiveis(user)
    && hasExplicitCustosRecebiveisPermission(user, CUSTOS_RECEBIVEIS_PERMISSIONS.CONFIG_MANAGE)
    && hasExplicitCustosRecebiveisPermission(user, CUSTOS_RECEBIVEIS_PERMISSIONS.OBRAS_VIEW);
}
