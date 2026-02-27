import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCaixaSaida } from '../services/conversasInternas';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

export default function ConversasSaida() {
  const navigate = useNavigate();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getCaixaSaida();
      setItens(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar caixa de saida');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Caixa de Saída</h1>
          <p className="page-subtitle">Conversas enviadas por você.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={carregar}>Atualizar</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Assunto</th>
              <th>Destinatário</th>
              <th>Status</th>
              <th>Última mensagem</th>
              <th>Atualizado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6" align="center">Carregando...</td>
              </tr>
            )}
            {!loading && itens.length === 0 && (
              <tr>
                <td colSpan="6" align="center">Nenhuma conversa enviada.</td>
              </tr>
            )}
            {!loading && itens.map(item => (
              <tr key={item.id}>
                <td>{item.assunto}</td>
                <td>{item.destinatario?.nome || '-'}</td>
                <td>{item.status}</td>
                <td>{item.ultima_mensagem?.mensagem || '-'}</td>
                <td>{formatarDataHora(item.updatedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/conversas/${item.id}`)}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
