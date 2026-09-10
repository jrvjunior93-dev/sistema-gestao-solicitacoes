import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ApropriacaoAutocomplete from '../../../components/ui/ApropriacaoAutocomplete';
import Alert from '../../../components/ui/Alert';
import OverlayModal from '../../../components/ui/OverlayModal';
import StatusBadge from '../../../components/StatusBadge';
import { useAuth } from '../../../contexts/AuthContext';
import { listarApropriacoes } from '../../../services/apropriacoes';
import {
  atualizarApropriacoesItemSolicitacaoCompra,
  atualizarQuantidadeItemSolicitacaoCompra,
  baixarPdfSolicitacaoCompra,
  cancelarSolicitacaoCompra,
  cadastrarUnidadeItemSolicitacaoCompra,
  encaminharSolicitacaoCompraParaCompras,
  obterSolicitacaoCompra
} from '../../../services/compras';
import {
  canAlterarQuantidadeSolicitacaoCompra,
  canCatalogarItensManuaisCompras,
  canDeleteCompraSolicitacoes,
  canEditarApropriacoesItemCompraDireta,
  canEditarApropriacoesItemSolicitacaoCompra,
  canEncaminharCompraSolicitacoes,
  isBusinessAdmin
} from '../../../utils/acessoProduto';
import { useSafeNavigateBack } from '../../../utils/navigation';
import { userHasSetorCapability } from '../../../utils/setor';
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
import ItemCompraDetalhe, { statusCatalogacao } from '../components/ItemCompraDetalhe';
import {
  Avisos,
  BlocoConteudo,
  CamposComVazios,
  CampoForm,
  CelulaDupla,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';

function formatarData(data) {
  if (!data) return '-';
  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? '-' : valor.toLocaleDateString('pt-BR');
}

function normalizarStatusCompra(status) {
  return String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function estaAguardandoRevisaoGeo(status) {
  return ['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(normalizarStatusCompra(status));
}

function formatarStatus(status) {
  return String(status || '-').replace(/_/g, ' ').toUpperCase();
}

function combinarItensSolicitacaoCompra(solicitacao, apropriacoes = []) {
  const itens = (solicitacao?.itens || []).map((item) => ({
    id: item.id,
    item_tipo: 'CADASTRADO',
    tipo: 'CADASTRADO',
    nome: item.insumo?.nome || '-',
    unidade: item.unidade_sigla_manual || item.unidade?.sigla || item.unidade?.nome || '-',
    unidade_id: item.unidade_id || item.unidade?.id || null,
    unidade_sigla_manual: item.unidade_sigla_manual || '',
    quantidade: item.quantidade,
    especificacao: item.especificacao || '-',
    apropriacao_id: item.apropriacao_id || '',
    apropriacao: montarLinhasResumoApropriacao(item, apropriacoes).join(' | ')
      || item.apropriacao?.descricao
      || item.apropriacao?.nome
      || item.apropriacao?.codigo
      || '-',
    apropriacoes: Array.isArray(item.apropriacoes) ? item.apropriacoes : [],
    apropriacao_linhas: item.apropriacao_linhas || [],
    necessario_para: item.necessario_para,
    necessario_para_formatado: formatarData(item.necessario_para),
    link_produto: item.link_produto || '',
    arquivo_url: item.arquivo_url || '',
    arquivo_nome_original: item.arquivo_nome_original || ''
  }));

  const manuais = (solicitacao?.itensManuais || []).map((item) => {
    const insumoOficial = item.insumoCatalogado || null;
    return {
      id: item.id,
      item_tipo: 'MANUAL',
      tipo: 'MANUAL',
      nome: insumoOficial?.nome || item.nome_manual || '-',
      unidade: insumoOficial?.unidade?.sigla
        || insumoOficial?.unidade?.nome
        || insumoOficial?.unidade_manual
        || item.unidade_sigla_manual
        || '-',
      quantidade: item.quantidade,
      especificacao: insumoOficial?.descricao || item.especificacao || '-',
      nome_original: item.nome_manual || '-',
      especificacao_original: item.especificacao || '-',
      apropriacao_id: item.apropriacao_id || '',
      apropriacao: montarLinhasResumoApropriacao(item, apropriacoes).join(' | ')
        || item.apropriacao?.descricao
        || item.apropriacao?.nome
        || item.apropriacao?.codigo
        || '-',
      apropriacoes: Array.isArray(item.apropriacoes) ? item.apropriacoes : [],
      apropriacao_linhas: item.apropriacao_linhas || [],
      necessario_para: item.necessario_para,
      necessario_para_formatado: formatarData(item.necessario_para),
      link_produto: item.link_produto || '',
      arquivo_url: item.arquivo_url || '',
      arquivo_nome_original: item.arquivo_nome_original || '',
      insumo_catalogado_id: item.insumo_catalogado_id || null,
      insumoCatalogado: insumoOficial,
      catalogador: item.catalogador || null,
      catalogado_em: item.catalogado_em || null,
      catalogacao_tipo: item.catalogacao_tipo || null
    };
  });

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
  const [cadastrandoUnidadeId, setCadastrandoUnidadeId] = useState(null);
  /*
    A EDIÇÃO DE QUANTIDADE VIROU FORMULÁRIO (05/09).

    Eram DOIS `window.prompt` encadeados: um pedia a quantidade, o outro o
    motivo. O motivo vai para a trilha de auditoria da solicitação — e
    justificativa que entra em registro não se digita numa caixa do Chrome,
    que não tem rótulo, não valida, não diz o que vai acontecer e some sem
    deixar rastro no DOM (R19).

    O `useConfirmacao` resolve o caso de UM campo; aqui são dois (quantidade
    e motivo) e o segundo depende do primeiro estar válido, então o passo é
    um formulário no modal do sistema. O item é fixado no estado ao abrir e
    lido dali na gravação — nunca relido da lista depois do `await` (R26).
  */
  const [modalQuantidadeItem, setModalQuantidadeItem] = useState(null);
  const [quantidadeForm, setQuantidadeForm] = useState({ quantidade: '', motivo: '' });
  const [modalApropriacaoItem, setModalApropriacaoItem] = useState(null);
  const [rateiosModal, setRateiosModal] = useState([]);
  const [motivoApropriacao, setMotivoApropriacao] = useState('');
  const [salvandoApropriacaoId, setSalvandoApropriacaoId] = useState(null);
  const [modalCancelamentoAberto, setModalCancelamentoAberto] = useState(false);
  const [cancelandoSolicitacao, setCancelandoSolicitacao] = useState(false);
  const [encaminhandoCompras, setEncaminhandoCompras] = useState(false);
  const [cancelamentoForm, setCancelamentoForm] = useState({
    motivo: '',
    cancelar_cotacao: true,
    cancelar_solicitacao_principal: false
  });
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function carregar() {
    try {
      setLoading(true);
      const data = await obterSolicitacaoCompra(id);
      setSolicitacao(data || null);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar solicitacao de compra');
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
        setApropriacoes(lista.filter((item) => item?.ativo !== false && item?.somadora !== true));
      } catch (error) {
        console.error(error);
        setApropriacoes([]);
      }
    }

    carregarApropriacoes();
  }, [obraIdSolicitacao]);

  const itensCombinados = useMemo(() => {
    // `posicao` guarda o "#" que a coluna de índice mostrava: a TabelaPadrao
    // renderiza por item (sem índice), então a ordem vira dado da linha.
    return combinarItensSolicitacaoCompra(solicitacao, apropriacoes)
      .map((item, indice) => ({ ...item, posicao: indice + 1 }));
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

  const aguardandoRevisaoGeo = estaAguardandoRevisaoGeo(solicitacao?.status);
  const usuarioEhGeo = userHasSetorCapability(user, 'eh_setor_geo');
  const usuarioEhCompras = userHasSetorCapability(user, 'eh_setor_compras');
  const edicaoGeoPermitidaNoEstagio = !usuarioEhGeo || usuarioEhCompras || aguardandoRevisaoGeo;
  const podeEditarQuantidadeItem = canAlterarQuantidadeSolicitacaoCompra(user) && edicaoGeoPermitidaNoEstagio;
  const podeCadastrarUnidadeItem = podeEditarQuantidadeItem;
  const podeEditarApropriacoesItem =
    (canEditarApropriacoesItemSolicitacaoCompra(user) || canEditarApropriacoesItemCompraDireta(user))
    && edicaoGeoPermitidaNoEstagio;
  const podeCatalogarItensManuais = canCatalogarItensManuaisCompras(user);
  const podeEncaminharCompras = (
    canEncaminharCompraSolicitacoes(user)
    && aguardandoRevisaoGeo
    && (usuarioEhGeo || isBusinessAdmin(user))
  );

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
      avisar.erro(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  async function handleCadastrarUnidadeItem(item) {
    const unidadeLivre = String(item?.unidade_sigla_manual || '').trim();
    if (!unidadeLivre) return;

    const { ok } = await confirmar({
      titulo: 'Cadastrar unidade de medida',
      mensagem: `Cadastrar "${unidadeLivre}" no catálogo de unidades e vinculá-la somente a este item? A unidade padrão do insumo não será alterada.`,
      rotuloConfirmar: 'Cadastrar UN'
    });
    if (!ok) return;

    const loadingKey = `${item.item_tipo}-${item.id}`;
    try {
      setCadastrandoUnidadeId(loadingKey);
      const data = await cadastrarUnidadeItemSolicitacaoCompra(id, item.id);
      setSolicitacao(data || null);
      avisar.sucesso(`UN ${unidadeLivre} cadastrada e vinculada ao item.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cadastrar a unidade informada no item');
    } finally {
      setCadastrandoUnidadeId(null);
    }
  }

  async function handleEncaminharCompras() {
    const { ok } = await confirmar({
      titulo: 'Enviar para Compras',
      mensagem: 'Concluir a revisão GEO e enviar esta solicitação para o setor de Compras?',
      rotuloConfirmar: 'Enviar para Compras',
      rotuloCancelar: 'Continuar revisando'
    });
    if (!ok) return;

    try {
      setEncaminhandoCompras(true);
      const data = await encaminharSolicitacaoCompraParaCompras(id);
      setSolicitacao(data || null);
      avisar.sucesso('Solicitação revisada e enviada para o setor de Compras.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar solicitacao para Compras');
    } finally {
      setEncaminhandoCompras(false);
    }
  }

  function parseQuantidadeDigitada(value) {
    const texto = String(value || '').trim();
    if (!texto) return NaN;
    return Number(texto.replace(/\./g, '').replace(',', '.'));
  }

  function abrirModalQuantidade(item) {
    if (!item?.id) {
      avisar.erro('Item sem identificador para edição.');
      return;
    }
    setModalQuantidadeItem(item);
    setQuantidadeForm({
      quantidade: String(item.quantidade ?? '').replace('.', ','),
      motivo: ''
    });
  }

  function fecharModalQuantidade() {
    if (salvandoQuantidadeId) return;
    setModalQuantidadeItem(null);
    setQuantidadeForm({ quantidade: '', motivo: '' });
  }

  async function salvarQuantidadeItem() {
    // R26: o item é fixado ANTES de qualquer await. O modal do sistema não
    // congela a tela, e reler `modalQuantidadeItem` depois da gravação
    // poderia atualizar um item diferente daquele que a pessoa viu.
    const item = modalQuantidadeItem;
    if (!item?.id) return;

    const quantidade = parseQuantidadeDigitada(quantidadeForm.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      avisar.alerta('Informe uma quantidade valida maior que zero.');
      return;
    }

    const motivoNormalizado = String(quantidadeForm.motivo || '').trim();
    if (!motivoNormalizado) {
      avisar.alerta('Informe o motivo da alteração.');
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
      setModalQuantidadeItem(null);
      setQuantidadeForm({ quantidade: '', motivo: '' });
      abrirModalApropriacao(itemAtualizado || { ...item, quantidade });
      avisar.sucesso('Quantidade atualizada. Revise obrigatoriamente a apropriação deste item antes de continuar.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao atualizar quantidade solicitada');
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
    // R26: mesma disciplina da quantidade — alvo fixado antes do await.
    const alvo = modalApropriacaoItem;
    if (!alvo?.id) {
      avisar.erro('Item sem identificador para edição.');
      return;
    }

    const itemComRateios = sincronizarItemComRateios({
      ...alvo,
      apropriacoes: rateiosModal
    });
    const validacao = validarRateiosItem(itemComRateios);

    if (!validacao.ok) {
      avisar.alerta(validacao.mensagem);
      return;
    }

    const motivo = motivoApropriacao.trim();
    if (!motivo) {
      avisar.alerta('Informe o motivo da alteração.');
      return;
    }

    const loadingKey = `${alvo.item_tipo}-${alvo.id}`;
    try {
      setSalvandoApropriacaoId(loadingKey);
      const data = await atualizarApropriacoesItemSolicitacaoCompra(id, alvo.id, {
        item_tipo: alvo.item_tipo,
        apropriacoes: normalizarRateiosEntrada(itemComRateios).map((rateio) => ({
          apropriacao_id: Number(rateio.apropriacao_id),
          quantidade_apropriada: parseQuantidade(rateio.quantidade_apropriada)
        })),
        motivo
      });
      setSolicitacao(data || null);
      fecharModalApropriacao();
      avisar.sucesso('Apropriações do item atualizadas com auditoria.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao atualizar apropriacoes do item');
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
    // R26: o recorte do cancelamento (motivo + as duas marcas) é fixado
    // numa const ANTES do await; nada é relido do estado depois.
    const pedido = {
      ...cancelamentoForm,
      motivo: String(cancelamentoForm.motivo || '').trim()
    };
    if (!pedido.motivo) {
      avisar.alerta('Informe o motivo do cancelamento.');
      return;
    }

    try {
      setCancelandoSolicitacao(true);
      const data = await cancelarSolicitacaoCompra(id, pedido);
      setSolicitacao(data || null);
      setModalCancelamentoAberto(false);
      avisar.sucesso('Solicitação de compra cancelada com histórico.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cancelar solicitacao de compra');
    } finally {
      setCancelandoSolicitacao(false);
    }
  }

  if (loading) {
    return (
      <Pagina className="compra-detalhe-page">
        <BlocoConteudo>Carregando...</BlocoConteudo>
      </Pagina>
    );
  }

  if (!solicitacao) {
    return (
      <Pagina className="compra-detalhe-page">
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo>Solicitação de compra não encontrada.</BlocoConteudo>
      </Pagina>
    );
  }

  const statusSolicitacaoCompra = String(solicitacao.status || '').toUpperCase();
  const solicitacaoCompraCancelada = ['CANCELADA', 'CANCELADO', 'INATIVA'].includes(statusSolicitacaoCompra);
  const podeCancelarSolicitacaoCompra = canDeleteCompraSolicitacoes(user) && !solicitacaoCompraCancelada;
  const codigoSolicitacao = `SC-${String(solicitacao.id).padStart(5, '0')}`;
  const cotacaoBloqueada = solicitacaoCompraCancelada || aguardandoRevisaoGeo;
  const rotuloCotacao = solicitacaoCompraCancelada
    ? 'Cotacao cancelada'
    : aguardandoRevisaoGeo
      ? 'Cotacao apos revisao GEO'
      : 'Gerenciar cotacao';

  const acaoPdf = {
    rotulo: baixando ? 'Abrindo PDF...' : 'Abrir PDF',
    onClick: handleAbrirPdf,
    desabilitada: baixando
  };
  const acaoCotacao = {
    rotulo: rotuloCotacao,
    onClick: () => navigate(`/solicitacoes-compra/${id}/cotacao`),
    desabilitada: cotacaoBloqueada
  };
  const acaoEncaminhar = {
    rotulo: encaminhandoCompras ? 'Enviando...' : 'Enviar para Compras',
    onClick: handleEncaminharCompras,
    desabilitada: encaminhandoCompras
  };

  return (
    <Pagina className="compra-detalhe-page">
      <Avisos avisos={avisos} aoFechar={fechar} />
      {/*
        C5: UM primário sólido. Quando a revisão GEO pode ser concluída, o
        que a tela existe para fazer é ENVIAR PARA COMPRAS — o PDF desce
        para secundária. Fora desse estágio o primário é abrir o PDF.
        Antes os dois eram `btn btn-primary` lado a lado.
      */}
      <PageHeader
        titulo={`Solicitação ${codigoSolicitacao}`}
        contagem={`${itensCombinados.length} item(ns)`}
        descricao={[solicitacao.obra?.nome, solicitacao.solicitante?.nome].filter(Boolean).join(' · ')
          || 'Dados, itens e vinculos operacionais da solicitacao.'}
        voltar={{ onClick: () => navigateBack('/solicitacoes-compra'), title: 'Voltar para solicitacoes de compra' }}
        acaoPrincipal={podeEncaminharCompras ? acaoEncaminhar : acaoPdf}
        secundarias={podeEncaminharCompras ? [acaoCotacao, acaoPdf] : [acaoCotacao]}
        destrutiva={podeCancelarSolicitacaoCompra ? {
          rotulo: 'Cancelar SC',
          onClick: abrirModalCancelamento
        } : undefined}
      />

      {/*
        CONDIÇÃO DERIVADA DO CONTEÚDO, não evento: ela descreve o estágio em
        que a solicitação está e continua verdadeira depois de fechada. Por
        isso NÃO passa pelo `useAvisos` (que é para evento) e fica como
        faixa fixa no fluxo, com o tom semântico do sistema — a versão
        anterior pintava a mesma faixa com paleta crua (amber-50/300/900),
        que não tem par no tema escuro (R25).
      */}
      {aguardandoRevisaoGeo && (
        <Alert
          type="warning"
          title="Aguardando revisão do GEO."
          message="Usuarios autorizados podem conferir quantidades e apropriacoes. A cotacao sera liberada somente depois do envio para Compras."
        />
      )}

      <BlocoConteudo variante="secundario" titulo="Dados da solicitação">
        <CamposComVazios
          colunas={4}
          campos={[
            {
              label: 'Status',
              valor: <StatusBadge status={formatarStatus(solicitacao.status)} setor="COMPRAS" />
            },
            { label: 'Obra', valor: solicitacao.obra?.nome, sub: solicitacao.obra?.codigo },
            { label: 'Solicitante', valor: solicitacao.solicitante?.nome },
            { label: 'Necessario para', valor: formatarData(solicitacao.necessario_para) },
            { label: 'Criada em', valor: formatarData(solicitacao.createdAt) },
            {
              /*
                O link para o registro relacionado mora NO CORPO, junto do
                dado que o origina — nunca na barra de ações (decisão de
                04/09 sobre onde a navegação mora).
              */
              label: 'Solicitação principal',
              valor: solicitacao.solicitacaoPrincipal ? (
                <button
                  type="button"
                  className="compra-detalhe-link-button"
                  onClick={() => navigate(`/solicitacoes/${solicitacao.solicitacaoPrincipal.id}`)}
                >
                  {solicitacao.solicitacaoPrincipal.codigo || `ID ${solicitacao.solicitacaoPrincipal.id}`}
                </button>
              ) : null
            },
            { label: 'Observações', valor: solicitacao.observacoes, span: 2 }
          ]}
        />
      </BlocoConteudo>

      {/*
        O bloco PRIMÁRIO é o dos itens: é o que a pessoa vem conferir nesta
        tela (quantidade, apropriação, cadastro pendente).
      */}
      <BlocoConteudo variante="primario" cor="var(--sem-info)" titulo="Itens">
        <TabelaPadrao
          colunas={[
            {
              id: 'posicao',
              titulo: '#',
              tipo: 'numero',
              render: (item) => (
                <span className="compra-item-index">{String(item.posicao).padStart(2, '0')}</span>
              )
            },
            {
              id: 'origem',
              titulo: 'Origem',
              tipo: 'badge',
              render: (item) => (
                <span className={`compra-item-origin ${item.tipo === 'MANUAL' ? 'is-manual' : ''}`}>{item.tipo}</span>
              )
            },
            {
              id: 'item',
              titulo: 'Item',
              // R17: o nome do insumo é o que nomeia a linha.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla
                  principal={item.nome}
                  sub={item.especificacao || 'Sem especificacao adicional'}
                />
              )
            },
            {
              id: 'quantidade',
              titulo: 'Quantidade',
              tipo: 'numero',
              render: (item) => <CelulaDupla principal={item.quantidade} sub={item.unidade} />
            },
            {
              id: 'apropriacao',
              titulo: 'Apropriação',
              tipo: 'texto',
              render: (item) => item.apropriacao
            },
            {
              id: 'necessario_para',
              titulo: 'Necessario para',
              tipo: 'data',
              render: (item) => item.necessario_para_formatado
            },
            {
              id: 'cadastro',
              titulo: 'Cadastro',
              tipo: 'badge',
              render: (item) => {
                const status = statusCatalogacao(item);
                return <span className={`compra-item-catalog-status ${status.className}`}>{status.label}</span>;
              }
            }
          ]}
          itens={itensCombinados}
          getId={(item) => `${item.item_tipo}-${item.id}`}
          storageKey="tabela:solicitacao-compra-detalhe:itens"
          rotuloRolagem="Itens da solicitacao de compra"
          vazio="Nenhum item informado nesta solicitação."
          linhaExpansivel={(item) => {
            const loadingKey = `${item.item_tipo}-${item.id}`;
            return (
              <ItemCompraDetalhe
                item={item}
                solicitacaoId={id}
                podeEditarQuantidade={podeEditarQuantidadeItem}
                podeEditarApropriacao={podeEditarApropriacoesItem}
                podeCatalogar={podeCatalogarItensManuais}
                podeCadastrarUnidade={podeCadastrarUnidadeItem}
                bloqueado={solicitacaoCompraCancelada}
                cadastrandoUnidade={cadastrandoUnidadeId === loadingKey}
                salvandoQuantidade={salvandoQuantidadeId === loadingKey}
                salvandoApropriacao={salvandoApropriacaoId === loadingKey}
                onEditarQuantidade={abrirModalQuantidade}
                onEditarApropriacao={abrirModalApropriacao}
                onCadastrarUnidade={handleCadastrarUnidadeItem}
                onCatalogado={carregar}
              />
            );
          }}
        />
      </BlocoConteudo>

      <BlocoConteudo variante="secundario" titulo="Cotação">
        <StatGrid colunas={4}>
          <StatTile label="Fornecedores" valor={resumoCotacao.total} />
          <StatTile label="Respondidos" valor={resumoCotacao.respondidos} tom="success" />
          <StatTile label="Enviados" valor={resumoCotacao.enviados} />
          <StatTile label="Visualizados" valor={resumoCotacao.visualizados} />
        </StatGrid>
        <div className="app-actionbar mt-4">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(`/solicitacoes-compra/${id}/cotacao`)}
            disabled={cotacaoBloqueada}
          >
            {solicitacaoCompraCancelada
              ? 'Cotacao cancelada'
              : aguardandoRevisaoGeo
                ? 'Aguardando envio para Compras'
                : 'Abrir gestao da cotacao'}
          </button>
        </div>
      </BlocoConteudo>

      <BlocoConteudo variante="secundario" titulo="Vínculos operacionais" recolhivel recolhidoPadrao>
        <StatGrid colunas={2}>
          <StatTile
            label="Solicitação principal"
            valor={solicitacao.solicitacaoPrincipal?.codigo}
            vazio={!solicitacao.solicitacaoPrincipal?.codigo}
          />
          <StatTile
            label="PDF e cotação"
            valor="No cabecalho da tela"
            sub="Use os botoes do cabeçalho para abrir o PDF ou gerenciar a cotação desta compra."
          />
        </StatGrid>
      </BlocoConteudo>

      {Array.isArray(solicitacao.fornecedores) && solicitacao.fornecedores.length > 0 && (
        <BlocoConteudo
          variante="secundario"
          titulo="Fornecedores vinculados"
          contagem={`${solicitacao.fornecedores.length} cotação(oes)`}
        >
          <TabelaPadrao
            colunas={[
              {
                id: 'fornecedor',
                titulo: 'Fornecedor',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (cotacao) => cotacao.fornecedor?.nome || '-'
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (cotacao) => <StatusBadge status={formatarStatus(cotacao.status)} setor="COMPRAS" />
              },
              {
                id: 'enviado_em',
                titulo: 'Enviado em',
                tipo: 'data',
                render: (cotacao) => formatarData(cotacao.enviado_em)
              },
              {
                id: 'respondido_em',
                titulo: 'Respondido em',
                tipo: 'data',
                render: (cotacao) => formatarData(cotacao.respondido_em)
              },
              {
                id: 'prazo',
                titulo: 'Prazo',
                tipo: 'data',
                render: (cotacao) => formatarData(cotacao.prazo_resposta)
              }
            ]}
            itens={solicitacao.fornecedores}
            vazio="Nenhum fornecedor vinculado."
            storageKey="tabela:solicitacao-compra-detalhe:fornecedores"
            rotuloRolagem="Fornecedores vinculados"
            acoesLinha={() => (
              <button type="button" className="btn btn-outline" onClick={() => navigate(`/solicitacoes-compra/${id}/cotacao`)}>
                Gerenciar
              </button>
            )}
            larguraAcoes={160}
          />
        </BlocoConteudo>
      )}

      {modalQuantidadeItem && (
        <OverlayModal
          rotulo="Editar quantidade solicitada"
          largura="var(--modal-max-w-md, 640px)"
          onFechar={fecharModalQuantidade}
        >
          <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
            <h2 className="app-bloco-titulo">Editar quantidade solicitada</h2>
            <p className="text-sm text-[var(--c-muted)]">
              {modalQuantidadeItem.nome} — quantidade atual {formatarQuantidade(modalQuantidadeItem.quantidade)} {modalQuantidadeItem.unidade}
            </p>
          </div>

          <div className="grid gap-3 p-4">
            <FormSecao colunas={2}>
              <CampoForm label="Nova quantidade" obrigatorio hint="Use virgula para decimais (ex.: 10,5).">
                <input
                  className="input"
                  value={quantidadeForm.quantidade}
                  onChange={(event) => setQuantidadeForm((atual) => ({ ...atual, quantidade: event.target.value }))}
                  placeholder="Ex.: 10,5"
                  disabled={Boolean(salvandoQuantidadeId)}
                  autoFocus
                />
              </CampoForm>
              <CampoForm
                label="Motivo da alteração"
                obrigatorio
                tipo="observacao"
                hint="O motivo vai para a trilha de auditoria da solicitacao."
              >
                <textarea
                  className="input"
                  value={quantidadeForm.motivo}
                  onChange={(event) => setQuantidadeForm((atual) => ({ ...atual, motivo: event.target.value }))}
                  placeholder="Explique por que a quantidade solicitada esta sendo alterada."
                  disabled={Boolean(salvandoQuantidadeId)}
                />
              </CampoForm>
            </FormSecao>
            <p className="text-sm text-[var(--c-muted)]">
              Ao salvar, a apropriação deste item abre em seguida para revisão obrigatória.
            </p>
          </div>

          <div data-modal="rodape" className="border-t border-[var(--c-border)] p-4">
            <div className="app-actionbar">
              <button
                type="button"
                className="btn btn-outline"
                onClick={fecharModalQuantidade}
                disabled={Boolean(salvandoQuantidadeId)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={salvarQuantidadeItem}
                disabled={Boolean(salvandoQuantidadeId)}
              >
                {salvandoQuantidadeId ? 'Salvando quantidade...' : 'Salvar quantidade'}
              </button>
            </div>
          </div>
        </OverlayModal>
      )}

      {modalApropriacaoItem && (
        <OverlayModal
          rotulo="Editar apropriações do item"
          largura="var(--modal-max-w-xl, 980px)"
          onFechar={fecharModalApropriacao}
        >
          <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
            <h2 className="app-bloco-titulo">Editar apropriações do item</h2>
            <p className="text-sm text-[var(--c-muted)]">
              {modalApropriacaoItem.nome} - quantidade total {formatarQuantidade(modalApropriacaoItem.quantidade)}
            </p>
          </div>

          <div className="grid gap-3 p-4">
            {rateiosModal.map((rateio, rateioIndex) => (
              <div key={`rateio-item-${rateioIndex}`} className="rounded-xl border border-[var(--c-border)] p-3">
                <FormSecao colunas={3}>
                  <CampoForm label="Apropriação" span={2}>
                    <ApropriacaoAutocomplete
                      value={rateio.apropriacao_id}
                      options={apropriacoes}
                      onChange={(value) => atualizarRateioModal(rateioIndex, 'apropriacao_id', value)}
                      placeholder="Digite código ou descrição"
                    />
                  </CampoForm>
                  <CampoForm label="Quantidade">
                    <input
                      className="input"
                      value={rateio.quantidade_apropriada}
                      onChange={(event) => atualizarRateioModal(rateioIndex, 'quantidade_apropriada', event.target.value)}
                      placeholder="Ex.: 10,5"
                    />
                  </CampoForm>
                </FormSecao>
                <div className="app-actionbar">
                  <button
                    type="button"
                    className="btn btn-outline btn-perigo-suave"
                    onClick={() => removerRateioModal(rateioIndex)}
                    disabled={rateiosModal.length <= 1}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}

            <div className="app-actionbar">
              <button type="button" className="btn btn-outline" onClick={adicionarRateioModal}>
                Adicionar apropriação
              </button>
            </div>

            {/*
              O saldo do rateio é CONDIÇÃO (fecha ou não fecha), não evento:
              fica ao lado do que descreve, com o tom semântico do sistema.
            */}
            {resumoRateiosModal && (
              <Alert
                type={resumoRateiosModal.fechado ? 'success' : 'warning'}
                message={`Total: ${formatarQuantidade(resumoRateiosModal.total)} | Distribuido: ${formatarQuantidade(resumoRateiosModal.distribuido)} | Saldo: ${formatarQuantidade(resumoRateiosModal.saldo)}`}
              />
            )}

            <FormSecao colunas={2}>
              <CampoForm
                label="Motivo da alteração"
                obrigatorio
                tipo="observacao"
                hint="O motivo vai para a trilha de auditoria da apropriacao."
              >
                <textarea
                  className="input"
                  value={motivoApropriacao}
                  onChange={(event) => setMotivoApropriacao(event.target.value)}
                  placeholder="Explique por que a apropriação do item foi alterada."
                />
              </CampoForm>
            </FormSecao>
          </div>

          <div data-modal="rodape" className="border-t border-[var(--c-border)] p-4">
            <div className="app-actionbar">
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
        </OverlayModal>
      )}

      {modalCancelamentoAberto && (
        <OverlayModal
          rotulo="Cancelar solicitação de compra"
          largura="var(--modal-max-w-lg, 860px)"
          onFechar={fecharModalCancelamento}
        >
          <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
            <h2 className="app-bloco-titulo">Cancelar solicitação de compra</h2>
            <p className="text-sm text-[var(--c-muted)]">
              Esta ação registra histórico e remove a compra dos fluxos operacionais em aberto.
            </p>
          </div>

          <div className="grid gap-4 p-4">
            <FormSecao colunas={2}>
              <CampoForm label="Motivo do cancelamento" obrigatorio tipo="observacao">
                <textarea
                  className="input"
                  value={cancelamentoForm.motivo}
                  onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, motivo: event.target.value }))}
                  placeholder="Explique por que a solicitação de compra esta sendo cancelada."
                  disabled={cancelandoSolicitacao}
                />
              </CampoForm>
            </FormSecao>

            <label className="flex items-start gap-3 rounded-xl border border-[var(--c-border)] p-3 text-sm text-[var(--c-text)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={cancelamentoForm.cancelar_cotacao}
                onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, cancelar_cotacao: event.target.checked }))}
                disabled={cancelandoSolicitacao}
              />
              <span>
                <strong>Cancelar cotação vinculada</strong>
                <span className="mt-1 block text-[var(--c-muted)]">
                  Fornecedores e respostas ficam preservados para auditoria, mas a cotação deixa de ficar ativa.
                </span>
              </span>
            </label>

            {/*
              A segunda marca é a que tem alcance fora desta tela (cancela a
              solicitação principal). O destaque dela era paleta crua
              (amber-50/200/900); agora é o `Alert` semântico do sistema, com
              a marca dentro dele.
            */}
            <label
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
              style={{
                borderColor: 'var(--sem-warning-border)',
                background: 'var(--sem-warning-bg)',
                color: 'var(--sem-warning)'
              }}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={cancelamentoForm.cancelar_solicitacao_principal}
                onChange={(event) => setCancelamentoForm((prev) => ({ ...prev, cancelar_solicitacao_principal: event.target.checked }))}
                disabled={cancelandoSolicitacao}
              />
              <span>
                <strong>Também cancelar a solicitação principal</strong>
                <span className="mt-1 block">
                  O sistema bloqueia esta opção se já existir título financeiro vinculado.
                </span>
              </span>
            </label>
          </div>

          <div data-modal="rodape" className="border-t border-[var(--c-border)] p-4">
            <div className="app-actionbar">
              <button type="button" className="btn btn-outline" onClick={fecharModalCancelamento} disabled={cancelandoSolicitacao}>
                Cancelar
              </button>
              <span className="app-actionbar-apartada">
                <button
                  type="button"
                  className="btn btn-outline btn-perigo-suave"
                  onClick={handleConfirmarCancelamentoSolicitacao}
                  disabled={cancelandoSolicitacao}
                >
                  {cancelandoSolicitacao ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </span>
            </div>
          </div>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
