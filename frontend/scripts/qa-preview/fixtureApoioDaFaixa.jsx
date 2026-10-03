/*
 * FIXTURE VIVA DO APOIO DA FAIXA — o `PageHeader` REAL, dentro do shell
 * REAL, com o CSS real e os textos REAIS das telas.
 * ============================================================================
 *
 * POR QUE O SHELL INTEIRO, e não o `PageHeader` solto. A lição já foi paga
 * nesta leva: uma fixture que monta o componente sem o cartão do sistema à
 * volta mede outra tela. Aqui isso não é zelo, é o mecanismo:
 *
 *   - a folha escreve `.layout-main .app-page-header` — sem o `<main
 *     class="layout-main">` a faixa não recebe nem posição nem superfície;
 *   - `Pagina` publica `--pos-cabecalho-fixo` medindo a `.fx-topbar` REAL;
 *     sem barra do topo no DOM a faixa gruda no lugar errado;
 *   - `.app-pagina` é `display: grid` com `grid-template-columns` declarado,
 *     e é essa trilha que decide se o apoio comprido estica a página inteira
 *     (o defeito que a `paginaCabeNoCelular` fecha);
 *   - `.compras-responsive-scope` + `.apoio-linha-unica` mudam a conta de
 *     quebra da própria faixa (`compras-relatorio-apoio.css`).
 *
 * `?tela=` escolhe o texto. Os quatro são LITERAIS DE TELA, copiados do
 * código, não frases inventadas para caber ou para não caber:
 *   solicitacoes           src/pages/Solicitacoes/index.jsx:1968
 *   financeiro-titulos     src/pages/FinanceiroTitulos.jsx:997
 *   solicitacoes-rel-op    src/pages/SolicitacoesRelatorioOperacional.jsx:417
 *   compras-rel-economia   apoio longo do escopo de Compras (.apoio-linha-unica)
 *
 * `?d=nowrapNoCelular` planta de volta a folha de antes de 07/09 — o apoio
 * da faixa recusando quebra no celular. Prova que não reprova o defeito
 * conhecido não está medindo nada.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pagina from '../../src/components/padrao/Pagina';
import PageHeader from '../../src/components/padrao/PageHeader';
import BlocoConteudo from '../../src/components/padrao/BlocoConteudo';

const PARAMS = new URLSearchParams(window.location.search);
const TELA = PARAMS.get('tela') || 'solicitacoes';
const D = PARAMS.get('d') || '';

/* Os textos, como estão no código das telas. */
export const TELAS = {
  solicitacoes: {
    titulo: 'Solicitações',
    contagem: '2003 solicitação(ões)',
    descricao: 'Fila de trabalho do módulo: visões, filtros salvos, busca e ações em lote.'
  },
  'financeiro-titulos': {
    titulo: 'Consulta de Títulos Financeiros',
    contagem: '1.284 título(s)',
    descricao: 'Filtre a carteira antes de operar baixas, boletos e integracoes.'
  },
  'solicitacoes-rel-op': {
    titulo: 'Painel operacional',
    contagem: null,
    descricao: 'Marque o recorte e clique em Atualizar relatório: a consulta remonta o relatório inteiro, então só roda no clique.'
  },
  'compras-rel-economia': {
    titulo: 'Economia por negociação',
    contagem: '312 pedido(s)',
    descricao: 'Compara o valor da primeira cotação com o valor fechado, por fornecedor e por período, e mostra onde a negociação rendeu.',
    escopoCompras: true
  }
};

/*
  A FOLHA DE ANTES DE 07/09, na declaração exata que mudou: o apoio da
  faixa recusando quebra no celular. É a mesma forma do defeito que o
  irmão `.app-bloco-lead` já tinha plantado na `paginaCabeNoCelular`.
*/
const CSS_DEFEITOS = {
  nowrapNoCelular: `
    @media (max-width: 767px) {
      .app-page-lead {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    }
  `
};

function App() {
  const tela = TELAS[TELA] || TELAS.solicitacoes;
  return (
    <MemoryRouter initialEntries={['/prova']}>
      <div className="layout-shell fluxy-app-shell">
        <main className="layout-main">
          <div className={`layout-content-shell${tela.escopoCompras ? ' compras-responsive-scope' : ''}`}>
            {/* A barra do topo entra porque `Pagina` MEDE a altura dela para
                publicar `--pos-cabecalho-fixo`. Sem ela a faixa gruda no
                fallback de 96px e a geometria medida é de outra tela. */}
            <header className="fx-topbar">
              <div className="fx-topbar-nav">
                <a className="fx-brand" href="/prova">Fluxy</a>
              </div>
              <div className="fx-topbar-tray">
                <button type="button" className="theme-toggle" aria-label="Tema">◐</button>
              </div>
            </header>

            <Pagina className={tela.escopoCompras ? 'apoio-linha-unica' : ''}>
              <PageHeader
                titulo={tela.titulo}
                contagem={tela.contagem}
                descricao={tela.descricao}
                acaoPrincipal={{ rotulo: 'Atualizar', onClick: () => {} }}
              />
              <BlocoConteudo titulo="Conteúdo" variante="primario">
                {/* Página rolável: a faixa compacta é estado de ROLAGEM, e
                    sem altura para rolar ela nunca acontece. */}
                <div style={{ height: '1600px' }} />
              </BlocoConteudo>
            </Pagina>
          </div>
        </main>
      </div>
      {CSS_DEFEITOS[D] && <style>{CSS_DEFEITOS[D]}</style>}
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
