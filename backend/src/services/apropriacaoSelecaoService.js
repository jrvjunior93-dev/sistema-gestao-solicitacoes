const NIVEIS_APROPRIACAO_FORMULARIO = Object.freeze([
  'ETAPA',
  'SERVICO',
  'SUBSERVICO',
  'PERSONALIZADO'
]);

function asPlain(value) {
  return value && typeof value.get === 'function' ? value.get({ plain: true }) : value;
}

function normalizarNivelApropriacaoFormulario(value, fallback = null) {
  const nivel = String(value || '').trim().toUpperCase();
  return NIVEIS_APROPRIACAO_FORMULARIO.includes(nivel) ? nivel : fallback;
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

function mapaNiveisHierarquia(apropriacoes = []) {
  const itens = ordenarApropriacoes(apropriacoes).map(asPlain);
  const porId = new Map(itens.map((item) => [String(item.id), item]));
  const cache = new Map();

  function nivelDo(item, visitados = new Set()) {
    const chave = String(item?.id ?? '');
    if (cache.has(chave)) return cache.get(chave);
    if (!item?.apropriacao_pai_id) {
      cache.set(chave, 0);
      return 0;
    }
    if (visitados.has(chave)) {
      cache.set(chave, 0);
      return 0;
    }

    const pai = porId.get(String(item.apropriacao_pai_id));
    if (!pai) {
      cache.set(chave, 0);
      return 0;
    }

    const proximosVisitados = new Set(visitados);
    proximosVisitados.add(chave);
    const nivel = nivelDo(pai, proximosVisitados) + 1;
    cache.set(chave, nivel);
    return nivel;
  }

  itens.forEach((item) => nivelDo(item));
  return cache;
}

function selecionarApropriacoesPorNivel(apropriacoes = [], nivelInformado = null) {
  const ordenadas = ordenarApropriacoes(apropriacoes).map(asPlain);
  const nivel = normalizarNivelApropriacaoFormulario(nivelInformado, null);
  if (!nivel) return selecionarApropriacoesOperacionais(ordenadas);
  if (nivel === 'PERSONALIZADO') {
    return ordenadas.filter(apropriacaoEhMacroFormulario);
  }

  const niveis = mapaNiveisHierarquia(ordenadas);
  const idsComFilhos = new Set(
    ordenadas
      .map((item) => item.apropriacao_pai_id)
      .filter(Boolean)
      .map(String)
  );

  if (nivel === 'ETAPA') {
    return ordenadas.filter((item) => Number(niveis.get(String(item.id)) || 0) === 0);
  }

  if (nivel === 'SERVICO') {
    return ordenadas.filter((item) => {
      const profundidade = Number(niveis.get(String(item.id)) || 0);
      return profundidade === 1 || (profundidade === 0 && !idsComFilhos.has(String(item.id)));
    });
  }

  // Subservico e o detalhe operacional: usa a folha mais profunda de cada ramo.
  // Assim nenhum ramo desaparece quando a planilha termina antes do terceiro nivel.
  return ordenadas.filter((item) => !idsComFilhos.has(String(item.id)));
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

async function sincronizarNivelApropriacaoFormulario({
  obraId,
  nivel: nivelInformado,
  apropriacaoIds = [],
  transaction = null
}) {
  const { Op } = require('sequelize');
  const { Apropriacao, Obra } = require('../models');
  const nivel = normalizarNivelApropriacaoFormulario(nivelInformado, null);
  if (!nivel) {
    const error = new Error('Selecione o nivel de apropriacao dos formularios.');
    error.statusCode = 400;
    throw error;
  }

  const obra = await Obra.findByPk(Number(obraId), { transaction });
  if (!obra) {
    const error = new Error('Obra nao encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const apropriacoes = ordenarApropriacoes(await Apropriacao.findAll({
    where: { obra_id: Number(obraId), ativo: true },
    transaction
  }));
  let selecionadas;

  if (nivel === 'PERSONALIZADO') {
    const ids = [...new Set(apropriacaoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    selecionadas = apropriacoes.filter((item) => ids.includes(Number(asPlain(item).id)));
    if (!ids.length || selecionadas.length !== ids.length) {
      const error = new Error('Selecione apropriacoes ativas pertencentes a esta obra.');
      error.statusCode = 400;
      throw error;
    }
  } else {
    selecionadas = selecionarApropriacoesPorNivel(apropriacoes, nivel);
    if (apropriacoes.length && !selecionadas.length) {
      const error = new Error('O nivel escolhido nao encontrou apropriacoes nesta obra.');
      error.statusCode = 400;
      throw error;
    }
  }

  await Apropriacao.update(
    { macro_formulario: false },
    { where: { obra_id: Number(obraId), macro_formulario: true }, transaction }
  );
  const idsSelecionados = selecionadas.map((item) => Number(asPlain(item).id));
  if (idsSelecionados.length) {
    await Apropriacao.update(
      { macro_formulario: true },
      { where: { obra_id: Number(obraId), id: { [Op.in]: idsSelecionados }, ativo: true }, transaction }
    );
  }
  await obra.update({ nivel_apropriacao_formulario: nivel }, { transaction });

  return { obra, nivel, apropriacaoIds: idsSelecionados, apropriacoes: selecionadas };
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
  NIVEIS_APROPRIACAO_FORMULARIO,
  apropriacaoEhMacroFormulario,
  apropriacaoEhSomadora,
  apropriacaoPodeReceberLancamento,
  listarCandidatasMacro,
  mapaNiveisHierarquia,
  normalizarNivelApropriacaoFormulario,
  ordenarApropriacoes,
  selecionarApropriacoesPorNivel,
  selecionarApropriacoesOperacionais,
  selecionarApropriacoesOperacionaisPorObra,
  sincronizarNivelApropriacaoFormulario,
  sugerirIdsMacros
};
