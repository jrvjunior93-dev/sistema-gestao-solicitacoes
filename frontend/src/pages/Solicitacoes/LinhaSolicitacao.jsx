import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import StatusBadge from '../../components/StatusBadge';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';

const API_URL = 'http://localhost:3001';

export default function LinhaSolicitacao({ solicitacao, onAtualizar }) {

  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);

  const navigate = useNavigate();

  async function ocultar() {
    if (!confirm('Ocultar esta solicitação da sua lista?')) return;

    try {
      await fetch(
        `${API_URL}/solicitacoes/${solicitacao.id}/ocultar`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao ocultar solicitação');
    }
  }

  return (
    <>
      <tr className="border-t hover:bg-gray-50">

        <td className="p-3 font-medium">
          {solicitacao.codigo}
        </td>

        <td className="p-3">
          {solicitacao.obra?.nome || '-'}
        </td>

        <td className="p-3 max-w-md truncate">
          {solicitacao.descricao}
        </td>

        <td className="p-3">
          {solicitacao.area_responsavel}
        </td>

        <td className="p-3">
          {solicitacao.responsavel || '-'}
        </td>

        <td className="p-3">
          <StatusBadge status={solicitacao.status_global} />
        </td>

        <td className="p-3 flex gap-3">

          <button
            className="text-blue-600 hover:underline"
            onClick={() =>
              navigate(`/solicitacoes/${solicitacao.id}`)
            }
          >
            Ver
          </button>
          <button
            className="text-green-600"
            onClick={async () => {
                await fetch(
                `${API_URL}/solicitacoes/${solicitacao.id}/assumir`,
                {
                    method: 'POST',
                    headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                    }
                }
                );

                onAtualizar();
            }}
            >
            Assumir
          </button>


          <button
            className="text-purple-600 hover:underline"
            onClick={() => setModalAtribuir(true)}
          >
            Atribuir
          </button>

          <button
            className="text-orange-600 hover:underline"
            onClick={() => setModalEnviar(true)}
          >
            Enviar
          </button>

          <button
            className="text-gray-600 hover:underline"
            onClick={ocultar}
          >
            Ocultar
          </button>

        </td>

      </tr>

      {/* ================= MODAIS ================= */}

      {modalAtribuir && (
        <ModalAtribuirResponsavel
          solicitacaoId={solicitacao.id}
          onClose={() => setModalAtribuir(false)}
          onSucesso={onAtualizar}
        />
      )}

      {modalEnviar && (
        <ModalEnviarSetor
          solicitacaoId={solicitacao.id}
          onClose={() => setModalEnviar(false)}
          onSucesso={onAtualizar}
        />
      )}

    </>
  );
}
