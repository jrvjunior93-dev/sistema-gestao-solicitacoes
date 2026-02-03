import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import StatusBadge from '../../components/StatusBadge';
import { useTheme } from '../../contexts/ThemeContext';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';
import { API_URL, authHeaders } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function LinhaSolicitacao({ solicitacao, onAtualizar, setoresMap, permissaoUsuario }) {

  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);
  const { user } = useAuth();
  const { tema } = useTheme();
  const isSetorObra =
    user?.setor?.codigo === 'OBRA' ||
    user?.area === 'OBRA';
  const setorNomeSolicitacao =
    (setoresMap?.[solicitacao.area_responsavel] || solicitacao.area_responsavel || '');
  const isSetorObraSolicitacao =
    String(setorNomeSolicitacao).trim().toUpperCase() === 'OBRA';
  const setorCodigo = user?.setor?.codigo || user?.area || '';
  const isFinanceiro =
    String(setorCodigo).toUpperCase() === 'FINANCEIRO' ||
    String(user?.setor?.nome || '').toUpperCase() === 'FINANCEIRO';
  const isUsuario = user?.perfil === 'USUARIO';
  const podeAssumir =
    !isSetorObra &&
    (isUsuario
      ? (!!permissaoUsuario?.usuario_pode_assumir || isFinanceiro)
      : true);
  const podeAtribuir =
    !isSetorObra &&
    (isUsuario
      ? (!!permissaoUsuario?.usuario_pode_atribuir || isFinanceiro)
      : true);

  const navigate = useNavigate();
  const podeOcultar = ['CONCLUIDA', 'FINALIZADA'].includes(solicitacao.status_global);
  const dataCriacaoRaw =
    solicitacao.createdAt ||
    solicitacao.data_criacao ||
    solicitacao.created_at ||
    null;
  const dataCriacao = dataCriacaoRaw ? new Date(dataCriacaoRaw) : null;
  const dataCriacaoValida = dataCriacao && !Number.isNaN(dataCriacao.getTime());
  const dataCriacaoLabel = dataCriacaoValida
    ? dataCriacao.toLocaleDateString('pt-BR')
    : '-';
  const dataCriacaoTitle = dataCriacaoValida
    ? dataCriacao.toLocaleString('pt-BR')
    : '';

  async function ocultar() {
    if (!confirm('Ocultar esta solicitação da sua lista?')) return;

    try {
      await fetch(
        `${API_URL}/solicitacoes/${solicitacao.id}/ocultar`,
        {
          method: 'PATCH',
          headers: authHeaders()
        }
      );

      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao ocultar solicitação');
    }
  }

  const acaoCores = tema?.actions || {};

  return (
    <>
      <tr className="border-b odd:bg-white even:bg-gray-50/50 hover:bg-blue-50/40">

        <td
          className="p-2 whitespace-nowrap"
          title={dataCriacaoTitle}
        >
          {dataCriacaoLabel}
        </td>

        <td
          className="p-2 font-medium whitespace-nowrap truncate"
          title={solicitacao.codigo || ''}
        >
          {solicitacao.codigo}
        </td>

        <td
          className="p-2 whitespace-nowrap truncate"
          title={solicitacao.obra?.nome || ''}
        >
          {solicitacao.obra?.nome || '-'}
        </td>

        <td
          className="p-2 whitespace-nowrap truncate"
          title={solicitacao.contrato?.codigo || solicitacao.codigo_contrato || ''}
        >
          {solicitacao.contrato?.codigo || solicitacao.codigo_contrato || '-'}
        </td>

        <td
          className="p-2 max-w-md truncate"
          title={solicitacao.descricao || ''}
        >
          {solicitacao.descricao}
        </td>

        <td
          className="p-2 whitespace-nowrap truncate"
          title={solicitacao.tipo?.nome || solicitacao.tipoMacroSolicitacao?.nome || ''}
        >
          {solicitacao.tipo?.nome || solicitacao.tipoMacroSolicitacao?.nome || '-'}
        </td>

        <td
          className="p-2 whitespace-nowrap"
          title={solicitacao.valor ? String(solicitacao.valor) : ''}
        >
          {solicitacao.valor
            ? Number(solicitacao.valor).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            : '-'}
        </td>

        <td
          className="p-2 whitespace-nowrap truncate"
          title={setoresMap?.[solicitacao.area_responsavel] || solicitacao.area_responsavel || ''}
        >
          {setoresMap?.[solicitacao.area_responsavel] || solicitacao.area_responsavel}
        </td>

        <td
          className="p-2 whitespace-nowrap truncate"
          title={solicitacao.responsavel || ''}
        >
          {solicitacao.responsavel || '-'}
        </td>

        <td
          className="p-2 whitespace-nowrap"
          title={solicitacao.status_global || ''}
        >
          <StatusBadge
            status={solicitacao.status_global}
            setor={solicitacao.area_responsavel}
          />
        </td>

        <td className="p-2 whitespace-nowrap">
          <div className="flex gap-2 flex-wrap">

          <button
            className="hover:underline text-xs"
            style={{ color: acaoCores.ver || '#2563eb' }}
            onClick={() =>
              navigate(`/solicitacoes/${solicitacao.id}`)
            }
          >
            Ver
          </button>
          {podeAssumir && (
            <button
              className="text-xs hover:underline"
              style={{ color: acaoCores.assumir || '#16a34a' }}
              onClick={async () => {
                await fetch(
                  `${API_URL}/solicitacoes/${solicitacao.id}/assumir`,
                  {
                    method: 'POST',
                    headers: authHeaders()
                  }
                );

                onAtualizar();
              }}
            >
              Assumir
            </button>
          )}

          {podeAtribuir && (
            <button
              className="hover:underline text-xs"
              style={{ color: acaoCores.atribuir || '#7c3aed' }}
              onClick={() => setModalAtribuir(true)}
            >
              Atribuir
            </button>
          )}

          {!isSetorObra && (
            <button
              className="hover:underline text-xs"
              style={{ color: acaoCores.enviar || '#f97316' }}
              onClick={() => setModalEnviar(true)}
            >
              Enviar
            </button>
          )}

          <button
            className="hover:underline text-xs"
            style={{ color: acaoCores.ocultar || '#6b7280' }}
            onClick={ocultar}
            disabled={!podeOcultar}
          >
            Ocultar
          </button>

          </div>
        </td>

      </tr>

      {/* ================= MODAIS ================= */}

      {modalAtribuir && (
        <ModalAtribuirResponsavel
          solicitacaoId={solicitacao.id}
          obraId={solicitacao.obra_id}
          isSetorObraSolicitacao={isSetorObraSolicitacao}
          isUsuarioSetorObra={isSetorObra}
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
