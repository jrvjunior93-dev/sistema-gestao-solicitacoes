import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StatusBadge from '../../components/StatusBadge';
import { useTheme } from '../../contexts/ThemeContext';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';
import { API_URL, authHeaders } from '../../services/api';
import {
  arquivarSolicitacao,
  deleteSolicitacao,
  desarquivarSolicitacao,
  updateValorSolicitacao
} from '../../services/solicitacoes';
import { useAuth } from '../../contexts/AuthContext';
import { parseDateSmart } from '../../utils/dateLocal';

export default function LinhaSolicitacao({
  solicitacao,
  onAtualizar,
  setoresMap,
  permissaoUsuario,
  mostrarRefContrato = false,
  visibleColumns = null,
  mostrarArquivadas = false,
  selecaoHabilitada = false,
  selecionada = false,
  onToggleSelecionada,
  viewportMode = 'desktop'
}) {

  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);
  const limitarTexto = (valor, limite = 15) => {
    const texto = String(valor || '');
    if (!texto) return '';
    return texto.length > limite ? `${texto.slice(0, limite)}...` : texto;
  };
  const visibleSet = Array.isArray(visibleColumns) && visibleColumns.length > 0
    ? new Set(visibleColumns)
    : null;
  const mostrarColuna = (id) => !visibleSet || visibleSet.has(id);
  const isMobileCard = viewportMode === 'mobile';
  const tdBase = (label, extraClass = '') => ({
    'data-label': label,
    className: `${extraClass}`.trim()
  });
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
  const dataVencimentoRaw = solicitacao.data_vencimento || null;
  const dataVencimento = dataVencimentoRaw ? parseDateSmart(dataVencimentoRaw) : null;
  const dataVencimentoValida = dataVencimento && !Number.isNaN(dataVencimento.getTime());
  const dataVencimentoLabel = dataVencimentoValida
    ? dataVencimento.toLocaleDateString('pt-BR')
    : '-';
  const dataVencimentoTitle = dataVencimentoValida
    ? dataVencimento.toLocaleString('pt-BR')
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

  async function arquivarItem() {
    if (!confirm('Arquivar esta solicitação somente para sua visualização?')) return;
    try {
      await arquivarSolicitacao(solicitacao.id);
      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao arquivar solicitação');
    }
  }

  async function desarquivarItem() {
    try {
      await desarquivarSolicitacao(solicitacao.id);
      onAtualizar();
    } catch (err) {
      console.error(err);
      alert('Erro ao desarquivar solicitação');
    }
  }

  const acaoCores = tema?.actions || {};
  const podeSelecionarLinha = selecaoHabilitada && typeof onToggleSelecionada === 'function';

  function clicarEmElementoInterativo(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('button, a, input, select, textarea, label, [role=\"button\"], [data-no-row-select=\"true\"]');
  }

  function alternarSelecaoLinha() {
    if (!podeSelecionarLinha) return;
    onToggleSelecionada(solicitacao.id);
  }

  return (
    <>
      <tr
        className={`solicitacao-row border-b border-gray-200 dark:border-slate-700 odd:bg-white even:bg-gray-50/50 dark:odd:bg-slate-900 dark:even:bg-slate-800/90 hover:bg-blue-50/40 dark:hover:bg-slate-700 ${podeSelecionarLinha ? 'cursor-pointer' : ''}`}
        onClick={(event) => {
          if (!podeSelecionarLinha) return;
          if (clicarEmElementoInterativo(event.target)) return;
          alternarSelecaoLinha();
        }}
      >

        {selecaoHabilitada && (
          <td className="p-2 whitespace-nowrap" data-label="Selecionar">
            <input
              type="checkbox"
              checked={!!selecionada}
              onChange={alternarSelecaoLinha}
              aria-label={`Selecionar ${solicitacao.codigo || solicitacao.id}`}
            />
          </td>
        )}

        {mostrarColuna('data') && (
          <td
            {...tdBase('Data', 'p-2 whitespace-nowrap')}
            title={dataCriacaoTitle}
          >
            {dataCriacaoLabel}
          </td>
        )}

        {mostrarColuna('codigo') && (
          <td
            {...tdBase('Código', `p-2 font-medium whitespace-nowrap truncate ${isMobileCard ? 'text-sm font-semibold' : ''}`)}
            title={solicitacao.codigo || ''}
          >
            {solicitacao.codigo}
          </td>
        )}

        {mostrarColuna('numero_sienge') && (
          <td
            {...tdBase('Nº SIENGE', 'p-2 whitespace-nowrap truncate')}
            title={solicitacao.numero_pedido || ''}
          >
            {limitarTexto(solicitacao.numero_pedido, 15) || '-'}
          </td>
        )}

        {mostrarColuna('obra') && (
          <td
            {...tdBase('Obra', 'p-2 whitespace-nowrap truncate')}
            title={solicitacao.obra?.nome || ''}
          >
            {limitarTexto(solicitacao.obra?.nome, 15) || '-'}
          </td>
        )}

        {mostrarColuna('contrato') && (
          <td
            {...tdBase('Contrato', 'p-2 whitespace-nowrap truncate')}
            title={solicitacao.contrato?.codigo || solicitacao.codigo_contrato || ''}
          >
            {limitarTexto(solicitacao.contrato?.codigo || solicitacao.codigo_contrato, 15) || '-'}
          </td>
        )}

        {mostrarRefContrato && mostrarColuna('ref_contrato') && (
          (() => {
            const refContrato = solicitacao.contrato?.ref_contrato || '';
            const refContratoCurta =
              refContrato.length > 30 ? `${refContrato.slice(0, 30)}...` : refContrato;

            return (
              <td
                {...tdBase('Ref. do Contrato', 'p-2 whitespace-nowrap truncate')}
                title={refContrato}
              >
                {refContratoCurta || '-'}
              </td>
            );
          })()
        )}

        {mostrarColuna('descricao') && (() => {
          const descricao = solicitacao.descricao || '';
          const descricaoCurta =
            descricao.length > 15 ? `${descricao.slice(0, 15)}...` : descricao;
          return (
            <td
              {...tdBase('Descrição', 'p-2 whitespace-nowrap truncate')}
              title={descricao}
            >
              {descricaoCurta}
            </td>
          );
        })()}

        {mostrarColuna('tipo') && (
          <td
            {...tdBase('Tipo de Solicitação', 'p-2 whitespace-nowrap truncate')}
            title={solicitacao.tipo?.nome || solicitacao.tipoMacroSolicitacao?.nome || ''}
          >
            {solicitacao.tipo?.nome || solicitacao.tipoMacroSolicitacao?.nome || '-'}
          </td>
        )}

        {mostrarColuna('valor') && (
        <td
          {...tdBase('Valor', 'p-2 overflow-hidden')}
          title={solicitacao.valor ? String(solicitacao.valor) : ''}
        >
          {editandoValor ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                className="w-24 rounded px-2 py-1 text-right bg-[var(--c-surface)] text-[var(--c-text)] border border-[var(--c-border)] focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                value={valorEditado}
                onChange={e => setValorEditado(e.target.value)}
              />
              <button
                className="text-xs text-blue-700 hover:underline"
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
            <div className="flex flex-col items-start gap-1 min-w-0 w-full">
              <span
                className="block w-full min-w-0 truncate"
                title={
                  solicitacao.valor
                    ? Number(solicitacao.valor).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })
                    : '-'
                }
              >
                {solicitacao.valor
                  ? Number(solicitacao.valor).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })
                  : '-'}
              </span>
              {podeEditarValor && (
                <button
                  className="text-[11px] leading-none text-blue-600 hover:underline shrink-0"
                  onClick={() => setEditandoValor(true)}
                >
                  Editar
                </button>
              )}
            </div>
          )}
        </td>
        )}

        {mostrarColuna('setor') && (
          <td
            {...tdBase('Setor', 'p-2 whitespace-nowrap truncate')}
            title={setoresMap?.[solicitacao.area_responsavel] || solicitacao.area_responsavel || ''}
          >
            {setoresMap?.[solicitacao.area_responsavel] || solicitacao.area_responsavel}
          </td>
        )}

        {mostrarColuna('responsavel') && (
          <td
            {...tdBase('Responsável', 'p-2 whitespace-nowrap truncate')}
            title={solicitacao.responsavel || ''}
          >
            {solicitacao.responsavel || '-'}
          </td>
        )}

        {mostrarColuna('status') && (
          <td
            {...tdBase('Status', 'p-2 whitespace-nowrap')}
            title={solicitacao.status_global || ''}
          >
            <StatusBadge
              status={solicitacao.status_global}
              setor={solicitacao.setor_status_atual || solicitacao.area_responsavel}
            />
          </td>
        )}

        {mostrarColuna('vencimento') && (
          <td
            {...tdBase('Vencimento', 'p-2 whitespace-nowrap')}
            title={dataVencimentoTitle}
          >
            {dataVencimentoLabel}
          </td>
        )}

        {mostrarColuna('acoes') && (
        <td {...tdBase('Ações', 'p-2 whitespace-nowrap')}>
          <div className={`solicitacao-acoes ${isMobileCard ? 'flex-wrap' : 'flex-nowrap'}`}>

            <button
              className="acao-link"
              style={{ color: acaoCores.ver || '#2563eb' }}
            onClick={() =>
              navigate(`/solicitacoes/${solicitacao.id}`)
            }
          >
            Ver
          </button>
          {podeAssumir && (
            <button
              className="acao-link"
              style={{ color: acaoCores.assumir || '#1d4ed8' }}
              onClick={async () => {
                const res = await fetch(
                  `${API_URL}/solicitacoes/${solicitacao.id}/assumir`,
                  {
                    method: 'POST',
                    headers: authHeaders()
                  }
                );

                if (!res.ok) {
                  let mensagem = 'Erro ao assumir solicitação';
                  try {
                    const data = await res.json();
                    mensagem = data?.error || mensagem;
                  } catch (_) {}
                  alert(mensagem);
                  return;
                }

                alert('Solicitação assumida com sucesso.');
                onAtualizar();
              }}
            >
              Assumir
            </button>
          )}

          {podeAtribuir && (
            <button
              className="acao-link"
              style={{ color: acaoCores.atribuir || '#3b82f6' }}
              onClick={() => setModalAtribuir(true)}
            >
              Atribuir
            </button>
          )}

          {!isSetorObra && (
            <button
              className="acao-link"
              style={{ color: acaoCores.enviar || '#0ea5e9' }}
              onClick={() => setModalEnviar(true)}
            >
              Enviar
            </button>
          )}

          {(isSuperadmin || isAdminGEO) && (
            <button
              className="acao-link"
              style={{ color: '#1e40af' }}
              onClick={excluirSolicitacao}
            >
              Excluir
            </button>
          )}

          {!mostrarArquivadas ? (
            <button
              className="acao-link"
              style={{ color: acaoCores.ocultar || '#64748b' }}
              onClick={arquivarItem}
            >
              Arquivar
            </button>
          ) : (
            <button
              className="acao-link"
              style={{ color: acaoCores.ocultar || '#64748b' }}
              onClick={desarquivarItem}
            >
              Desarquivar
            </button>
          )}

          </div>
        </td>
        )}

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
