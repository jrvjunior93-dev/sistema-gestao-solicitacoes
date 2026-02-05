import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import Header from './Header';
import Timeline from './Timeline';
import Comentarios from './Comentarios';
import Anexos from './Anexos';
import Pedido from './Pedido';
import ModalAlterarStatus from './ModalAlterarStatus';
import { updateStatusSolicitacao } from '../../services/solicitacoes';
import { API_URL, authHeaders } from '../../services/api';

export default function SolicitacaoDetalhe() {

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = setorTokens.includes('OBRA');
  const isSetorGeo = setorTokens.includes('GEO');

  const [solicitacao, setSolicitacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalStatus, setModalStatus] = useState(false);

  const perfil = String(user?.perfil || '').trim().toUpperCase();
  const setorUsuario =
    user?.setor?.codigo ||
    user?.area ||
    user?.setor?.nome ||
    '';
  const setorParaStatus =
    isSetorGeo
      ? 'GEO'
      : (perfil === 'SUPERADMIN' || perfil.startsWith('ADMIN'))
        ? solicitacao?.area_responsavel
        : setorUsuario;

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API_URL}/solicitacoes/${id}`,
        {
          headers: authHeaders()
        }
      );

      const data = await res.json();
      setSolicitacao(data);

    } catch (err) {
      console.error(err);
      alert('Erro ao carregar solicitação');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p>Carregando...</p>;
  if (!solicitacao) return null;

  async function salvarStatus(novoStatus) {
    try {
      await updateStatusSolicitacao(solicitacao.id, novoStatus);
      setModalStatus(false);
      carregar();
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao atualizar status');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* VOLTAR */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-600 hover:underline"
      >
        ← Voltar
      </button>

      {/* CABEÇALHO */}
      <Header
        solicitacao={solicitacao}
        onAlterarStatus={() => setModalStatus(true)}
        mostrarAlterarStatus={!isSetorObra}
      />

      {/* CONTEÚDO */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* TIMELINE */}
        <Timeline historicos={solicitacao.historicos} />

        {/* LADO DIREITO */}
        <div className="space-y-6">

          {/* CAMPO COMENTÁRIO */}
          {!isSetorObra && (
            <Comentarios
              solicitacaoId={id}
              onSucesso={carregar}
            />
          )}

          {isSetorGeo && (
            <Pedido
              solicitacaoId={id}
              numeroPedido={solicitacao.numero_pedido}
              onSucesso={carregar}
            />
          )}

          {/* UPLOAD */}
          <Anexos
            solicitacaoId={id}
            onSucesso={carregar}
          />

        </div>

      </div>

      {!isSetorObra && (
        <ModalAlterarStatus
          aberto={modalStatus}
          setor={setorParaStatus}
          onClose={() => setModalStatus(false)}
          onSalvar={salvarStatus}
        />
      )}

    </div>
  );
}
