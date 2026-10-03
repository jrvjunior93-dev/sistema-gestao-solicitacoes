/*
 * FIXTURE VIVA DA FAIXA DE VISÕES — a `ListaAvancada` REAL, com as visões da
 * tela `solicitacoes` e o CSS real, nas três larguras do harness.
 * ============================================================================
 *
 * A SUSPEITA QUE ELA EXISTE PARA MEDIR (S4 do revisor separado, 06/09): em
 * `solicitacoes` a 390, "nenhuma visão parece selecionada — a faixa de chips
 * rola na horizontal e o chip ativo fica fora da tela, sem pista de que há
 * rolagem". Ele registrou como SUSPEITA, não como defeito, e o pedido foi
 * medir antes de tratar.
 *
 * O que a leitura do código já dizia, e esta fixture põe em número: abaixo de
 * 768px a `.la-visoes` vira `flex-wrap: nowrap; overflow-x: auto`
 * (`lista-avancada.css`), a tela `solicitacoes` declara "Todas" como a
 * ÚLTIMA das cinco visões e abre com `visaoInicial="todas"`. O chip ativo
 * nasce, por construção, no fim de uma faixa que não cabe.
 *
 * As visões são as REAIS (`pages/Solicitacoes/index.jsx`), na ordem real,
 * com os contadores que a tela mostra.
 */
import { createRoot } from 'react-dom/client';
import ListaAvancada from '../../src/components/lista-avancada/ListaAvancada';

const params = new URLSearchParams(window.location.search);
const VISAO_INICIAL = params.get('visao') || 'todas';

const VISOES = [
  { id: 'minhas', rotulo: 'Minhas pendências' },
  { id: 'fila_setor', rotulo: 'Fila do setor' },
  { id: 'vencendo', rotulo: 'Vencendo', tom: 'warning' },
  { id: 'atrasadas', rotulo: 'Atrasadas', tom: 'danger' },
  { id: 'todas', rotulo: 'Todas' }
];

const COLUNAS = [
  { id: 'codigo', titulo: 'Código', tipo: 'codigo', render: (i) => i.codigo },
  { id: 'titulo', titulo: 'Título', tipo: 'identidade', noCard: 'titulo', render: (i) => i.titulo },
  { id: 'status', titulo: 'Status', tipo: 'status', render: (i) => i.status }
];

const ITENS = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  codigo: `SOL-${String(i + 1).padStart(5, '0')}`,
  titulo: `Solicitação de compra número ${i + 1}`,
  status: 'Aberto'
}));

function App() {
  return (
    <div className="layout-shell fluxy-app-shell">
      <main className="layout-main">
        <div className="layout-content-shell">
          <div className="page solicitacoes-page app-pagina">
            <ListaAvancada
              id="prova-visoes"
              itens={ITENS}
              total={ITENS.length}
              /* ZERO, e não 1, de propósito: em 06/09 a `ListaAvancada`
                 tinha `totalPaginas > 0 ? página < totalPaginas : false` na
                 linha 327 — `página`, com acento, que não é variável
                 nenhuma e derruba o componente inteiro no primeiro render.
                 O defeito é de outra frente (a passagem de acentuação) e
                 está registrado no relatório; com uma página só, o ramo
                 quebrado não é avaliado e esta fixture mede o que veio
                 medir. Quando aquilo for corrigido, este número pode voltar
                 a ser o que a tela usa. */
              totalPaginas={0}
              pagina={1}
              colunas={COLUNAS}
              visoes={VISOES}
              visaoInicial={VISAO_INICIAL}
              onQueryChange={() => {}}
              onPageRequest={() => {}}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
