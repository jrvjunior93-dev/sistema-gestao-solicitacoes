import { userHasSetorCapability } from './setor';
import { normalizeRhDpPermissionList } from '../constants/rhDpPermissions';

export function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isSuperadmin(user) {
  return normalizeToken(user?.perfil) === 'SUPERADMIN';
}

export function isAdministrador(user) {
  return normalizeToken(user?.perfil) === 'ADMINISTRADOR';
}

export function isAdmin(user) {
  return normalizeToken(user?.perfil) === 'ADMIN';
}

export function isEstagiario(user) {
  return normalizeToken(user?.perfil) === 'ESTAGIARIO';
}

export function isBusinessAdmin(user) {
  return isSuperadmin(user) || isAdministrador(user);
}

export function isAdminGeo(user) {
  return isAdmin(user) && userHasSetorCapability(user, 'eh_setor_geo');
}

export function canManageUsers(user) {
  if (isBusinessAdmin(user) || isAdminGeo(user)) return true;
  return hasAnyExplicitPermissao(user, [
    'configuracoes.geral.gerenciar',
    'configuracoes.usuarios.gerenciar'
  ]);
}

export function getEnabledModules(user) {
  return Array.isArray(user?.modulos_habilitados) ? user.modulos_habilitados : [];
}

export function hasEnabledModule(user, moduleKey, options = {}) {
  const normalizedKey = normalizeToken(moduleKey);
  const allowSuperadminBypass = options.allowSuperadminBypass !== false;

  if (!normalizedKey) return true;
  if (allowSuperadminBypass && isSuperadmin(user)) return true;

  const modules = getEnabledModules(user);
  if (!modules.length) return true;

  const found = modules.find((item) => normalizeToken(item?.key) === normalizedKey);
  if (!found) return true;
  return Boolean(found.enabled);
}

export function canAccessSolicitacoes(user) {
  return hasEnabledModule(user, 'SOLICITACOES');
}

const SOLICITACOES_RELATORIOS_KEYS = [
  'solicitacoes.relatorios.visualizar',
  'solicitacoes.relatorios.operacional',
  'solicitacoes.relatorios.abertas',
  'solicitacoes.relatorios.arquivadas',
  'solicitacoes.relatorios.sla_setor',
  'solicitacoes.relatorios.funil',
  'solicitacoes.relatorios.volume_obra_centro'
];

export function canViewSolicitacoesRelatorios(user) {
  if (!canAccessSolicitacoes(user)) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SOLICITACOES_RELATORIOS_KEYS);
  }
  return true;
}

export function canViewSolicitacoesRelatorioOperacional(user) {
  if (!canAccessSolicitacoes(user)) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'solicitacoes.relatorios.operacional');
  }
  return true;
}

export function canAccessPrioridadesDiretoria(user) {
  if (!canAccessSolicitacoes(user)) return false;
  if (isBusinessAdmin(user)) return true;
  if (user?.prioridade_diretoria_acesso) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'solicitacoes.prioridades.visualizar',
      'solicitacoes.prioridades.criar',
      'solicitacoes.prioridades.finalizar',
      'solicitacoes.prioridades.cancelar',
      'solicitacoes.prioridades.excluir'
    ]);
  }

  const tokens = [
    user?.setor?.codigo,
    user?.setor?.nome,
    user?.area,
    ...(Array.isArray(user?.setores) ? user.setores.flatMap(setor => [setor?.codigo, setor?.nome]) : []),
    ...(Array.isArray(user?.setoresVinculos)
      ? user.setoresVinculos.flatMap(vinculo => [vinculo?.setor?.codigo, vinculo?.setor?.nome])
      : [])
  ].map(normalizeToken).filter(Boolean);

  return (
    tokens.includes('DIR_ADMIN') ||
    tokens.includes('DIR_OBRAS_PUBLICAS') ||
    tokens.includes('DIR_OBRAS_PRIVADAS')
  );
}

export function canDeleteSolicitacaoAnexo(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'solicitacoes.anexos.excluir');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canAccessCompras(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.visualizar',
      'compras.solicitacoes.criar',
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.excluir',
      'compras.solicitacoes.encaminhar_compras',
      'compras.solicitacoes.editar_itens',
      'compras.solicitacoes.editar_quantidade',
      'compras.solicitacoes.editar_apropriacoes_itens',
      'compras.solicitacoes.gerar_pedidos',
      'compras.pedidos.visualizar',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar',
      'compras.pedidos.auditoria',
      'compras.pedidos.editar_itens',
      'compras.pedidos.remanejar',
      'compras.pedidos.cancelar',
      'compras.pedidos.anexar_espelho',
      'compras.pedidos.alterar_status',
      'compras.pedidos.reabrir',
      'compras.pedidos.registrar_frete',
      'compras.pedidos.cancelar_frete',
      'compras.delegacao.visualizar',
      'compras.delegacao.gerenciar',
      'compras.delegacao.alterar_responsavel',
      'compras.delegacao.alterar_prazo',
      'compras.delegacao.salvar_motivo',
      'compras.cotacoes.visualizar',
      'compras.cotacoes.gerenciar',
      'compras.cotacoes.editar_respostas',
      'compras.cotacoes.salvar_rascunho',
      'compras.cotacoes.cancelar',
      'compras.cotacoes.fechar_parcial',
      'compras.cotacoes.encerrar',
      'compras.cotacoes.encerrar_sem_pedido',
      'compras.cotacoes.reabrir',
      'compras.fornecedores.visualizar',
      'compras.fornecedores.gerenciar',
      'compras.relatorios.visualizar',
      'compras.relatorios.cotacoes',
      'compras.relatorios.pedidos',
      'compras.configuracoes.cotacoes',
      'compras.configuracoes.status_pedidos',
      'compras.configuracoes.cadastros'
    ]);
  }

  return (
    Boolean(user?.pode_criar_solicitacao_compra) ||
    userHasSetorCapability(user, 'eh_setor_compras') ||
    userHasSetorCapability(user, 'eh_setor_geo')
  );
}

export function canViewCompraSolicitacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.visualizar',
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.encaminhar_compras',
      'compras.solicitacoes.editar_itens',
      'compras.solicitacoes.editar_quantidade',
      'compras.solicitacoes.editar_apropriacoes_itens',
      'compras.solicitacoes.gerar_pedidos',
      'compras.delegacao.visualizar',
      'compras.delegacao.gerenciar'
    ]);
  }
  return canAccessCompras(user);
}

export function canCreateCompraSolicitacao(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.solicitacoes.criar');
  }
  return Boolean(user?.pode_criar_solicitacao_compra) || userHasSetorCapability(user, 'eh_setor_compras');
}

export function canManageCompraSolicitacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canEditarItensSolicitacaoCompra(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.editar_itens',
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canAlterarQuantidadeSolicitacaoCompra(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.editar_quantidade',
      'compras.solicitacoes.editar_itens',
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canEditarApropriacoesSolicitacao(user) {
  if (!canAccessSolicitacoes(user)) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'solicitacoes.apropriacoes.editar');
  }
  return false;
}

export function canEditarApropriacoesItemSolicitacaoCompra(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.editar_apropriacoes_itens',
      'compras.solicitacoes.editar_itens',
      'compras.solicitacoes.gerenciar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return false;
}

export function canEditarApropriacoesItemCompraDireta(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.compra_direta.editar_apropriacoes_itens');
  }
  return false;
}

export function canCatalogarItensManuaisCompras(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.insumos.catalogar_itens_manuais');
  }
  return false;
}

export function canEncaminharCompraSolicitacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.solicitacoes.encaminhar_compras',
      'compras.solicitacoes.gerenciar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canDeleteCompraSolicitacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.solicitacoes.excluir');
  }
  return false;
}

export function canManageComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canAnexarEspelhoComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.pedidos.anexar_espelho');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canEditarItensComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.editar_itens',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canRemanejarComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.remanejar',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canCancelarComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.cancelar',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canAlterarStatusComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.alterar_status',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canReabrirComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.reabrir',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canRegistrarFreteComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.registrar_frete',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canCancelarFreteComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.cancelar_frete',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canViewComprasPedidos(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.visualizar',
      'compras.pedidos.criar',
      'compras.pedidos.aprovar',
      'compras.pedidos.editar_itens',
      'compras.pedidos.remanejar',
      'compras.pedidos.cancelar',
      'compras.pedidos.alterar_status',
      'compras.pedidos.reabrir',
      'compras.pedidos.registrar_frete',
      'compras.pedidos.cancelar_frete',
      'compras.pedidos.auditoria',
      'compras.pedidos.financeiro.visualizar',
      'compras.pedidos.financeiro.anexar_documentos',
      'compras.pedidos.financeiro.gerar_previsao',
      'compras.pedidos.financeiro.liberar_pagamento',
      'compras.pedidos.financeiro.aprovar_reabertura',
      'compras.relatorios.visualizar',
      'compras.relatorios.pedidos'
    ]);
  }
  return canAccessCompras(user);
}

export function canViewPedidoCompraFinanceiro(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.pedidos.financeiro.visualizar',
      'compras.pedidos.financeiro.anexar_documentos',
      'compras.pedidos.financeiro.gerar_previsao',
      'compras.pedidos.financeiro.liberar_pagamento',
      'compras.pedidos.financeiro.aprovar_reabertura'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canAnexarDocumentoPedidoCompraFinanceiro(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.pedidos.financeiro.anexar_documentos');
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canGerarPrevisaoPedidoCompraFinanceiro(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.pedidos.financeiro.gerar_previsao');
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canLiberarPedidoCompraFinanceiro(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.pedidos.financeiro.liberar_pagamento');
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canAprovarReaberturaPedidoCompraFinanceiro(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.pedidos.financeiro.aprovar_reabertura');
  }
  return userHasSetorCapability(user, 'eh_setor_geo');
}

export function canCreateComprasPedidos(user) {
  return canManageComprasPedidos(user);
}

export function canViewComprasDelegacao(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.delegacao.visualizar',
      'compras.delegacao.gerenciar',
      'compras.delegacao.alterar_responsavel',
      'compras.delegacao.alterar_prazo',
      'compras.delegacao.salvar_motivo'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canManageComprasDelegacao(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['compras.delegacao.gerenciar']);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canViewComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.cotacoes.visualizar',
      'compras.cotacoes.gerenciar',
      'compras.cotacoes.editar_respostas',
      'compras.cotacoes.salvar_rascunho',
      'compras.cotacoes.fechar_parcial',
      'compras.cotacoes.encerrar',
      'compras.cotacoes.reabrir',
      'compras.relatorios.visualizar',
      'compras.relatorios.cotacoes'
    ]);
  }
  return canAccessCompras(user);
}

export function canManageComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.cotacoes.gerenciar');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canOperateComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.cotacoes.gerenciar',
      'compras.cotacoes.editar_respostas',
      'compras.cotacoes.salvar_rascunho'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canEncerrarComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.cotacoes.encerrar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canEncerrarSemPedidoComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.cotacoes.encerrar_sem_pedido');
  }
  return false;
}

export function canFecharParcialComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.cotacoes.fechar_parcial',
      'compras.cotacoes.encerrar',
      'compras.solicitacoes.gerar_pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canReabrirComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.cotacoes.reabrir');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canCancelarComprasCotacoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.cotacoes.cancelar');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canViewComprasFornecedores(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['compras.fornecedores.visualizar', 'compras.fornecedores.gerenciar']);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canManageComprasFornecedores(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (!hasEnabledModule(user, 'COTACOES')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'compras.fornecedores.gerenciar');
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canViewComprasRelatorios(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.relatorios.visualizar',
      'compras.relatorios.cotacoes',
      'compras.relatorios.pedidos'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_compras');
}

export function canManageComprasConfiguracoes(user) {
  if (!hasEnabledModule(user, 'COMPRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'compras.configuracoes.cotacoes',
      'compras.configuracoes.status_pedidos',
      'compras.configuracoes.cadastros'
    ]);
  }
  return isBusinessAdmin(user);
}

export function canAccessDashboard(user) {
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'painel.dashboard.visualizar');
  }
  const perfil = String(user?.perfil || '').toUpperCase();
  return isBusinessAdmin(user) || canAccessFinanceiro(user) || perfil === 'ADMIN';
}

const FINANCEIRO_RELATORIOS_KEYS = [
  'financeiro.relatorios.visualizar',
  'financeiro.relatorios.grupo_consolidado',
  'financeiro.relatorios.fluxo_consolidado',
  'financeiro.relatorios.dre',
  'financeiro.relatorios.diagnostico_dre',
  'financeiro.relatorios.intercompany',
  'financeiro.relatorios.endividamento',
  'financeiro.relatorios.analitico',
  'financeiro.relatorios.financeiro_obras',
  'financeiro.relatorios.movimentacao_contas',
  'financeiro.relatorios.conciliacao_contas',
  'financeiro.relatorios.resultado_obras',
  'financeiro.relatorios.centros_custo'
];

export function canAccessFinanceiro(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'financeiro.titulos.visualizar',
      'financeiro.titulos.criar',
      'financeiro.titulos.importar',
      'financeiro.titulos.exportar',
      'financeiro.titulos.importar_codigos',
      'financeiro.titulos.baixar',
      'financeiro.titulos.excluir',
      'financeiro.titulos.estornar',
      'financeiro.comprovantes.excluir',
      'financeiro.cheques.visualizar',
      'financeiro.cheques.cadastrar',
      'financeiro.cheques.importar',
      'financeiro.cheques.depositar',
      'financeiro.cheques.devolver',
      'financeiro.cheques.cancelar',
      'financeiro.cheques.transferir',
      'financeiro.baixas_compostas.visualizar',
      'financeiro.baixas_compostas.criar',
      'financeiro.baixas_compostas.confirmar',
      'financeiro.baixas_compostas.estornar',
      ...FINANCEIRO_RELATORIOS_KEYS,
      'financeiro.conciliacao.visualizar',
      'financeiro.conciliacao.importar',
      'financeiro.conciliacao.conciliar',
      'financeiro.conciliacao.estornar',
      'financeiro.bancos.visualizar',
      'financeiro.bancos.auditar',
      'financeiro.bancos.conciliar',
      'financeiro.bancos.remessas',
      'financeiro.bancos.retornos',
      'financeiro.bancos.configurar',
      'financeiro.cadastros.visualizar',
      'financeiro.cadastros.gerenciar',
      'financeiro.pagamentos.visualizar',
      'financeiro.pagamentos.preparar',
      'financeiro.pagamentos.aprovar',
      'financeiro.pagamentos.rejeitar',
      'financeiro.pagamentos.enviar_banco',
      'financeiro.pagamentos.sincronizar_banco',
      'financeiro.pagamentos.cancelar',
      'financeiro.pagamentos.reprocessar',
      'financeiro.pagamentos.confirmar_baixa',
      'financeiro.pagamentos.auditar',
      'financeiro.pagamentos.configurar',
      'financeiro.dda.visualizar',
      'financeiro.dda.sincronizar',
      'financeiro.dda.vincular',
      'financeiro.dda.ignorar',
      'financeiro.dda.auditar',
      'financeiro.dda.configurar',
      'financeiro.favorecidos.visualizar',
      'financeiro.favorecidos.gerenciar',
      'financeiro.favorecidos.auditar'
    ]);
  }

  return (
    Boolean(user?.financeiro_liberado) ||
    normalizeToken(user?.perfil) === 'FINANCEIRO' ||
    userHasSetorCapability(user, 'eh_setor_financeiro')
  );
}

export function canViewFinanceiroRelatorios(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, FINANCEIRO_RELATORIOS_KEYS);
  }
  return canAccessFinanceiro(user);
}

export function canViewFinanceiroRelatorio(user, permissionKey) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, permissionKey);
  }
  return canAccessFinanceiro(user);
}

export function canViewSolicitacaoFinanceiro(user) {
  // A aba dentro da solicitacao e uma leitura operacional da propria Obra. Isto nao habilita o
  // modulo Financeiro nem qualquer acao financeira fora da tela de detalhes.
  if (userHasSetorCapability(user, 'eh_setor_obra')) return true;

  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (canAccessFinanceiro(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'solicitacoes.acoes.ver_aba_financeiro');
  }
  return false;
}

export function canAccessBancosEnterprise(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'financeiro.bancos.visualizar',
      'financeiro.bancos.auditar',
      'financeiro.bancos.conciliar',
      'financeiro.bancos.remessas',
      'financeiro.bancos.retornos',
      'financeiro.bancos.configurar'
    ]);
  }

  return canAccessFinanceiro(user);
}

function userHasPaymentApprovalDirectorate(user) {
  const tokens = [
    user?.setor?.codigo,
    user?.setor?.nome,
    user?.area,
    ...(Array.isArray(user?.setores) ? user.setores.flatMap(setor => [setor?.codigo, setor?.nome]) : []),
    ...(Array.isArray(user?.setoresVinculos)
      ? user.setoresVinculos.flatMap(vinculo => [vinculo?.setor?.codigo, vinculo?.setor?.nome])
      : [])
  ].map(normalizeToken).filter(Boolean);

  return (
    tokens.includes('DIR_ADMIN') ||
    tokens.includes('DIRETORIA_ADMINISTRATIVA') ||
    tokens.includes('DIRETORIA ADMINISTRATIVA') ||
    tokens.includes('DIR_EXECUTIVA') ||
    tokens.includes('DIRETORIA_EXECUTIVA') ||
    tokens.includes('DIRETORIA EXECUTIVA')
  );
}

export function canAccessPagamentos(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'financeiro.pagamentos.visualizar',
      'financeiro.pagamentos.preparar',
      'financeiro.pagamentos.aprovar',
      'financeiro.pagamentos.rejeitar',
      'financeiro.pagamentos.enviar_banco',
      'financeiro.pagamentos.sincronizar_banco',
      'financeiro.pagamentos.cancelar',
      'financeiro.pagamentos.reprocessar',
      'financeiro.pagamentos.confirmar_baixa',
      'financeiro.pagamentos.auditar',
      'financeiro.pagamentos.configurar'
    ]);
  }

  return canAccessFinanceiro(user) || userHasPaymentApprovalDirectorate(user);
}

function canFilaPagamentos(user, permissionKey) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, permissionKey);
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canAccessFilaPagamentos(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'financeiro.fila_pagamentos.visualizar',
      'financeiro.fila_pagamentos.preparar',
      'financeiro.fila_pagamentos.baixar',
      'financeiro.fila_pagamentos.reportar',
      'financeiro.fila_pagamentos.resolver'
    ]);
  }
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export const canPrepareFilaPagamentos = (user) => canFilaPagamentos(user, 'financeiro.fila_pagamentos.preparar');
export const canBaixarFilaPagamentos = (user) => canFilaPagamentos(user, 'financeiro.fila_pagamentos.baixar');
export const canReportarFilaPagamentos = (user) => canFilaPagamentos(user, 'financeiro.fila_pagamentos.reportar');
export const canResolverFilaPagamentos = (user) => canFilaPagamentos(user, 'financeiro.fila_pagamentos.resolver');

export function canAccessFinanceiroDda(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'financeiro.dda.visualizar',
      'financeiro.dda.sincronizar',
      'financeiro.dda.vincular',
      'financeiro.dda.ignorar',
      'financeiro.dda.auditar',
      'financeiro.dda.configurar'
    ]);
  }
  return canAccessFinanceiro(user);
}

export function canPreparePagamentos(user) {
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'financeiro.pagamentos.preparar')
      && !hasPermissao(user, 'financeiro.pagamentos.aprovar');
  }
  return (
    (userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO')
    && !userHasPaymentApprovalDirectorate(user)
  );
}

export function canApprovePagamentos(user) {
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.aprovar');
  return userHasPaymentApprovalDirectorate(user);
}

export function canRejectPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.rejeitar');
  return userHasPaymentApprovalDirectorate(user);
}

export function canSendPagamentosBanco(user) {
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'financeiro.pagamentos.enviar_banco')
      && !hasPermissao(user, 'financeiro.pagamentos.aprovar');
  }
  return (
    (userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO')
    && !userHasPaymentApprovalDirectorate(user)
  );
}

export function canSyncPagamentosBanco(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.sincronizar_banco');
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canCancelPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.cancelar');
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canReprocessPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.reprocessar');
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canConfirmarBaixaPagamento(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.confirmar_baixa');
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canAuditPagamentos(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.pagamentos.auditar');
  return (
    userHasSetorCapability(user, 'eh_setor_financeiro') ||
    normalizeToken(user?.perfil) === 'FINANCEIRO' ||
    userHasPaymentApprovalDirectorate(user)
  );
}

export function canManagePaymentBeneficiaries(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) return hasPermissao(user, 'financeiro.favorecidos.gerenciar');
  return (
    userHasSetorCapability(user, 'eh_setor_financeiro') ||
    normalizeToken(user?.perfil) === 'FINANCEIRO' ||
    userHasPaymentApprovalDirectorate(user)
  );
}

export function canDeleteComprovante(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'financeiro.comprovantes.excluir');
  }
  return false;
}

export function canDeleteTitulosFinanceiros(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'financeiro.titulos.excluir');
  }
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canImportTitulosFinanceiros(user) {
  if (!hasEnabledModule(user, 'FINANCEIRO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'financeiro.titulos.importar');
  }
  return userHasSetorCapability(user, 'eh_setor_financeiro') || normalizeToken(user?.perfil) === 'FINANCEIRO';
}

export function canAccessBoletos(user) {
  if (!hasEnabledModule(user, 'BOLETOS')) return false;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'boletos.emitir.visualizar',
      'boletos.emitir.gerar'
    ]);
  }
  return canAccessFinanceiro(user) && (
    hasPermissao(user, 'boletos.emitir.visualizar') ||
    hasPermissao(user, 'boletos.emitir.gerar')
  );
}

export function canAccessCadastroObras(user) {
  if (!hasEnabledModule(user, 'OBRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (canManageConfiguracoesArea(user, 'cadastros')) return true;
  return hasAnyExplicitPermissao(user, [
    'obras.cadastro.visualizar',
    'obras.cadastro.gerenciar'
  ]);
}

export function canManageCadastroObras(user) {
  if (!hasEnabledModule(user, 'OBRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (canManageConfiguracoesArea(user, 'cadastros')) return true;
  return hasAnyExplicitPermissao(user, ['obras.cadastro.gerenciar']);
}

export function canAccessGestaoObras(user) {
  if (!hasEnabledModule(user, 'OBRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'obras.gestao.visualizar',
      'obras.gestao.apropriacoes'
    ]);
  }
  return canAccessCadastroObras(user);
}

export function canManageGestaoObrasApropriacoes(user) {
  if (!hasEnabledModule(user, 'OBRAS')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, ['obras.gestao.apropriacoes']);
}

export function canAccessContratos(user) {
  if (!hasEnabledModule(user, 'CONTRATOS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'contratos.geral.visualizar',
      'contratos.geral.criar',
      'contratos.geral.editar',
      'contratos.relatorios.visualizar'
    ]);
  }
  return isAdminGeo(user) || userHasSetorCapability(user, 'eh_setor_obra');
}

export function canManageContratos(user) {
  if (!hasEnabledModule(user, 'CONTRATOS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'contratos.geral.editar');
  }
  return isAdminGeo(user);
}

export function canAccessComercial(user) {
  if (!hasEnabledModule(user, 'COMERCIAL')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, [
    'comercial.empreendimentos.visualizar',
    'comercial.empreendimentos.gerenciar',
    'comercial.vendas.visualizar',
    'comercial.vendas.criar',
    'comercial.vendas.contratos',
    'comercial.vendas.importar',
    'comercial.relatorios.visualizar'
  ]);
}

export function canViewComercialEmpreendimentos(user) {
  if (!hasEnabledModule(user, 'COMERCIAL')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, [
    'comercial.empreendimentos.visualizar',
    'comercial.empreendimentos.gerenciar',
    'comercial.vendas.importar'
  ]);
}

export function canViewComercialContratos(user) {
  if (!hasEnabledModule(user, 'COMERCIAL')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, [
    'comercial.vendas.visualizar',
    'comercial.vendas.criar',
    'comercial.vendas.contratos',
    'comercial.vendas.importar',
    'comercial.relatorios.visualizar'
  ]);
}

export function canImportComercialContratos(user) {
  if (!hasEnabledModule(user, 'COMERCIAL')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, ['comercial.vendas.importar']);
}

const RH_DP_AREA_PERMISSION_KEYS = [
  'rh_dp.dashboard.visualizar',
  'rh_dp.empresas.gerenciar',
  'rh_dp.colaboradores.visualizar',
  'rh_dp.colaboradores.editar',
  'rh_dp.documentos.visualizar',
  'rh_dp.documentos.gerenciar',
  'rh_dp.importacoes.executar',
  'rh_dp.apuracao.visualizar',
  'rh_dp.apuracao.editar',
  'rh_dp.fechamento.executar',
  'rh_dp.fechamento.reabrir',
  'rh_dp.obrigacoes.visualizar',
  'rh_dp.relatorios.visualizar'
];

const RH_DP_LEGACY_TO_AREA = {
  rh_dp_dashboard_view: ['rh_dp.dashboard.visualizar'],
  rh_dp_colaboradores_view: ['rh_dp.colaboradores.visualizar'],
  rh_dp_colaboradores_edit: ['rh_dp.colaboradores.editar'],
  rh_dp_documentos_view: ['rh_dp.documentos.visualizar'],
  rh_dp_documentos_manage: ['rh_dp.documentos.gerenciar'],
  rh_dp_importacoes_execute: ['rh_dp.importacoes.executar'],
  rh_dp_apuracao_view: ['rh_dp.apuracao.visualizar'],
  rh_dp_apuracao_edit: ['rh_dp.apuracao.editar'],
  rh_dp_fechamento_execute: ['rh_dp.fechamento.executar'],
  rh_dp_fechamento_reopen: ['rh_dp.fechamento.reabrir'],
  rh_dp_obrigacoes_view: ['rh_dp.obrigacoes.visualizar']
};

export function canAccessRhDp(user) {
  if (!hasEnabledModule(user, 'RH_DP')) return false;
  if (isBusinessAdmin(user)) return true;
  if (userHasSetorCapability(user, 'eh_setor_obra')) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, RH_DP_AREA_PERMISSION_KEYS);
  }
  return getRhDpCapabilities(user).length > 0;
}

export function canAccessProvisoes(user) {
  if (!hasEnabledModule(user, 'PROVISOES')) return false;
  if (isBusinessAdmin(user)) return true;

  return (
    hasPermissao(user, 'provisoes.lista.visualizar') ||
    hasPermissao(user, 'provisoes.cadastro.criar') ||
    hasPermissao(user, 'provisoes.cadastro.editar') ||
    hasPermissao(user, 'provisoes.dashboard.visualizar') ||
    hasPermissao(user, 'provisoes.relatorios.visualizar') ||
    hasPermissao(user, 'provisoes.status.gerenciar') ||
    hasPermissao(user, 'provisoes.categorias.gerenciar')
  );
}

export function getRhDpCapabilities(user) {
  return normalizeRhDpPermissionList(user?.rh_dp_capacidades || []);
}

export function hasRhDpCapability(user, capability) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    const key = String(capability || '').trim().toLowerCase();
    return hasAnyPermissao(user, RH_DP_LEGACY_TO_AREA[key] || []);
  }
  return getRhDpCapabilities(user).includes(String(capability || '').trim().toLowerCase());
}

export function canAccessRhDpDashboard(user) {
  if (!canAccessRhDp(user)) return false;
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['rh_dp.dashboard.visualizar', 'rh_dp.relatorios.visualizar']);
  }
  return hasRhDpCapability(user, 'rh_dp_dashboard_view');
}

export function canAccessRhDpEmpresas(user) {
  if (!hasEnabledModule(user, 'RH_DP')) return false;
  if (isBusinessAdmin(user)) return true;
  if (userHasSetorCapability(user, 'eh_setor_obra')) return false;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'rh_dp.empresas.gerenciar');
  }
  return false;
}

export function canViewRhDpColaboradores(user) {
  if (!canAccessRhDp(user)) return false;
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return true;
  return canAccessRhDp(user) && (
    hasRhDpCapability(user, 'rh_dp_colaboradores_view') ||
    hasRhDpCapability(user, 'rh_dp_colaboradores_edit')
  );
}

export function canManageRhDpColaboradores(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_colaboradores_edit');
}

export function canAccessRhDpCadastroColaboradores(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canViewRhDpColaboradores(user);
}

export function canViewRhDpDocumentos(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && (
    hasRhDpCapability(user, 'rh_dp_documentos_view') ||
    hasRhDpCapability(user, 'rh_dp_documentos_manage')
  );
}

export function canManageRhDpDocumentos(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_documentos_manage');
}

export function canExecuteRhDpImportacoes(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_importacoes_execute');
}

export function canViewRhDpApuracao(user) {
  return canAccessRhDp(user) && (
    hasRhDpCapability(user, 'rh_dp_apuracao_view') ||
    hasRhDpCapability(user, 'rh_dp_apuracao_edit') ||
    hasRhDpCapability(user, 'rh_dp_fechamento_execute')
  );
}

export function canEditRhDpApuracao(user) {
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_apuracao_edit');
}

export function canViewRhDpObrigacoes(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && (
    hasRhDpCapability(user, 'rh_dp_obrigacoes_view') ||
    hasRhDpCapability(user, 'rh_dp_fechamento_execute') ||
    hasRhDpCapability(user, 'rh_dp_fechamento_reopen')
  );
}

export function canExecuteRhDpFechamento(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_fechamento_execute');
}

export function canReopenRhDpFechamento(user) {
  if (userHasSetorCapability(user, 'eh_setor_obra') && !isBusinessAdmin(user)) return false;
  return canAccessRhDp(user) && hasRhDpCapability(user, 'rh_dp_fechamento_reopen');
}

export function canViewProvisionamentos(user) {
  return canAccessProvisoes(user) && (
    hasPermissao(user, 'provisoes.lista.visualizar') ||
    hasPermissao(user, 'provisoes.cadastro.criar') ||
    hasPermissao(user, 'provisoes.cadastro.editar')
  );
}

export function canCreateProvisionamentos(user) {
  return canAccessProvisoes(user) && (
    hasPermissao(user, 'provisoes.cadastro.criar') ||
    hasPermissao(user, 'provisoes.cadastro.editar')
  );
}

export function canManageProvisionamentos(user) {
  return canAccessProvisoes(user) && hasPermissao(user, 'provisoes.cadastro.editar');
}

export function canManageProvisionamentosStatus(user) {
  return canAccessProvisoes(user) && hasPermissao(user, 'provisoes.status.gerenciar');
}

export function canViewProvisionamentosDashboard(user) {
  return canAccessProvisoes(user) && hasAnyPermissao(user, [
    'provisoes.dashboard.visualizar',
    'provisoes.relatorios.visualizar'
  ]);
}

export function canManageProvisionamentoCategorias(user) {
  return canAccessProvisoes(user) && hasPermissao(user, 'provisoes.categorias.gerenciar');
}

export function canAccessBiblioteca(user) {
  if (!hasEnabledModule(user, 'BIBLIOTECA_MODELOS')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'biblioteca.geral.visualizar',
      'biblioteca.geral.gerenciar'
    ]);
  }
  return true;
}

export function canManageBiblioteca(user) {
  if (!hasEnabledModule(user, 'BIBLIOTECA_MODELOS')) return false;
  if (isBusinessAdmin(user)) return true;
  return hasAnyExplicitPermissao(user, ['biblioteca.geral.gerenciar']);
}

export function canAccessTreinamento(user) {
  if (!hasEnabledModule(user, 'TREINAMENTO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'treinamento.conteudos.visualizar',
      'treinamento.conteudos.gerenciar',
      'treinamento.conteudos.publicar',
      'treinamento.relatorios.visualizar'
    ]);
  }
  return true;
}

export function canManageTreinamento(user) {
  if (!hasEnabledModule(user, 'TREINAMENTO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'treinamento.conteudos.gerenciar',
      'treinamento.conteudos.publicar'
    ]);
  }
  return false;
}

export function canPublishTreinamento(user) {
  if (!hasEnabledModule(user, 'TREINAMENTO')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'treinamento.conteudos.publicar');
  }
  return false;
}

export function canAccessComunicacao(user) {
  if (!hasEnabledModule(user, 'COMUNICACAO_INTERNA')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, [
      'comunicacao.geral.visualizar',
      'comunicacao.geral.enviar'
    ]);
  }
  return true;
}

export function canSendComunicacao(user) {
  if (!hasEnabledModule(user, 'COMUNICACAO_INTERNA')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'comunicacao.geral.enviar');
  }
  return true;
}

const FISCAL_PERMISSION_KEYS = [
  'fiscal.view',
  'fiscal.config.manage',
  'fiscal.document.view',
  'fiscal.document.upload',
  'fiscal.document.link',
  'fiscal.document.ignore',
  'fiscal.sync.view',
  'fiscal.sync.run',
  'fiscal.logs.view',
  'fiscal.relatorios.visualizar'
];

export function canAccessFiscal(user) {
  if (!hasEnabledModule(user, 'FISCAL')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, FISCAL_PERMISSION_KEYS);
  }
  return false;
}

export function canManageFiscalConfig(user) {
  if (!hasEnabledModule(user, 'FISCAL')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasPermissao(user, 'fiscal.config.manage');
  }
  return false;
}

export function canViewFiscalDocuments(user) {
  if (!hasEnabledModule(user, 'FISCAL')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['fiscal.document.view', 'fiscal.document.upload', 'fiscal.document.link', 'fiscal.document.ignore', 'fiscal.relatorios.visualizar']);
  }
  return false;
}

export function canViewFiscalLogs(user) {
  if (!hasEnabledModule(user, 'FISCAL')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['fiscal.sync.view', 'fiscal.sync.run', 'fiscal.logs.view', 'fiscal.relatorios.visualizar']);
  }
  return false;
}

const SST_PERMISSION_KEYS = [
  'sst.dashboard.visualizar',
  'sst.analytics.visualizar',
  'sst.analytics.gerenciar',
  'sst.observabilidade.visualizar',
  'sst.producao.visualizar',
  'sst.rollout.gerenciar',
  'sst.telemetria.visualizar',
  'sst.alertas.gerenciar',
  'sst.hardening.gerenciar',
  'sst.logs.visualizar',
  'sst.integracoes.gerenciar',
  'sst.riscos.visualizar',
  'sst.riscos.gerenciar',
  'sst.agentes.visualizar',
  'sst.agentes.gerenciar',
  'sst.pgr.visualizar',
  'sst.pgr.gerenciar',
  'sst.pcmso.visualizar',
  'sst.pcmso.gerenciar',
  'sst.aso.visualizar',
  'sst.aso.gerenciar',
  'sst.exames.visualizar',
  'sst.exames.gerenciar',
  'sst.epi.visualizar',
  'sst.epi.gerenciar',
  'sst.treinamentos.visualizar',
  'sst.treinamentos.gerenciar',
  'sst.acidentes.visualizar',
  'sst.acidentes.gerenciar',
  'sst.documentos.visualizar',
  'sst.documentos.gerenciar',
  'sst.documentos_ia.visualizar',
  'sst.documentos_ia.gerenciar',
  'sst.documentos_ia.analisar',
  'sst.documentos_ia.aprovar_sugestao',
  'sst.esocial.visualizar',
  'sst.esocial.preparar',
  'sst.esocial.gerar_xml',
  'sst.esocial.validar_xml',
  'sst.esocial.assinar_xml',
  'sst.esocial.enviar_restrita',
  'sst.esocial.consultar_retorno',
  'sst.configuracoes.gerenciar'
];

export function canAccessSst(user) {
  if (!hasEnabledModule(user, 'SST')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SST_PERMISSION_KEYS);
  }
  return false;
}

export function canViewSstDashboard(user) {
  if (!hasEnabledModule(user, 'SST')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, ['sst.dashboard.visualizar', 'sst.analytics.visualizar', 'sst.observabilidade.visualizar', 'sst.producao.visualizar', 'sst.telemetria.visualizar']);
  }
  return false;
}

export function canViewSstArea(user, area) {
  if (!hasEnabledModule(user, 'SST')) return false;
  if (isBusinessAdmin(user)) return true;
  const normalizedArea = String(area || '').trim().toLowerCase();
  const keys = [
    `sst.${normalizedArea}.visualizar`,
    `sst.${normalizedArea}.gerenciar`,
    normalizedArea === 'esocial' ? 'sst.esocial.preparar' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.gerar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.validar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.assinar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.enviar_restrita' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.consultar_retorno' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.visualizar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.analisar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.aprovar_sugestao' : null,
    normalizedArea === 'analytics' ? 'sst.analytics.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.logs.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.producao.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.telemetria.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.enterprise.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.performance.visualizar' : null,
    normalizedArea === 'analytics' ? 'sst.governanca.visualizar' : null,
    normalizedArea === 'configuracoes' ? 'sst.rollout.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.hardening.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.cache.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.qualidade.gerenciar' : null
  ].filter(Boolean);
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, keys);
  }
  return false;
}

export function canManageSstArea(user, area) {
  if (!hasEnabledModule(user, 'SST')) return false;
  if (isBusinessAdmin(user)) return true;
  const normalizedArea = String(area || '').trim().toLowerCase();
  const key = normalizedArea === 'esocial'
    ? 'sst.esocial.preparar'
    : `sst.${normalizedArea}.gerenciar`;
  const keys = [
    key,
    normalizedArea === 'esocial' ? 'sst.esocial.gerar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.validar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.assinar_xml' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.enviar_restrita' : null,
    normalizedArea === 'esocial' ? 'sst.esocial.consultar_retorno' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.gerenciar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.analisar' : null,
    normalizedArea === 'documentos' ? 'sst.documentos_ia.aprovar_sugestao' : null,
    normalizedArea === 'analytics' ? 'sst.alertas.gerenciar' : null,
    normalizedArea === 'analytics' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'analytics' ? 'sst.qualidade.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.rollout.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.hardening.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.jobs.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.cache.gerenciar' : null,
    normalizedArea === 'configuracoes' ? 'sst.qualidade.gerenciar' : null
  ].filter(Boolean);
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, keys);
  }
  return false;
}

const SYSTEM_GOVERNANCE_VIEW_KEYS = ['governanca.sistema.visualizar', 'governanca.sistema.gerenciar'];
const SYSTEM_GOVERNANCE_MANAGE_KEYS = ['governanca.sistema.gerenciar'];
const SYSTEM_TECH_MONITOR_VIEW_KEYS = ['governanca.tecnico.visualizar', 'governanca.sistema.gerenciar'];
const SYSTEM_AUDIT_VIEW_KEYS = ['governanca.auditoria.visualizar', 'governanca.sistema.gerenciar'];
const SYSTEM_OPERATIONAL_AUDIT_VIEW_KEYS = ['governanca.operacional.visualizar_resumo', 'governanca.operacional.visualizar_usuarios', 'governanca.operacional.visualizar_detalhes', 'governanca.sistema.gerenciar'];
const SYSTEM_OPERATIONAL_AUDIT_DETAIL_KEYS = ['governanca.operacional.visualizar_detalhes', 'governanca.sistema.gerenciar'];
const SYSTEM_OPERATIONAL_AUDIT_USER_KEYS = ['governanca.operacional.visualizar_usuarios', 'governanca.operacional.visualizar_detalhes', 'governanca.sistema.gerenciar'];
const SYSTEM_OPERATIONAL_AUDIT_EXPORT_KEYS = ['governanca.operacional.exportar', 'governanca.sistema.gerenciar'];
const SYSTEM_PRODUCT_EVOLUTION_VIEW_KEYS = ['governanca.produto.visualizar', 'governanca.sistema.gerenciar'];

export function canViewSystemGovernance(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SYSTEM_GOVERNANCE_VIEW_KEYS);
  }
  return false;
}

export function canManageSystemGovernance(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SYSTEM_GOVERNANCE_MANAGE_KEYS);
  }
  return false;
}

export function canViewSystemTechMonitor(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SYSTEM_TECH_MONITOR_VIEW_KEYS);
  }
  return false;
}

export function canViewSystemAudit(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SYSTEM_AUDIT_VIEW_KEYS);
  }
  return false;
}

export function canViewOperationalAudit(user) {
  if (isBusinessAdmin(user)) return true;
  return hasConfiguredAreaPermissions(user) && hasAnyPermissao(user, SYSTEM_OPERATIONAL_AUDIT_VIEW_KEYS);
}

export function canViewOperationalAuditDetails(user) {
  if (isBusinessAdmin(user)) return true;
  return hasConfiguredAreaPermissions(user) && hasAnyPermissao(user, SYSTEM_OPERATIONAL_AUDIT_DETAIL_KEYS);
}

export function canViewOperationalAuditUsers(user) {
  if (isBusinessAdmin(user)) return true;
  return hasConfiguredAreaPermissions(user) && hasAnyPermissao(user, SYSTEM_OPERATIONAL_AUDIT_USER_KEYS);
}

export function canExportOperationalAudit(user) {
  if (isBusinessAdmin(user)) return true;
  return hasConfiguredAreaPermissions(user) && hasAnyPermissao(user, SYSTEM_OPERATIONAL_AUDIT_EXPORT_KEYS);
}

export function canViewSystemProductEvolution(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, SYSTEM_PRODUCT_EVOLUTION_VIEW_KEYS);
  }
  return false;
}

const CONFIGURACOES_AREA_PERMISSION_KEYS = {
  geral: [
    'configuracoes.geral.visualizar',
    'configuracoes.geral.gerenciar'
  ],
  cadastros: [
    'configuracoes.geral.gerenciar',
    'configuracoes.cadastros.gerenciar'
  ],
  usuarios: [
    'configuracoes.geral.gerenciar',
    'configuracoes.usuarios.gerenciar'
  ],
  status_vinculos: [
    'configuracoes.geral.gerenciar',
    'configuracoes.status_vinculos.gerenciar'
  ],
  solicitacoes: [
    'configuracoes.geral.gerenciar',
    'configuracoes.solicitacoes.gerenciar'
  ],
  aparencia: [
    'configuracoes.geral.gerenciar',
    'configuracoes.aparencia.gerenciar'
  ],
  permissoes: [
    'configuracoes.geral.gerenciar',
    'configuracoes.permissoes.gerenciar'
  ],
  modulos: [
    'configuracoes.geral.gerenciar',
    'configuracoes.modulos.gerenciar'
  ]
};

const CONFIGURACOES_VIEW_KEYS = [
  ...new Set(Object.values(CONFIGURACOES_AREA_PERMISSION_KEYS).flat())
];

export function canAccessConfiguracoes(user) {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CONFIGURACOES_VIEW_KEYS);
  }
  return false;
}

export function canManageConfiguracoesArea(user, area = 'geral') {
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    const normalizedArea = String(area || 'geral').trim().toLowerCase();
    const permissionKeys = CONFIGURACOES_AREA_PERMISSION_KEYS[normalizedArea] || CONFIGURACOES_AREA_PERMISSION_KEYS.geral;
    return hasAnyPermissao(user, permissionKeys);
  }
  return false;
}

const CRM_PERFIS = ['SUPERADMIN', 'ADMIN', 'ADMINISTRADOR', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM', 'DIRETORIA'];
const CRM_PERFIS_EXPORT = ['SUPERADMIN', 'ADMIN', 'ADMINISTRADOR', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM'];
const CRM_PERFIS_REDISTRIBUTE = ['SUPERADMIN', 'ADMIN', 'ADMINISTRADOR', 'ADMIN_CRM', 'GESTOR_COMERCIAL', 'COORDENADOR_CRM'];
const CRM_DASHBOARD_KEYS = ['crm.dashboard.visualizar', 'crm.relatorios.visualizar'];
const CRM_LEADS_VIEW_KEYS = [
  'crm.leads.visualizar',
  'crm.leads.criar',
  'crm.leads.exportar',
  'crm.leads.redistribuir'
];
const CRM_LEADS_WRITE_KEYS = ['crm.leads.criar'];
const CRM_LEADS_EXPORT_KEYS = ['crm.leads.exportar'];
const CRM_LEADS_REDISTRIBUTE_KEYS = ['crm.leads.redistribuir'];
const CRM_ATENDIMENTO_VIEW_KEYS = ['crm.atendimento.visualizar', 'crm.atendimento.enviar'];
const CRM_ATENDIMENTO_SEND_KEYS = ['crm.atendimento.enviar'];
const CRM_AUTOMACOES_VIEW_KEYS = ['crm.automacoes.visualizar', 'crm.automacoes.gerenciar'];
const CRM_AUTOMACOES_MANAGE_KEYS = ['crm.automacoes.gerenciar'];
const CRM_CONFIG_VIEW_KEYS = ['crm.configuracoes.visualizar', 'crm.configuracoes.gerenciar'];
const CRM_CONFIG_MANAGE_KEYS = ['crm.configuracoes.gerenciar'];
const CRM_PERMISSION_KEYS = [
  ...CRM_DASHBOARD_KEYS,
  ...CRM_LEADS_VIEW_KEYS,
  ...CRM_ATENDIMENTO_VIEW_KEYS,
  ...CRM_AUTOMACOES_VIEW_KEYS,
  ...CRM_CONFIG_VIEW_KEYS
];

export function canAccessCrm(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_PERMISSION_KEYS);
  }
  const perfil = normalizeToken(user?.perfil || '');
  return CRM_PERFIS.includes(perfil);
}

export function canViewCrmDashboard(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_DASHBOARD_KEYS);
  }
  return canAccessCrm(user);
}

export function canViewCrmLeads(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_LEADS_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

export function canCreateCrmLeads(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_LEADS_WRITE_KEYS);
  }
  return canAccessCrm(user);
}

export function canExportCrmLeads(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_LEADS_EXPORT_KEYS);
  }
  const perfil = normalizeToken(user?.perfil || '');
  return CRM_PERFIS_EXPORT.includes(perfil);
}

export function canRedistributeCrmLeads(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_LEADS_REDISTRIBUTE_KEYS);
  }
  const perfil = normalizeToken(user?.perfil || '');
  return CRM_PERFIS_REDISTRIBUTE.includes(perfil);
}

export function canViewCrmAtendimento(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_ATENDIMENTO_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

export function canSendCrmAtendimento(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_ATENDIMENTO_SEND_KEYS);
  }
  return canAccessCrm(user);
}

export function canViewCrmAutomacoes(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_AUTOMACOES_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

export function canManageCrmAutomacoes(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_AUTOMACOES_MANAGE_KEYS);
  }
  return canAccessCrm(user);
}

export function canViewCrmConfiguracoes(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_CONFIG_VIEW_KEYS);
  }
  return canAccessCrm(user);
}

export function canManageCrmConfiguracoes(user) {
  if (!hasEnabledModule(user, 'CRM')) return false;
  if (isBusinessAdmin(user)) return true;
  if (hasConfiguredAreaPermissions(user)) {
    return hasAnyPermissao(user, CRM_CONFIG_MANAGE_KEYS);
  }
  return canAccessCrm(user);
}

/**
 * Verifica se o usuário tem uma permissão de área específica.
 *
 * SUPERADMIN e ADMINISTRADOR têm bypass total (retorna sempre true).
 * Usuários sem nenhuma permissão configurada têm acesso completo (backwards compat).
 * Usuários COM permissões configuradas: somente as chaves listadas são concedidas.
 *
 * @param {object} user - Objeto do usuário da sessão
 * @param {string} permKey - Chave no formato "modulo.area.acao" (ex: "financeiro.titulos.criar")
 */
export function hasPermissao(user, permKey) {
  if (isBusinessAdmin(user)) return true;
  const lista = user?.areas_permissoes;
  // O backend informa explicitamente se existe configuracao. Assim uma lista
  // vazia configurada significa "sem permissoes", enquanto a ausencia de
  // configuracao continua com o acesso legado por compatibilidade.
  if (!hasConfiguredAreaPermissions(user)) return true;
  if (!Array.isArray(lista)) return false;
  return lista.includes(String(permKey).toLowerCase());
}

export function hasConfiguredAreaPermissions(user) {
  if (typeof user?.areas_permissoes_configuradas === 'boolean') {
    return user.areas_permissoes_configuradas;
  }
  const lista = user?.areas_permissoes;
  return Array.isArray(lista) && lista.length > 0;
}

export function hasAnyPermissao(user, permKeys = []) {
  return (Array.isArray(permKeys) ? permKeys : []).some((permKey) => hasPermissao(user, permKey));
}

export function hasAnyExplicitPermissao(user, permKeys = []) {
  if (isBusinessAdmin(user)) return true;
  if (!hasConfiguredAreaPermissions(user)) return false;
  return hasAnyPermissao(user, permKeys);
}
