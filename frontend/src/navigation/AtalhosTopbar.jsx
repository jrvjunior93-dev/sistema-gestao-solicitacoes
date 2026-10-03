import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HiOutlineStar,
  HiStar,
  HiOutlineHome,
  HiHome,
  HiOutlineLockClosed,
  HiOutlineChevronDoubleRight
} from 'react-icons/hi2';
import { AuthContext } from '../contexts/AuthContext';
import { findFixableByPath, resolveLabel } from './navigationConfig';
import { useAtalhos } from './AtalhosContext';
import { definirTelaInicial, limparTelaInicial } from '../services/telaInicial';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../hooks/usePosicaoFlutuante';

// =====================================================================
// BARRA DO TOPO — estrela de fixar a tela atual + botão de tela
// inicial + fileira de atalhos.
// ---------------------------------------------------------------------
// - Estrela: aparece em toda tela fixável (correspondência exata na
//   fonte única). Clicou, fixou; clicou de novo, saiu.
// - Casinha: define ESTA tela como a tela inicial do usuário (onde o
//   login entra). Mesma lógica e mesmo lugar da estrela, mas sem
//   competir com ela: contorno cinza apagado quando inativa, casa
//   preenchida na cor primária quando esta tela já é a inicial
//   (a estrela ativa é âmbar). Desmarcar volta para a Home.
// - Fileira: só o ÍCONE, na cor de identidade do módulo, nome em
//   tooltip; separada da navegação por um divisor vertical. Quantos
//   cabem é calculado pela largura disponível (ResizeObserver) — o
//   excedente abre no painel do botão "»", que só existe quando há
//   excedente. No mobile a fileira some e fica só o "»".
// =====================================================================

const LARGURA_ICONE = 36; // px por atalho na fileira
// Ligado com o pacote B5 (rotas /me/tela-inicial no backend).
const TELA_INICIAL_DISPONIVEL = true;

export default function AtalhosTopbar() {
  const { user, updateUser } = useContext(AuthContext);
  const { atalhos, fixados, alternar, carregando } = useAtalhos();
  const location = useLocation();
  const [salvandoInicial, setSalvandoInicial] = useState(false);
  const [larguraFileira, setLarguraFileira] = useState(0);
  const [painelAberto, setPainelAberto] = useState(false);
  const [mobile, setMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  const painelRef = useRef(null);

  const telaAtual = useMemo(
    () => findFixableByPath(user, location.pathname, location.search),
    [user, location.pathname]
  );
  const telaFixada = telaAtual ? fixados.has(telaAtual.id) : false;
  const ehTelaInicial = Boolean(telaAtual && user?.tela_inicial?.id === telaAtual.id);

  async function alternarTelaInicial() {
    if (!telaAtual || salvandoInicial) return;
    try {
      setSalvandoInicial(true);
      if (ehTelaInicial) {
        await limparTelaInicial();
        updateUser({ tela_inicial: null });
      } else {
        const data = await definirTelaInicial(telaAtual.id);
        updateUser({ tela_inicial: data?.tela_inicial || null });
      }
    } catch (error) {
      alert(error?.message || 'Erro ao salvar tela inicial');
    } finally {
      setSalvandoInicial(false);
    }
  }

  /*
    QUANTOS ÍCONES CABEM — quem é medido é a FILEIRA, não a área inteira.

    Era a área (`.fx-atalhos-area`), e ela contém, além da fileira, a
    estrela, a casinha e o botão "»": ~105px que NÃO estão disponíveis para
    ícone nenhum. A conta descontava um ícone (o do "»") e ignorava os
    outros dois, então sobravam dois ícones a mais do que cabia — e como a
    fileira é `overflow: clip`, eles não empurravam nada: ficavam CORTADOS.
    Medido a 1366px antes da correção, em 6 telas: "Cotações" sobrando
    0×32px de 32×32, "Pedidos de Compra" idem. Ícone que não se vê é atalho
    que não existe.

    A fileira é renderizada SEMPRE (mesmo vazia) porque ela é o
    instrumento: um elemento que só nasce quando já há ícones não tem como
    dizer quantos cabem. Ela é o item flexível da área (`flex: 1 1 0`), o
    que sobra na área é o que ela mede, e a conta vira uma divisão simples.
  */
  /*
    O OBSERVADOR ANDA COM O NÓ — `ref` de função, não `useEffect` de
    montagem.

    A barra passa por `carregando` em TODA navegação, e o `carregando`
    devolve outra árvore: o nó que o `useEffect` de montagem observou é
    descartado assim que os atalhos chegam, e o observador fica preso a um
    nó fora do documento — que nunca mais muda de tamanho, então nunca
    mais dispara. Medido: a fileira tinha 529px de espaço a 1920px e
    mostrava ZERO ícone, com os três atalhos todos empurrados para o
    painel "»". O `ref` de função é chamado de novo a cada troca de nó, e
    é a única forma de o observador acompanhar.
  */
  const observadorRef = useRef(null);
  const fileiraRef = useCallback((el) => {
    if (observadorRef.current) {
      observadorRef.current.disconnect();
      observadorRef.current = null;
    }
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver((entradas) => {
      setLarguraFileira(entradas[0]?.contentRect?.width || 0);
    });
    observador.observe(el);
    observadorRef.current = observador;
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const listener = (event) => setMobile(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // Painel fecha com clique fora e Esc — hook compartilhado.
  useFecharAoSair(painelRef, painelAberto, () => setPainelAberto(false));

  /*
    O painel "mais atalhos" é `absolute; left: 0` com 240px de largura
    mínima, e o botão dele vive ENCOSTADO NA DIREITA da barra do topo: a
    borda direita do painel caía fora da janela em toda largura, e a 390px
    ele saía inteiro. Mesma família do "Filtros visíveis", espelhada.
    Alinhar pela esquerda do botão segue sendo a preferência — o hook só
    troca de lado quando esse lado não cabe.

    R29 — este hook fica ACIMA do `if (carregando) return` de baixo. Ele e o
    `useFecharAoSair` são os dois hooks que a barra do topo chama depois do
    carregamento, e a barra passa por `carregando` em toda navegação.
  */
  const botaoMaisRef = useRef(null);
  const painelMenuRef = useRef(null);
  const posicaoPainel = usePosicaoFlutuante(botaoMaisRef, painelMenuRef, painelAberto);

  useEffect(() => {
    setPainelAberto(false);
  }, [location.pathname]);

  if (carregando) {
    return (
      <div className="fx-atalhos-area">
        <nav ref={fileiraRef} className="fx-atalhos-fileira" aria-hidden="true" />
      </div>
    );
  }

  const capacidade = Math.max(0, Math.floor(larguraFileira / LARGURA_ICONE));
  const visiveis = mobile ? [] : atalhos.slice(0, capacidade);
  const excedentes = atalhos.slice(visiveis.length);

  return (
    <div className="fx-atalhos-area">
      {telaAtual && (
        <button
          type="button"
          className={`fx-fixar-btn ${telaFixada ? 'fx-fixar-btn--ativo' : ''}`}
          onClick={() => alternar(telaAtual.id)}
          title={telaFixada ? 'Remover dos seus atalhos' : 'Fixar como atalho'}
          aria-label={telaFixada
            ? `Remover ${resolveLabel(telaAtual, user)} dos seus atalhos`
            : `Fixar ${resolveLabel(telaAtual, user)} como atalho`}
          aria-pressed={telaFixada}
        >
          {telaFixada ? <HiStar size={17} aria-hidden="true" /> : <HiOutlineStar size={17} aria-hidden="true" />}
        </button>
      )}

      {/* DEGRADAÇÃO (onda 2 do porte): as rotas /me/tela-inicial ainda não
          existem neste backend (pacote B5 da proposta). A casinha fica
          oculta até lá — religar trocando a constante. */}
      {TELA_INICIAL_DISPONIVEL && telaAtual && (
        <button
          type="button"
          className={`fx-fixar-btn fx-inicial-btn ${ehTelaInicial ? 'fx-inicial-btn--ativo' : ''}`}
          onClick={alternarTelaInicial}
          disabled={salvandoInicial}
          title={ehTelaInicial
            ? 'Esta é sua tela inicial — clique para voltar à Home'
            : 'Definir como minha tela inicial'}
          aria-label={ehTelaInicial
            ? `Deixar de entrar em ${resolveLabel(telaAtual, user)} ao abrir o sistema`
            : `Entrar em ${resolveLabel(telaAtual, user)} ao abrir o sistema`}
          aria-pressed={ehTelaInicial}
        >
          {ehTelaInicial ? <HiHome size={16} aria-hidden="true" /> : <HiOutlineHome size={16} aria-hidden="true" />}
        </button>
      )}

      {atalhos.length > 0 && <span className="fx-atalhos-divisor" aria-hidden="true" />}

      <nav
        ref={fileiraRef}
        className="fx-atalhos-fileira"
        aria-label={visiveis.length > 0 ? 'Seus atalhos' : undefined}
        aria-hidden={visiveis.length > 0 ? undefined : 'true'}
      >
        {visiveis.map((item) => {
            const Icone = item.icon;
            const rotulo = resolveLabel(item, user);
            return (
              <Link
                key={item.id}
                to={item.to}
                className="fx-atalho-icone"
                style={{ '--atalho-cor': `var(--module-${item.moduleId}, var(--c-muted))` }}
                title={item.obrigatorio ? `${rotulo} (fixado pelo setor)` : rotulo}
                aria-label={rotulo}
              >
                {Icone && <Icone aria-hidden="true" />}
                {item.obrigatorio && (
                  <HiOutlineLockClosed className="fx-atalho-cadeado" aria-hidden="true" />
                )}
              </Link>
          );
        })}
      </nav>

      {excedentes.length > 0 && (
        <div className="fx-atalhos-mais-wrap" ref={painelRef}>
          <button
            type="button"
            className="fx-atalhos-mais"
            ref={botaoMaisRef}
            onClick={() => setPainelAberto((aberto) => !aberto)}
            aria-expanded={painelAberto}
            aria-haspopup="menu"
            title={`Mais ${excedentes.length} atalho(s)`}
            aria-label={`Mais ${excedentes.length} atalhos`}
          >
            <HiOutlineChevronDoubleRight size={15} aria-hidden="true" />
          </button>
          {painelAberto && posicaoPainel && (
            <div
              className="fx-atalhos-painel"
              role="menu"
              aria-label="Todos os seus atalhos"
              ref={painelMenuRef}
              style={posicaoPainel.estilo}
            >
              <ul>
                {excedentes.map((item) => {
                  const Icone = item.icon;
                  const rotulo = resolveLabel(item, user);
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.to}
                        role="menuitem"
                        className="fx-atalhos-painel-item"
                        style={{ '--atalho-cor': `var(--module-${item.moduleId}, var(--c-muted))` }}
                        onClick={() => setPainelAberto(false)}
                      >
                        {Icone && <Icone aria-hidden="true" />}
                        <span>{rotulo}</span>
                        {item.obrigatorio && (
                          <HiOutlineLockClosed className="fx-atalho-cadeado-lista" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                to="/"
                className="fx-atalhos-painel-gerenciar"
                onClick={() => setPainelAberto(false)}
              >
                Gerenciar atalhos
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
