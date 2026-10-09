import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import FinanceiroCard from '../../src/pages/SolicitacaoDetalhe/FinanceiroCard';
import { AuthContext } from '../../src/contexts/AuthContext';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';
import '../../src/index.css';
import '../../src/styles/design-tokens.css';
import '../../src/styles/escala.css';
import '../../src/styles/componentes-padrao.css';
import '../../src/styles/responsive-system.css';
const params = new URLSearchParams(location.search);
const grant = params.get('grant') || 'BOTH';
const user = { id: 2, perfil: 'USUARIO', area: 'GEO', modulos: ['FINANCEIRO'], areas_permissoes_configuradas: true,
  areas_permissoes: ['financeiro.titulos.visualizar',
    ...(grant === 'BOTH' || grant === 'FILA' ? ['financeiro.fila_pagamentos.preparar'] : []),
    ...(grant === 'BOTH' || grant === 'AUTORIZACAO' ? ['financeiro.autorizacoes_pagamento.preparar'] : [])],
  autorizacao_pagamentos: { enabled: params.get('mode') !== 'OFF', can_prepare: true, prepare_required: true } };
const solicitacao = { id: 100, codigo: 'SOL-QA', valor: 200,
  contrato_id: params.has('recarga') ? null : 1,
  tipo: { nome: params.has('recarga') ? 'RECARGA DE CARTAO' : 'CONTRATO' },
  obra_id: 1, obra: { id: 1, nome: 'Obra QA', empresa_grupo_id: 1 },
  parceiro: { id: 1, nome: 'Credor QA', fornecedor: true, ativo: true }, data_vencimento: '2026-10-20' };
window.__atualizacoes = 0;
createRoot(document.getElementById('root')).render(<BrowserRouter>
  <AuthContext.Provider value={{ user }}><ThemeContext.Provider value={{ tema: TEMA_PADRAO }}>
    <main className="layout-main app-page p-4 bg-[var(--c-bg)] text-[var(--c-text)]">
      <FinanceiroCard solicitacao={solicitacao} podeAcessarModuloFinanceiro podeOperarAbaFinanceiro podeVisualizarTitulos
        onSolicitacaoAtualizada={() => { window.__atualizacoes++; }} />
    </main>
  </ThemeContext.Provider></AuthContext.Provider></BrowserRouter>);
