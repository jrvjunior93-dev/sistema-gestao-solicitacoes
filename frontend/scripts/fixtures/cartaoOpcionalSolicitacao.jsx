import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import FinanceiroCard from '../../src/pages/SolicitacaoDetalhe/FinanceiroCard';
import { AuthContext } from '../../src/contexts/AuthContext';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';

const solicitacao = { id: 100, codigo: 'SOL-QA', valor: 200, tipo: { nome: 'DESPESA EVENTUAL' },
  obra_id: 1, obra: { id: 1, nome: 'Obra QA', empresa_grupo_id: 1 },
  parceiro: { id: 1, nome: 'Credor QA', cpf_cnpj: '12345678909', fornecedor: true, ativo: true },
  data_vencimento: '2026-10-20' };
const user = { id: 99, perfil: 'USUARIO', areas_permissoes: ['financeiro.titulos.criar', 'financeiro.titulos.visualizar'] };
createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthContext.Provider value={{ user }}><ThemeContext.Provider value={{ tema: TEMA_PADRAO }}>
    <main className="layout-main app-page p-4 bg-[var(--c-bg)] text-[var(--c-text)]">
      <FinanceiroCard solicitacao={solicitacao} podeAcessarModuloFinanceiro podeOperarAbaFinanceiro podeVisualizarTitulos />
    </main>
  </ThemeContext.Provider></AuthContext.Provider></BrowserRouter>
);
