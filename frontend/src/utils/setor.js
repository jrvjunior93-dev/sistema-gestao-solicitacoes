export function normalizarSetorToken(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

export function getSetorCapabilities(setor) {
  const tokenCodigo = normalizarSetorToken(setor?.codigo);
  const tokenNome = normalizarSetorToken(setor?.nome);
  const tokens = [tokenCodigo, tokenNome].filter(Boolean);
  const has = (token) => tokens.includes(token);

  const read = (field, fallback) => (
    typeof setor?.[field] === 'boolean'
      ? setor[field]
      : fallback
  );

  return {
    eh_setor_obra: read('eh_setor_obra', has('OBRA')),
    eh_setor_financeiro: read('eh_setor_financeiro', has('FINANCEIRO')),
    eh_setor_compras: read('eh_setor_compras', has('COMPRAS')),
    eh_setor_geo: read('eh_setor_geo', has('GEO') || has('GERENCIA_DE_PROCESSOS') || has('GERENCIA_PROCESSOS')),
    eh_setor_administrativo: read('eh_setor_administrativo', has('ADMINISTRATIVO'))
  };
}

export function userSetorCapabilities(user) {
  const setores = Array.isArray(user?.setores) ? user.setores : [];
  const capabilitiesPrincipal = getSetorCapabilities({
    ...(user?.setor || {}),
    codigo: user?.setor?.codigo || user?.area || user?.setor?.codigo,
    nome: user?.setor?.nome || user?.area || user?.setor?.nome
  });

  return setores.reduce((acc, setor) => {
    const atual = getSetorCapabilities(setor);
    return {
      eh_setor_obra: acc.eh_setor_obra || atual.eh_setor_obra,
      eh_setor_financeiro: acc.eh_setor_financeiro || atual.eh_setor_financeiro,
      eh_setor_compras: acc.eh_setor_compras || atual.eh_setor_compras,
      eh_setor_geo: acc.eh_setor_geo || atual.eh_setor_geo,
      eh_setor_administrativo: acc.eh_setor_administrativo || atual.eh_setor_administrativo
    };
  }, capabilitiesPrincipal);
}

export function userHasSetorCapability(user, capability) {
  return Boolean(userSetorCapabilities(user)?.[capability]);
}

export function isGeoSetor(valor) {
  if (typeof valor === 'object' && valor !== null) {
    return getSetorCapabilities(valor).eh_setor_geo;
  }
  const token = normalizarSetorToken(valor);
  return token === 'GEO' || token === 'GERENCIA_DE_PROCESSOS' || token === 'GERENCIA_PROCESSOS';
}

export function isObraSetor(valor) {
  if (typeof valor === 'object' && valor !== null) {
    return getSetorCapabilities(valor).eh_setor_obra;
  }
  return normalizarSetorToken(valor) === 'OBRA';
}

export function isFinanceiroSetor(valor) {
  if (typeof valor === 'object' && valor !== null) {
    return getSetorCapabilities(valor).eh_setor_financeiro;
  }
  return normalizarSetorToken(valor) === 'FINANCEIRO';
}

export function isComprasSetor(valor) {
  if (typeof valor === 'object' && valor !== null) {
    return getSetorCapabilities(valor).eh_setor_compras;
  }
  return normalizarSetorToken(valor) === 'COMPRAS';
}

const SETORES_DP = new Set(['DP', 'DEPARTAMENTO_PESSOAL']);

export function isDpSetor(valor) {
  if (typeof valor === 'object' && valor !== null) {
    return [valor.codigo, valor.nome].some((item) => SETORES_DP.has(normalizarSetorToken(item)));
  }
  return SETORES_DP.has(normalizarSetorToken(valor));
}

export function userBelongsToDpSetor(user) {
  const setoresDoUsuario = [
    user?.setor,
    ...(Array.isArray(user?.setores) ? user.setores : [])
  ].filter(Boolean);

  return setoresDoUsuario.some(isDpSetor) || isDpSetor(user?.area);
}

export function obterTokensSetorUsuario(user) {
  const tokens = new Set([
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ].filter(Boolean));

  if (Array.isArray(user?.setores)) {
    user.setores.forEach((setor) => {
      if (setor?.id) tokens.add(String(setor.id).toUpperCase());
      if (setor?.codigo) tokens.add(String(setor.codigo).toUpperCase());
      if (setor?.nome) tokens.add(String(setor.nome).toUpperCase());
    });
  }

  if (Array.isArray(user?.setores_visiveis)) {
    user.setores_visiveis.forEach((setor) => {
      if (setor) tokens.add(String(setor).toUpperCase());
    });
  }

  const capabilities = userSetorCapabilities(user);
  if (capabilities.eh_setor_geo) {
    tokens.add('GEO');
    tokens.add('GERENCIA DE PROCESSOS');
    tokens.add('GERENCIA_PROCESSOS');
  }
  if (capabilities.eh_setor_obra) tokens.add('OBRA');
  if (capabilities.eh_setor_financeiro) tokens.add('FINANCEIRO');
  if (capabilities.eh_setor_compras) tokens.add('COMPRAS');

  return Array.from(tokens);
}

export function solicitacaoEstaNoSetorDoUsuario(areaResponsavel, user) {
  const setorSolicitacao = normalizarSetorToken(areaResponsavel);
  if (!setorSolicitacao) return false;

  return obterTokensSetorUsuario(user).some(token => {
    const tokenNormalizado = normalizarSetorToken(token);
    if (!tokenNormalizado) return false;
    if (tokenNormalizado === setorSolicitacao) return true;
    return isGeoSetor(tokenNormalizado) && isGeoSetor(setorSolicitacao);
  });
}
