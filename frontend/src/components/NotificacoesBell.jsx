import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas
} from '../services/notificacoes';

export default function NotificacoesBell() {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const navigate = useNavigate();

  async function carregar() {
    try {
      const data = await getNotificacoes({ limit: 50 });
      setItens(Array.isArray(data.itens) ? data.itens : []);
      setTotalNaoLidas(Number(data.total_nao_lidas || 0));
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 60000);
    return () => clearInterval(id);
  }, []);

  async function abrirModal() {
    await carregar();
    setAberto(true);
  }

  async function marcarTudo() {
    await marcarTodasNotificacoesLidas();
    await carregar();
  }

  async function abrirSolicitacao(item) {
    if (item.destinatario_id && !item.lida_em) {
      await marcarNotificacaoLida(item.destinatario_id);
    }
    await carregar();
    if (item.solicitacao_id) {
      navigate(`/solicitacoes/${item.solicitacao_id}`);
    }
    setAberto(false);
  }

  return (
    <>
      <button
        onClick={abrirModal}
        className="relative p-2 rounded-full hover:bg-gray-200"
        aria-label="Notificacoes"
      >
        <span className="text-xl">🔔</span>
        {totalNaoLidas > 0 && (
          <span className="absolute -top-1 -right-1 text-xs bg-red-600 text-white rounded-full px-1.5 py-0.5">
            {totalNaoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-20">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Notificacoes</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={marcarTudo}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Marcar todas como lidas
                </button>
                <button
                  onClick={() => setAberto(false)}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {itens.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">
                  Sem notificacoes.
                </p>
              )}

              {itens.map(item => (
                <button
                  key={item.destinatario_id}
                  onClick={() => abrirSolicitacao(item)}
                  className="w-full text-left py-3 px-2 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm ${item.lida_em ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                        {item.mensagem}
                      </p>
                      {item.createdAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {!item.lida_em && (
                      <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
