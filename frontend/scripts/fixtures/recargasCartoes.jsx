import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RecargasCartoesFields from '../../src/components/recarga-cartao/RecargasCartoesFields';
import RecargaCartaoDetalhe from '../../src/pages/SolicitacaoDetalhe/RecargaCartaoDetalhe';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';

function Fixture() {
  const [origem, setOrigem] = useState('11');
  const [linhas, setLinhas] = useState([]);
  const [contexto, setContexto] = useState(null);
  const alterar = useCallback((itens) => setLinhas(itens), []);
  return <main className="app-page space-y-4 p-4 bg-[var(--c-bg)] text-[var(--c-text)]">
    <h1 className="text-lg font-semibold">Nova solicitação · recarga de cartões</h1>
    <label>Obra / Centro de custo <select aria-label="Origem" className="input" value={origem} onChange={(event) => { setOrigem(event.target.value); setLinhas([]); }}><option value="11">Centro administrativo</option><option value="10">Obra QA</option></select></label>
    <RecargasCartoesFields ativo obraId={origem} value={linhas} onChange={alterar} onContextChange={setContexto} />
    <output data-testid="linhas">{JSON.stringify(linhas)}</output>
    <output data-testid="bloqueio">{String(contexto?.bloqueado)}</output>
    <h2 className="text-lg font-semibold">Detalhes · prestações por cartão</h2>
    <RecargaCartaoDetalhe solicitacaoId={100} />
  </main>;
}
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{ tema: TEMA_PADRAO }}><Fixture /></ThemeContext.Provider>);
