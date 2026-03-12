import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft, HiChevronRight } from 'react-icons/hi2';
import { useAuth } from '../../contexts/AuthContext';

import Header from './Header';
import Timeline from './Timeline';
import Comentarios from './Comentarios';
import Anexos from './Anexos';
import Pedido from './Pedido';
import ModalAlterarStatus from './ModalAlterarStatus';
import ModalEnviarSetor from '../Solicitacoes/ModalEnviarSetor';
import { updateStatusSolicitacao } from '../../services/solicitacoes';
import { API_URL, authHeaders } from '../../services/api';
import { isGeoSetor } from '../../utils/setor';

export default function SolicitacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];

  const isSetorGeo = setorTokens.some(isGeoSetor);
  const isSetorCompras = setorTokens.includes('COMPRAS');
  const isSuperadmin = String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';

  const [solicitacao, setSolicitacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalStatus, setModalStatus] = useState(false);
  const [modalEnviarSetor, setModalEnviarSetor] = useState(false);

  const perfil = String(user?.perfil || '').trim().toUpperCase();
  const setorUsuario = user?.setor?.codigo || user?.area || user?.setor?.nome || '';
  const setorParaStatus =
    perfil === 'SUPERADMIN'
      ? null
      : isSetorGeo
        ? 'GEO'
        : setorUsuario;

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/solicitacoes/${id}`, {
        headers: authHeaders()
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao carregar solicitacao');
      }

      setSolicitacao(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar solicitacao');
    } finally {
      setLoading(false);
    }
  }

  async function salvarStatus(novoStatus) {
    try {
      await updateStatusSolicitacao(solicitacao.id, novoStatus);
      setModalStatus(false);
      await carregar();
      alert('Status alterado com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao atualizar status');
    }
  }

  if (loading) return <p>Carregando...</p>;
  if (!solicitacao) return null;

  const atualizadoEm = new Date(solicitacao.updatedAt || solicitacao.createdAt).toLocaleString('pt-BR');

  return (
    <div className="sol-detail-page max-w-6xl mx-auto space-y-6">
      <div className="sol-detail-nav">
        <button
          onClick={() => navigate(-1)}
          className="sol-detail-back-btn"
          type="button"
        >
          <HiOutlineArrowLeft className="sol-detail-back-icon" />
          <span>Voltar para solicitacoes</span>
        </button>

        <div className="sol-detail-nav-right">
          <div className="sol-detail-breadcrumb">
            <span>Solicitacoes</span>
            <HiChevronRight className="sol-detail-breadcrumb-sep" />
            <span className="sol-detail-breadcrumb-current">{solicitacao.codigo}</span>
          </div>
          <span className="sol-detail-updated-at">Atualizado em {atualizadoEm}</span>
        </div>
      </div>

      <Header
        solicitacao={solicitacao}
        onAlterarStatus={() => setModalStatus(true)}
        onEnviarSetor={() => setModalEnviarSetor(true)}
        mostrarAlterarStatus
        mostrarEnviarSetor
      />

      <div className="grid md:grid-cols-2 gap-6">
        <Timeline
          historicos={solicitacao.historicos || []}
          canRemoveAnexo={isSetorCompras || isSuperadmin}
          onAnexoRemovido={carregar}
        />

        <div className="space-y-6">
          <Comentarios
            solicitacaoId={id}
            onSucesso={carregar}
          />

          {isSetorGeo && (
            <Pedido
              solicitacaoId={id}
              numeroPedido={solicitacao.numero_pedido}
              onSucesso={carregar}
            />
          )}

          <Anexos
            solicitacaoId={id}
            onSucesso={carregar}
          />
        </div>
      </div>

      <ModalAlterarStatus
        aberto={modalStatus}
        setor={setorParaStatus}
        onClose={() => setModalStatus(false)}
        onSalvar={salvarStatus}
      />

      {modalEnviarSetor && (
        <ModalEnviarSetor
          solicitacaoId={solicitacao.id}
          onClose={() => setModalEnviarSetor(false)}
          onSucesso={carregar}
        />
      )}
    </div>
  );
}
