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
import Obras from './pages/Obras';
import Setores from './pages/Setores';
import TiposSolicitacao from './pages/TiposSolicitacao';
import Cargo from './pages/Cargos';

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

        <Route path="obras" element={<Obras />} />
        <Route path="setores" element={<Setores />} />
        <Route path="cargos" element={<Cargo />} />
        <Route path="tipos-solicitacao" element={<TiposSolicitacao />} />

        <Route path="comprovantes/upload" element={<UploadComprovantes />} />

      </Route>

    </Routes>
  );
}
