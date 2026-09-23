const CODIGOS_OBRAS_MACRO_CONFIGURAVEIS = Object.freeze(['109', '110']);

function asPlain(value) {
  return value && typeof value.get === 'function' ? value.get({ plain: true }) : value;
}

function normalizarCodigoObra(value) {
  return String(value ?? '').trim();
}

function obraPermiteConfiguracaoMacro(obra) {
  return CODIGOS_OBRAS_MACRO_CONFIGURAVEIS.includes(normalizarCodigoObra(asPlain(obra)?.codigo));
}

function apropriacaoEhMacroFormulario(apropriacao) {
  const value = asPlain(apropriacao)?.macro_formulario;
  return value === true || Number(value) === 1;
}

function apropriacaoEhSomadora(apropriacao) {
  const value = asPlain(apropriacao)?.somadora;
  return value === true || Number(value) === 1;
}

function apropriacaoPodeReceberLancamento(apropriacao) {
  const item = asPlain(apropriacao);
  if (!item || item.ativo === false || Number(item.ativo) === 0) return false;
  return !apropriacaoEhSomadora(item) || apropriacaoEhMacroFormulario(item);
}

function ordemApropriacao(apropriacao) {
  const item = asPlain(apropriacao) || {};
  const ordem = Number(item.ordem_planilha || 0);
  return ordem > 0 ? ordem : Number(item.id || 0);
}

function ordenarApropriacoes(apropriacoes = []) {
  return [...apropriacoes].sort((left, right) => (
    ordemApropriacao(left) - ordemApropriacao(right)
      || String(asPlain(left)?.codigo || '').localeCompare(
        String(asPlain(right)?.codigo || ''),
        'pt-BR',
        { numeric: true, sensitivity: 'base' }
      )
  ));
}

function selecionarApropriacoesOperacionais(apropriacoes = []) {
  const ordenadas = ordenarApropriacoes(apropriacoes);
  const macros = ordenadas.filter(apropriacaoEhMacroFormulario);
  return macros.length
    ? macros
    : ordenadas.filter((item) => !apropriacaoEhSomadora(item));
}

function selecionarApropriacoesOperacionaisPorObra(apropriacoes = []) {
  const porObra = new Map();
  for (const item of apropriacoes) {
    const obraId = Number(asPlain(item)?.obra_id || 0);
    if (!porObra.has(obraId)) porObra.set(obraId, []);
    porObra.get(obraId).push(item);
  }
  return ordenarApropriacoes(
    [...porObra.values()].flatMap(selecionarApropriacoesOperacionais)
  );
}

function sugerirIdsMacros(apropriacoes = []) {
  const ordenadas = ordenarApropriacoes(apropriacoes).map(asPlain);
  const idsConfigurados = ordenadas
    .filter(apropriacaoEhMacroFormulario)
    .map((item) => Number(item.id));
  if (idsConfigurados.length) return idsConfigurados;

  const roots = ordenadas.filter((item) => !item.apropriacao_pai_id);
  const rootIds = new Set(roots.map((item) => Number(item.id)));
  const filhosDiretos = ordenadas.filter((item) => rootIds.has(Number(item.apropriacao_pai_id)));

  // Planilhas com poucas frentes raiz (caso da obra 109) usam o primeiro nivel
  // abaixo das frentes. Estruturas com muitas raizes (caso da obra 110) ja trazem
  // as etapas macro diretamente no nivel raiz.
  const sugeridas = roots.length > 0 && roots.length <= 5 && filhosDiretos.length > roots.length
    ? filhosDiretos
    : roots;

  return sugeridas.map((item) => Number(item.id));
}

function listarCandidatasMacro(apropriacoes = []) {
  const ordenadas = ordenarApropriacoes(apropriacoes).map(asPlain);
  const rootIds = new Set(
    ordenadas.filter((item) => !item.apropriacao_pai_id).map((item) => Number(item.id))
  );
  return ordenadas.filter((item) => (
    apropriacaoEhSomadora(item)
      || apropriacaoEhMacroFormulario(item)
      || rootIds.has(Number(item.apropriacao_pai_id))
  ));
}

module.exports = {
  CODIGOS_OBRAS_MACRO_CONFIGURAVEIS,
  apropriacaoEhMacroFormulario,
  apropriacaoEhSomadora,
  apropriacaoPodeReceberLancamento,
  listarCandidatasMacro,
  obraPermiteConfiguracaoMacro,
  ordenarApropriacoes,
  selecionarApropriacoesOperacionais,
  selecionarApropriacoesOperacionaisPorObra,
  sugerirIdsMacros
};
