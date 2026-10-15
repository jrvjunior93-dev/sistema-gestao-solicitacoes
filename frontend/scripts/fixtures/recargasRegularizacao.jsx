import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecargasRegularizacao from '../../src/pages/RecargasRegularizacao';
import { canRegularizarRecarga } from '../../src/utils/acessoProduto';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';
window.__permissoesQA = [
  { perfil: 'SUPERADMIN' }, { area: 'GEO' }, { setor: { nome: 'Gerência de Processos' } },
  { area: 'OBRA' }, { area: 'DEPARTAMENTO PESSOAL' }, { perfil: 'ADMIN', area: 'FINANCEIRO' }
].map(canRegularizarRecarga);
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{ tema: TEMA_PADRAO }}><RecargasRegularizacao /></ThemeContext.Provider></MemoryRouter>);
