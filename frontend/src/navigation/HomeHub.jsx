import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { getVisibleModules, resolveLabel } from './navigationConfig';
import { getPendenciasUsuario } from '../services/pendencias';
import { getDetalheLayouts } from '../services/detalheLayout';
import { getListaPreferencias, salvarListaPreferencias } from '../services/listasPreferencias';
import { blocosPermitidos, resolverLayoutHome } from './blocosHome';
import { COMPONENTE_BLOCO_EXTRA } from './BlocosHomeExtras';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../hooks/usePosicaoFlutuante';
import { Pagina, PageHeader, BlocoConteudo, BlocosPersonalizaveis } from '../components/padrao';
import NavCard from './NavCard';
import SeusAtalhos from './SeusAtalhos';
import { vencimentoHumano } from '../utils/formatarTexto';
import { nomeProprio } from '../utils/texto';
import {
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineInboxStack,
  HiOutlineBolt
} from 'react-icons/hi2';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  if (Number.isNaN(numero)) return null;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TONE_ICON = {
  danger: HiOutlineExclamationTriangle,
  warning: HiOutlineClock
};

// NÍVEL 1 — Hub Principal em BLOCOS personalizáveis com o MESMO motor
// do detalhe da solicitação (utils/layoutBlocos.js): admin define o
// padrão por setor (tela='home'), o usuário arrasta/oculta por cima,
// tudo salvo no banco. Ocultou = some POR COMPLETO; volta só pelo
// "Adicionar bloco" do modo Personalizar. Os blocos opcionais carregam
// dados sob demanda (BlocosHomeExtras) — desligado não consulta nada.
//
// MIGRADA PARA O PADRÃO DA CASA EM 05/09 — e a lição é a de sempre neste
// projeto: esta é a PRIMEIRA tela que todo mundo vê (rota `/`) e foi a
// última a entrar no padrão, porque nunca esteve no manifesto de QA.
// Duzentas telas foram medidas por cima dela. O que mudou aqui é só ONDE
// cada coisa mora — nenhum bloco, atalho, contador ou ação saiu:
//   * a casca virou `Pagina` (ritmo vertical do componente, R10) e o
//     cabeçalho próprio virou `PageHeader` (faixa fixa presa à topbar:
//     C1/C2/X2);
//   * cada bloco passou a ser um `BlocoConteudo` — a superfície branca
//     sobre o canvas que a B1 procura pelo nome `.app-bloco`. As seções
//     internas (`.hub-pendencias`, `.hub-atalhos`, `.hub-resolver`,
//     `.hub-obras-resumo`, `.hub-extra`) já desenhavam um cartão à mão:
//     elas perderam a casca no CSS para não virar cartão dentro de cartão.
export default function HomeHub() {
  const { user } = useContext(AuthContext);
  const [pendencias, setPendencias] = useState([]);
  const [paraResolver, setParaResolver] = useState([]);
  const [resumoObras, setResumoObras] = useState([]);
  // Camadas do layout (usuário → setor → padrão) + modo personalização.
  const [layoutSetor, setLayoutSetor] = useState(null);
  const [prefsLayoutUsuario, setPrefsLayoutUsuario] = useState(null);
  const [personalizando, setPersonalizando] = useState(false);
  const [adicionarModuloAberto, setAdicionarModuloAberto] = useState(false);
  const [toast, setToast] = useState('');
  const dragModuloRef = useRef(null);
  const toastTimerRef = useRef(null);
  // Painéis suspensos fecham ao clicar fora e com Esc — mesmo hook do
  // menu "Colunas" do ListaAvancada (useFecharAoSair).
  const adicionarModuloRef = useRef(null);
  const [isMobileHome, setIsMobileHome] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  /*
    A faixa gerencial "A pagar no mês, por obra" é contexto opcional de
    tela larga, e essa regra vivia SÓ no CSS (`display: none` abaixo de
    1280px). Com cada bloco da Home dentro de um `BlocoConteudo`, esconder
    apenas o conteúdo deixaria o CARTÃO VAZIO na tela — casca com padding
    e sombra em volta de nada. Quem decide passa a ser a tela: sem
    largura, o bloco não é montado (05/09).
  */
  const [temLarguraGerencial, setTemLarguraGerencial] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  ));

  useFecharAoSair(adicionarModuloRef, adicionarModuloAberto, () => setAdicionarModuloAberto(false));
  /* Mesma classe `.app-blocos-adicionar-pop` e mesmo risco do painel de
     blocos: `left: 0` com 230px de largura mínima, num botão que vive à
     direita da barra de personalização. R29: hook no topo. */
  const botaoAdicionarModuloRef = useRef(null);
  const menuAdicionarModuloRef = useRef(null);
  const posicaoAdicionarModulo = usePosicaoFlutuante(
    botaoAdicionarModuloRef, menuAdicionarModuloRef, adicionarModuloAberto
  );

  const modules = useMemo(() => getVisibleModules(user), [user]);
  const catalogoPermitido = useMemo(() => blocosPermitidos(user), [user]);
  const idsPermitidos = useMemo(
    () => new Set(catalogoPermitido.map((bloco) => bloco.id)),
    [catalogoPermitido]
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const listener = (event) => setIsMobileHome(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const listener = (event) => setTemLarguraGerencial(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    let ativo = true;
    getPendenciasUsuario()
      .then((data) => {
        if (!ativo) return;
        setPendencias(Array.isArray(data?.itens) ? data.itens : []);
        setParaResolver(Array.isArray(data?.para_resolver) ? data.para_resolver : []);
        setResumoObras(Array.isArray(data?.resumo_obras) ? data.resumo_obras : []);
      })
      .catch(() => {
        // pendências são um extra do hub: falha não bloqueia a navegação
        if (ativo) setPendencias([]);
      });
    return () => {
      ativo = false;
    };
  }, [user?.id]);

  // Camadas do layout: padrão do setor (admin) + arranjo do usuário.
  const setorUsuario = user?.setor?.codigo || user?.area || '';
  useEffect(() => {
    let ativo = true;
    if (setorUsuario) {
      getDetalheLayouts(String(setorUsuario).toUpperCase(), 'home')
        .then((linhas) => {
          if (ativo) setLayoutSetor(linhas[0]?.config || null);
        })
        .catch(() => {});
    }
    getListaPreferencias('home')
      .then((prefs) => {
        const temAlgo = prefs && (
          Array.isArray(prefs.ordem) || Array.isArray(prefs.removidos)
          || Array.isArray(prefs.adicionados) || prefs.larguras || prefs.modulos
        );
        if (ativo && temAlgo) setPrefsLayoutUsuario(prefs);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [setorUsuario]);

  const {
    ordem: ordemBlocos,
    ocultos: blocosOcultos,
    larguras: largurasBlocos,
    adicionados: blocosAdicionados,
    /* RECOLHER CHEGA À HOME (05/09). O motor já resolvia `recolhidos` —
       era o detalhe da solicitação que usava e a Home que ignorava, e a
       extração do componente é o que torna a diferença gratuita: somar as
       capacidades das duas telas custou ler mais um campo que já vinha
       resolvido. */
    recolhidos: blocosRecolhidos
  } = resolverLayoutHome({ configSetor: layoutSetor, prefsUsuario: prefsLayoutUsuario });

  // ----- Personalização dos MÓDULOS (cards dentro do bloco Módulos) ---
  const modulosPrefs = prefsLayoutUsuario?.modulos || {};
  const modulosRemovidos = useMemo(() => new Set(
    (Array.isArray(modulosPrefs.removidos) ? modulosPrefs.removidos : [])
  ), [modulosPrefs.removidos]);
  const modulosOrdenados = useMemo(() => {
    const ordemSalva = Array.isArray(modulosPrefs.ordem) ? modulosPrefs.ordem : [];
    const porId = new Map(modules.map((mod) => [mod.id, mod]));
    const primeiro = ordemSalva.map((id) => porId.get(id)).filter(Boolean);
    const listados = new Set(ordemSalva);
    return [...primeiro, ...modules.filter((mod) => !listados.has(mod.id))];
  }, [modules, modulosPrefs.ordem]);
  const modulosVisiveis = modulosOrdenados.filter((mod) => !modulosRemovidos.has(mod.id));
  const modulosOcultaveis = modulosOrdenados.filter((mod) => modulosRemovidos.has(mod.id));

  const temCamadaUsuario = (novo) => Boolean(
    novo && (
      novo.ordem?.length || novo.removidos?.length || novo.adicionados?.length
      || novo.recolhidos?.length
      || Object.keys(novo.larguras || {}).length
      || novo.modulos?.ordem?.length || novo.modulos?.removidos?.length
      || novo.modulos?.aviso_ctrlk_visto
    )
  );
  const persistirLayoutUsuario = (novo) => {
    setPrefsLayoutUsuario(temCamadaUsuario(novo) ? novo : null);
    salvarListaPreferencias('home', novo || {}).catch(() => {});
  };
  /*
    AS SEIS FUNÇÕES DE BLOCO SAÍRAM DAQUI (05/09) — `moverBloco`,
    `removerBloco`, `readicionarBloco`, `definirLarguraBloco`,
    `restaurarPadraoSetor` e a barra/popover que as acompanhava existiam
    palavra por palavra no detalhe da solicitação, e esta tela ainda
    desenhava tudo com as classes `sol-detail-*`, o prefixo da OUTRA tela.
    Agora o mecanismo é um só (`BlocosPersonalizaveis`) e o que sobra aqui
    é o que é DA HOME e não é bloco: a personalização dos MÓDULOS.
  */
  const persistirArranjoBlocos = (camada) => {
    persistirLayoutUsuario(camada ? { ...camada, modulos: camadaAtual().modulos } : null);
  };
  // Sempre grava a camada completa — mudar uma coisa não perde as outras.
  const camadaAtual = () => ({
    ordem: prefsLayoutUsuario?.ordem?.length ? ordemBlocos : [],
    removidos: Array.from(blocosOcultos).filter((id) => !blocosAdicionados.has(id)),
    adicionados: Array.from(blocosAdicionados),
    // Recolher entrou na Home junto com o componente: sem esta linha uma
    // mudança de MÓDULO gravaria a camada sem os blocos recolhidos e
    // desfaria a escolha de quem só recolheu.
    recolhidos: Array.from(blocosRecolhidos),
    larguras: { ...(prefsLayoutUsuario?.larguras || {}) },
    modulos: {
      ordem: Array.isArray(modulosPrefs.ordem) ? modulosPrefs.ordem : [],
      removidos: Array.from(modulosRemovidos),
      aviso_ctrlk_visto: Boolean(modulosPrefs.aviso_ctrlk_visto)
    }
  });
  const restaurarPadraoSetor = () => {
    persistirLayoutUsuario(null);
  };

  // ----- mutações dos módulos ----------------------------------------
  const mostrarToast = (mensagem) => {
    setToast(mensagem);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 6000);
  };
  const ocultarModulo = (moduloId) => {
    const camada = camadaAtual();
    const removidos = new Set(camada.modulos.removidos);
    removidos.add(moduloId);
    const jaAvisado = camada.modulos.aviso_ctrlk_visto;
    persistirLayoutUsuario({
      ...camada,
      modulos: { ...camada.modulos, removidos: Array.from(removidos), aviso_ctrlk_visto: true }
    });
    // Uma única vez: quem oculta um módulo não perdeu o caminho até ele.
    if (!jaAvisado) {
      mostrarToast('Módulo oculto da Home. Ele continua acessível pela busca (Ctrl+K) e pelos atalhos.');
    }
  };
  const readicionarModulo = (moduloId) => {
    const camada = camadaAtual();
    persistirLayoutUsuario({
      ...camada,
      modulos: {
        ...camada.modulos,
        removidos: camada.modulos.removidos.filter((id) => id !== moduloId)
      }
    });
  };
  const moverModulo = (origemId, alvoId) => {
    if (!origemId || !alvoId || origemId === alvoId) return;
    const ordem = modulosOrdenados.map((mod) => mod.id);
    const de = ordem.indexOf(origemId);
    const para = ordem.indexOf(alvoId);
    if (de < 0 || para < 0) return;
    ordem.splice(para, 0, ordem.splice(de, 1)[0]);
    const camada = camadaAtual();
    persistirLayoutUsuario({ ...camada, modulos: { ...camada.modulos, ordem } });
  };

  // Contador dos cards de módulo: soma por módulo; VERMELHO quando o
  // módulo tem algum item 'danger' (atrasado/aguardando aprovação),
  // âmbar (atenção) nos demais.
  const contadoresModulo = useMemo(() => {
    const mapa = {};
    for (const item of pendencias) {
      if (!item?.modulo || !Number(item?.quantidade)) continue;
      const atual = mapa[item.modulo] || { total: 0, tom: 'warning' };
      atual.total += Number(item.quantidade);
      if (item.tom === 'danger') atual.tom = 'danger';
      mapa[item.modulo] = atual;
    }
    return mapa;
  }, [pendencias]);

  const itensVisiveis = pendencias.filter((item) => Number(item?.quantidade) > 0);
  // Apoio da faixa (C2/R5): o número que a pessoa veio ver. Some as
  // MESMAS quantidades dos cartões de pendência — a faixa dá o total, os
  // blocos dão o recorte (é a leitura de C2 × B3 registrada em 05/09).
  const totalPendencias = itensVisiveis.reduce(
    (soma, item) => soma + Number(item.quantidade || 0), 0
  );
  const papel = String(user?.setor?.nome || user?.area || user?.perfil || '').trim();

  // ----- Conteúdo de cada bloco (null = bloco sem nada a mostrar) -----
  const conteudoBlocos = {
    pendencias: itensVisiveis.length > 0 ? (
      <section className="hub-pendencias" aria-label="Suas pendências">
        <h2 className="hub-pendencias-title">
          <HiOutlineInboxStack aria-hidden="true" />
          Suas pendências
        </h2>
        <ul className="hub-pendencias-list hub-pendencias-list--cartoes">
          {itensVisiveis.map((item) => {
            const Icone = TONE_ICON[item.tom] || HiOutlineClock;
            return (
              <li key={item.chave}>
                <Link
                  to={item.link || '/'}
                  className={`hub-pendencia-cartao ${item.tom === 'danger' ? 'hub-pendencia-cartao--danger' : ''}`}
                  aria-label={`${item.quantidade} ${item.rotulo}${item.criterio ? `. Critério: ${item.criterio}` : ''}`}
                  title={item.criterio || undefined}
                >
                  <span className="hub-pendencia-cartao-numero">{item.quantidade}</span>
                  <span className="hub-pendencia-cartao-rotulo">
                    <Icone aria-hidden="true" />
                    {item.rotulo}
                  </span>
                  {item.criterio && (
                    <span className="hub-pendencia-cartao-criterio">{item.criterio}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    ) : null,

    // O trabalho em si, não só o número: os itens mais urgentes que o
    // usuário pode resolver, das MESMAS consultas das pendências.
    // Vazio = a seção não existe (sem estado decorativo).
    resolver: paraResolver.length > 0 ? (
      <section className="hub-resolver" aria-label="Para resolver agora">
        <h2 className="hub-pendencias-title">
          <HiOutlineBolt aria-hidden="true" />
          Para resolver agora
        </h2>
        <ul className="hub-resolver-lista">
          {paraResolver.map((item) => (
            <li key={`${item.tipo}-${item.id}`}>
              <Link
                to={item.link}
                className={`hub-resolver-item hub-resolver-item--${item.tom === 'danger' ? 'danger' : 'warning'}`}
              >
                <span className="hub-resolver-id">
                  <strong>{item.codigo}</strong>
                  {item.contexto && <span className="hub-resolver-contexto">{item.contexto}</span>}
                </span>
                <span className="hub-resolver-oque">
                  {item.o_que_e}
                  {item.descricao ? ` — ${item.descricao}` : ''}
                </span>
                <span className="hub-resolver-fim">
                  {formatarMoeda(item.valor) && (
                    <span className="hub-resolver-valor">{formatarMoeda(item.valor)}</span>
                  )}
                  {item.data_vencimento && (
                    <span className={`hub-resolver-prazo ${item.tom === 'danger' ? 'hub-resolver-prazo--danger' : ''}`}>
                      {vencimentoHumano(item.data_vencimento)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null,

    atalhos: <SeusAtalhos />,

    // Cards de módulo personalizáveis: reordenar arrastando e ocultar
    // um a um no modo Personalizar; catálogo próprio "Adicionar módulo"
    // traz de volta. Permissão continua mandando (getVisibleModules).
    modulos: (
      <nav aria-label="Módulos do sistema">
        {personalizando && (
          <div className="hub-modulos-toolbar">
            <span className="text-sm text-[var(--c-muted)]">
              Arraste os cards para reordenar; "×" oculta um módulo.
            </span>
            <div className="app-blocos-adicionar" ref={adicionarModuloRef}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                ref={botaoAdicionarModuloRef}
                onClick={() => setAdicionarModuloAberto((aberto) => !aberto)}
                aria-expanded={adicionarModuloAberto}
                disabled={modulosOcultaveis.length === 0}
              >
                Adicionar módulo{modulosOcultaveis.length > 0 ? ` (${modulosOcultaveis.length})` : ''}
              </button>
              {adicionarModuloAberto && modulosOcultaveis.length > 0 && posicaoAdicionarModulo && (
                <div
                  className="app-blocos-adicionar-pop"
                  role="menu"
                  aria-label="Módulos ocultos"
                  ref={menuAdicionarModuloRef}
                  style={posicaoAdicionarModulo.estilo}
                >
                  {modulosOcultaveis.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        readicionarModulo(mod.id);
                        setAdicionarModuloAberto(false);
                      }}
                    >
                      {resolveLabel(mod, user)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <ul className="hub-grid">
          {modulosVisiveis.map((mod) => {
            const unicoFilho = mod.children.length === 1 ? mod.children[0] : null;
            const destino = unicoFilho ? unicoFilho.to : `/hub/${mod.id}`;
            const contador = contadoresModulo[mod.id];
            return (
              <li
                key={mod.id}
                className={personalizando ? 'hub-modulo-card-editavel' : undefined}
                draggable={personalizando && !isMobileHome}
                onDragStart={() => { dragModuloRef.current = mod.id; }}
                onDragOver={(event) => { if (personalizando) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!personalizando) return;
                  event.stopPropagation();
                  moverModulo(dragModuloRef.current, mod.id);
                  dragModuloRef.current = null;
                }}
              >
                {personalizando && (
                  <button
                    type="button"
                    className="hub-modulo-remover"
                    onClick={() => ocultarModulo(mod.id)}
                    title={`Ocultar ${resolveLabel(mod, user)} da Home`}
                    aria-label={`Ocultar ${resolveLabel(mod, user)} da Home`}
                  >
                    ×
                  </button>
                )}
                <NavCard
                  to={destino}
                  icon={mod.icon}
                  label={resolveLabel(mod, user)}
                  desc={mod.desc}
                  accentVar={`--module-${mod.id}`}
                  count={contador?.total || 0}
                  countTone={contador?.tom || 'warning'}
                />
              </li>
            );
          })}
        </ul>
      </nav>
    ),

    // Contexto gerencial opcional (telas largas, permissão financeira):
    // as obras com maior saldo a pagar no mês. Não é dashboard.
    obras_resumo: temLarguraGerencial && resumoObras.length > 0 ? (
      <section className="hub-obras-resumo" aria-label="Maiores saldos a pagar no mês por obra">
        <h2 className="hub-pendencias-title">A pagar no mês, por obra</h2>
        <ul className="hub-obras-resumo-lista">
          {resumoObras.map((linha) => (
            <li key={linha.obra_id}>
              <Link to={linha.link} className="hub-obras-resumo-item">
                <span className="hub-obras-resumo-nome">{linha.obra}</span>
                <span className="hub-obras-resumo-total">{formatarMoeda(linha.total)}</span>
                <span className="hub-obras-resumo-qtd">{linha.quantidade} título(s)</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null
  };

  // Blocos opcionais: componente com fetch próprio, montado SÓ quando o
  // bloco está visível — desligado não consulta nada.
  // Ligado com o pacote B6 (endpoint /home/blocos/:bloco no backend);
  // a constante fica como interruptor de emergência.
  const BLOCOS_EXTRAS_DISPONIVEIS = true;
  for (const [blocoId, Componente] of Object.entries(COMPONENTE_BLOCO_EXTRA)) {
    if (!BLOCOS_EXTRAS_DISPONIVEIS) break;
    if (!idsPermitidos.has(blocoId)) continue;
    if (!blocosOcultos.has(blocoId)) {
      conteudoBlocos[blocoId] = <Componente />;
    } else {
      // marcador para o catálogo saber que o bloco existe (sem fetch)
      conteudoBlocos[blocoId] = conteudoBlocos[blocoId] || 'disponivel';
    }
  }

  const blocosVisiveis = ordemBlocos
    .filter((blocoId) => idsPermitidos.has(blocoId) && !blocosOcultos.has(blocoId))
    .map((blocoId) => ({ id: blocoId, conteudo: conteudoBlocos[blocoId] }))
    .filter((bloco) => bloco.conteudo && bloco.conteudo !== 'disponivel');

  /*
    B2 — UM bloco principal por tela, e nesta a pergunta central é "o que
    eu resolvo agora?": a barra de cor fica em "Para resolver agora" e,
    quando ele não tem item, em "Suas pendências". Se nenhum dos dois
    estiver visível (o usuário ocultou, ou o dia está limpo), ela vai para
    o PRIMEIRO bloco da ordem — que é o topo que o próprio usuário montou.
    Assim existe sempre exatamente um, em qualquer arranjo de blocos.

    Sem módulo nenhum liberado, o principal é o aviso que explica isso
    (renderizado fora desta lista), e aqui não há primário.
  */
  const idBlocoPrimario = modules.length === 0
    ? null
    : (['resolver', 'pendencias'].find((id) => blocosVisiveis.some((b) => b.id === id))
      || blocosVisiveis[0]?.id);

  /*
    Cada bloco continua sendo um `BlocoConteudo` desenhado AQUI — é esta
    tela que sabe qual é o primário e de que cor é a barra dele (B2). O
    que o componente recebe é o catálogo: id, rótulo, largura padrão do
    catálogo da Home ('total', com os compactos em 'normal') e o conteúdo
    pronto. O marcador 'disponivel' de um bloco extra DESLIGADO viaja
    inteiro: é ele que mantém o bloco no "Adicionar bloco" sem montar o
    componente que consultaria dados.
  */
  const catalogoBlocos = catalogoPermitido.map((meta) => {
    const conteudo = conteudoBlocos[meta.id];
    const real = conteudo && conteudo !== 'disponivel' ? conteudo : null;
    return {
      id: meta.id,
      rotulo: meta.rotulo,
      grupo: meta.grupo,
      padraoOculto: meta.padraoOculto,
      larguraPadrao: meta.larguraPadrao === 'normal' ? 'normal' : 'total',
      conteudo: real ? (
        <BlocoConteudo
          className="hub-bloco"
          variante={meta.id === idBlocoPrimario ? 'primario' : 'neutro'}
          /* Tom semântico da barra do principal: pendência é "atenção"
             (--sem-warning); em qualquer outro bloco ela é só hierarquia. */
          cor={meta.id !== idBlocoPrimario
            ? undefined
            : (meta.id === 'resolver' || meta.id === 'pendencias'
              ? 'var(--sem-warning)'
              : 'var(--c-primary)')}
        >
          {real}
        </BlocoConteudo>
      ) : conteudo
    };
  });
  const grupoDoBloco = (id) => catalogoPermitido.find((meta) => meta.id === id)?.grupo || 'Home';
  const GRUPOS_HOME = ['Home', 'Trabalho', 'Financeiro', 'Obras e Compras', 'Institucional'];

  return (
    <Pagina className="hub-home-page">
      {/*
        FAIXA FIXA DO PADRÃO (C1/C2/X2) no lugar do cabeçalho próprio da
        Home: título (quem é o usuário), apoio em UMA linha na própria
        faixa (total de pendências + papel) e a personalização na barra de
        ações — personalizar é AÇÃO SOBRE ESTA TELA, não caminho para
        outra (R11/C6), então é ali que ela mora.

        A entrada continua escondida no celular, como era: arrastar bloco
        e escolher largura são gestos de desktop, e a decisão está no
        comentário do `isMobileHome`.
      */}
      <PageHeader
        titulo={user?.nome ? nomeProprio(user.nome) : 'Início'}
        contagem={`${totalPendencias} pendência(s)`}
        descricao={papel || 'Início do sistema'}
        secundarias={isMobileHome ? [] : [{
          rotulo: personalizando ? 'Concluir personalização' : 'Personalizar',
          // Botão de LIGA/DESLIGA: o estado tem de chegar ao leitor de tela,
          // e não só ao rótulo. O `aria-pressed` existia no arranjo anterior
          // e voltou pelo `pressionada` da ação (PageHeader, 05/09).
          pressionada: personalizando,
          classe: personalizando ? 'app-blocos-ligado' : undefined,
          title: personalizando
            ? 'Sair do modo de personalização da Home'
            : 'Reordenar, ocultar e redimensionar os blocos da sua Home',
          onClick: () => {
            setPersonalizando((atual) => !atual);
            setAdicionarModuloAberto(false);
          }
        }]}
      />

      {/* Sem módulo liberado, ESTE é o bloco principal da tela (B2): é ele
          que responde a única pergunta que sobra — "e agora?". */}
      {modules.length === 0 && (
        <BlocoConteudo
          className="hub-bloco"
          variante="primario"
          cor="var(--sem-warning)"
          role="status"
          aria-label="Nenhum módulo disponível"
        >
          <h2 className="hub-pendencias-title">Nenhum módulo disponível para o seu acesso</h2>
          <p className="hub-subtitle">
            Seu usuário ainda não tem permissão em nenhum módulo do sistema. Fale com o
            administrador para liberar os acessos do seu setor. Enquanto isso, você pode
            revisar seus dados em <Link to="/perfil">Meu Perfil</Link> ou sair e entrar com
            outro usuário.
          </p>
        </BlocoConteudo>
      )}

      <BlocosPersonalizaveis
        blocos={catalogoBlocos}
        arranjo={{
          ordem: ordemBlocos,
          ocultos: blocosOcultos,
          recolhidos: blocosRecolhidos,
          larguras: largurasBlocos,
          adicionados: blocosAdicionados
        }}
        preferenciasBrutas={prefsLayoutUsuario}
        aoMudarArranjo={persistirArranjoBlocos}
        aoRestaurar={restaurarPadraoSetor}
        larguraPadrao="total"
        /* O modo é ligado na barra de ações da faixa (personalizar é ação
           SOBRE ESTA TELA — R11/C6), então ele vem controlado daqui e a
           entrada própria do componente não aparece. */
        personalizando={personalizando}
        aoAlternarPersonalizando={(ligado) => {
          setPersonalizando(ligado);
          if (!ligado) setAdicionarModuloAberto(false);
        }}
        /* O catálogo da Home é grande (17 blocos em cinco grupos): o
           popover agrupa, como já agrupava. */
        agruparPor={grupoDoBloco}
        gruposOrdem={GRUPOS_HOME}
        classes={{ colunas: 'hub-blocos-colunas' }}
      />

      {toast && (
        <div className="hub-toast" role="status">
          {toast}
          <button type="button" onClick={() => setToast('')} aria-label="Fechar aviso">×</button>
        </div>
      )}
    </Pagina>
  );
}
