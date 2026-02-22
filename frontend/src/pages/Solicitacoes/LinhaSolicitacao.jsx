import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StatusBadge from '../../components/StatusBadge';
import { useTheme } from '../../contexts/ThemeContext';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';
import { API_URL, authHeaders } from '../../services/api';
import { deleteSolicitacao, updateValorSolicitacao } from '../../services/solicitacoes';
import { useAuth } from '../../contexts/AuthContext';

export default function LinhaSolicitacao({
  solicitacao,
  onAtualizar,
  setoresMap,
  permissaoUsuario,
  mostrarRefContrato = false
}) {

  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);
  const { user } = useAuth();
  const { tema } = useTheme();
  const isSetorObra =
    user?.setor?.codigo === 'OBRA' ||
    user?.area === 'OBRA';
  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isAdminGEO =
    String(user?.perfil || '').toUpperCase().startsWith('ADMIN') &&
    setorTokens.includes('GEO');
  const isSuperadmin = String(user?.perfil || '').toUpperCase() === 'SUPERADMIN';
  const podeEditarValor = isAdminGEO || isSuperadmin;
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
    String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase() === 'TODOS_VISIVEIS' &&
    (isUsuario
      ? (!!permissaoUsuario?.usuario_pode_assumir || isFinanceiro)
      : true);
  const podeAtribuir =
    !isSetorObra &&
    String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase() === 'TODOS_VISIVEIS' &&
    (isUsuario
      ? (!!permissaoUsuario?.usuario_pode_atribuir || isFinanceiro)
      : true);

  const navigate = useNavigate();
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

  const [editandoValor, setEditandoValor] = useState(false);
  const [valorEditado, setValorEditado] = useState(
    solicitacao.valor !== null && solicitacao.valor !== undefined
      ? String(solicitacao.valor)
      : ''
  );

  useEffect(() => {
    if (!editandoValor) {
      setValorEditado(
        solicitacao.valor !== null && solicitacao.valor !== undefined
          ? String(solicitacao.valor)
          : ''
      );
    }
  }, [solicitacao.valor, editandoValor]);

  async function salvarValor() {
    try {
      const valorNumero = valorEditado === '' ? null : Number(valorEditado);
      if (valorEditado !== '' && Number.isNaN(valorNumero)) {
        alert('Valor invalido');
        return;
      }
      await updateValorSolicitacao(solicitacao.id, valorNumero);
      setEditandoValor(false);
      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar valor');
    }
  }

  async function excluirSolicitacao() {
    if (!confirm('Excluir esta solicitacao? Esta acao nao pode ser desfeita.')) return;
    try {
      await deleteSolicitacao(solicitacao.id);
      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir solicitacao');
    }
  }

  const acaoCores = tema?.actions || {};

  return (
    <>
      <tr className="border-b border-gray-200 dark:border-slate-700 odd:bg-white even:bg-gray-50/50 dark:odd:bg-slate-900 dark:even:bg-slate-800/90 hover:bg-blue-50/40 dark:hover:bg-slate-700 text-gray-900 dark:text-slate-100">

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

        {mostrarRefContrato && (
          (() => {
            const refContrato = solicitacao.contrato?.ref_contrato || '';
            const refContratoCurta =
              refContrato.length > 30 ? `${refContrato.slice(0, 30)}...` : refContrato;

            return (
              <td
                className="p-2 whitespace-nowrap truncate"
                title={refContrato}
              >
                {refContratoCurta || '-'}
              </td>
            );
          })()
        )}

        {(() => {
          const descricao = solicitacao.descricao || '';
          const descricaoCurta =
            descricao.length > 30 ? `${descricao.slice(0, 30)}...` : descricao;
          return (
            <td
              className="p-2 whitespace-nowrap truncate"
              title={descricao}
            >
              {descricaoCurta}
            </td>
          );
        })()}

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
          {editandoValor ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                className="w-24 border rounded p-1 text-right"
                value={valorEditado}
                onChange={e => setValorEditado(e.target.value)}
              />
              <button
                className="text-xs text-green-600 hover:underline"
                onClick={salvarValor}
              >
                Salvar
              </button>
              <button
                className="text-xs text-gray-500 hover:underline"
                onClick={() => {
                  setValorEditado(
                    solicitacao.valor !== null && solicitacao.valor !== undefined
                      ? String(solicitacao.valor)
                      : ''
                  );
                  setEditandoValor(false);
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>
                {solicitacao.valor
                  ? Number(solicitacao.valor).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })
                  : '-'}
              </span>
              {podeEditarValor && (
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setEditandoValor(true)}
                >
                  Editar
                </button>
              )}
            </div>
          )}
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
          <div className="flex gap-2 flex-nowrap">

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

          {(isSuperadmin || isAdminGEO) && (
            <button
              className="hover:underline text-xs"
              style={{ color: '#dc2626' }}
              onClick={excluirSolicitacao}
            >
              Excluir
            </button>
          )}

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
