import { Routes, Route } from 'react-router-dom';

import PrivateRoute from './components/PrivateRoute';

// Layout
import Layout from './layout/Layout';

// Páginas públicas
import Login from './pages/Login';

// Páginas protegidas
import Dashboard from './pages/Dashboard';
import Solicitacoes from './pages/Solicitacoes';
import SolicitacaoDetalhe from './pages/SolicitacaoDetalhe';
import Usuarios from './pages/Usuarios';
import UsuarioNovo from './pages/UsuarioNovo';
import NovaSolicitacao from './pages/NovaSolicitacao';
import UploadComprovantes from './pages/UploadComprovantes';
import ComprovantesPendentes from './pages/ComprovantesPendentes';
import Obras from './pages/Obras';
import Setores from './pages/Setores';
import TiposSolicitacao from './pages/TiposSolicitacao';
import Cargo from './pages/Cargos';
import GestaoContratos from './pages/GestaoContratos';
import Configuracoes from './pages/Configuracoes';
import TiposSubContrato from './pages/TiposSubContrato';
import StatusSetor from './pages/StatusSetor';
import Perfil from './pages/Perfil';
import PermissoesSetor from './pages/PermissoesSetor';
import CoresSistema from './pages/CoresSistema';
import AreasObra from './pages/AreasObra';
import AreasPorSetorOrigem from './pages/AreasPorSetorOrigem';
import SetoresVisiveisUsuario from './pages/SetoresVisiveisUsuario';
import ComportamentoRecebimentoSetor from './pages/ComportamentoRecebimentoSetor';
import TimeoutInatividade from './pages/TimeoutInatividade';

export default function App() {
  return (
    <Routes>

      {/* =========================
          LOGIN (PÚBLICO)
      ========================= */}
      <Route path="/login" element={<Login />} />

      {/* =========================
          ÁREA PROTEGIDA
      ========================= */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >

        <Route index element={<Dashboard />} />

        <Route path="solicitacoes" element={<Solicitacoes />} />
        <Route path="solicitacoes/:id" element={<SolicitacaoDetalhe />} />

        <Route path="nova-solicitacao" element={<NovaSolicitacao />} />

        <Route path="usuarios" element={<Usuarios />} />
        <Route path="usuarios/novo" element={<UsuarioNovo />} />
        <Route path="usuarios/:id" element={<UsuarioNovo />} />
        <Route path="usuarios/:id/editar" element={<UsuarioNovo />} />

        <Route path="obras" element={<Obras />} />
        <Route path="setores" element={<Setores />} />
        <Route path="cargos" element={<Cargo />} />
        <Route path="tipos-solicitacao" element={<TiposSolicitacao />} />
        <Route path="gestao-contratos" element={<GestaoContratos />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="tipos-sub-contrato" element={<TiposSubContrato />} />
        <Route path="status-setor" element={<StatusSetor />} />
        <Route path="permissoes-setor" element={<PermissoesSetor />} />
        <Route path="cores-sistema" element={<CoresSistema />} />
        <Route path="areas-obra" element={<AreasObra />} />
        <Route path="areas-por-setor-origem" element={<AreasPorSetorOrigem />} />
        <Route path="setores-visiveis-usuario" element={<SetoresVisiveisUsuario />} />
        <Route path="comportamento-recebimento-setor" element={<ComportamentoRecebimentoSetor />} />
        <Route path="timeout-inatividade" element={<TimeoutInatividade />} />

        <Route path="comprovantes/upload" element={<UploadComprovantes />} />
        <Route path="comprovantes/pendentes" element={<ComprovantesPendentes />} />
        <Route path="perfil" element={<Perfil />} />

      </Route>

    </Routes>
  );
}
