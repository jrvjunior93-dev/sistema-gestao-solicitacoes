import { useRef, useState } from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';

/**
 * MENU "⋯" — o destino das ações raras. A regra do padrão: todo botão é
 * visível, mas ação avançada/eventual não disputa a barra com a ação do
 * dia a dia; ela mora aqui, sempre no mesmo lugar em toda tela.
 * Item perigoso fica apartado no fim, com separador (nunca colado no resto).
 */
export default function MenuMais({ itens = [], rotulo = 'Mais ações' }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  useFecharAoSair(ref, aberto, () => setAberto(false));
  /*
    R29 — hook ANTES do `return null` de baixo (menu sem item nenhum não
    desenha). O `.app-mais-menu` traz `right: 0` e `min-width: 220px`: numa
    barra estreita, ou com o botão à esquerda, a borda esquerda do menu cai
    fora da janela — o mesmo defeito do painel "Filtros visíveis". Alinhar
    pela direita continua sendo a preferência (é de lá que este menu nasce,
    encostado à direita da barra de ações); o hook só troca de lado quando
    esse lado NÃO CABE.
  */
  const posicao = usePosicaoFlutuante(botaoRef, menuRef, aberto, { ancorarADireita: true });

  const visiveis = itens.filter(Boolean);
  if (visiveis.length === 0) return null;
  const comuns = visiveis.filter((item) => !item.perigosa);
  const perigosas = visiveis.filter((item) => item.perigosa);

  return (
    <div className="app-mais-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-outline"
        ref={botaoRef}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        onClick={() => setAberto((atual) => !atual)}
      >
        ⋯
      </button>
      {aberto && posicao && (
        <div className="app-mais-menu" role="menu" ref={menuRef} style={posicao.estilo}>
          {[...comuns, ...perigosas].map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              className={`app-mais-item${item.perigosa ? ' app-mais-item--perigosa' : ''}`}
              disabled={item.desabilitada}
              title={item.title}
              onClick={() => {
                setAberto(false);
                item.onClick?.();
              }}
            >
              {item.icone}
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
