import { Children, isValidElement, useEffect, useState } from 'react';
import ModalPortal from './ModalPortal';

/**
 * Casca de modal do sistema: centraliza sobre a AREA DE CONTEUDO e resolve o empilhamento.
 *
 * Nasceu depois de o mesmo defeito aparecer em dois modais (termo aditivo e Gerar conta), por duas
 * causas que `z-index` nao resolve:
 *
 *   1) `main.layout-main` tem `position: relative; z-index: 1`, o que CRIA UM CONTEXTO DE
 *      EMPILHAMENTO. Dentro dele o modal so disputa entre irmaos do main — e o main inteiro vale 1
 *      contra a sidebar, que vale 40. Nenhum valor resolveria: o teto e o do ancestral.
 *   2) `responsive-system.css` tem `.layout-main :where(..., .card, ...) { max-width: 100% }`.
 *      O `:where()` zera a propria especificidade, mas o `.layout-main` nao: a regra EMPATA com o
 *      utilitario de largura e vence pela ordem de importacao, esticando o painel.
 *
 * As duas somem quando o modal sai do `.layout-main` — e e o `ModalPortal` que faz isso.
 *
 * E centraliza sobre o CONTEUDO, nao sobre a viewport: o menu ocupa ~286px que nao sao area util, e
 * centralizar na viewport inteira deixa o painel visivelmente deslocado para a esquerda. O recuo e
 * MEDIDO do `.layout-main` — o menu recolhe, e no celular vira gaveta comecando em zero.
 *
 * ---
 *
 * ## Por que compoe o `ModalPortal` em vez de repetir o que ele faz
 *
 * Na consolidacao com a `dev-v2` (20/08) apareceram duas solucoes para o mesmo problema: este
 * componente e o `ModalPortal` de la, que trava a rolagem do documento, trata `Escape` e devolve o
 * foco — mas nao lida com empilhamento nem com a centralizacao.
 *
 * A primeira tentativa foi COPIAR a trava de rolagem para ca. Errado: a trava conta modais abertos
 * numa variavel de modulo, e duas copias sao **dois contadores**. Com um modal de cada familia
 * aberto ao mesmo tempo — a tela de Compras usa `ModalPortal` direto —, cada um se acharia dono do
 * `body.style` e o primeiro a fechar destravaria a rolagem com o outro ainda aberto. E exatamente o
 * caso que o contador existe para evitar.
 *
 * Entao: uma implementacao so. `ModalPortal` e a base (portal, rolagem, Escape, foco);
 * `OverlayModal` e a casca por cima dela (fundo, centralizacao sobre o conteudo, largura, painel).
 */
export default function OverlayModal({
  aberto = true,
  largura = 'var(--modal-max-w-lg, 860px)',
  rotulo,
  onFechar,
  fecharComEscape = true,
  children
}) {
  const [recuoConteudo, setRecuoConteudo] = useState(0);

  useEffect(() => {
    if (!aberto || typeof document === 'undefined') return undefined;
    const medir = () => {
      const principal = document.querySelector('.layout-main');
      setRecuoConteudo(principal ? Math.max(0, Math.round(principal.getBoundingClientRect().left)) : 0);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [aberto]);

  if (!aberto || typeof document === 'undefined') return null;

  return (
    <ModalPortal onClose={onFechar} closeOnEscape={fecharComEscape && Boolean(onFechar)}>
      <div
        className="fixed inset-0 flex items-center justify-center py-6"
        style={{
          zIndex: 'var(--z-modal)',
          background: 'var(--modal-overlay, rgba(15, 23, 42, 0.48))',
          alignItems: 'safe center',
          justifyContent: 'safe center',
          overflow: 'auto',
          overscrollBehavior: 'contain',
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          paddingLeft: `calc(${recuoConteudo}px + 1rem)`,
          paddingRight: '1rem'
        }}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
      >
        {/*
          R18 (02/09): `overflow: clip`, NUNCA `hidden`. O painel precisa
          recortar o conteúdo nos cantos arredondados, mas `hidden` cria um
          contexto de rolagem e mata em silêncio qualquer `position: sticky`
          lá dentro — cabeçalho grudado ou coluna fixa de tabela dentro de
          modal simplesmente pararia de funcionar, sem erro nenhum. `clip`
          recorta igual e não cria scrollport.
        */}
        <div
          className="card"
          style={{
            overflow: 'clip',
            width: `min(100%, ${largura})`,
            maxWidth: '100%',
            maxHeight: 'min(calc(100dvh - 1.5rem), 920px)',
            display: 'flex',
            flexDirection: 'column',
            padding: 0
          }}
        >
          {/*
            CORPO QUE ROLA, CABEÇALHO E RODAPÉ FIXOS (04/09).

            O painel tem teto de altura e `overflow: clip`, e NÃO dava
            rolagem própria: conteúdo mais alto que o teto era **cortado em
            silêncio** — e o que fica de fora é o rodapé, ou seja, o botão
            que executa a ação. Modal que esconde o botão de confirmar é
            pior que modal que não abre: parece funcional.

            A responsabilidade era de cada chamador lembrar de pôr
            `overflow-y: auto` no lugar certo, e nada verificava. São 22
            telas usando este componente; basta uma esquecer.

            Agora a estrutura é do componente: quem marcar um filho com
            `data-modal="cabecalho"` ou `data-modal="rodape"` fica FIXO, e
            todo o resto rola entre os dois. Sem marcação, o conteúdo
            inteiro vira corpo rolante — que é o comportamento seguro e
            resolve as 22 telas sem nenhuma delas mudar.
          */}
          <ModalCorpo>{children}</ModalCorpo>
        </div>
      </div>
    </ModalPortal>
  );
}

/*
  Separa os filhos marcados como cabeçalho/rodapé (que ficam fixos) do
  resto (que rola). A marcação é `data-modal="cabecalho"` / `"rodape"` no
  elemento — atributo, não prop, para não mudar o contrato de ninguém: quem
  não marcar nada continua funcionando, com tudo rolando.
*/
function ModalCorpo({ children }) {
  const filhos = Children.toArray(children);
  const marca = (filho, valor) => isValidElement(filho)
    && filho.props?.['data-modal'] === valor;

  const cabecalho = filhos.filter((f) => marca(f, 'cabecalho'));
  const rodape = filhos.filter((f) => marca(f, 'rodape'));
  const corpo = filhos.filter((f) => !marca(f, 'cabecalho') && !marca(f, 'rodape'));

  return (
    <>
      {cabecalho.length ? <div style={{ flex: '0 0 auto' }}>{cabecalho}</div> : null}
      {/*
        `minHeight: 0` é o que faz o filho de um flex column PODER encolher
        abaixo do próprio conteúdo — sem ele o corpo empurra o rodapé para
        fora do painel e a rolagem nunca acontece. É o mesmo motivo das
        trilhas `minmax(0, 1fr)` que a ComunicacaoInterna precisou.
      */}
      <div
        className="min-w-0"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain'
        }}
      >
        {corpo}
      </div>
      {rodape.length ? <div style={{ flex: '0 0 auto' }}>{rodape}</div> : null}
    </>
  );
}
