/*
 * FIXTURE VIVA DA BARRA DO TOPO — o `Layout` REAL, com o CSS real, na rota
 * que a prova pedir.
 * ============================================================================
 *
 * POR QUE O `Layout` INTEIRO e não uma cópia da barra. O defeito medido é de
 * GEOMETRIA DE FLEXBOX entre irmãos (`.fx-topbar-nav` × `.fx-topbar-tray`) e
 * entre netos (`.fx-atalhos-area` e os seus botões). Uma reprodução do DOM
 * carregaria as classes e perderia justamente o que decide: quantos filhos
 * a barra tem naquela rota, se o `.compras-responsive-scope` está no
 * `.layout-content-shell` (13 prefixos de rota no `Layout.jsx`), e o que o
 * `AtalhosTopbar` renderiza depois do `ResizeObserver`.
 *
 * O QUE A FIXTURE SUBSTITUI, e só isto: o `AuthProvider` (que faz sessão por
 * rede) por um `AuthContext.Provider` com um usuário fixo. Todo o resto é o
 * componente de produção — inclusive o `AtalhosProvider`, que tenta a rede,
 * falha contra `127.0.0.1:1` e cai nas SUGESTOES_PADRAO, exatamente como
 * cairia num usuário novo.
 *
 * `?rota=` escolhe a rota (é ela que liga ou não o escopo de Compras).
 * `?d=` planta um defeito conhecido — `antesDaCorrecao` devolve as quatro
 * declarações de antes de 06/09, `soAreaDeAtalhos` devolve só as duas da
 * área de atalhos, e `trilhaQueRola` devolve a trilha rolante de antes de
 * 07/09 (usado pela `provaTextoInteiroAparece`). Prova que não reprova o
 * defeito conhecido não está medindo nada.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../../src/contexts/AuthContext';
import Layout from '../../src/layout/Layout';

const PARAMS = new URLSearchParams(window.location.search);
const ROTA = PARAMS.get('rota') || '/';
const D = PARAMS.get('d') || '';

/*
  O USUÁRIO. SUPERADMIN para que a trilha resolva em qualquer rota do
  sistema (a trilha lê a mesma fonte única dos hubs, e ela filtra por
  permissão); setor COMPRAS porque é o setor das 28 telas reprovadas e
  porque é ele que decide as SUGESTOES_PADRAO da fileira de atalhos — quem
  tem atalho tem o botão "»", que é um dos que se atravessam.
*/
const USUARIO = {
  id: 1,
  nome: 'Ana Paula Figueiredo',
  perfil: 'SUPERADMIN',
  area: 'COMPRAS',
  setor: { codigo: 'COMPRAS', nome: 'Compras' },
  tela_inicial: null
};

const AUTH = {
  user: USUARIO,
  token: 'fixture',
  isAuthenticated: true,
  authReady: true,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
  refreshSession: () => {}
};

/*
  OS DEFEITOS PLANTADOS — dois, porque a correção tem duas metades.

  `antesDaCorrecao`: base ZERO na navegação (`flex: 1 1 0%`). Com base
  zero, o tamanho da navegação NÃO entra na decisão de quebra da barra:
  ela nunca quebra por causa da navegação, dá a ela só a sobra da bandeja,
  e os filhos (que não encolhem) transbordam — por cima da bandeja quando
  a bandeja cabe na mesma fileira (as 28 telas de Compras, onde a folha do
  módulo encolhe os botões da bandeja), ou para fora da janela quando ela
  não cabe (as outras 165, onde o `overflow-x: clip` do shell come os três
  botões de tela).

  `soAreaDeAtalhos`: a outra metade, sozinha.
*/
/*
  A TRILHA DE ANTES DE 07/09 — e por que ela entra nos DOIS defeitos.

  Até 07/09 a trilha morava DENTRO da `.fx-topbar-nav` e escondia o resto
  do caminho atrás de `overflow-x: auto` sem barra de rolagem. A correção
  daquele defeito tirou-a de lá abaixo de 1024px: ela passou a ter fileira
  própria, com `flex: 1 1 100%`, e essa base é o que faz a BARRA quebrar.

  Isso muda a geometria que estes dois defeitos precisam para aparecer. Com
  a trilha abrindo fileira, a navegação ganha uma fileira inteira abaixo de
  1024px — e aí `flex: 1 1 0%` nela deixa de espremer coisa nenhuma:
  medido, a mordida parou de reprovar a 768 e a 390 (e a segunda mordida,
  nas duas). A folha de antes de 06/09, sozinha, virou uma folha que não
  reproduz mais o estado de antes de 06/09.

  Então ela vem junto: para plantar o defeito de 06/09 é preciso plantar
  também o arranjo de 06/09. NÃO é afrouxar a mordida — é o contrário: sem
  isto ela passaria a verde sem medir nada, que é exatamente o que este
  arquivo diz, lá em cima, para não deixar acontecer.

  De 1024px para cima nada disto muda a tela (a trilha já mora dentro da
  navegação), e é por isso que a mordida continuava reprovando ali.
*/
const TRILHA_DE_ANTES = `
  .fx-breadcrumb--fileira { display: none !important; }
  .fx-breadcrumb--dentro {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    scrollbar-width: none !important;
  }
  /*
    O degrau tambem recusava quebra — e sem esta linha o defeito plantado
    NAO e o defeito que existia: com o white-space normal de hoje o degrau
    encolhe e quebra o proprio texto dentro da tira rolante, nada fica
    escondido, e a mordida da trilha para de reprovar a 1024 e a 1366
    (medido). A folha de antes tem de vir inteira. (Sem crases aqui: este
    comentario mora dentro de um template literal.)
  */
  .fx-breadcrumb--dentro a,
  .fx-breadcrumb--dentro .fx-breadcrumb-current { white-space: nowrap !important; }
`;

const CSS_DEFEITOS = {
  /* A folha EXATA de antes de 06/09, nas quatro declarações que mudaram,
     mais o arranjo de trilha que existia naquele dia (ver acima). */
  antesDaCorrecao: `
    .fx-topbar-nav { flex: 1 1 0% !important; min-width: 0 !important; }
    .fx-atalhos-area { flex: 1 1 0% !important; }
    .fx-atalhos-fileira { flex: 0 1 auto !important; }
    .fx-topbar-tray { flex-wrap: nowrap !important; }
    ${TRILHA_DE_ANTES}
  `,
  /* Só a metade da correção que mora na ÁREA DE ATALHOS. A barra continua
     quebrando certo (a navegação tem base `auto`), mas a área volta a ter
     base zero: os três botões de tela deixam de ter espaço reservado e
     saem para fora. Serve para provar que a segunda declaração também é
     carregada — meia correção medida como inteira é o jeito de a outra
     metade voltar sozinha na próxima leva. */
  soAreaDeAtalhos: `
    .fx-atalhos-area { flex: 1 1 0% !important; }
    .fx-atalhos-fileira { flex: 0 1 auto !important; }
    ${TRILHA_DE_ANTES}
  `,
  /*
    A TRILHA QUE ROLA — o defeito de 07/09, sozinho, para a
    `provaTrilhaInteiraAparece` plantar de volta. Sem as bases zero: aqui
    o que se quer medir é o CAMINHO SUMINDO, não a barra se atravessando.
  */
  trilhaQueRola: TRILHA_DE_ANTES
};

function Corpo() {
  return <div className="prova-corpo" style={{ height: '1400px' }} />;
}

function App() {
  return (
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter initialEntries={[ROTA]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<Corpo />} />
          </Route>
        </Routes>
        {CSS_DEFEITOS[D] && <style>{CSS_DEFEITOS[D]}</style>}
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
