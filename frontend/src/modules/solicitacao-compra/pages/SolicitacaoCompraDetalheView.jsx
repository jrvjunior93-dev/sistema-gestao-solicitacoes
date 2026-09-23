import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResizableTable, ResizableTh } from '../../../components/ResizableTable';
import ApropriacaoAutocomplete from '../../../components/ui/ApropriacaoAutocomplete';
import { useAuth } from '../../../contexts/AuthContext';
import { listarApropriacoes } from '../../../services/apropriacoes';
import {
  atualizarApropriacoesItemSolicitacaoCompra,
  atualizarQuantidadeItemSolicitacaoCompra,
  baixarPdfSolicitacaoCompra,
  cancelarSolicitacaoCompra,
  obterSolicitacaoCompra
} from '../../../services/compras';
import {
  canAlterarQuantidadeSolicitacaoCompra,
  canDeleteCompraSolicitacoes,
  canEditarApropriacoesItemCompraDireta,
  canEditarApropriacoesItemSolicitacaoCompra
} from '../../../utils/acessoProduto';
import { useSafeNavigateBack } from '../../../utils/navigation';
import {
  calcularResumoRateios,
  criarRateioBase,
  formatarQuantidade,
  montarLinhasResumoApropriacao,
  normalizarRateiosEntrada,
  parseQuantidade,
  sincronizarItemComRateios,
  validarRateiosItem
} from '../utils/apropriacoes';

function formatarData(data) {
  if (!data) return '-';
  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? '-' : valor.toLocaleDateString('pt-BR');
}

function formatarStatus(status) {
  return String(status || '-').replace(/_/g, ' ').toUpperCase();
}

function statusClass(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'ENCERRADO') return 'app-status-pill bg-slate-100 text-slate-700';
  if (value === 'FECHAMENTO_PARCIAL') return 'app-status-pill bg-amber-100 text-amber-800';
  if (value === 'AGUARDANDO_DIRETORIA') return 'app-status-pill bg-amber-100 text-amber-700';
  return 'app-status-pill bg-blue-100 text-blue-700';
}

function statusCotacaoClass(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'RESPONDIDO') return 'app-status-pill bg-emerald-100 text-emerald-700';
  if (value === 'FINALIZADA') return 'app-status-pill bg-slate-100 text-slate-700';
  if (value === 'VISUALIZADO') return 'app-status-pill bg-amber-100 text-amber-700';
  if (['CANCELADA', 'CANCELADO'].includes(value)) return 'app-status-pill bg-slate-100 text-slate-700';
  return 'app-status-pill bg-blue-100 text-blue-700';
}

const itemTableColumns = [
  { key: 'indice', width: 64, minWidth: 56 },
  { key: 'tipo', width: 112, minWidth: 92 },
  { key: 'insumo', width: 220, minWidth: 160 },
  { key: 'unidade', width: 96, minWidth: 78 },
  { key: 'quantidade', width: 118, minWidth: 98 },
  { key: 'especificacao', width: 260, minWidth: 180 },
  { key: 'apropriacao', width: 140, minWidth: 110 },
  { key: 'necessario_para', width: 132, minWidth: 112 },
  { key: 'link', width: 280, minWidth: 140 }
];

function combinarItensSolicitacaoCompra(solicitacao, apropriacoes = []) {
  const itens = (solicitacao?.itens || []).map((item) => ({
    id: item.id,
    item_tipo: 'CADASTRADO',
    tipo: 'CADASTRADO',
    nome: item.insumo?.nome || '-',
    unidade: item.unidade?.sigla || '-',
    quantidade: item.quantidade,
    especificacao: item.especificacao || '-',
    apropriacao_id: item.apropriacao_id || '',
    apropriacao: montarLinhasResumoApropriacao(item, apropriacoes).join(' | ') || item.apropriacao?.codigo || '-',
    apropriacoes: Array.isArray(item.apropriacoes) ? item.apropriacoes : [],
    apropriacao_linhas: item.apropriacao_linhas || [],
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || ''
  }));

  const manuais = (solicitacao?.itensManuais || []).map((item) => ({
    id: item.id,
    item_tipo: 'MANUAL',
    tipo: 'MANUAL',
    nome: item.nome_manual || '-',
    unidade: item.unidade_sigla_manual || '-',
    quantidade: item.quantidade,
    especificacao: item.especificacao || '-',
    apropriacao_id: item.apropriacao_id || '',
    apropriacao: montarLinhasResumoApropriacao(item, apropriacoes).join(' | ') || item.apropriacao?.codigo || '-',
    apropriacoes: Array.isArray(item.apropriacoes) ? item.apropriacoes : [],
    apropriacao_linhas: item.apropriacao_linhas || [],
    necessario_para: item.necessario_para,
    link_produto: item.link_produto || ''
  }));

  return [...itens, ...manuais];
}

export default function SolicitacaoCompraDetalheView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const navigateBack = useSafeNavigateBack('/solicitacoes-compra');
  const { user } = useAuth();
  const [solicitacao, setSolicitacao] = useState(null);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [salvandoQuantidadeId, setSalvandoQuantidadeId] = useState(null);
  const [modalApropriacaoItem, setModalApropriacaoItem] = useState(null);
  const [rateiosModal, setRateiosModal] = useState([]);
  const [motivoApropriacao, setMotivoApropriacao] = useState('');
  const [salvandoApropriacaoId, setSalvandoApropriacaoId] = useState(null);
  const [modalCancelamentoAberto, setModalCancelamentoAberto] = useState(false);
  const [cancelandoSolicitacao, setCancelandoSolicitacao] = useState(false);
  const [cancelamentoForm, setCancelamentoForm] = useState({
    motivo: '',
    cancelar_cotacao: true,
    cancelar_solicitacao_principal: false
  });

  async function carregar() {
    try {
      setLoading(true);
      const data = await obterSolicitacaoCompra(id);
      setSolicitacao(data || null);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar solicitacao de compra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  const obraIdSolicitacao = solicitacao?.obra_id || solicitacao?.obra?.id || '';

  useEffect(() => {
    async function carregarApropriacoes() {
      if (!obraIdSolicitacao) {
        setApropriacoes([]);
        return;
      }

      try {
        const data = await listarApropriacoes({ obra_id: obraIdSolicitacao });
        const lista = Array.isArray(data) ? data : [];
        setApropriacoes(lista.filter((item) => item?.ativo !== false));
      } catch (error) {
        console.error(error);
        setApropriacoes([]);
      }
    }

    carregarApropriacoes();
  }, [obraIdSolicitacao]);

  const itensCombinados = useMemo(() => {
    return combinarItensSolicitacaoCompra(solicitacao, apropriacoes);
  }, [apropriacoes, solicitacao]);

  const resumoCotacao = useMemo(() => {
    const fornecedores = Array.isArray(solicitacao?.fornecedores) ? solicitacao.fornecedores : [];
    return {
      total: fornecedores.length,
      respondidos: fornecedores.filter((item) => String(item.status || '').toUpperCase() === 'RESPONDIDO').length,
      visualizados: fornecedores.filter((item) => String(item.status || '').toUpperCase() === 'VISUALIZADO').length,
      enviados: fornecedores.filter((item) => String(item.status || '').toUpperCase() === 'ENVIADO').length
    };
  }, [solicitacao]);

  const podeEditarQuantidadeItem = canAlterarQuantidadeSolicitacaoCompra(user);
  const podeEditarApropriacoesItem =
    canEditarApropriacoesItemSolicitacaoCompra(user) || canEditarApropriacoesItemCompraDireta(user);

  const resumoRateiosModal = modalApropriacaoItem
    ? calcularResumoRateios({ ...modalApropriacaoItem, apropriacoes: rateiosModal })
    : null;

  async function handleAbrirPdf() {
    try {
      setBaixando(true);
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  function parseQuantidadeDigitada(value) {
    const texto = String(value || '').trim();
    if (!texto) return NaN;
    return Number(texto.replace(/\./g, '').replace(',', '.'));
  }

  async function handleEditarQuantidade(item) {
    if (!item?.id) {
      alert('Item sem identificador para edicao.');
      return;
    }

    const quantidadeTexto = window.prompt(
      `Informe a nova quantidade para ${item.nome}:`,
      String(item.quantidade ?? '').replace('.', ',')
    );
    if (quantidadeTexto === null) return;

    const quantidade = parseQuantidadeDigitada(quantidadeTexto);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      alert('Informe uma quantidade valida maior que zero.');
      return;
    }

    const motivo = window.prompt('Informe o motivo da alteracao da quantidade solicitada.');
    if (motivo === null) return;

    const motivoNormalizado = motivo.trim();
    if (!motivoNormalizado) {
      alert('Informe o motivo da alteracao.');
      return;
    }

    const loadingKey = `${item.item_tipo}-${item.id}`;
    try {
      setSalvandoQuantidadeId(loadingKey);
      const data = await atualizarQuantidadeItemSolicitacaoCompra(id, item.id, {
        item_tipo: item.item_tipo,
        quantidade,
        motivo: motivoNormalizado
      });
      setSolicitacao(data || null);
      const itemAtualizado = combinarItensSolicitacaoCompra(data, apropriacoes).find(
        (itemAtual) => itemAtual.item_tipo === item.item_tipo && Number(itemAtual.id) === Number(item.id)
      );
      abrirModalApropriacao(itemAtualizado || { ...item, quantidade });
      alert('Quantidade atualizada. Revise obrigatoriamente a apropriacao deste item antes de continuar.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar quantidade solicitada');
    } finally {
      setSalvandoQuantidadeId(null);
    }
  }

  function abrirModalApropriacao(item) {
    const rateios = normalizarRateiosEntrada(item);
    setModalApropriacaoItem(item);
    setRateiosModal(rateios.length ? rateios : [criarRateioBase(item?.quantidade)]);
    setMotivoApropriacao('');
  }

  function fecharModalApropriacao() {
    setModalApropriacaoItem(null);
    setRateiosModal([]);
    setMotivoApropriacao('');
    setSalvandoApropriacaoId(null);
  }

  function atualizarRateioModal(index, campo, valor) {
    setRateiosModal((atual) =>
      atual.map((rateio, rateioIndex) =>
        rateioIndex === index
          ? {
              ...rateio,
              [campo]: valor
            }
          : rateio
      )
    );
  }

  function adicionarRateioModal() {
    setRateiosModal((atual) => [...atual, criarRateioBase('')]);
  }

  function removerRateioModal(index) {
    setRateiosModal((atual) => atual.filter((_, rateioIndex) => rateioIndex !== index));
  }

  async function salvarApropriacoesItem() {
    if (!modalApropriacaoItem?.id) {
      alert('Item sem identificador para edicao.');
      return;
    }

    const itemComRateios = sincronizarItemComRateios({
      ...modalApropriacaoItem,
      apropriacoes: rateiosModal
    });
    const validacao = validarRateiosItem(itemComRateios);

    if (!validacao.ok) {
      alert(validacao.mensagem);
      return;
    }

    const motivo = motivoApropriacao.trim();
    if (!motivo) {
      alert('Informe o motivo da alteracao.');
      return;
    }

    const loadingKey = `${modalApropriacaoItem.item_tipo}-${modalApropriacaoItem.id}`;
    try {
      setSalvandoApropriacaoId(loadingKey);
      const data = await atualizarApropriacoesItemSolicitacaoCompra(id, modalApropriacaoItem.id, {
        item_tipo: modalApropriacaoItem.item_tipo,
        apropriacoes: normalizarRateiosEntrada(itemComRateios).map((rateio) => ({
          apropriacao_id: Number(rateio.apropriacao_id),
          quantidade_apropriada: parseQuantidade(rateio.quantidade_apropriada)
        })),
        motivo
      });
      setSolicitacao(data || null);
      fecharModalApropriacao();
      alert('Apropriacoes do item atualizadas com auditoria.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar apropriacoes do item');
    } finally {
      setSalvandoApropriacaoId(null);
    }
  }

  function abrirModalCancelamento() {
    setCancelamentoForm({
      motivo: '',
      cancelar_cotacao: true,
      cancelar_solicitacao_principal: false
    });
    setModalCancelamentoAberto(true);
  }

  function fecharModalCancelamento() {
    if (cancelandoSolicitacao) return;
    setModalCancelamentoAberto(false);
  }

  async function handleConfirmarCancelamentoSolicitacao() {
    const motivo = String(cancelamentoForm.motivo || '').trim();
    if (!motivo) {
      alert('Informe o motivo do cancelamento.');
      return;
    }

    try {
      setCancelandoSolicitacao(true);
      const data = await cancelarSolicitacaoCompra(id, {
        ...cancelamentoForm,
        motivo
      });
      setSolicitacao(data || null);
      setModalCancelamentoAberto(false);
      alert('Solicitacao de compra cancelada com historico.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cancelar solicitacao de compra');
    } finally {
      setCancelandoSolicitacao(false);
    }
  }

  if (loading) {
    return (
      <div className="page solicitacoes-page">
        <div className="app-empty-card sol-surface-card">Carregando...</div>
      </div>
    );
  }

  if (!solicitacao) {
    return (
      <div className="page solicitacoes-page">
        <div className="app-empty-card sol-surface-card">Solicitacao de compra nao encontrada.</div>
      </div>
    );
  }

  const statusSolicitacaoCompra = String(solicitacao.status || '').toUpperCase();
  const solicitacaoCompraCancelada = ['CANCELADA', 'CANCELADO', 'INATIVA'].includes(statusSolicitacaoCompra);
  const podeCancelarSolicitacaoCompra = canDeleteCompraSolicitacoes(user) && !solicitacaoCompraCancelada;

  return (
    <div className="page solicitacoes-page compra-detalhe-page">
      <div className="card sol-surface-card app-toolbar-card">
        <div className="app-page-header-row">
          <div>
            <h1 className="page-title">Detalhe da Solicitacao de Compra</h1>
            <p className="page-subtitle">
              SC-{String(solicitacao.id).padStart(5, '0')} - dados, itens e vinculos operacionais da solicitacao.
            </p>
          </div>
          <div className="app-page-actions">
            <button type="button" className="btn btn-outline" onClick={() => navigateBack('/solicitacoes-compra')}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(`/solicitacoes-compra/${id}/cotacao`)}
              disabled={solicitacaoCompraCancelada}
            >
              {solicitacaoCompraCancelada ? 'Cotacao cancelada' : 'Gerenciar cotacao'}
            </button>
            {podeCancelarSolicitacaoCompra && (
              <button type="button" className="btn btn-danger" onClick={abrirModalCancelamento}>
                Cancelar SC
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={handleAbrirPdf} disabled={baixando}>
              {baixando ? 'Abrindo PDF...' : 'Abrir PDF'}
            </button>
          </div>
        </div>

        <div className="compra-detalhe-summary-grid">
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Status</span>
            <strong>
              <span className={statusClass(solicitacao.status)}>{formatarStatus(solicitacao.status)}</span>
            </strong>
          </div>
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Obra</span>
            <strong>{solicitacao.obra?.nome || '-'}</strong>
            <small>{solicitacao.obra?.codigo || '-'}</small>
          </div>
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Solicitante</span>
            <strong>{solicitacao.solicitante?.nome || '-'}</strong>
          </div>
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Necessario para</span>
            <strong>{formatarData(solicitacao.necessario_para)}</strong>
          </div>
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Criada em</span>
            <strong>{formatarData(solicitacao.createdAt)}</strong>
          </div>
          <div className="compra-detalhe-summary-item">
            <span className="compra-detalhe-summary-label">Solicitacao principal</span>
            {solicitacao.solicitacaoPrincipal ? (
              <button
                type="button"
                className="compra-detalhe-link-button"
                onClick={() => navigate(`/solicitacoes/${solicitacao.solicitacaoPrincipal.id}`)}
              >
                {solicitacao.solicitacaoPrincipal.codigo || `ID ${solicitacao.solicitacaoPrincipal.id}`}
              </button>
            ) : (
              <strong>-</strong>
            )}
          </div>
          <div className="compra-detalhe-summary-item compra-detalhe-summary-wide">
            <span className="compra-detalhe-summary-label">Observacoes</span>
            <strong>{solicitacao.observacoes || '-'}</strong>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="card sol-surface-card compra-detalhe-itens-card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Itens</h2>
            <span className="text-sm text-[var(--c-muted)]">{itensCombinados.length} item(ns)</span>
          </div>
          <div className="app-table-shell compra-detalhe-itens-shell overflow-x-auto">
            <ResizableTable
              columns={itemTableColumns}
              storageKey="fluxy.solicitacao-compra-detalhe.itens.columns.v1"
              className="table compra-detalhe-itens-table"
            >
              <thead>
                <tr>
                  <ResizableTh columnKey="indice">#</ResizableTh>
                  <ResizableTh columnKey="tipo">Tipo</ResizableTh>
                  <ResizableTh columnKey="insumo">Insumo</ResizableTh>
                  <ResizableTh columnKey="unidade">Unidade</ResizableTh>
                  <ResizableTh columnKey="quantidade">Quantidade</ResizableTh>
                  <ResizableTh columnKey="especificacao">Especificacao</ResizableTh>
                  <ResizableTh columnKey="apropriacao">Apropriacao</ResizableTh>
                  <ResizableTh columnKey="necessario_para">Necessario para</ResizableTh>
                  <ResizableTh columnKey="link">Link</ResizableTh>
                </tr>
              </thead>
              <tbody>
                {itensCombinados.map((item, index) => {
                  const loadingKey = `${item.item_tipo}-${item.id}`;

                  return (
                  <tr key={loadingKey}>
                    <td>{index + 1}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.tipo === 'MANUAL' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.tipo}
                      </span>
                    </td>
                    <td className={item.tipo === 'MANUAL' ? 'font-semibold text-red-700' : ''}>{item.nome}</td>
                    <td>{item.unidade}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{item.quantidade}</span>
                        {podeEditarQuantidadeItem && !solicitacaoCompraCancelada && (
                          <button
                            type="button"
                            className="rounded-full border border-[var(--c-border)] px-2 py-1 text-xs font-semibold text-[var(--c-text)] hover:bg-[var(--c-surface-muted)]"
                            onClick={() => handleEditarQuantidade(item)}
                            disabled={salvandoQuantidadeId === loadingKey}
                          >
                            {salvandoQuantidadeId === loadingKey ? 'Salvando...' : 'Editar'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{item.especificacao}</td>
                    <td>
                      <div className="flex flex-col gap-2">
                        <span>{item.apropriacao}</span>
                        {podeEditarApropriacoesItem && !solicitacaoCompraCancelada && (
                          <button
                            type="button"
                            className="w-fit rounded-full border border-[var(--c-border)] px-2 py-1 text-xs font-semibold text-[var(--c-text)] hover:bg-[var(--c-surface-muted)]"
                            onClick={() => abrirModalApropriacao(item)}
                            disabled={salvandoApropriacaoId === loadingKey}
                          >
                            {salvandoApropriacaoId === loadingKey ? 'Salvando...' : 'Editar apropr.'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{formatarData(item.necessario_para)}</td>
                    <td>
                      {item.link_produto ? (
                        <a
                          className="compra-detalhe-link-cell"
                          href={item.link_produto}
                          target="_blank"
                          rel="noreferrer"
                          title={item.link_produto}
                        >
                          {item.link_produto}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </ResizableTable>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="card sol-surface-card">
            <div className="card-header">
              <h2 className="font-semibold">Cotacao</h2>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-muted)]">Fornecedores</div>
                  <div className="mt-1 text-xl font-semibold text-[var(--c-text)]">{resumoCotacao.total}</div>
                </div>
                <div className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-muted)]">Respondidos</div>
                  <div className="mt-1 text-xl font-semibold text-[var(--c-text)]">{resumoCotacao.respondidos}</div>
                </div>
              </div>
              <div className="text-xs text-[var(--c-muted)]">
                Enviados: {resumoCotacao.enviados} - Visualizados: {resumoCotacao.visualizados}
              </div>
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => navigate(`/solicitacoes-compra/${id}/cotacao`)}
                disabled={solicitacaoCompraCancelada}
              >
                {solicitacaoCompraCancelada ? 'Cotacao cancelada' : 'Abrir gestao da cotacao'}
              </button>
            </div>
          </div>

          <div className="card sol-surface-card compra-detalhe-support-card">
            <div className="card-header">
              <h2 className="font-semibold">Vinculos operacionais</h2>
            </div>
            <div className="grid gap-3 text-sm text-[var(--c-muted)]">
              <div className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em]">Solicitacao principal</div>
                <div className="mt-1 text-base font-semibold text-[var(--c-text)]">
                  {solicitacao.solicitacaoPrincipal?.codigo || '-'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--c-border)] px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em]">PDF e cotacao</div>
                <div className="mt-1">Use os botoes do cabecalho para abrir o PDF ou gerenciar a cotacao desta compra.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalApropriacaoItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-2xl bg-[var(--c-surface)] p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Editar apropriacoes do item</h2>
                <p className="text-sm text-[var(--c-muted)]">
                  {modalApropriacaoItem.nome} - quantidade total {formatarQuantidade(modalApropriacaoItem.quantidade)}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={fecharModalApropriacao}>
                Fechar
              </button>
            </div>

            <div className="grid gap-3">
              {rateiosModal.map((rateio, rateioIndex) => (
                <div key={`rateio-item-${rateioIndex}`} className="rounded-xl border border-[var(--c-border)] p-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_96px]">
                    <label className="grid gap-1 text-sm font-semibold text-[var(--c-text)]">
                      Apropriacao
                      <ApropriacaoAutocomplete
                        value={rateio.apropriacao_id}
                        options={apropriacoes}
                        onChange={(value) => atualizarRateioModal(rateioIndex, 'apropriacao_id', value)}
                        placeholder="Digite codigo ou descricao"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold text-[var(--c-text)]">
                      Quantidade
                      <input
                        className="input"
                        value={rateio.quantidade_apropriada}
                        onChange={(event) => atualizarRateioModal(rateioIndex, 'quantidade_apropriada', event.target.value)}
                        placeholder="Ex.: 10,5"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn btn-outline w-full justify-center"
                        onClick={() => removerRateioModal(rateioIndex)}
                        disabled={rateiosModal.length <= 1}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-outline w-fit" onClick={adicionarRateioModal}>
                Adicionar apropriacao
              </button>

              {resumoRateiosModal && (
                <div className={`rounded-xl border px-3 py-2 text-sm ${
                  resumoRateiosModal.fechado
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  Total: {formatarQuantidade(resumoRateiosModal.total)} | Distribuido: {formatarQuantidade(resumoRateiosModal.distribuido)} | Saldo: {formatarQuantidade(resumoRateiosModal.saldo)}
                </div>
              )}

              <label className="grid gap-1 text-sm font-semibold text-[var(--c-text)]">
                Motivo da alteracao
                <textarea
                  className="input min-h-24"
                  value={motivoApropriacao}
                  onChange={(event) => setMotivoApropriacao(event.target.value)}
                  placeholder="Explique por que a apropriacao do item foi alterada."
                />
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={fecharModalApropriacao}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={salvarApropriacoesItem}
                  disabled={Boolean(salvandoApropriacaoId)}
                >
                  {salvandoApropriacaoId ? 'Salvando...' : 'Salvar apropriacoes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalCancelamentoAberto && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--c-surface)] p-5 shadow-2xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Cancelar solicitacao de compra</h2>
                <p className="text-sm text-[var(--c-muted)]">
                  Esta acao registra historico e remove a compra dos fluxos operacionais em aberto.
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={fecharModalCancelamento} disabled={cancelandoSolicitacao}>
                Fechar
              </button>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-semibold text-[var(--c-text)]">
                Motivo do cancelamento *
                <textarea
                  className="input min-h-[110px]"
                  value={cancelamentoForm.motivo}
                  onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, motivo: event.target.value }))}
                  placeholder="Explique por que a solicitacao de compra esta sendo cancelada."
                  disabled={cancelandoSolicitacao}
                />
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-[var(--c-border)] p-3 text-sm text-[var(--c-text)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={cancelamentoForm.cancelar_cotacao}
                  onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, cancelar_cotacao: event.target.checked }))}
                  disabled={cancelandoSolicitacao}
                />
                <span>
                  <strong>Cancelar cotacao vinculada</strong>
                  <span className="mt-1 block text-[var(--c-muted)]">
                    Fornecedores e respostas ficam preservados para auditoria, mas a cotacao deixa de ficar ativa.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={cancelamentoForm.cancelar_solicitacao_principal}
                  onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, cancelar_solicitacao_principal: event.target.checked }))}
                  disabled={cancelandoSolicitacao}
                />
                <span>
                  <strong>Tambem cancelar a solicitacao principal</strong>
                  <span className="mt-1 block">
                    O sistema bloqueia esta opcao se ja existir titulo financeiro vinculado.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] pt-4">
                <button type="button" className="btn btn-outline" onClick={fecharModalCancelamento} disabled={cancelandoSolicitacao}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={handleConfirmarCancelamentoSolicitacao} disabled={cancelandoSolicitacao}>
                  {cancelandoSolicitacao ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {Array.isArray(solicitacao.fornecedores) && solicitacao.fornecedores.length > 0 && (
        <div className="mt-4 card sol-surface-card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Fornecedores vinculados</h2>
            <span className="text-sm text-[var(--c-muted)]">{solicitacao.fornecedores.length} cotacao(oes)</span>
          </div>
          <div className="app-table-shell compras-responsive-table">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Status</th>
                  <th>Enviado em</th>
                  <th>Respondido em</th>
                  <th>Prazo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {solicitacao.fornecedores.map((cotacao) => (
                  <tr key={cotacao.id}>
                    <td className="font-medium">{cotacao.fornecedor?.nome || '-'}</td>
                    <td><span className={statusCotacaoClass(cotacao.status)}>{formatarStatus(cotacao.status)}</span></td>
                    <td>{formatarData(cotacao.enviado_em)}</td>
                    <td>{formatarData(cotacao.respondido_em)}</td>
                    <td>{formatarData(cotacao.prazo_resposta)}</td>
                    <td className="text-right">
                      <button type="button" className="btn btn-xs btn-outline" onClick={() => navigate(`/solicitacoes-compra/${id}/cotacao`)}>
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
