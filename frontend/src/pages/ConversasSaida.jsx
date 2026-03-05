import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  arquivarConversasEmMassa,
  desarquivarConversasEmMassa,
  getCaixaSaida
} from '../services/conversasInternas';
import { useAuth } from '../contexts/AuthContext';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

function alternarSelecionado(lista, id) {
  if (lista.includes(id)) return lista.filter((item) => item !== id);
  return [...lista, id];
}

export default function ConversasSaida() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('ABERTAS');
  const [selecionadas, setSelecionadas] = useState([]);

  const arquivadas = aba === 'ARQUIVADAS';

  async function carregar() {
    try {
      setLoading(true);
      const data = await getCaixaSaida({ arquivadas });
      setItens(Array.isArray(data) ? data : []);
      setSelecionadas([]);
      if (!arquivadas) {
        const userId = Number(user?.id);
        if (Number.isInteger(userId) && userId > 0) {
          localStorage.setItem(`conversas_saida_last_seen_${userId}`, new Date().toISOString());
          window.dispatchEvent(new Event('conversas:saida:seen'));
        }
      }
    } catch (error) {
      alert(error?.message || 'Erro ao carregar caixa de saída');
    } finally {
      setLoading(false);
    }
  }

  async function arquivarOuDesarquivarEmMassa() {
    if (selecionadas.length === 0) {
      alert('Selecione ao menos uma conversa.');
      return;
    }
    try {
      if (arquivadas) {
        await desarquivarConversasEmMassa(selecionadas);
        alert('Conversas desarquivadas com sucesso.');
      } else {
        await arquivarConversasEmMassa(selecionadas);
        alert('Conversas arquivadas com sucesso.');
      }
      await carregar();
    } catch (error) {
      alert(error?.message || 'Erro ao processar arquivamento em massa');
    }
  }

  async function arquivarOuDesarquivarIndividual(conversaId) {
    try {
      if (arquivadas) {
        await desarquivarConversasEmMassa([conversaId]);
        alert('Conversa desarquivada com sucesso.');
      } else {
        await arquivarConversasEmMassa([conversaId]);
        alert('Conversa arquivada com sucesso.');
      }
      await carregar();
    } catch (error) {
      alert(error?.message || 'Erro ao processar conversa');
    }
  }

  useEffect(() => {
    carregar();
  }, [aba, user?.id]);

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Caixa de Saída</h1>
          <p className="page-subtitle">Conversas enviadas por você.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline" onClick={carregar}>Atualizar</button>
          <button type="button" className="btn btn-outline" onClick={arquivarOuDesarquivarEmMassa}>
            {arquivadas ? 'Desarquivar em massa' : 'Arquivar em massa'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <button type="button" className={`btn ${aba === 'ABERTAS' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('ABERTAS')}>
            Abertas
          </button>
          <button type="button" className={`btn ${aba === 'ARQUIVADAS' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('ARQUIVADAS')}>
            Arquivadas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={itens.length > 0 && selecionadas.length === itens.length}
                    onChange={(e) =>
                      setSelecionadas(e.target.checked ? itens.map((item) => item.id) : [])
                    }
                  />
                </th>
                <th>Assunto</th>
                <th>Destinatário</th>
                <th>Status</th>
                <th>Última mensagem</th>
                <th>Anexos</th>
                <th>Participantes</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" align="center">Carregando...</td>
                </tr>
              )}
              {!loading && itens.length === 0 && (
                <tr>
                  <td colSpan="9" align="center">Nenhuma conversa nesta aba.</td>
                </tr>
              )}
              {!loading && itens.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionadas.includes(item.id)}
                      onChange={() =>
                        setSelecionadas((prev) => alternarSelecionado(prev, item.id))
                      }
                    />
                  </td>
                  <td>{item.assunto}</td>
                  <td>{item.destinatario?.nome || '-'}</td>
                  <td>{item.status}</td>
                  <td>{item.ultima_mensagem?.mensagem || '-'}</td>
                  <td>{item.anexos_total ?? 0}</td>
                  <td>{item.participantes_total ?? 0}</td>
                  <td>{formatarDataHora(item.updatedAt)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate(`/conversas/${item.id}`, { state: { origemConversa: 'saida' } })}
                      >
                        Abrir chat
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => arquivarOuDesarquivarIndividual(item.id)}
                      >
                        {arquivadas ? 'Desarquivar' : 'Arquivar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
