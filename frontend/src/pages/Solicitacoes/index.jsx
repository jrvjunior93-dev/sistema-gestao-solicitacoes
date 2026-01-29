import { useEffect, useState } from 'react';
import Filtros from './Filtros';
import TabelaSolicitacoes from './TabelaSolicitacoes';

const API_URL = 'http://localhost:3001';

export default function Solicitacoes() {

  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filtros, setFiltros] = useState({
    status: '',
    area: '',
    obra_id: '',
    codigo_contrato: ''
  });

  /* ===============================
     CARREGAR DADOS
  =============================== */

  useEffect(() => {
    carregar();
  }, [filtros]);

  async function carregar() {
    try {
      setLoading(true);

      const params = new URLSearchParams(filtros).toString();

      const res = await fetch(
        `${API_URL}/solicitacoes?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (!res.ok) {
        throw new Error('Erro ao buscar solicitações');
      }

      const data = await res.json();
      setSolicitacoes(data);

    } catch (error) {
      console.error(error);
      alert('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }

  /* ===============================
     RENDER
  =============================== */

  return (
    <div className="p-6">

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
          Solicitações
        </h1>
      </div>

      <Filtros
        filtros={filtros}
        setFiltros={setFiltros}
      />

      {loading && (
        <p className="mt-6">Carregando...</p>
      )}

      {!loading && solicitacoes.length === 0 && (
        <p className="mt-6">Nenhuma solicitação encontrada.</p>
      )}

      {!loading && solicitacoes.length > 0 && (
        <TabelaSolicitacoes
          solicitacoes={solicitacoes}
          onAtualizar={carregar}
        />
      )}

    </div>
  );
}
