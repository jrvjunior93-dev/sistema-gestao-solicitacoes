import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import Header from './Header';
import Timeline from './Timeline';
import Comentarios from './Comentarios';
import Anexos from './Anexos';

const API_URL = 'http://localhost:3001';

export default function SolicitacaoDetalhe() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [solicitacao, setSolicitacao] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API_URL}/solicitacoes/${id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
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
      <Header solicitacao={solicitacao} />

      {/* CONTEÚDO */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* TIMELINE */}
        <Timeline historicos={solicitacao.historicos} />

        {/* LADO DIREITO */}
        <div className="space-y-6">

          {/* CAMPO COMENTÁRIO */}
          <Comentarios
            solicitacaoId={id}
            onSucesso={carregar}
          />

          {/* UPLOAD */}
          <Anexos
            solicitacaoId={id}
            onSucesso={carregar}
          />

        </div>

      </div>

    </div>
  );
}
