// =====================================================================
// MOTOR GENÉRICO DE LAYOUT EM BLOCOS (detalhe da solicitação e Home)
// ---------------------------------------------------------------------
// Um catálogo FIXO de blocos por tela; a configuração só ORDENA/OCULTA.
// Resolução em três camadas (a primeira que existir vence):
//   1. arranjo do USUÁRIO (usuario_lista_preferencias, chave da tela)
//   2. layout do SETOR (setor_detalhe_layout, coluna `tela`)
//   3. ordem padrão do código — o layout atual da tela.
//
// Extraído de blocosDetalhe.js para a Home reaproveitar o MESMO motor
// (nada de sistema paralelo). `resolverLayoutDetalhe` delega para cá.
// =====================================================================

// Combina as camadas em um arranjo final:
// - `ordemPadrao`: ids do catálogo da tela, na ordem do código
// - `configSetor`: [{ bloco, visivel, posicao }] (admin) ou null
// - `prefsUsuario`: { ordem, recolhidos, removidos, larguras } ou null —
//    a camada do usuário VENCE a do setor (o padrão do setor é padrão,
//    não restrição; restrição é permissão).
// Retorna { ordem, ocultos: Set, recolhidos: Set, larguras: {} }.
// `larguras` preserva valores 'normal' E 'total' — cada tela interpreta
// com o próprio padrão (detalhe: padrão normal; Home: padrão total).
// Blocos que não constem na configuração entram no FIM, visíveis —
// um bloco novo no código nunca some por causa de config antiga.
export function resolverLayoutBlocos(ordemPadrao, { configSetor = null, prefsUsuario = null } = {}) {
  const idsValidos = new Set(ordemPadrao);

  let ordemBase = ordemPadrao;
  const ocultosSetor = new Set();

  if (Array.isArray(configSetor) && configSetor.length > 0) {
    const daConfig = configSetor
      .filter((item) => idsValidos.has(item?.bloco))
      .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
    const listados = new Set(daConfig.map((item) => item.bloco));
    ordemBase = [
      ...daConfig.map((item) => item.bloco),
      ...ordemPadrao.filter((id) => !listados.has(id))
    ];
    for (const item of daConfig) {
      if (item.visivel === false) ocultosSetor.add(item.bloco);
    }
  }

  let ordem = ordemBase;
  const recolhidos = new Set();
  const larguras = {};
  // Quando o usuário tem lista própria de removidos, ela SUBSTITUI a
  // ocultação do setor (ele pode readicionar um bloco que o admin
  // ocultou por padrão).
  let ocultos = ocultosSetor;

  if (prefsUsuario && Array.isArray(prefsUsuario.ordem) && prefsUsuario.ordem.length > 0) {
    const doUsuario = prefsUsuario.ordem.filter((id) => idsValidos.has(id));
    const listados = new Set(doUsuario);
    ordem = [...doUsuario, ...ordemBase.filter((id) => !listados.has(id))];
  }
  if (prefsUsuario && Array.isArray(prefsUsuario.removidos)) {
    ocultos = new Set(prefsUsuario.removidos.filter((id) => idsValidos.has(id)));
  }
  if (prefsUsuario && Array.isArray(prefsUsuario.recolhidos)) {
    for (const id of prefsUsuario.recolhidos) {
      if (idsValidos.has(id)) recolhidos.add(id);
    }
  }
  if (prefsUsuario && prefsUsuario.larguras && typeof prefsUsuario.larguras === 'object') {
    for (const [id, largura] of Object.entries(prefsUsuario.larguras)) {
      if (idsValidos.has(id) && (largura === 'total' || largura === 'normal')) {
        larguras[id] = largura;
      }
    }
  }

  return { ordem, ocultos, recolhidos, larguras };
}

// =====================================================================
// ARRANJO PERSONALIZÁVEL GENÉRICO (05/09)
// ---------------------------------------------------------------------
// O motor acima resolve as CAMADAS. O que vem abaixo é o que faltava
// para as duas telas que já tinham personalização (Home e detalhe da
// solicitação) pararem de manter, cada uma, a sua cópia das seis funções
// de mutação — e para as telas de relatório ganharem o mesmo mecanismo
// sem escrever nenhuma delas. Ele é usado pelo componente padrão
// `components/padrao/BlocosPersonalizaveis.jsx`.
//
// A SOMA DAS DUAS TELAS, NÃO A ESCOLHA DE UMA:
//   - `adicionados` (só a Home tinha): bloco que nasce DESLIGADO
//     (`padraoOculto`) e volta pelo "Adicionar bloco";
//   - `recolhidos` (só o detalhe tinha): bloco recolhido pelo arranjo;
//   - `larguras` com PADRÃO POR BLOCO: o detalhe tem padrão 'normal' e a
//     Home 'total' — em vez de escolher um dos dois, o padrão viaja no
//     catálogo (`larguraPadrao` por bloco) e o que se guarda é o desvio.
// =====================================================================

// Largura efetiva de um bloco quando o usuário não escolheu nada.
export function larguraPadraoDoBloco(bloco, larguraPadraoDaTela = 'normal') {
  const declarada = bloco?.larguraPadrao;
  if (declarada === 'normal' || declarada === 'total') return declarada;
  return larguraPadraoDaTela === 'total' ? 'total' : 'normal';
}

/*
  Resolve o arranjo de uma tela a partir do catálogo (a ordem do CÓDIGO) e
  da preferência do usuário. Devolve, além do arranjo, o que NÃO foi
  reconhecido — e isso não é detalhe: a preferência guarda o desvio, e um
  id que sumiu do catálogo (bloco escondido por permissão hoje, bloco
  renomeado ontem) é IGNORADO NA LEITURA e PRESERVADO NA GRAVAÇÃO. Filtrar
  é reversível; apagar não é. É a mesma regra da linha 23-24 deste arquivo.
*/
export function resolverArranjoBlocos(catalogo, prefsUsuario = null, opcoes = {}) {
  const { configSetor = null, larguraPadrao: larguraPadraoDaTela = 'normal' } = opcoes;
  const blocos = Array.isArray(catalogo) ? catalogo.filter((bloco) => bloco && bloco.id) : [];
  const ordemPadrao = blocos.map((bloco) => bloco.id);
  const idsValidos = new Set(ordemPadrao);
  const porId = new Map(blocos.map((bloco) => [bloco.id, bloco]));

  const base = resolverLayoutBlocos(ordemPadrao, { configSetor, prefsUsuario });

  // Camada `adicionados`: quem nasce desligado só aparece quando o usuário
  // pediu (ou quando o admin do setor ligou no layout do setor).
  const ligadosPeloSetor = new Set(
    (Array.isArray(configSetor) ? configSetor : [])
      .filter((item) => item?.visivel !== false)
      .map((item) => item?.bloco)
  );
  const adicionados = new Set(
    (Array.isArray(prefsUsuario?.adicionados) ? prefsUsuario.adicionados : [])
      .filter((id) => idsValidos.has(id))
  );
  const ocultos = new Set(base.ocultos);
  for (const bloco of blocos) {
    if (!bloco.padraoOculto) continue;
    if (adicionados.has(bloco.id) || ligadosPeloSetor.has(bloco.id)) continue;
    ocultos.add(bloco.id);
  }
  // Blocos que representam decisão ou ação pendente podem participar da
  // ordem e do recolhimento, mas não podem desaparecer da tela. A proteção
  // também corrige preferências antigas que tenham o id em `removidos`.
  for (const bloco of blocos) {
    if (bloco.removivel === false) ocultos.delete(bloco.id);
  }

  // Largura FINAL por bloco: escolha do usuário > padrão do bloco >
  // padrão da tela.
  const larguras = {};
  for (const bloco of blocos) {
    const escolhida = base.larguras[bloco.id];
    larguras[bloco.id] = (escolhida === 'normal' || escolhida === 'total')
      ? escolhida
      : larguraPadraoDoBloco(bloco, larguraPadraoDaTela);
  }

  const fora = (lista) => (Array.isArray(lista) ? lista.filter((id) => !idsValidos.has(id)) : []);
  const largurasDesconhecidas = {};
  for (const [id, largura] of Object.entries(prefsUsuario?.larguras || {})) {
    if (!idsValidos.has(id)) largurasDesconhecidas[id] = largura;
  }

  return {
    ordem: base.ordem,
    ocultos,
    recolhidos: base.recolhidos,
    larguras,
    adicionados,
    porId,
    idsValidos,
    // O que a leitura ignorou e a gravação tem de devolver intacto.
    desconhecidos: {
      ordem: Array.isArray(prefsUsuario?.ordem) ? prefsUsuario.ordem : [],
      removidos: fora(prefsUsuario?.removidos),
      adicionados: fora(prefsUsuario?.adicionados),
      recolhidos: fora(prefsUsuario?.recolhidos),
      larguras: largurasDesconhecidas
    }
  };
}

/*
  Mescla a ordem NOVA (só ids do catálogo) de volta na ordem ARMAZENADA,
  mantendo cada id desconhecido no lugar em que estava. Sem isto, mover um
  bloco jogaria para o fim (ou para fora) o bloco que a permissão do dia
  escondeu — e a pessoa que abrisse a mesma tela com outro perfil veria o
  arranjo dela desfeito por um arrasto que não era sobre aquele bloco.
*/
export function mesclarOrdemBlocos(ordemArmazenada, novaOrdem, idsValidos) {
  const armazenada = Array.isArray(ordemArmazenada) ? ordemArmazenada : [];
  const fila = Array.isArray(novaOrdem) ? novaOrdem.slice() : [];
  const resultado = [];
  for (const id of armazenada) {
    if (idsValidos.has(id)) {
      if (fila.length > 0) resultado.push(fila.shift());
    } else {
      resultado.push(id);
    }
  }
  return [...resultado, ...fila];
}
