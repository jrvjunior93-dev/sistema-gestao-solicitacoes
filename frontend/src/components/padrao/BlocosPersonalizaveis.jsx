import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import BlocoConteudo from './BlocoConteudo';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';
import { TIPO_BLOCOS, usePreferenciaDeLista } from '../../contexts/PreferenciasContext';
import {
  larguraPadraoDoBloco,
  mesclarOrdemBlocos,
  resolverArranjoBlocos
} from '../../utils/layoutBlocos';

/* =====================================================================
   BLOCOS PERSONALIZÁVEIS — O COMPONENTE PADRÃO (05/09)
   ---------------------------------------------------------------------
   POR QUE ELE EXISTE: o mecanismo (ocultar, reordenar, recolher e
   "Adicionar bloco" para trazer de volta) existia em DUAS telas e estava
   DUPLICADO entre elas. Medido em 05/09, nos dois arquivos:

     - seis funções iguais escritas duas vezes (`moverBloco`,
       `removerBloco`, `readicionarBloco`, `definirLarguraBloco`,
       `restaurarPadraoSetor`, `camadaAtual`/`persistirLayoutUsuario`);
     - a barra por bloco (⋮⋮ · nome · largura · ×) e o popover
       "Adicionar bloco", markup por markup;
     - e a Home desenhando tudo isso com as classes `sol-detail-*`, o
       prefixo da OUTRA tela — cópia que trouxe o CSS junto.

   A SOMA DAS CAPACIDADES, NÃO A ESCOLHA DE UMA. Cada tela tinha um
   pedaço que a outra não tinha, e nenhum deles se perde aqui:
     - `adicionados` (era só da Home): bloco que nasce DESLIGADO
       (`padraoOculto`) e só aparece quando a pessoa o adiciona;
     - `recolhidos` (era só do detalhe): recolher pelo arranjo, com o
       bloco virando uma linha "— mostrar";
     - LARGURA com padrões OPOSTOS (detalhe 'normal', Home 'total'):
       resolvido sem escolher lado — o padrão viaja por bloco
       (`larguraPadrao`) e o que se guarda é o DESVIO dele.

   O QUE SE GUARDA É O DESVIO, NUNCA O ESTADO COMPLETO. Bloco novo no
   código entra visível; id que não existe mais no catálogo é IGNORADO NA
   LEITURA e DEVOLVIDO INTACTO NA GRAVAÇÃO (`desconhecidos` do
   `resolverArranjoBlocos`) — filtrar é reversível, apagar não é. O
   detalhe e a Home hoje APAGAM esses ids ao gravar; aqui isso deixa de
   acontecer, e é ganho, não mudança de contrato.

   DOIS DONOS DA PERSISTÊNCIA, PORQUE SÃO DOIS CASOS DE USO:
     1. `chave` — a tela só declara identidade e o componente grava
        sozinho (tipo `blocos` do `PreferenciasContext`: leitura síncrona
        em render, gravação com 700ms de atraso, por usuário no banco).
        É o caminho das 40 telas de relatório/painel.
     2. `arranjo` + `aoMudarArranjo` — a tela já tem camadas próprias
        (setor do admin, `modulos` da Home, `historico_ordem` do
        detalhe) e continua dona da gravação; o componente devolve a
        camada de blocos inteira e ela mescla o que é dela.

   CELULAR: o arrastar é HTML5 nativo (`draggable`), que NÃO responde a
   toque. Ligar o modo no celular seria oferecer um gesto que não existe,
   então ele fica desligado abaixo de 768px — a regra que as duas telas
   já aplicavam, agora num lugar só. O que o celular mantém é o
   RESULTADO: a ordem e os blocos escolhidos no desktop valem lá.
   ===================================================================== */

const CELULAR = '(max-width: 767px)';

// Id derivado do título quando a tela não declara um: minúsculas, sem
// acento, dentro do padrão que o backend aceita para chave de lista
// (`^[a-z0-9_:-]+$`). Título é o que a pessoa lê no bloco — é a
// identidade mais estável que existe sem inventar prop nova.
function idDeTexto(valor) {
  const texto = typeof valor === 'string' ? valor : '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* Catálogo a partir dos filhos JSX: cada `<BlocoConteudo>` vira um bloco
   do arranjo. O id sai de `data-bloco-id` (quando a tela quer mandar) ou
   do título; `data-*` porque ele atravessa o `...props` do BlocoConteudo
   sem virar atributo desconhecido no DOM. Filho sem título nem id fica
   com a posição declarada — e como id desconhecido é preservado na
   gravação, um bloco condicional que sumiu não leva o arranjo junto. */
function catalogoDosFilhos(children) {
  const usados = new Set();
  return Children.toArray(children)
    .filter((filho) => isValidElement(filho))
    .map((filho, indice) => {
      const props = filho.props || {};
      const base = props['data-bloco-id'] || idDeTexto(props.titulo) || `bloco-${indice + 1}`;
      let id = base;
      let sufixo = 2;
      // Dois blocos com o mesmo título na mesma tela existiriam como UM
      // só na preferência (recolher um recolheria o outro).
      while (usados.has(id)) { id = `${base}-${sufixo}`; sufixo += 1; }
      usados.add(id);
      return {
        id,
        rotulo: props['data-bloco-rotulo'] || props.titulo || `Bloco ${indice + 1}`,
        larguraPadrao: props['data-bloco-largura'],
        conteudo: filho
      };
    });
}

export default function BlocosPersonalizaveis({
  // --- identidade e persistência própria ---
  chave,
  // --- catálogo: array explícito OU os filhos JSX ---
  blocos,
  children,
  // --- padrão de largura da TELA (o do bloco vence, quando declarado) ---
  larguraPadrao = 'normal',
  // --- arranjo controlado de fora (telas com camadas próprias) ---
  arranjo: arranjoControlado = null,
  preferenciasBrutas,
  aoMudarArranjo,
  aoRestaurar,
  // --- modo de personalização controlado de fora ---
  personalizando: personalizandoControlado,
  aoAlternarPersonalizando,
  // --- ajustes de apresentação ---
  mostrarEntrada = true,
  dentroDeGrade = false,
  permiteLargura = true,
  permiteRecolher = true,
  agruparPor,
  gruposOrdem,
  toolbarExtra,
  rotuloRestaurar = 'Restaurar padrão',
  classes = {}
}) {
  const [personalizandoInterno, setPersonalizandoInterno] = useState(false);
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const adicionarRef = useRef(null);
  const arrastadoRef = useRef(null);
  const [ehCelular, setEhCelular] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(CELULAR).matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia(CELULAR);
    const ouvinte = (evento) => setEhCelular(evento.matches);
    media.addEventListener('change', ouvinte);
    return () => media.removeEventListener('change', ouvinte);
  }, []);

  useFecharAoSair(adicionarRef, adicionarAberto, () => setAdicionarAberto(false));
  /*
    O catálogo "Adicionar bloco" é `absolute; left: 0` com `min-width:
    230px` e teto de 420px. Numa barra de personalização o botão fica à
    DIREITA: a 390px de janela o catálogo saía pela borda direita, e é a
    mesma família do defeito do painel "Filtros visíveis" — só que para o
    outro lado. Alinhar pela esquerda do botão continua sendo a
    preferência; o hook só vira quando esse lado não cabe.
    R29: hook no topo, acima de qualquer saída antecipada.
  */
  const botaoAdicionarRef = useRef(null);
  const menuAdicionarRef = useRef(null);
  const posicaoAdicionar = usePosicaoFlutuante(botaoAdicionarRef, menuAdicionarRef, adicionarAberto);

  // Quem controla o arranjo de fora também grava de fora: a chave só
  // registra entrada no armazém quando ela é MESMO a dona da gravação.
  const persistePorConta = Boolean(chave && !aoMudarArranjo);
  const [preferencia, gravarPreferencia] = usePreferenciaDeLista(
    persistePorConta ? chave : '',
    TIPO_BLOCOS
  );

  const catalogo = useMemo(
    () => (Array.isArray(blocos) ? blocos.filter((bloco) => bloco && bloco.id) : catalogoDosFilhos(children)),
    [blocos, children]
  );

  const brutas = preferenciasBrutas !== undefined ? preferenciasBrutas : preferencia;
  const resolvido = useMemo(
    () => resolverArranjoBlocos(catalogo, brutas, { larguraPadrao }),
    [catalogo, brutas, larguraPadrao]
  );

  // Tela com camadas próprias manda no arranjo; o resolvido continua
  // valendo para o que só ele sabe (catálogo, ids válidos, desconhecidos).
  const arranjo = arranjoControlado || resolvido;
  const ordem = arranjo.ordem || resolvido.ordem;
  const ocultos = arranjo.ocultos || new Set();
  const recolhidos = arranjo.recolhidos || new Set();
  const larguras = arranjo.larguras || resolvido.larguras;
  const adicionados = arranjo.adicionados || new Set();
  const { porId, idsValidos, desconhecidos } = resolvido;

  const modoControlado = typeof personalizandoControlado === 'boolean';
  const podePersonalizar = !ehCelular;
  const personalizando = podePersonalizar
    && (modoControlado ? personalizandoControlado : personalizandoInterno);

  const alternarModo = () => {
    const proximo = !personalizando;
    if (!modoControlado) setPersonalizandoInterno(proximo);
    if (aoAlternarPersonalizando) aoAlternarPersonalizando(proximo);
    if (!proximo) setAdicionarAberto(false);
  };

  /* ----- a camada de blocos, sempre inteira ---------------------------
     Gravar só o que mudou perderia o resto: as duas telas já escreviam a
     camada completa, e a diferença aqui é que os ids que a leitura
     ignorou voltam junto (`desconhecidos`). */
  const camadaAtual = () => {
    const ordemArmazenada = Array.isArray(brutas?.ordem) ? brutas.ordem : [];
    return {
      // Ordem só passa a existir na preferência quando a pessoa move
      // alguma coisa — até lá o padrão do código (ou do setor) manda.
      ordem: ordemArmazenada.length > 0
        ? mesclarOrdemBlocos(ordemArmazenada, ordem, idsValidos)
        : [],
      removidos: [
        ...Array.from(ocultos).filter((id) => !adicionados.has(id)),
        ...desconhecidos.removidos
      ],
      adicionados: [...Array.from(adicionados), ...desconhecidos.adicionados],
      recolhidos: [...Array.from(recolhidos), ...desconhecidos.recolhidos],
      // Larguras saem do que está GRAVADO (só desvios), não do resolvido:
      // materializar o padrão de todo bloco congelaria a escolha do
      // código no dia em que a pessoa mexeu num bloco qualquer.
      larguras: { ...(brutas?.larguras || {}) }
    };
  };

  const temAlgumaEscolha = (camada) => Boolean(
    camada && (
      camada.ordem?.length || camada.removidos?.length || camada.adicionados?.length
      || camada.recolhidos?.length || Object.keys(camada.larguras || {}).length
    )
  );

  const aplicar = (remendo) => {
    const camada = { ...camadaAtual(), ...remendo };
    if (aoMudarArranjo) {
      aoMudarArranjo(camada);
      return;
    }
    // Sem desvio nenhum não há preferência: `null` apaga o registro em vez
    // de gravar uma cópia do padrão.
    gravarPreferencia(temAlgumaEscolha(camada) ? camada : null);
  };

  const moverBloco = (origemId, alvoId) => {
    if (!origemId || !alvoId || origemId === alvoId) return;
    const nova = ordem.slice();
    const de = nova.indexOf(origemId);
    const para = nova.indexOf(alvoId);
    if (de < 0 || para < 0) return;
    nova.splice(para, 0, nova.splice(de, 1)[0]);
    const ordemArmazenada = Array.isArray(brutas?.ordem) ? brutas.ordem : [];
    aplicar({
      ordem: ordemArmazenada.length > 0
        ? mesclarOrdemBlocos(ordemArmazenada, nova, idsValidos)
        : nova
    });
  };

  const ocultarBloco = (blocoId) => {
    if (porId.get(blocoId)?.removivel === false) return;
    const camada = camadaAtual();
    aplicar({
      removidos: Array.from(new Set([...camada.removidos, blocoId])),
      adicionados: camada.adicionados.filter((id) => id !== blocoId)
    });
  };

  const readicionarBloco = (blocoId) => {
    const camada = camadaAtual();
    aplicar({
      removidos: camada.removidos.filter((id) => id !== blocoId),
      adicionados: Array.from(new Set([...camada.adicionados, blocoId]))
    });
  };

  const alternarRecolhido = (blocoId) => {
    const camada = camadaAtual();
    const conjunto = new Set(camada.recolhidos);
    if (conjunto.has(blocoId)) conjunto.delete(blocoId);
    else conjunto.add(blocoId);
    aplicar({ recolhidos: Array.from(conjunto) });
  };

  const definirLargura = (blocoId, valor) => {
    const camada = camadaAtual();
    const novas = { ...camada.larguras };
    const escolhida = valor === 'total' ? 'total' : 'normal';
    // Desvio, não estado: escolher de volta o padrão do bloco APAGA a
    // entrada, e o bloco volta a seguir o código.
    if (escolhida === larguraPadraoDoBloco(porId.get(blocoId), larguraPadrao)) delete novas[blocoId];
    else novas[blocoId] = escolhida;
    aplicar({ larguras: novas });
  };

  const restaurarPadrao = () => {
    setAdicionarAberto(false);
    if (aoRestaurar) {
      aoRestaurar();
      return;
    }
    if (aoMudarArranjo) {
      aoMudarArranjo(null);
      return;
    }
    gravarPreferencia(null);
  };

  const visiveis = ordem
    .filter((id) => !ocultos.has(id))
    .map((id) => porId.get(id))
    .filter((bloco) => bloco && bloco.conteudo);

  // Catálogo do "Adicionar bloco": só o que está oculto AGORA e tem
  // conteúdo — permissão e tipo continuam decidindo o que pode existir.
  const disponiveis = ordem
    .filter((id) => ocultos.has(id))
    .map((id) => porId.get(id))
    .filter((bloco) => bloco && bloco.conteudo);

  // Segmentos da grade: 'total' quebra a linha e ocupa tudo; os demais
  // fluem em duas colunas dentro do segmento.
  const segmentos = [];
  let corrente = null;
  for (const bloco of visiveis) {
    if (larguras[bloco.id] === 'total') {
      segmentos.push({ tipo: 'total', blocos: [bloco] });
      corrente = null;
    } else {
      if (!corrente) {
        corrente = { tipo: 'colunas', blocos: [] };
        segmentos.push(corrente);
      }
      corrente.blocos.push(bloco);
    }
  }

  /*
    DENTRO DE GRADE: a tela já tem a própria grade (duas ou três colunas
    escritas por ela) e os blocos são filhos dela. Se os invólucros do
    componente entrassem no meio, a grade passaria a ter UM filho e as
    colunas sumiriam. Com `display: contents` eles saem do caminho: quem
    posiciona continua sendo a grade da tela, e o componente decide só a
    ORDEM e a presença — o desenho de hoje fica byte a byte o mesmo
    enquanto ninguém personalizar nada.
  */
  const classeArranjo = classes.arranjo
    || (dentroDeGrade ? 'app-blocos-transparente' : 'app-blocos-arranjo');
  const classeColunas = classes.colunas
    || (dentroDeGrade ? 'app-blocos-transparente' : 'app-blocos-colunas');
  const classeTotal = classes.segmentoTotal
    || (dentroDeGrade ? 'app-blocos-transparente app-blocos-total' : 'app-blocos-segmento-total');
  const classeBloco = classes.bloco || 'app-blocos-item';
  // A faixa de personalização atravessa a grade inteira: meia coluna de
  // barra de ferramentas seria uma linha de botões espremida.
  const classeFaixa = dentroDeGrade ? 'app-blocos-faixa-grade' : '';

  const renderizarBloco = (bloco) => {
    const recolhido = recolhidos.has(bloco.id);
    return (
      <section
        key={bloco.id}
        className={classeBloco}
        draggable={personalizando}
        onDragStart={() => { arrastadoRef.current = bloco.id; }}
        onDragOver={(evento) => { if (personalizando) evento.preventDefault(); }}
        onDrop={(evento) => {
          if (!personalizando) return;
          evento.stopPropagation();
          moverBloco(arrastadoRef.current, bloco.id);
          arrastadoRef.current = null;
        }}
      >
        {personalizando && (
          <div className="app-blocos-barra">
            <span className="app-blocos-arrastar" aria-hidden="true">⋮⋮</span>
            <span className="app-blocos-nome">{bloco.rotulo}</span>
            {permiteLargura && (
              <label className="app-blocos-largura">
                {/* Seletor de CONTEXTO do arranjo (não é filtro de lista) — R12. */}
                <select
                  value={larguras[bloco.id] === 'total' ? 'total' : 'normal'}
                  onChange={(evento) => definirLargura(bloco.id, evento.target.value)}
                  aria-label={`Largura do bloco ${bloco.rotulo}`}
                >
                  <option value="normal">Normal</option>
                  <option value="total">Largura total</option>
                </select>
              </label>
            )}
            {permiteRecolher && (
              <button
                type="button"
                className="app-blocos-acao"
                onClick={() => alternarRecolhido(bloco.id)}
              >
                {recolhido ? 'Mostrar' : 'Recolher'}
              </button>
            )}
            {bloco.removivel !== false && (
              <button
                type="button"
                className="app-blocos-remover"
                onClick={() => ocultarBloco(bloco.id)}
                title={`Remover ${bloco.rotulo} desta tela`}
                aria-label={`Remover ${bloco.rotulo} desta tela`}
              >
                ×
              </button>
            )}
          </div>
        )}
        {recolhido ? (
          !personalizando && (
            <button
              type="button"
              className="app-blocos-recolhido"
              onClick={() => alternarRecolhido(bloco.id)}
            >
              {bloco.rotulo} — mostrar
            </button>
          )
        ) : bloco.conteudo}
      </section>
    );
  };

  const grupos = useMemo(() => {
    if (!agruparPor) return null;
    const mapa = new Map();
    for (const bloco of disponiveis) {
      const grupo = agruparPor(bloco.id) || '';
      if (!mapa.has(grupo)) mapa.set(grupo, []);
      mapa.get(grupo).push(bloco);
    }
    const ordenados = Array.isArray(gruposOrdem) && gruposOrdem.length > 0
      ? gruposOrdem.filter((grupo) => mapa.has(grupo))
      : Array.from(mapa.keys());
    return ordenados.map((grupo) => ({ grupo, blocos: mapa.get(grupo) }));
    // `disponiveis` é recalculado a cada render (é derivado), então a
    // dependência é o que o gera.
  }, [agruparPor, gruposOrdem, ordem, ocultos, porId]); // eslint-disable-line react-hooks/exhaustive-deps

  const painelAdicionar = (
    <div className="app-blocos-adicionar" ref={adicionarRef}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        ref={botaoAdicionarRef}
        onClick={() => setAdicionarAberto((aberto) => !aberto)}
        aria-expanded={adicionarAberto}
        disabled={disponiveis.length === 0}
      >
        Adicionar bloco{disponiveis.length > 0 ? ` (${disponiveis.length})` : ''}
      </button>
      {adicionarAberto && disponiveis.length > 0 && posicaoAdicionar && (
        <div
          className="app-blocos-adicionar-pop"
          role="menu"
          aria-label="Blocos disponíveis"
          ref={menuAdicionarRef}
          style={posicaoAdicionar.estilo}
        >
          {grupos
            ? grupos.map(({ grupo, blocos: doGrupo }) => (
              <div key={grupo || 'sem-grupo'} className="app-blocos-adicionar-grupo">
                {grupo ? <span className="app-blocos-adicionar-grupo-titulo">{grupo}</span> : null}
                {doGrupo.map((bloco) => (
                  <button
                    key={bloco.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { readicionarBloco(bloco.id); setAdicionarAberto(false); }}
                  >
                    {bloco.rotulo}
                  </button>
                ))}
              </div>
            ))
            : disponiveis.map((bloco) => (
              <button
                key={bloco.id}
                type="button"
                role="menuitem"
                onClick={() => { readicionarBloco(bloco.id); setAdicionarAberto(false); }}
              >
                {bloco.rotulo}
              </button>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* A entrada do modo. Telas que já têm o botão na faixa de ações
          (Home e detalhe) controlam o modo de fora e desligam esta
          entrada — dois botões para a mesma coisa seriam dois donos. */}
      {podePersonalizar && mostrarEntrada && !modoControlado && !personalizando && (
        <div className={`app-blocos-entrada ${classeFaixa}`.trim()}>
          <button type="button" className="btn btn-outline btn-sm" onClick={alternarModo}>
            Personalizar blocos
          </button>
        </div>
      )}

      {personalizando && (
        <BlocoConteudo
          className={classeFaixa}
          titulo="Personalizar blocos"
          variante="secundario"
          descricao={'Arraste para reordenar; largura, recolher e "×" em cada bloco. '
            + 'Salvo automaticamente. No celular valem a ordem e os blocos mantidos — '
            + 'largura e arrasto são do desktop.'}
        >
          <div className="app-blocos-toolbar">
            {painelAdicionar}
            {toolbarExtra}
            <button type="button" className="btn btn-outline btn-sm" onClick={restaurarPadrao}>
              {rotuloRestaurar}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm app-blocos-ligado"
              onClick={alternarModo}
              aria-pressed
            >
              Concluir personalização
            </button>
          </div>
        </BlocoConteudo>
      )}

      <div className={classeArranjo}>
        {segmentos.map((segmento, indice) => (
          segmento.tipo === 'total' ? (
            <div key={`seg-${indice}`} className={classeTotal}>
              {segmento.blocos.map(renderizarBloco)}
            </div>
          ) : (
            <div key={`seg-${indice}`} className={classeColunas}>
              {segmento.blocos.map(renderizarBloco)}
            </div>
          )
        ))}
      </div>
    </>
  );
}
