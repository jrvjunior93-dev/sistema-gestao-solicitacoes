import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../src/contexts/AuthContext';
import NovaSolicitacao from '../../src/pages/NovaSolicitacao';
import AdiantamentoDetalhe from '../../src/pages/SolicitacaoDetalhe/AdiantamentoDetalhe';
import DistribuicaoCentroCustoConfig from '../../src/components/obras/DistribuicaoCentroCustoConfig';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';
function Fixture() {
  const [aberto, setAberto] = useState(false);
  return <main className="layout-main p-4" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
    <button onClick={() => setAberto(true)} className="btn btn-outline">Obras para rateio</button>
    {aberto && <DistribuicaoCentroCustoConfig centro={{ id: 30, nome: 'Administrativo' }} onFechar={() => setAberto(false)} />}
    <AdiantamentoDetalhe solicitacaoId={10} podeInteragir={!location.search.includes('leitura')} />
  </main>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={{ user: { id: 9, perfil: 'USUARIO', area: 'ADMINISTRATIVO', modulos: ['SOLICITACOES', 'APROPRIACOES'] } }}><ThemeContext.Provider value={{ tema: TEMA_PADRAO }}>{location.search.includes('nova') ? <NovaSolicitacao /> : <Fixture />}</ThemeContext.Provider></AuthContext.Provider></BrowserRouter>);
